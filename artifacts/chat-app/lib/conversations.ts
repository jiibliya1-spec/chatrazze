import { supabase } from "@/lib/supabase";

export type ConversationBackend = {
  conversationTable: "conversations" | "chats";
  participantTable: "participants" | "chat_participants";
  conversationKey: "conversation_id" | "chat_id";
};

export type ConversationResolution = {
  conversationId: string;
  otherUserId: string;
  backend: ConversationBackend;
};

type ConversationLookupResult = {
  backend: ConversationBackend;
  conversationId: string;
};

type ConversationParticipantRow = {
  chat_id?: string;
  conversation_id?: string;
};

let cachedBackend: ConversationBackend | null = null;

const DEFAULT_TIMEOUT_MS = 3000;

function isMissingRelationError(error: unknown) {
  const message = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("relation") || message.includes("column") || message.includes("schema cache");
}

export async function withTimeout<T>(operation: PromiseLike<T>, label: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function resolveConversationBackend(): Promise<ConversationBackend> {
  if (cachedBackend) {
    return cachedBackend;
  }

  const { error: participantsProbeError } = await withTimeout(
    supabase.from("participants").select("conversation_id").limit(1),
    "Resolve conversations backend"
  );

  if (!participantsProbeError) {
    cachedBackend = {
      conversationTable: "conversations",
      participantTable: "participants",
      conversationKey: "conversation_id",
    };
    return cachedBackend;
  }

  const { error: chatsProbeError } = await withTimeout(
    supabase.from("chat_participants").select("chat_id").limit(1),
    "Resolve chats backend"
  );

  if (!chatsProbeError) {
    cachedBackend = {
      conversationTable: "chats",
      participantTable: "chat_participants",
      conversationKey: "chat_id",
    };
    return cachedBackend;
  }

  if (isMissingRelationError(participantsProbeError) || isMissingRelationError(chatsProbeError)) {
    throw new Error("No supported conversation schema is available in Supabase.");
  }

  throw new Error(
    `Unable to access conversation tables. participants error: ${String((participantsProbeError as { message?: string } | null)?.message ?? participantsProbeError)}; chat_participants error: ${String((chatsProbeError as { message?: string } | null)?.message ?? chatsProbeError)}`
  );
}

export async function getOrCreateDirectConversation(currentUserId: string, otherUserId: string): Promise<ConversationLookupResult> {
  const backend = await resolveConversationBackend();

  const { data: currentParticipants, error: currentParticipantsError } = await withTimeout(
    supabase.from(backend.participantTable).select(backend.conversationKey).eq("user_id", currentUserId),
    "Load current user conversations"
  );
  if (currentParticipantsError) {
    throw currentParticipantsError;
  }

  const { data: otherParticipants, error: otherParticipantsError } = await withTimeout(
    supabase.from(backend.participantTable).select(backend.conversationKey).eq("user_id", otherUserId),
    "Load selected user conversations"
  );
  if (otherParticipantsError) {
    throw otherParticipantsError;
  }

  const currentParticipantRows = (currentParticipants ?? []) as ConversationParticipantRow[];
  const otherParticipantRows = (otherParticipants ?? []) as ConversationParticipantRow[];

  const currentConversationIds = new Set(
    currentParticipantRows
      .map((participant) => participant[backend.conversationKey])
      .filter((conversationId): conversationId is string => typeof conversationId === "string" && conversationId.length > 0)
  );

  const sharedConversation = otherParticipantRows.find((participant) =>
    typeof participant[backend.conversationKey] === "string" && currentConversationIds.has(participant[backend.conversationKey] as string)
  );

  const sharedConversationId = sharedConversation?.[backend.conversationKey];
  if (typeof sharedConversationId === "string" && sharedConversationId.length > 0) {
    return {
      backend,
      conversationId: sharedConversationId,
    };
  }

  const { data: newConversation, error: createConversationError } = await withTimeout(
    supabase.from(backend.conversationTable).insert({}).select().single(),
    "Create conversation"
  );
  if (createConversationError) {
    throw createConversationError;
  }

  if (!newConversation?.id) {
    throw new Error("Create conversation returned no id");
  }

  const { error: insertParticipantsError } = await withTimeout(
    supabase.from(backend.participantTable).insert([
      { [backend.conversationKey]: newConversation.id, user_id: currentUserId },
      { [backend.conversationKey]: newConversation.id, user_id: otherUserId },
    ]),
    "Insert conversation participants"
  );
  if (insertParticipantsError) {
    throw insertParticipantsError;
  }

  return {
    backend,
    conversationId: newConversation.id,
  };
}

export async function resolveConversationFromRoute(routeId: string, currentUserId: string, routeUserId?: string): Promise<ConversationResolution> {
  const backend = await resolveConversationBackend();

  const { data: existingConversation, error: existingConversationError } = await withTimeout(
    supabase
      .from(backend.participantTable)
      .select(backend.conversationKey)
      .eq(backend.conversationKey, routeId)
      .eq("user_id", currentUserId)
      .maybeSingle(),
    "Resolve route conversation"
  );
  if (existingConversationError) {
    throw existingConversationError;
  }

  const existingConversationRecord = existingConversation as ConversationParticipantRow | null;
  const existingConversationId = existingConversationRecord?.[backend.conversationKey];

  if (typeof existingConversationId === "string" && existingConversationId.length > 0) {
    return {
      backend,
      conversationId: existingConversationId,
      otherUserId: routeUserId ?? "",
    };
  }

  const otherUserId = routeUserId ?? routeId;
  const createdOrFound = await getOrCreateDirectConversation(currentUserId, otherUserId);

  return {
    backend: createdOrFound.backend,
    conversationId: createdOrFound.conversationId,
    otherUserId,
  };
}

export function normalizeMessageRecord(record: Record<string, unknown>, conversationKey: ConversationBackend["conversationKey"]) {
  return {
    ...record,
    chat_id: (record.chat_id as string | undefined) ?? (record[conversationKey] as string),
    type: (record.type as string | undefined) ?? "text",
    status: (record.status as string | undefined) ?? "sent",
  };
}