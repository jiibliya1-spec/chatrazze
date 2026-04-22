import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useChatMode } from "@/contexts/ChatModeContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import { User } from "@/types";

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    isDemoMode,
    demoContacts,
    demoBlockedUsers,
    getDemoUser,
    addDemoContact,
    toggleDemoBlockedUser,
    startDemoChat,
  } = useChatMode();

  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 12;

  const goBackOrChats = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/chats");
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      if (isDemoMode) {
        setProfile(getDemoUser(id) ?? null);
        setLoading(false);
        return;
      }

      const { data } = await supabase.from("users").select("*").eq("id", id).single();
      setProfile((data as User | null) ?? null);
      setLoading(false);
    };

    setLoading(true);
    loadProfile();
  }, [getDemoUser, id, isDemoMode]);

  // ✅ FIX كامل هنا
  const handleStartChat = async () => {
    if (!id || !user) return;

    setBusyAction("chat");

    try {
      if (isDemoMode) {
        const chatId = startDemoChat(id);
        router.replace({ pathname: "/chat/[id]", params: { id: chatId } });
        return;
      }

      // 🔥 تأكد من contact
      await supabase.from("contacts").upsert([
        { user_id: user.id, contact_id: id, status: "accepted" },
        { user_id: id, contact_id: user.id, status: "accepted" },
      ]);

      // 🔥 قلب على chat موجود
      const { data: myChats } = await supabase
        .from("chat_participants")
        .select("chat_id")
        .eq("user_id", user.id);

      let chatId: string | null = null;

      if (myChats) {
        for (const chat of myChats) {
          const { data: match } = await supabase
            .from("chat_participants")
            .select("chat_id")
            .eq("chat_id", chat.chat_id)
            .eq("user_id", id)
            .maybeSingle();

          if (match) {
            chatId = chat.chat_id;
            break;
          }
        }
      }

      // 🔥 إلا ماكانش → صايب واحد جديد
      if (!chatId) {
        const { data: newChat } = await supabase
          .from("chats")
          .insert({})
          .select()
          .single();

        if (!newChat) throw new Error("Failed to create chat");

        await supabase.from("chat_participants").insert([
          { chat_id: newChat.id, user_id: user.id },
          { chat_id: newChat.id, user_id: id },
        ]);

        chatId = newChat.id;
      }

      // 🔥 دخل للشات
      router.replace({
        pathname: "/chat/[id]",
        params: { id: chatId },
      });

    } catch (error) {
      console.error("CHAT ERROR:", error);
      Alert.alert("Error", "Failed to start chat");
    } finally {
      setBusyAction(null);
    }
  };

  const handleCall = (type: "audio" | "video") => {
    if (!id) return;
    const chatId = isDemoMode ? startDemoChat(id) : `direct-${id}`;
    router.push({ pathname: "/call/[id]", params: { id: chatId, calleeId: id, type } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: topPad + 10, padding: 16, backgroundColor: colors.headerBg }}>
        <Pressable onPress={goBackOrChats}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator />
      ) : (
        <ScrollView>
          <View style={{ alignItems: "center", padding: 20 }}>
            <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={90} />
            <Text>{profile?.display_name}</Text>
          </View>

          <Pressable
            onPress={handleStartChat}
            style={{ backgroundColor: "red", margin: 20, padding: 15, borderRadius: 10 }}
          >
            {busyAction === "chat" ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={{ color: "white", textAlign: "center" }}>Message</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({});