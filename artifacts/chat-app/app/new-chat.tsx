import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useI18n } from "@/contexts/I18nContext";
import { useColors } from "@/hooks/useColors";
import { getOrCreateDirectConversation } from "@/lib/conversations";
import { supabase } from "@/lib/supabase";
import { User } from "@/types";

export default function NewChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 0 : insets.top;

  const goBackOrChats = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/chats");
  };

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        let query = supabase.from("users").select("*").neq("id", user?.id ?? "");
        if (search.trim()) {
          query = query.or(
            `display_name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`
          );
        }
        const { data, error } = await query.order("display_name", { ascending: true }).limit(50);
        if (error) {
          console.error("[NewChat] failed loading users", error);
          setUsers([]);
          return;
        }
        setUsers((data as User[]) ?? []);
      } finally {
        setLoading(false);
      }
    };
    const timer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timer);
  }, [search, user?.id]);

  const openChat = async (otherUserId: string) => {
    if (creating) {
      console.log("[NewChat] ignoring click while request is already in progress", { creating });
      return;
    }

    console.log("User clicked:", otherUserId);
    console.log("CLICK USER", otherUserId);
    setCreating(otherUserId);
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.error("[NewChat] failed to refresh authenticated user", authError);
        throw authError;
      }

      const currentUserId = authData.user?.id ?? user?.id;
      if (!currentUserId) {
        throw new Error("Unable to resolve authenticated user id");
      }

      const { conversationId } = await getOrCreateDirectConversation(currentUserId, otherUserId);

      if (!conversationId) {
        throw new Error("Could not resolve a conversation id");
      }

      console.log("Conversation found or created:", conversationId);
      console.log("CONVERSATION ID", conversationId);
      console.log("NAVIGATING");
      console.log("NAVIGATING TO", conversationId);
      router.push(`/chat/${conversationId}`);
    } catch (error) {
      console.error("[NewChat] openChat failed", error);
      Alert.alert("Unable to open chat", "Please try again.");
    } finally {
      console.log("[NewChat] request finished", { selectedUserId: otherUserId });
      setLoading(false);
      setCreating(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad + 8 }]}>
        <Pressable onPress={goBackOrChats} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("newChat")}</Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder={t("searchByNameOrPhone")}
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : users.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={52} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("noResults")}</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.userRow, { backgroundColor: pressed ? colors.muted : colors.background, borderBottomColor: colors.separator }]}
              onPress={() => {
                console.log("[NewChat] press row", { selectedUserId: item.id });
                openChat(item.id);
              }}
            >
              <Avatar uri={item.avatar_url} name={item.display_name || item.phone} size={52} showOnline isOnline={item.is_online} />
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: colors.foreground }]}>{item.display_name || item.phone}</Text>
                <Text style={[styles.userSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {item.about || item.phone || ""}
                </Text>
              </View>
              {creating === item.id ? (
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, color: "white", fontSize: 20, fontWeight: "700" },
  searchWrap: { paddingHorizontal: 12, paddingVertical: 10 },
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 24, paddingHorizontal: 14, height: 42, borderWidth: 1.5, gap: 8 },
  searchInput: { flex: 1, fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { fontSize: 16 },
  userRow: { flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  userInfo: { flex: 1, marginLeft: 12 },
  userName: { fontSize: 16, fontWeight: "600" },
  userSub: { fontSize: 13, marginTop: 2 },
});
