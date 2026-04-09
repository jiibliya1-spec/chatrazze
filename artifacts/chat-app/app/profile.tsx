import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, signOut, refreshUser } = useAuth();
  const { theme, setTheme, isDark } = useTheme();
  const [name, setName] = useState(user?.display_name ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSaveName = async () => {
    if (!user) return;
    setSaving(true);
    await supabase
      .from("users")
      .update({ display_name: name.trim() || null })
      .eq("id", user.id);
    await refreshUser();
    setSaving(false);
    setEditing(false);
  };

  const toggleDark = (value: boolean) => {
    setTheme(value ? "dark" : "light");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <View style={[styles.profileSection, { backgroundColor: colors.card }]}>
        <Avatar
          uri={user?.avatar_url}
          name={user?.display_name || user?.phone}
          size={80}
        />
        <View style={styles.profileText}>
          {editing ? (
            <View style={styles.editRow}>
              <TextInput
                style={[styles.nameInput, { color: colors.foreground, borderBottomColor: colors.primary }]}
                value={name}
                onChangeText={setName}
                autoFocus
                placeholder="Display name"
                placeholderTextColor={colors.mutedForeground}
              />
              {saving ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Pressable onPress={handleSaveName}>
                  <Ionicons name="checkmark" size={24} color={colors.primary} />
                </Pressable>
              )}
            </View>
          ) : (
            <Pressable onPress={() => setEditing(true)} style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.foreground }]}>
                {user?.display_name || "Add your name"}
              </Text>
              <Ionicons name="pencil" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
          <Text style={[styles.phone, { color: colors.mutedForeground }]}>
            {user?.phone}
          </Text>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
          <View style={styles.settingLeft}>
            <Ionicons name="moon-outline" size={22} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>Dark Mode</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleDark}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="white"
          />
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, marginTop: 8 }]}>
        <Pressable
          onPress={signOut}
          style={[styles.settingRow, { borderBottomColor: colors.border }]}
        >
          <View style={styles.settingLeft}>
            <Ionicons name="log-out-outline" size={22} color={colors.destructive} />
            <Text style={[styles.settingLabel, { color: colors.destructive }]}>Sign Out</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
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
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    gap: 16,
    marginBottom: 8,
  },
  profileText: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 20, fontWeight: "700" },
  phone: { fontSize: 14, marginTop: 4 },
  editRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  nameInput: {
    flex: 1,
    fontSize: 18,
    borderBottomWidth: 2,
    paddingBottom: 2,
  },
  section: { marginTop: 8 },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  settingLabel: { fontSize: 16 },
});
