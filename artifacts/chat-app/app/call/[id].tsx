import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import { User } from "@/types";

type CallStatus = "connecting" | "ringing" | "active" | "ended";

export default function CallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id: chatId, type = "audio", calleeId } = useLocalSearchParams<{
    id: string;
    type: "audio" | "video";
    calleeId: string;
  }>();

  const [status, setStatus] = useState<CallStatus>("connecting");
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [callee, setCallee] = useState<User | null>(null);
  const [incoming, setIncoming] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callIdRef = useRef<string | null>(null);
  const channelRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const goBackOrChats = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/chats");
  }, []);

  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const bottomPad = Platform.OS === "web" ? 40 : insets.bottom + 20;

  // Fetch callee user
  useEffect(() => {
    if (!calleeId) return;
    const fetchCallee = async () => {
      try {
        const { data, error } = await supabase.from("users").select("*").eq("id", calleeId).single();
        if (error) {
          console.error("[CallScreen] failed loading callee", error);
          return;
        }
        if (data) {
          setCallee(data as User);
        }
      } catch (error) {
        console.error("[CallScreen] unexpected callee load error", error);
      }
    };
    fetchCallee();
  }, [calleeId]);

  useEffect(() => {
    if (Platform.OS !== "web" || type !== "video") {
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setCameraReady(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
          localVideoRef.current.play().catch((error) => {
            console.error("[CallScreen] local video autoplay failed", error);
          });
        }
      } catch (error) {
        console.error("[CallScreen] camera initialization failed", error);
        Alert.alert("Camera unavailable", "Could not access camera/microphone.");
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      setCameraReady(false);
    };
  }, [type]);

  // Subscribe to call signaling via Supabase Realtime
  useEffect(() => {
    if (!user || !chatId) return;

    const setupCall = async () => {
      try {
        const { data: existingIncoming, error: existingIncomingError } = await supabase
          .from("calls")
          .select("*")
          .eq("chat_id", chatId)
          .eq("callee_id", user.id)
          .in("status", ["calling", "ringing"])
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingIncomingError) {
          console.error("[CallScreen] failed checking incoming call", existingIncomingError);
        }

        if (existingIncoming?.id) {
          callIdRef.current = existingIncoming.id;
          setIncoming(true);
          setStatus("ringing");
        } else {
          const { data: callRow, error: createCallError } = await supabase.from("calls").insert({
            chat_id: chatId,
            caller_id: user.id,
            callee_id: calleeId,
            type,
            status: "calling",
          }).select().single();

          if (createCallError) {
            console.error("[CallScreen] failed creating call", createCallError);
            Alert.alert("Call failed", "Unable to start call.");
            setTimeout(() => goBackOrChats(), 300);
            return;
          }

          if (callRow?.id) {
            callIdRef.current = callRow.id;
            setStatus("ringing");
          }
        }

        const channel = supabase
          .channel(`call-${chatId}`)
          .on("postgres_changes", {
            event: "UPDATE",
            schema: "public",
            table: "calls",
            filter: callIdRef.current ? `id=eq.${callIdRef.current}` : undefined,
          }, (payload: any) => {
            const updated = payload.new;
            if (updated.status === "connected") {
              setStatus("active");
              setIncoming(false);
              if (!timerRef.current) {
                timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
              }
            } else if (updated.status === "ended" || updated.status === "declined") {
              endCall(false);
            }
          })
          .subscribe();

        channelRef.current = channel;
      } catch (error) {
        console.error("[CallScreen] setup call failed", error);
        Alert.alert("Call error", "Unable to set up call.");
      }
    };

    setupCall();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [user, chatId]);

  // Auto-connect after 3s for outgoing demo signaling.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (status === "ringing" && !incoming) {
        setStatus("active");
        timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [incoming, status]);

  const acceptIncomingCall = useCallback(async () => {
    if (!callIdRef.current) {
      return;
    }
    try {
      const { error } = await supabase
        .from("calls")
        .update({ status: "connected" })
        .eq("id", callIdRef.current);
      if (error) {
        console.error("[CallScreen] failed to accept call", error);
        Alert.alert("Call error", "Unable to accept call.");
        return;
      }
      setIncoming(false);
      setStatus("active");
      if (!timerRef.current) {
        timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      }
    } catch (error) {
      console.error("[CallScreen] acceptIncomingCall failed", error);
    }
  }, []);

  const endCall = useCallback(async (updateDB = true) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus("ended");
    try {
      if (updateDB && callIdRef.current) {
        const { error } = await supabase.from("calls").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", callIdRef.current);
        if (error) {
          console.error("[CallScreen] failed to end call in DB", error);
        }
      }
    } finally {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      channelRef.current?.unsubscribe();
      setTimeout(() => goBackOrChats(), 500);
    }
  }, [goBackOrChats]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const statusLabel = status === "connecting" ? "Connecting…" : status === "ringing" ? "Ringing…" : status === "active" ? formatDuration(duration) : "Call ended";

  return (
    <View style={[styles.container, { backgroundColor: colors.callBg, paddingTop: topPad }]}>
      {/* Callee info */}
      <View style={styles.calleeSection}>
        <Avatar
          uri={callee?.avatar_url}
          name={callee?.display_name || callee?.phone || ""}
          size={100}
          showOnline={false}
        />
        <Text style={styles.calleeName}>{callee?.display_name || callee?.phone || "…"}</Text>
        <Text style={styles.callStatus}>{statusLabel}</Text>
        <Text style={styles.callType}>{type === "video" ? "Video call" : "Voice call"}</Text>
        {incoming && (
          <Pressable onPress={acceptIncomingCall} style={styles.acceptBtn}>
            <Text style={styles.acceptBtnText}>Accept</Text>
          </Pressable>
        )}
      </View>

      {Platform.OS === "web" && type === "video" && (
        <View style={styles.videoWrap}>
          <video
            ref={(node) => {
              localVideoRef.current = node;
              if (node && localStreamRef.current) {
                node.srcObject = localStreamRef.current;
              }
            }}
            autoPlay
            muted
            playsInline
            style={{ width: 150, height: 220, borderRadius: 12, backgroundColor: "#000" }}
          />
          <View style={styles.remoteVideoPlaceholder}>
            <Text style={styles.remoteVideoPlaceholderText}>{cameraReady ? "Remote video placeholder" : "Waiting for camera..."}</Text>
          </View>
        </View>
      )}

      {status === "connecting" && (
        <View style={styles.center}>
          <ActivityIndicator color="white" size="large" />
        </View>
      )}

      {/* Controls */}
      <View style={[styles.controls, { paddingBottom: bottomPad }]}>
        {/* Mute */}
        <View style={styles.controlGroup}>
          <Pressable
            style={[styles.controlBtn, { backgroundColor: muted ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)" }]}
            onPress={() => setMuted((v) => !v)}
          >
            <Ionicons name={muted ? "mic-off" : "mic"} size={28} color="white" />
          </Pressable>
          <Text style={styles.controlLabel}>{muted ? "Unmute" : "Mute"}</Text>
        </View>

        {/* End call */}
        <View style={styles.controlGroup}>
          <Pressable style={[styles.controlBtn, styles.endBtn]} onPress={() => endCall(true)}>
            <Ionicons name="call" size={30} color="white" style={{ transform: [{ rotate: "135deg" }] }} />
          </Pressable>
          <Text style={styles.controlLabel}>End</Text>
        </View>

        {/* Speaker */}
        <View style={styles.controlGroup}>
          <Pressable
            style={[styles.controlBtn, { backgroundColor: speaker ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)" }]}
            onPress={() => setSpeaker((v) => !v)}
          >
            <Ionicons name={speaker ? "volume-high" : "volume-medium"} size={28} color="white" />
          </Pressable>
          <Text style={styles.controlLabel}>{speaker ? "Earpiece" : "Speaker"}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "space-between" },
  calleeSection: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  calleeName: { color: "white", fontSize: 28, fontWeight: "700" },
  callStatus: { color: "rgba(255,255,255,0.75)", fontSize: 18 },
  callType: { color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: -6 },
  acceptBtn: {
    marginTop: 10,
    backgroundColor: "#1D9A6C",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  acceptBtnText: { color: "white", fontSize: 14, fontWeight: "700" },
  videoWrap: {
    alignItems: "center",
    gap: 10,
    marginTop: -12,
  },
  remoteVideoPlaceholder: {
    width: 230,
    height: 140,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  remoteVideoPlaceholderText: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  center: { alignItems: "center", marginBottom: 30 },
  controls: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 24,
    paddingHorizontal: 40,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  controlGroup: { alignItems: "center", gap: 8 },
  controlBtn: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center" },
  endBtn: { backgroundColor: "#E11D2A" },
  controlLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
});
