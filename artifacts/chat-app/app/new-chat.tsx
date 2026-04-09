import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import { User } from "@/types";

export default function NewChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      let query = supabase
        .from("users")
        .select("*")
        .neq("id", user?.id ?? "");

      if (search) {
        query = query.or(`display_name.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      const { data } = await query.limit(30);
      setUsers((data as User[]) ?? []);
      setLoading(false);
    };

    const timer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timer);
  }, [search, user?.id]);

  const startChat = async (otherUserId: string) => {
    if (!user) return;
    setStarting(otherUserId);

    const { data: existing } = await supabase
      .from("chat_participants")
      .select("chat_id")
      .eq("user_id", user.id);

    const { data: otherParticipants } = await supabase
      .from("chat_participants")
      .select("chat_id")
      .eq("user_id", otherUserId);

    const myChats = new Set((existing ?? []).map((p) => p.chat_id));
    const sharedChat = (otherParticipants ?? []).find((p) => myChats.has(p.chat_id));

    if (sharedChat) {
      router.replace(`/chat/${sharedChat.chat_id}`);
      return;
    }

    const { data: newChat } = await supabase
      .from("chats")
      .insert({})
      .select()
      .single();

    if (newChat) {
      await supabase.from("chat_participants").insert([
        { chat_id: newChat.id, user_id: user.id },
        { chat_id: newChat.id, user_id: otherUserId },
      ]);
      router.replace(`/chat/${newChat.id}`);
    }

    setStarting(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </Pressable>
        <Text style={styles.headerTitle}>New Chat</Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by name or phone..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : users.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={50} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {search ? "No users found" : "No other users yet"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => startChat(item.id)}
              style={({ pressed }) => [
                styles.userItem,
                { backgroundColor: pressed ? colors.muted : colors.background },
              ]}
            >
              <Avatar
                uri={item.avatar_url}
                name={item.display_name || item.phone}
                size={48}
                showOnline
                isOnline={item.is_online}
              />
              <View style={[styles.userInfo, { borderBottomColor: colors.border }]}>
                <Text style={[styles.userName, { color: colors.foreground }]}>
                  {item.display_name || item.phone}
                </Text>
                <Text style={[styles.userPhone, { color: colors.mutedForeground }]}>
                  {item.display_name ? item.phone : item.is_online ? "Online" : "Offline"}
                </Text>
              </View>
              {starting === item.id ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: "white", fontSize: 20, fontWeight: "700" },
  searchWrap: { paddingHorizontal: 12, paddingVertical: 8 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { fontSize: 16, marginTop: 8 },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 16,
    paddingVertical: 8,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userName: { fontSize: 16, fontWeight: "600" },
  userPhone: { fontSize: 13, marginTop: 2 },
});
