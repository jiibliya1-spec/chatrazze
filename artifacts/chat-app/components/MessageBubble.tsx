import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { Message, MessageStatus } from "@/types";

interface MessageBubbleProps {
  message: Message;
  isSent: boolean;
}

function StatusIcon({ status, color }: { status: MessageStatus; color: string }) {
  if (status === "sent") {
    return <Ionicons name="checkmark" size={14} color={color} />;
  }
  if (status === "delivered") {
    return <Ionicons name="checkmark-done" size={14} color={color} />;
  }
  return <Ionicons name="checkmark-done" size={14} color="#53BDEB" />;
}

export function MessageBubble({ message, isSent }: MessageBubbleProps) {
  const colors = useColors();

  const bubbleStyle = isSent
    ? { backgroundColor: colors.chatBubbleSent, borderTopRightRadius: 2 }
    : { backgroundColor: colors.chatBubbleReceived, borderTopLeftRadius: 2 };

  const textColor = isSent ? colors.chatBubbleSentText : colors.chatBubbleReceivedText;

  const timeStr = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View style={[styles.wrapper, isSent ? styles.sentWrapper : styles.receivedWrapper]}>
      <View style={[styles.bubble, bubbleStyle, { shadowColor: colors.border }]}>
        {message.type === "image" && message.content ? (
          <View>
            <Image
              source={{ uri: message.content }}
              style={styles.image}
              resizeMode="cover"
            />
            <View style={styles.imageMeta}>
              <Text style={[styles.time, { color: "rgba(255,255,255,0.9)" }]}>{timeStr}</Text>
              {isSent && <StatusIcon status={message.status} color="rgba(255,255,255,0.9)" />}
            </View>
          </View>
        ) : (
          <View style={styles.textContent}>
            <Text style={[styles.text, { color: textColor }]}>{message.content}</Text>
            <View style={styles.meta}>
              <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeStr}</Text>
              {isSent && (
                <StatusIcon status={message.status} color={colors.mutedForeground} />
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 2,
    maxWidth: "80%",
  },
  sentWrapper: {
    alignSelf: "flex-end",
    marginRight: 8,
  },
  receivedWrapper: {
    alignSelf: "flex-start",
    marginLeft: 8,
  },
  bubble: {
    borderRadius: 10,
    overflow: "hidden",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  textContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 2,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    marginTop: 2,
  },
  time: {
    fontSize: 11,
  },
  image: {
    width: 220,
    height: 180,
  },
  imageMeta: {
    position: "absolute",
    bottom: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
});
