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
import { autoCreateContactsIfNeeded, getOrCreateDirectConversation } from "@/lib/conversations";
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
    // Guard: if user ID is not available, don't fetch
    if (!user?.id) {
      setUsers([]);
      setLoading(false);
      return;
    }

    let isActive = true;

    const fetchUsers = async () => {
      setLoading(true);

      try {
        let query = supabase.from("users").select("*").neq("id", user.id);

        const term = search.trim();
        if (term) {
          query = query.or(
            `display_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`
          );
        }

        const { data, error } = await query
          .order("display_name", { ascending: true })
          .limit(50);

        if (!isActive) return;

        if (error) {
          console.error("[NewChat] failed loading users", error);
          setUsers([]);
          return;
        }

        setUsers((data as User[]) ?? []);
      } catch (err) {
        if (!isActive) return;
        console.error("[NewChat] fetchUsers error:", err);
        setUsers([]);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    const timer = setTimeout(fetchUsers, 300);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [search, user?.id]);

  const openChat = async (otherUserId: string) => {
    if (creating) return;

    setCreating(otherUserId);
    setLoading(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id ?? user?.id;

      if (!currentUserId) {
        throw new Error("No user");
      }

      // 🔥 إنشاء contact أوتوماتيك
      await autoCreateContactsIfNeeded(currentUserId, otherUserId);

      // 🔥 إنشاء أو جلب conversation
      const { conversationId } = await getOrCreateDirectConversation(
        currentUserId,
        otherUserId
      );

      if (!conversationId) {
        throw new Error("No conversation");
      }

      // ✅ الإصلاح هنا (navigation صحيح)
      router.push({
        pathname: "/chat/[id]",
        params: {
          id: conversationId,
          userId: otherUserId,
        },
      });
    } catch (error) {
      console.error("[NewChat] openChat failed", error);
      Alert.alert("Error", "Cannot open chat");
    } finally {
      setLoading(false);
      setCreating(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>\n      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad + 8 }]}>\n        <Pressable onPress={goBackOrChats} style={styles.backBtn}>\n          <Ionicons name="arrow-back" size={24} color="white" />\n        </Pressable>\n        <Text style={styles.headerTitle}>{t("newChat")}</Text>\n      </View>\n      <View style={[styles.searchWrap, { backgroundColor: colors.background }]}>\n        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>\n          <Ionicons name="search" size={16} color={colors.mutedForeground} />\n          <TextInput\n            style={[styles.searchInput, { color: colors.foreground }]}\n            placeholder={t("searchByNameOrPhone")}\n            placeholderTextColor={colors.mutedForeground}\n            value={search}\n            onChangeText={setSearch}\n            autoFocus\n          />\n        </View>\n      </View>\n      {loading ? (\n        <View style={styles.center}>\n          <ActivityIndicator color={colors.primary} />\n        </View>\n      ) : (\n        <FlatList\n          data={users}\n          keyExtractor={(item) => item.id}\n          renderItem={({ item }) => (\n            <Pressable\n              style={styles.userRow}\n              onPress={() => openChat(item.id)}\n            >\n              <Avatar\n                uri={item.avatar_url}\n                name={item.display_name || item.phone}\n                size={52}\n                showOnline\n                isOnline={item.is_online}\n              />\n              <View style={styles.userInfo}>\n                <Text style={[styles.userName, { color: colors.foreground }]}>\n                  {item.display_name || item.phone}\n                </Text>\n              </View>\n              {creating === item.id && (\n                <ActivityIndicator color={colors.primary} size="small" />\n              )} \n            </Pressable>\n          )} \n        />\n      )} \n    </View>\n  );\n}\n
const styles = StyleSheet.create({\n  container: { flex: 1 },\n  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14 },\n  backBtn: { padding: 4 },\n  headerTitle: { color: "white", fontSize: 20, fontWeight: "700" },\n  searchWrap: { padding: 12 },\n  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 24, paddingHorizontal: 14, height: 42, borderWidth: 1.5 },\n  searchInput: { flex: 1 },\n  center: { flex: 1, justifyContent: "center", alignItems: "center" },\n  userRow: { flexDirection: "row", alignItems: "center", padding: 12 },\n  userInfo: { marginLeft: 10 },\n  userName: { fontSize: 16 },\n});