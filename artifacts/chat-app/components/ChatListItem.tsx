import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";
import { Chat } from "@/types";

interface ChatListItemProps {
  chat: Chat;
}

export function ChatListItem({ chat }: ChatListItemProps) {
  const colors = useColors();
  const otherUser = chat.other_user;
  const lastMsg = chat.last_message;

  const timeStr = lastMsg
    ? formatTime(lastMsg.created_at)
    : formatTime(chat.created_at);

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  const handlePress = () => {
    router.push(`/chat/${chat.id}`);
  };

  const preview = lastMsg
    ? lastMsg.type === "image"
      ? "Photo"
      : lastMsg.type === "audio"
      ? "Voice message"
      : lastMsg.content
    : "Start chatting";

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: pressed ? colors.muted : colors.background },
      ]}
    >
      <Avatar
        uri={otherUser?.avatar_url}
        name={otherUser?.display_name || otherUser?.phone}
        size={52}
        showOnline
        isOnline={otherUser?.is_online ?? false}
      />
      <View style={[styles.content, { borderBottomColor: colors.border }]}>
        <View style={styles.row}>
          <Text
            style={[styles.name, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {otherUser?.display_name || otherUser?.phone || "Unknown"}
          </Text>
          <Text style={[styles.time, { color: chat.unread_count ? colors.primary : colors.mutedForeground }]}>
            {timeStr}
          </Text>
        </View>
        <View style={styles.row}>
          <Text
            style={[
              styles.preview,
              { color: chat.unread_count ? colors.foreground : colors.mutedForeground },
              chat.unread_count ? styles.previewBold : null,
            ]}
            numberOfLines={1}
          >
            {lastMsg?.type === "image" && (
              <Ionicons name="image-outline" size={14} color={colors.mutedForeground} />
            )}
            {lastMsg?.type === "audio" && (
              <Ionicons name="mic-outline" size={14} color={colors.mutedForeground} />
            )}
            {preview}
          </Text>
          {!!chat.unread_count && (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={styles.badgeText}>{chat.unread_count}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingVertical: 8,
  },
  content: {
    flex: 1,
    marginLeft: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
  },
  preview: {
    fontSize: 14,
    flex: 1,
    marginRight: 8,
    marginTop: 3,
  },
  previewBold: {
    fontWeight: "600",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    marginTop: 3,
  },
  badgeText: {
    color: "white",
    fontSize: 11,
    fontWeight: "700",
  },
});
