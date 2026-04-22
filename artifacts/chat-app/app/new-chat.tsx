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

    const fetchUsers = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from("users")
          .select("*")
          .neq("id", user.id);

        if (search.trim()) {
          query = query.or(
            `display_name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`
          );
        }

        const { data, error } = await query
          .order("display_name", { ascending: true })
          .limit(50);

        if (error) {
          console.error("[NewChat] failed loading users", error);
          setUsers([]);
        } else {
          setUsers((data as User[]) ?? []);
        }
      } catch (err) {
        console.error("[NewChat] fetchUsers error:", err);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timer);
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
        </View>
      </View>

      {loading ? (
        <View style={styles.center}> 
          <ActivityIndicator color={colors.primary} /> 
        </View> 
      ) : ( 
        <FlatList 
          data={users} 
          keyExtractor={(item) => item.id} 
          renderItem={({ item }) => ( 
            <Pressable 
              style={styles.userRow} 
              onPress={() => openChat(item.id)} 
            > 
              <Avatar 
                uri={item.avatar_url} 
                name={item.display_name || item.phone} 
                size={52} 
                showOnline 
                isOnline={item.is_online} 
              /> 
              <View style={styles.userInfo}> 
                <Text style={[styles.userName, { color: colors.foreground }]}> 
                  {item.display_name || item.phone} 
                </Text> 
              </View> 

              {creating === item.id && ( 
                <ActivityIndicator color={colors.primary} size="small" /> 
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14 }, 
  backBtn: { padding: 4 }, 
  headerTitle: { color: "white", fontSize: 20, fontWeight: "700" }, 
  searchWrap: { padding: 12 }, 
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 24, paddingHorizontal: 14, height: 42, borderWidth: 1.5 }, 
  searchInput: { flex: 1 }, 
  center: { flex: 1, justifyContent: "center", alignItems: "center" }, 
  userRow: { flexDirection: "row", alignItems: "center", padding: 12 }, 
  userInfo: { marginLeft: 10 }, 
  userName: { fontSize: 16 }, 
});