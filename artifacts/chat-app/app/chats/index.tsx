import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { ChatListItem } from "@/components/ChatListItem";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import { Chat, Message, User } from "@/types";

export default function ChatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchChats = useCallback(async () => {
    if (!user) return;

    const { data: participants } = await supabase
      .from("chat_participants")
      .select("chat_id")
      .eq("user_id", user.id);

    if (!participants || participants.length === 0) {
      setChats([]);
      setLoading(false);
      return;
    }

    const chatIds = participants.map((p) => p.chat_id);

    const { data: chatsData } = await supabase
      .from("chats")
      .select("*")
      .in("id", chatIds)
      .order("created_at", { ascending: false });

    if (!chatsData) {
      setChats([]);
      setLoading(false);
      return;
    }

    const enrichedChats: Chat[] = await Promise.all(
      chatsData.map(async (chat) => {
        const { data: allParticipants } = await supabase
          .from("chat_participants")
          .select("*, user:users(*)")
          .eq("chat_id", chat.id);

        const other = allParticipants?.find((p) => p.user_id !== user.id);
        const otherUser = other?.user as User | undefined;

        const { data: lastMsgData } = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", chat.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("chat_id", chat.id)
          .neq("sender_id", user.id)
          .eq("status", "delivered");

        return {
          ...chat,
          other_user: otherUser,
          last_message: lastMsgData as Message | undefined,
          unread_count: count ?? 0,
        };
      })
    );

    enrichedChats.sort((a, b) => {
      const aTime = a.last_message?.created_at ?? a.created_at;
      const bTime = b.last_message?.created_at ?? b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    setChats(enrichedChats);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchChats();

    const channel = supabase
      .channel("chats-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => fetchChats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchChats]);

  const filteredChats = chats.filter((c) => {
    if (!search) return true;
    const name =
      c.other_user?.display_name || c.other_user?.phone || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <Text style={styles.headerTitle}>Chatraze</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/profile")}
            style={styles.headerBtn}
          >
            <Ionicons name="person-circle-outline" size={26} color="white" />
          </Pressable>
          <Pressable onPress={signOut} style={styles.headerBtn}>
            <Ionicons name="log-out-outline" size={26} color="white" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search conversations..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : filteredChats.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={60} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {search ? "No results found" : "No conversations yet"}
          </Text>
          <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
            {!search && "Start a new chat to connect"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatListItem chat={item} />}
          contentContainerStyle={{ paddingBottom: bottomPad + 80 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled
        />
      )}

      <Pressable
        onPress={() => router.push("/new-chat")}
        style={[
          styles.fab,
          { backgroundColor: colors.primary, bottom: bottomPad + 20 },
        ]}
      >
        <Ionicons name="chatbubble-ellipses" size={26} color="white" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    color: "white",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  headerActions: { flexDirection: "row", gap: 6 },
  headerBtn: { padding: 4 },
  searchContainer: { paddingHorizontal: 12, paddingVertical: 8 },
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
  emptyText: { fontSize: 17, fontWeight: "600", marginTop: 8 },
  emptySubText: { fontSize: 14 },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
