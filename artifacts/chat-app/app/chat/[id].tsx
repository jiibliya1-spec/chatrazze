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
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  const [showActions, setShowActions] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const topPad = Platform.OS === "web" ? 0 : insets.top;

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

      let resolvedChatId = routeChatId ?? null;
      let resolvedOtherUserId = routeUserId ?? null;

      if (!resolvedChatId) {
        const { data: joinedChat, error: joinedChatError } = await supabase
          .from("chat_participants")
          .select("chat_id")
          .eq("chat_id", routeId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (joinedChatError) {
          console.error("[ChatScreen] failed checking whether route id is a chat id", joinedChatError);
        }

        if (joinedChat?.chat_id) {
          resolvedChatId = joinedChat.chat_id;
        } else {
          resolvedOtherUserId = resolvedOtherUserId ?? routeId;
        }
      }

      if (!resolvedChatId && resolvedOtherUserId) {
        const { data: myParticipants, error: myParticipantsError } = await supabase
          .from("chat_participants")
          .select("chat_id")
          .eq("user_id", user.id);
        if (myParticipantsError) {
          console.error("[ChatScreen] failed loading current user participants", myParticipantsError);
        }

        const { data: otherParticipants, error: otherParticipantsError } = await supabase
          .from("chat_participants")
          .select("chat_id")
          .eq("user_id", resolvedOtherUserId);
        if (otherParticipantsError) {
          console.error("[ChatScreen] failed loading target user participants", otherParticipantsError);
        }

        const myChats = new Set((myParticipants ?? []).map((participant: { chat_id: string }) => participant.chat_id));
        const sharedChat = (otherParticipants ?? []).find((participant: { chat_id: string }) => myChats.has(participant.chat_id));

        if (sharedChat) {
          resolvedChatId = sharedChat.chat_id;
          console.log("[ChatScreen] found existing shared chat", { resolvedChatId, resolvedOtherUserId });
        } else {
          const { data: newChat, error: createChatError } = await supabase.from("chats").insert({}).select().single();
          if (createChatError) {
            console.error("[ChatScreen] failed creating chat", createChatError);
          }

          if (newChat) {
            const { error: insertParticipantsError } = await supabase.from("chat_participants").insert([
              { chat_id: newChat.id, user_id: user.id },
              { chat_id: newChat.id, user_id: resolvedOtherUserId },
            ]);

            if (insertParticipantsError) {
              console.error("[ChatScreen] failed inserting participants for new chat", insertParticipantsError);
            } else {
              resolvedChatId = newChat.id;
              console.log("[ChatScreen] created chat from route user", { resolvedChatId, resolvedOtherUserId });
            }
          }
        }
      }

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

      const { data: participants, error: participantsError } = await supabase
        .from("chat_participants")
        .select("*, user:users(*)")
        .eq("chat_id", resolvedChatId);
      if (participantsError) {
        console.error("[ChatScreen] failed loading chat participants", participantsError);
      }

      const other = participants?.find((participant: any) => participant.user_id !== user.id);
      if (other?.user) {
        setOtherUser(other.user as User);
      } else {
        setOtherUser(null);
      }

      const { data: msgsData, error: messagesError } = await supabase
        .from("messages")
        .select("*, reactions:message_reactions(*)")
        .eq("chat_id", resolvedChatId)
        .order("created_at", { ascending: false });

      if (messagesError) {
        console.error("[ChatScreen] failed loading messages", messagesError);
      }

      if (msgsData) {
        setMessages(msgsData as Message[]);
      }

      await supabase
        .from("messages")
        .update({ status: "read" })
        .eq("chat_id", resolvedChatId)
        .neq("sender_id", user.id)
        .neq("status", "read");

      console.log("[ChatScreen] chat ready", {
        resolvedChatId,
        otherUserId: other?.user_id ?? resolvedOtherUserId,
        messageCount: msgsData?.length ?? 0,
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${activeChatId}` },
        async (payload) => {
          const newMsg = { ...(payload.new as Message), reactions: [] };
          setMessages((prev) => [newMsg, ...prev]);
          if (newMsg.sender_id !== user?.id) {
            await supabase.from("messages").update({ status: "read" }).eq("id", newMsg.id);
          }
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `chat_id=eq.${activeChatId}` },
        async (payload) => {
          const { data: updated } = await supabase
            .from("messages")
            .select("*, reactions:message_reactions(*)")
            .eq("id", payload.new.id)
            .single();
          if (updated) setMessages((prev) => prev.map((m) => (m.id === updated.id ? (updated as Message) : m)));
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
  }, [activeChatId, fetchData, isDemoMode, user?.id]);

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
    if (isDemoMode) {
      await sendDemoText(currentChatId, content, replyMessage);
    } else if (user) {
      await supabase.from("messages").insert({
        chat_id: currentChatId, sender_id: user.id, content, type: "text", status: "sent", reply_to_id: replyId,
      });
    }
    setSending(false);
    inputRef.current?.focus();
  };

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
          await supabase.from("messages").insert({ chat_id: currentChatId, sender_id: user.id, content: urlData.publicUrl, type: "image", status: "sent" });
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
      await supabase.from("messages").insert({ chat_id: currentChatId, sender_id: user.id, content: urlData.publicUrl, type: "image", status: "sent" });
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
                  : <Pressable onPress={() => currentChatId && sendDemoVoice(currentChatId)}><Ionicons name="mic-outline" size={22} color={colors.mutedForeground} /></Pressable>
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
