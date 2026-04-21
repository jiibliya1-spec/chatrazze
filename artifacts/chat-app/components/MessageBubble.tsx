import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { Message, MessageStatus } from "@/types";

interface MessageBubbleProps {
  message: Message;
  isSent: boolean;
  onReact?: (messageId: string, emoji: string) => void;
  onReply?: (message: Message) => void;
}

function StatusIcon({ status }: { status: MessageStatus }) {
  if (status === "sent") return <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.6)" />;
  if (status === "delivered") return <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.6)" />;
  return <Ionicons name="checkmark-done" size={14} color="#53BDEB" />;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MessageBubble({ message, isSent, onReact, onReply }: MessageBubbleProps) {
  const colors = useColors();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
      setAudioPlaying(false);
    }
  }, [message.id]);

  if (message.is_deleted) {
    return (
      <View style={[styles.wrapper, isSent ? styles.sentWrapper : styles.receivedWrapper]}>
        <View style={[styles.bubble, styles.deletedBubble, { borderColor: colors.border }]}>
          <View style={styles.deletedRow}>
            <Ionicons name="ban-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.deletedText, { color: colors.mutedForeground }]}>This message was deleted</Text>
          </View>
        </View>
      </View>
    );
  }

  const bubbleBg = isSent ? colors.chatBubbleSent : colors.chatBubbleReceived;
  const textColor = isSent ? colors.chatBubbleSentText : colors.chatBubbleReceivedText;

  const timeStr = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Group reactions by emoji
  const reactionGroups: Record<string, number> = {};
  if (message.reactions) {
    for (const r of message.reactions) {
      reactionGroups[r.emoji] = (reactionGroups[r.emoji] ?? 0) + 1;
    }
  }
  const reactionEntries = Object.entries(reactionGroups);

  const toggleAudioPlayback = async () => {
    if (typeof window === "undefined") {
      return;
    }

    if (audioRef.current && audioPlaying) {
      audioRef.current.pause();
      setAudioPlaying(false);
      return;
    }

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(message.content);
        audioRef.current.onended = () => setAudioPlaying(false);
      }
      await audioRef.current.play();
      setAudioPlaying(true);
    } catch (error) {
      console.error("[MessageBubble] failed to play audio", error);
      setAudioPlaying(false);
    }
  };

  const renderContent = () => {
    if (message.type === "image") {
      return (
        <View>
          <Image source={{ uri: message.content }} style={styles.image} resizeMode="cover" />
          <View style={styles.imageMeta}>
            <Text style={[styles.time, { color: "rgba(255,255,255,0.92)" }]}>{timeStr}</Text>
            {isSent && <StatusIcon status={message.status} />}
          </View>
        </View>
      );
    }

    if (message.type === "voice" || message.type === "audio") {
      return (
        <View style={[styles.voiceRow]}>
          <Pressable onPress={toggleAudioPlayback} style={[styles.voicePlayBtn, { backgroundColor: isSent ? colors.primaryDark : colors.primary }]}> 
            <Ionicons name={audioPlaying ? "pause" : "play"} size={18} color="white" />
          </Pressable>
          <View style={styles.voiceWave}>
            {[3, 6, 10, 7, 12, 5, 8, 11, 4, 9, 6, 3, 8, 10, 5].map((h, i) => (
              <View
                key={i}
                style={[styles.waveLine, { height: h, backgroundColor: isSent ? colors.primaryDark : colors.primary, opacity: 0.8 }]}
              />
            ))}
          </View>
          <Text style={[styles.voiceDuration, { color: textColor }]}>
            {message.duration ? formatDuration(message.duration) : "0:00"}
          </Text>
          <View style={styles.metaFloat}>
            <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeStr}</Text>
            {isSent && <StatusIcon status={message.status} />}
          </View>
        </View>
      );
    }

    if (message.type === "file") {
      return (
        <View style={styles.fileRow}>
          <View style={[styles.fileIcon, { backgroundColor: isSent ? colors.primaryDark : colors.accent }]}>
            <Ionicons name="document-outline" size={24} color="white" />
          </View>
          <View style={styles.fileInfo}>
            <Text style={[styles.fileName, { color: textColor }]} numberOfLines={1}>
              {message.file_name ?? "File"}
            </Text>
            {message.file_size && (
              <Text style={[styles.fileSize, { color: colors.mutedForeground }]}>
                {(message.file_size / 1024).toFixed(0)} KB
              </Text>
            )}
          </View>
          <View style={styles.meta}>
            <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeStr}</Text>
            {isSent && <StatusIcon status={message.status} />}
          </View>
        </View>
      );
    }

    // Text message
    return (
      <View style={styles.textContent}>
        {message.reply_to && (
          <View style={[styles.replyQuote, { borderLeftColor: isSent ? colors.primaryDark : colors.accent, backgroundColor: "rgba(0,0,0,0.08)" }]}>
            <Text style={[styles.replyName, { color: isSent ? colors.primaryDark : colors.accent }]} numberOfLines={1}>
              {message.reply_to.sender?.display_name ?? "Unknown"}
            </Text>
            <Text style={[styles.replyText, { color: textColor }]} numberOfLines={2}>
              {message.reply_to.type === "image" ? "📷 Photo" : message.reply_to.content}
            </Text>
          </View>
        )}
        <Text style={[styles.text, { color: textColor }]} selectable>
          {message.content}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeStr}</Text>
          {isSent && <StatusIcon status={message.status} />}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.wrapper, isSent ? styles.sentWrapper : styles.receivedWrapper]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: bubbleBg },
          isSent ? styles.sentBubble : styles.receivedBubble,
        ]}
      >
        {renderContent()}
      </View>

      {/* Reactions */}
      {reactionEntries.length > 0 && (
        <View style={[styles.reactionsRow, isSent ? styles.reactionsRight : styles.reactionsLeft]}>
          {reactionEntries.map(([emoji, count]) => (
            <View key={emoji} style={[styles.reactionPill, { backgroundColor: colors.reactionBg, borderColor: colors.border }]}>
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              {count > 1 && <Text style={[styles.reactionCount, { color: colors.mutedForeground }]}>{count}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 1,
    maxWidth: "82%",
  },
  sentWrapper: { alignSelf: "flex-end", marginRight: 8 },
  receivedWrapper: { alignSelf: "flex-start", marginLeft: 8 },
  bubble: {
    borderRadius: 12,
    overflow: "hidden",
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sentBubble: { borderTopRightRadius: 4 },
  receivedBubble: { borderTopLeftRadius: 4 },
  deletedBubble: {
    backgroundColor: "transparent",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  deletedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  deletedText: { fontSize: 14, fontStyle: "italic" },
  textContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    minWidth: 80,
  },
  replyQuote: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  replyName: { fontSize: 12, fontWeight: "700" },
  replyText: { fontSize: 13, opacity: 0.85 },
  text: { fontSize: 15, lineHeight: 22 },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    marginTop: 3,
  },
  metaFloat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 6,
  },
  time: { fontSize: 11 },
  image: { width: 220, height: 180 },
  imageMeta: {
    position: "absolute",
    bottom: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    minWidth: 180,
  },
  voicePlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceWave: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 24,
  },
  waveLine: {
    width: 2.5,
    borderRadius: 2,
    flex: 1,
    maxWidth: 3,
  },
  voiceDuration: { fontSize: 12, minWidth: 32 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    minWidth: 200,
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: "600" },
  fileSize: { fontSize: 12, marginTop: 2 },
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 3,
    marginBottom: 2,
  },
  reactionsLeft: { marginLeft: 8 },
  reactionsRight: { justifyContent: "flex-end", marginRight: 8 },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 12, fontWeight: "600" },
});
