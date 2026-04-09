import { Ionicons } from "@expo/vector-icons";
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
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { MessageBubble } from "@/components/MessageBubble";
import { TypingIndicator } from "@/components/TypingIndicator";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import { Message, User } from "@/types";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const fetchData = useCallback(async () => {
    if (!user || !id) return;

    const { data: participants } = await supabase
      .from("chat_participants")
      .select("*, user:users(*)")
      .eq("chat_id", id);

    const other = participants?.find((p) => p.user_id !== user.id);
    if (other?.user) setOtherUser(other.user as User);

    const { data: msgsData } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", id)
      .order("created_at", { ascending: false });

    if (msgsData) setMessages(msgsData as Message[]);

    await supabase
      .from("messages")
      .update({ status: "read" })
      .eq("chat_id", id)
      .neq("sender_id", user.id)
      .neq("status", "read");

    setLoading(false);
  }, [user, id]);

  useEffect(() => {
    fetchData();

    const msgChannel = supabase
      .channel(`chat-messages-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${id}` },
        async (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [newMsg, ...prev]);
          if (newMsg.sender_id !== user?.id) {
            await supabase
              .from("messages")
              .update({ status: "read" })
              .eq("id", newMsg.id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `chat_id=eq.${id}` },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? (payload.new as Message) : m))
          );
        }
      )
      .subscribe();

    const typingChannel = supabase
      .channel(`typing-${id}`)
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
  }, [fetchData, id, user?.id]);

  const broadcastTyping = useCallback(async () => {
    await supabase.channel(`typing-${id}`).send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: user?.id },
    });
  }, [id, user?.id]);

  const handleTextChange = (val: string) => {
    setText(val);
    broadcastTyping();
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending || !user || !id) return;
    setText("");
    setSending(true);

    await supabase.from("messages").insert({
      chat_id: id,
      sender_id: user.id,
      content,
      type: "text",
      status: "sent",
    });

    setSending(false);
    inputRef.current?.focus();
  };

  const handleDelete = async (messageId: string) => {
    await supabase.from("messages").delete().eq("id", messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  const isOnline = otherUser?.is_online ?? false;
  const lastSeen = otherUser?.last_seen
    ? `Last seen ${new Date(otherUser.last_seen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "";

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </Pressable>
        <Avatar
          uri={otherUser?.avatar_url}
          name={otherUser?.display_name || otherUser?.phone}
          size={38}
          showOnline
          isOnline={isOnline}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>
            {otherUser?.display_name || otherUser?.phone || "Chat"}
          </Text>
          <Text style={styles.headerStatus}>
            {isOnline ? "Online" : lastSeen}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerBtn}>
            <Ionicons name="videocam-outline" size={24} color="white" />
          </Pressable>
          <Pressable style={styles.headerBtn}>
            <Ionicons name="call-outline" size={24} color="white" />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            inverted
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <LongPressMessage
                message={item}
                isSent={item.sender_id === user?.id}
                onDelete={handleDelete}
                colors={colors}
              />
            )}
            ListHeaderComponent={isTyping ? <TypingIndicator /> : null}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
          />
        )}

        <View style={[styles.inputRow, { backgroundColor: colors.background, paddingBottom: bottomPad + 8 }]}>
          <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Message"
              placeholderTextColor={colors.mutedForeground}
              value={text}
              onChangeText={handleTextChange}
              multiline
              maxLength={2000}
            />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={!text.trim() || sending}
            style={[
              styles.sendBtn,
              { backgroundColor: text.trim() ? colors.primary : colors.muted },
            ]}
          >
            {sending ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Ionicons
                name="send"
                size={20}
                color={text.trim() ? "white" : colors.mutedForeground}
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

interface LongPressMessageProps {
  message: Message;
  isSent: boolean;
  onDelete: (id: string) => void;
  colors: ReturnType<typeof useColors>;
}

function LongPressMessage({ message, isSent, onDelete, colors }: LongPressMessageProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <Pressable
      onLongPress={() => isSent && setShowActions(true)}
      delayLongPress={400}
    >
      <MessageBubble message={message} isSent={isSent} />
      {showActions && (
        <Pressable
          style={[styles.deleteAction, { alignSelf: isSent ? "flex-end" : "flex-start", marginRight: isSent ? 8 : 0, marginLeft: isSent ? 0 : 8 }]}
          onPress={() => {
            onDelete(message.id);
            setShowActions(false);
          }}
        >
          <Ionicons name="trash-outline" size={14} color={colors.destructive} />
          <Text style={[styles.deleteText, { color: colors.destructive }]}>Delete</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  headerName: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  headerStatus: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
  },
  headerActions: { flexDirection: "row", gap: 4 },
  headerBtn: { padding: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  messagesList: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8ECF0",
  },
  inputWrap: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 120,
  },
  input: { fontSize: 15, lineHeight: 20 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(239,68,68,0.1)",
    marginVertical: 2,
  },
  deleteText: { fontSize: 12, fontWeight: "600" },
});
