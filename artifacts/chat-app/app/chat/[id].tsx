import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { MessageBubble } from "@/components/MessageBubble";
import { TypingIndicator } from "@/components/TypingIndicator";
import { useAuth } from "@/contexts/AuthContext";
import { useChatMode } from "@/contexts/ChatModeContext";
import { useI18n } from "@/contexts/I18nContext";
import { useColors } from "@/hooks/useColors";
import { normalizeMessageRecord, resolveConversationFromRoute } from "@/lib/conversations";
import { supabase } from "@/lib/supabase";
import { Message, MessageReaction, User } from "@/types";

const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🙏"];

export default function ChatScreen() {
  const { id: routeIdParam, chatId: routeChatIdParam, userId: routeUserIdParam } = useLocalSearchParams<{ id: string; chatId?: string; userId?: string }>();
  const { user } = useAuth();
  const {
    isDemoMode,
    demoProfile,
    typingByChat,
    getDemoMessages,
    getDemoUser,
    sendDemoImage,
    sendDemoText,
    sendDemoVoice,
    reactToDemoMessage,
    deleteDemoMessage,
  } = useChatMode();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const routeId = typeof routeIdParam === "string" ? routeIdParam : undefined;
  const routeChatId = typeof routeChatIdParam === "string" ? routeChatIdParam : undefined;
  const routeUserId = typeof routeUserIdParam === "string" ? routeUserIdParam : undefined;
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeConversationKey, setActiveConversationKey] = useState<"chat_id" | "conversation_id">("chat_id");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  const [showActions, setShowActions] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const inputRef = useRef<TextInput>(null);
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const topPad = Platform.OS === "web" ? 0 : insets.top;

  const loadMessages = useCallback(async (conversationId: string, conversationKey: "chat_id" | "conversation_id") => {
    const messageQuery = supabase
      .from("messages")
      .select("*, reactions:message_reactions(*)")
      .eq(conversationKey, conversationId)
      .order("created_at", { ascending: false });

    const { data, error } = await messageQuery;
    if (!error && data) {
      return data.map((message) => ({
        ...normalizeMessageRecord(message as Record<string, unknown>, conversationKey),
        reactions: (message as { reactions?: MessageReaction[] }).reactions ?? [],
      })) as Message[];
    }

    if (error) {
      console.error("[ChatScreen] failed loading messages with reactions", error);
    }

    const { data: fallbackData, error: fallbackError } = await supabase
      .from("messages")
      .select("*")
      .eq(conversationKey, conversationId)
      .order("created_at", { ascending: false });

    if (fallbackError) {
      console.error("[ChatScreen] failed loading messages", fallbackError);
      return [];
    }

    return (fallbackData ?? []).map((message) => ({
      ...normalizeMessageRecord(message as Record<string, unknown>, conversationKey),
      reactions: [],
    })) as unknown as Message[];
  }, []);

  const insertMessageRecord = useCallback(async (payload: { content: string; type?: string; replyToId?: string | null; duration?: number | null }) => {
    if (!activeChatId || !user) {
      return;
    }

    const basePayload = {
      [activeConversationKey]: activeChatId,
      sender_id: user.id,
      content: payload.content,
    };

    const richPayload = {
      ...basePayload,
      type: payload.type ?? "text",
      status: "sent",
      reply_to_id: payload.replyToId ?? null,
      duration: payload.duration ?? null,
    };

    const { error } = await supabase.from("messages").insert(richPayload);
    if (!error) {
      return;
    }

    console.error("[ChatScreen] failed inserting rich message payload", error);

    const { error: fallbackError } = await supabase.from("messages").insert(basePayload);
    if (fallbackError) {
      console.error("[ChatScreen] failed inserting fallback message payload", fallbackError);
      throw fallbackError;
    }
  }, [activeChatId, activeConversationKey, user]);

  const fetchData = useCallback(async () => {
    if (isDemoMode) {
      const demoChatId = routeChatId ?? routeId;
      if (!demoChatId) {
        console.warn("[ChatScreen] missing demo chat id in route params", { routeId, routeChatId, routeUserId });
        setLoading(false);
        return;
      }

      setActiveChatId(demoChatId);
      setMessages(getDemoMessages(demoChatId));
      const chatMeta = getDemoMessages(demoChatId)[0];
      const otherUserId = chatMeta?.sender_id === demoProfile.id ? undefined : chatMeta?.sender_id;
      const guessedOther = otherUserId ? getDemoUser(otherUserId) : undefined;
      if (!guessedOther) {
        const firstForeign = getDemoMessages(demoChatId).find((message) => message.sender_id !== demoProfile.id);
        setOtherUser(firstForeign ? getDemoUser(firstForeign.sender_id) ?? null : null);
      } else {
        setOtherUser(guessedOther ?? null);
      }
      setLoading(false);
      return;
    }

    if (!user || !routeId) {
      console.warn("[ChatScreen] missing required non-demo params", { routeId, currentUserId: user?.id });
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      console.log("[ChatScreen] resolve chat from route", {
        routeId,
        routeChatId,
        routeUserId,
        currentUserId: user.id,
      });

      const resolvedConversation = await resolveConversationFromRoute(routeChatId ?? routeId, user.id, routeUserId);
      const resolvedChatId = resolvedConversation.conversationId;
      const resolvedOtherUserId = resolvedConversation.otherUserId;
      const conversationKey = resolvedConversation.backend.conversationKey;
      const participantTable = resolvedConversation.backend.participantTable;

      if (!resolvedChatId) {
        console.error("[ChatScreen] unable to resolve a chat id from route params", {
          routeId,
          routeChatId,
          routeUserId,
        });
        setMessages([]);
        setOtherUser(null);
        return;
      }

      setActiveChatId(resolvedChatId);
      setActiveConversationKey(conversationKey);

      const { data: participants, error: participantsError } = await supabase
        .from(participantTable)
        .select("user_id")
        .eq(conversationKey, resolvedChatId);
      if (participantsError) {
        console.error("[ChatScreen] failed loading chat participants", participantsError);
      }

      const otherParticipant = participants?.find((participant: { user_id: string }) => participant.user_id !== user.id);
      const targetUserId = otherParticipant?.user_id || resolvedOtherUserId;

      if (targetUserId) {
        const { data: otherUserData, error: otherUserError } = await supabase
          .from("users")
          .select("*")
          .eq("id", targetUserId)
          .maybeSingle();

        if (otherUserError) {
          console.error("[ChatScreen] failed loading conversation user", otherUserError);
        }

        setOtherUser((otherUserData as User | null) ?? null);
      } else {
        setOtherUser(null);
      }

      const msgsData = await loadMessages(resolvedChatId, conversationKey);
      setMessages(msgsData);

      const { error: markReadError } = await supabase
        .from("messages")
        .update({ status: "read" })
        .eq(conversationKey, resolvedChatId)
        .neq("sender_id", user.id)
        .neq("status", "read");
      if (markReadError) {
        console.error("[ChatScreen] failed marking messages as read", markReadError);
      }

      console.log("[ChatScreen] chat ready", {
        resolvedChatId,
        otherUserId: targetUserId,
        messageCount: msgsData.length,
      });
    } catch (error) {
      console.error("[ChatScreen] fetchData failed", error);
    } finally {
      setLoading(false);
    }
  }, [
    demoProfile.id,
    getDemoMessages,
    getDemoUser,
    loadMessages,
    routeChatId,
    routeId,
    routeUserId,
    isDemoMode,
    user,
  ]);

  useEffect(() => {
    fetchData();

    if (isDemoMode) {
      return;
    }

    if (!activeChatId) {
      return;
    }

    const msgChannel = supabase
      .channel(`chat-msgs-${activeChatId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `${activeConversationKey}=eq.${activeChatId}` },
        async (payload) => {
          const newMsg = {
            ...normalizeMessageRecord(payload.new as Record<string, unknown>, activeConversationKey),
            reactions: [],
          } as unknown as Message;
          setMessages((prev) => [newMsg, ...prev]);
          if (newMsg.sender_id !== user?.id) {
            await supabase.from("messages").update({ status: "read" }).eq("id", newMsg.id);
          }
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `${activeConversationKey}=eq.${activeChatId}` },
        async (payload) => {
          const updatedMessages = await loadMessages(activeChatId, activeConversationKey);
          const updated = updatedMessages.find((message) => message.id === payload.new.id);
          if (updated) {
            setMessages((prev) => prev.map((message) => (message.id === updated.id ? updated : message)));
          }
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => fetchData())
      .subscribe();
    const typingChannel = supabase
      .channel(`typing-${activeChatId}`)
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload?.user_id !== user?.id) {
          setIsTyping(true);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setIsTyping(false), 3000);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
    };
  }, [activeChatId, activeConversationKey, fetchData, isDemoMode, loadMessages, user?.id]);

  const currentChatId = activeChatId;

  const broadcastTyping = useCallback(async () => {
    if (isDemoMode) {
      return;
    }
    if (!currentChatId) {
      return;
    }
    await supabase.channel(`typing-${currentChatId}`).send({ type: "broadcast", event: "typing", payload: { user_id: user?.id } });
  }, [currentChatId, isDemoMode, user?.id]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending || !currentChatId) return;
    setText("");
    setSending(true);
    const replyId = replyTo?.id ?? null;
    const replyMessage = replyTo;
    setReplyTo(null);
    try {
      if (isDemoMode) {
        await sendDemoText(currentChatId, content, replyMessage);
      } else if (user) {
        await insertMessageRecord({ content, type: "text", replyToId: replyId });
      }
    } catch (error) {
      console.error("[ChatScreen] failed to send text message", error);
      Alert.alert("Send failed", "Unable to send this message right now.");
      setText(content);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleVoiceToggle = useCallback(async () => {
    if (!currentChatId || sending) {
      return;
    }

    if (isDemoMode) {
      try {
        await sendDemoVoice(currentChatId);
      } catch (error) {
        console.error("[ChatScreen] failed sending demo voice message", error);
      }
      return;
    }

    if (!user) {
      Alert.alert("Unable to record", "You are not signed in.");
      return;
    }

    if (Platform.OS !== "web") {
      Alert.alert("Audio messages", "Voice recording is available on web in this build.");
      return;
    }

    if (!recordingVoice) {
      try {
        console.log("[ChatScreen] start voice recording", { currentChatId });
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        mediaRecorderRef.current = recorder;
        recordingStartedAtRef.current = Date.now();

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.onerror = (event) => {
          console.error("[ChatScreen] voice recorder error", event);
        };

        recorder.onstop = async () => {
          try {
            const chunks = audioChunksRef.current;
            audioChunksRef.current = [];
            const recordedAt = recordingStartedAtRef.current ?? Date.now();
            const duration = Math.max(1, Math.round((Date.now() - recordedAt) / 1000));
            recordingStartedAtRef.current = null;

            if (chunks.length === 0) {
              console.warn("[ChatScreen] no audio chunks captured");
              return;
            }

            const blob = new Blob(chunks, { type: "audio/webm" });
            const path = `${user.id}/${Date.now()}.webm`;
            const { error: uploadError } = await supabase.storage
              .from("chat-media")
              .upload(path, blob, { contentType: "audio/webm", upsert: false });

            if (uploadError) {
              console.error("[ChatScreen] failed uploading voice message", uploadError);
              Alert.alert("Upload failed", "Unable to upload voice message.");
              return;
            }

            const { data: voiceUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
            await insertMessageRecord({ content: voiceUrlData.publicUrl, type: "voice", duration });
          } catch (error) {
            console.error("[ChatScreen] failed finalizing voice recording", error);
            Alert.alert("Recording failed", "Unable to send voice message.");
          } finally {
            mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
            mediaRecorderRef.current = null;
            setRecordingVoice(false);
          }
        };

        recorder.start();
        setRecordingVoice(true);
      } catch (error) {
        console.error("[ChatScreen] failed to start recording", error);
        Alert.alert("Microphone error", "Please allow microphone access and try again.");
        setRecordingVoice(false);
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
      }
      return;
    }

    try {
      console.log("[ChatScreen] stop voice recording", { currentChatId });
      mediaRecorderRef.current?.stop();
    } catch (error) {
      console.error("[ChatScreen] failed stopping recorder", error);
      setRecordingVoice(false);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
    }
  }, [currentChatId, insertMessageRecord, isDemoMode, recordingVoice, sendDemoVoice, sending, user]);

  const handlePickImage = async () => {
    if (!currentChatId) return;
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        setUploading(true);
        try {
          const previewUrl = URL.createObjectURL(file);
          if (isDemoMode) {
            await sendDemoImage(currentChatId, previewUrl, replyTo);
            setReplyTo(null);
            return;
          }
          if (!user) return;
          const ext = file.name.split(".").pop() ?? "jpg";
          const path = `${user.id}/${Date.now()}.${ext}`;
          await supabase.storage.from("chat-media").upload(path, file, { contentType: file.type });
          const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
          await insertMessageRecord({ content: urlData.publicUrl, type: "image" });
        } catch (err) { console.warn("upload error", err); }
        finally { setUploading(false); }
      };
      input.click();
      return;
    }
    if (!isDemoMode && !user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      if (isDemoMode) {
        await sendDemoImage(currentChatId, asset.uri, replyTo);
        setReplyTo(null);
        return;
      }
      if (!user) return;
      const ext = asset.uri.split(".").pop() ?? "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      await supabase.storage.from("chat-media").upload(path, blob, { contentType: `image/${ext}` });
      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      await insertMessageRecord({ content: urlData.publicUrl, type: "image" });
    } catch (err) { console.warn("upload error", err); }
    finally { setUploading(false); }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!user && !isDemoMode) return;
    setShowActions(false);
    setActionMsg(null);
    if (isDemoMode && currentChatId) {
      await reactToDemoMessage(currentChatId, messageId, emoji);
      return;
    }
    if (!user) return;
    const msg = messages.find((m) => m.id === messageId);
    const existing = msg?.reactions?.find((r: MessageReaction) => r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await supabase.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", user.id);
    } else {
      await supabase.from("message_reactions").upsert({ message_id: messageId, user_id: user.id, emoji }, { onConflict: "message_id,user_id" });
    }
  };

  const handleDelete = async (messageId: string) => {
    if (isDemoMode && currentChatId) {
      await deleteDemoMessage(currentChatId, messageId);
      setActionMsg(null);
      setShowActions(false);
      return;
    }
    await supabase.from("messages").update({ is_deleted: true, content: "" }).eq("id", messageId);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, is_deleted: true, content: "" } : m)));
    setActionMsg(null);
    setShowActions(false);
  };

  const handleLongPress = (message: Message) => {
    setActionMsg(message);
    setShowActions(true);
  };

  const activeUser = isDemoMode ? demoProfile : user;
  const isOnline = otherUser?.is_online ?? false;
  const lastSeenStr = otherUser?.last_seen
    ? `${t("lastSeen")} ${new Date(otherUser.last_seen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "";
  const canSend = text.trim().length > 0 && !sending;

  const goBackOrChats = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/chats");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad + 8 }]}>
        <Pressable onPress={goBackOrChats} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Pressable onPress={() => otherUser?.id && router.push({ pathname: "/user/[id]", params: { id: otherUser.id } })}>
            <Avatar uri={otherUser?.avatar_url} name={otherUser?.display_name || otherUser?.phone} size={38} showOnline isOnline={isOnline} />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>{otherUser?.display_name || otherUser?.phone || t("chats")}</Text>
            <Text style={styles.headerStatus}>{(isDemoMode ? typingByChat[currentChatId ?? ""] : isTyping) ? t("typing") : isOnline ? t("online") : lastSeenStr}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerBtn} onPress={() => currentChatId && router.push(`/call/${currentChatId}?type=video&calleeId=${otherUser?.id ?? ""}`)}>
            <Ionicons name="videocam-outline" size={23} color="white" />
          </Pressable>
          <Pressable style={styles.headerBtn} onPress={() => currentChatId && router.push(`/call/${currentChatId}?type=audio&calleeId=${otherUser?.id ?? ""}`)}>
            <Ionicons name="call-outline" size={23} color="white" />
          </Pressable>
          <Pressable style={styles.headerBtn}>
            <Ionicons name="ellipsis-vertical" size={21} color="white" />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
        ) : (
          <>
            <FlatList
              data={messages}
              keyExtractor={(item) => item.id}
              inverted
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable onLongPress={() => handleLongPress(item)} delayLongPress={350}>
                  <MessageBubble message={item} isSent={item.sender_id === activeUser?.id} onReact={handleReact} onReply={setReplyTo} />
                </Pressable>
              )}
              ListHeaderComponent={isTyping ? <TypingIndicator /> : null}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
            />

            {replyTo && (
              <View style={[styles.replyBanner, { backgroundColor: colors.card, borderLeftColor: colors.primary }]}>
                <View style={styles.replyContent}>
                  <Text style={[styles.replyName, { color: colors.primary }]}>{replyTo.sender?.display_name ?? t("reply")}</Text>
                  <Text style={[styles.replyText, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {replyTo.type === "image" ? `📷 ${t("photo")}` : replyTo.content}
                  </Text>
                </View>
                <Pressable onPress={() => setReplyTo(null)} style={styles.replyClose}>
                  <Ionicons name="close" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>
            )}

            <View style={[styles.inputRow, { borderTopColor: colors.separator, paddingBottom: bottomPad + 8, backgroundColor: colors.background }]}>
              <Pressable onPress={handlePickImage} disabled={uploading} style={[styles.circleBtn, { backgroundColor: colors.card }]}>
                {uploading
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Ionicons name="attach" size={22} color={colors.mutedForeground} />
                }
              </Pressable>
              <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TextInput
                  ref={inputRef}
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder={t("message")}
                  placeholderTextColor={colors.mutedForeground}
                  value={text}
                  onChangeText={(v) => { setText(v); broadcastTyping(); }}
                  multiline
                  maxLength={4000}
                />
                <Pressable onPress={handlePickImage} style={styles.cameraBtn}>
                  <Ionicons name="camera-outline" size={21} color={colors.mutedForeground} />
                </Pressable>
              </View>
              <Pressable
                onPress={canSend ? handleSend : undefined}
                style={[styles.sendBtn, { backgroundColor: canSend ? colors.primary : colors.card }]}
              >
                {sending ? <ActivityIndicator color="white" size="small" />
                  : canSend ? <Ionicons name="send" size={20} color="white" />
                  : <Pressable onPress={handleVoiceToggle}><Ionicons name={recordingVoice ? "stop-circle" : "mic-outline"} size={22} color={recordingVoice ? colors.destructive : colors.mutedForeground} /></Pressable>
                }
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      {showActions && actionMsg && (
        <Modal transparent animationType="fade" onRequestClose={() => { setShowActions(false); setActionMsg(null); }}>
          <TouchableWithoutFeedback onPress={() => { setShowActions(false); setActionMsg(null); }}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={[styles.actionSheet, { backgroundColor: colors.card }]}>
                  <View style={styles.reactionsBar}>
                    {REACTION_EMOJIS.map((emoji) => (
                      <Pressable key={emoji} onPress={() => handleReact(actionMsg.id, emoji)} style={styles.emojiBtn}>
                        <Text style={styles.emojiText}>{emoji}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={[styles.divider, { backgroundColor: colors.separator }]} />
                  <Pressable style={styles.actionRow} onPress={() => { setReplyTo(actionMsg); setShowActions(false); setActionMsg(null); inputRef.current?.focus(); }}>
                    <Ionicons name="arrow-undo-outline" size={20} color={colors.foreground} />
                    <Text style={[styles.actionLabel, { color: colors.foreground }]}>{t("reply")}</Text>
                  </Pressable>
                  <Pressable style={styles.actionRow} onPress={() => { setText(actionMsg.type === "image" ? `Forwarded photo: ${actionMsg.content}` : actionMsg.content); setShowActions(false); setActionMsg(null); inputRef.current?.focus(); }}>
                    <Ionicons name="share-outline" size={20} color={colors.foreground} />
                    <Text style={[styles.actionLabel, { color: colors.foreground }]}>{t("forward")}</Text>
                  </Pressable>
                  {actionMsg.sender_id === activeUser?.id && !actionMsg.is_deleted && (
                    <Pressable style={styles.actionRow} onPress={() => handleDelete(actionMsg.id)}>
                      <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                      <Text style={[styles.actionLabel, { color: colors.destructive }]}>{t("delete")}</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.actionRow} onPress={() => { setShowActions(false); setActionMsg(null); }}>
                    <Ionicons name="close-outline" size={20} color={colors.mutedForeground} />
                    <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>{t("cancel")}</Text>
                  </Pressable>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 10, gap: 6 },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerInfo: { flex: 1 },
  headerName: { color: "white", fontSize: 16, fontWeight: "700" },
  headerStatus: { color: "rgba(255,255,255,0.75)", fontSize: 12 },
  headerActions: { flexDirection: "row", gap: 2 },
  headerBtn: { padding: 5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  messagesList: { paddingVertical: 8, paddingHorizontal: 4 },
  replyBanner: { flexDirection: "row", alignItems: "center", borderLeftWidth: 4, paddingVertical: 8, paddingLeft: 12, paddingRight: 8 },
  replyContent: { flex: 1 },
  replyName: { fontSize: 13, fontWeight: "700" },
  replyText: { fontSize: 13 },
  replyClose: { padding: 4 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingTop: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  circleBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  inputWrap: { flex: 1, borderRadius: 24, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6, maxHeight: 120, flexDirection: "row", alignItems: "flex-end" },
  input: { flex: 1, fontSize: 15, lineHeight: 20, paddingRight: 4 },
  cameraBtn: { paddingBottom: 4 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", elevation: 2, shadowColor: "#E11D2A", shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  actionSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingBottom: 32 },
  reactionsBar: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 20, paddingVertical: 12 },
  emojiBtn: { padding: 8, borderRadius: 30 },
  emojiText: { fontSize: 28 },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 4 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  actionLabel: { fontSize: 16 },
});
