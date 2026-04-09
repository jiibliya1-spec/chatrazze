import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function OtpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { verifyOtp } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const handleVerify = async () => {
    if (code.length < 4) {
      setError("Enter the full verification code");
      return;
    }
    setError(null);
    setLoading(true);
    const { error } = await verifyOtp(phone!, code.trim());
    setLoading(false);
    if (error) {
      setError(error);
    } else {
      router.replace("/chats");
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 20 },
      ]}
    >
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Ionicons name="arrow-back" size={24} color={colors.foreground} />
      </Pressable>

      <View style={styles.iconWrapper}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
          <Ionicons name="shield-checkmark" size={40} color={colors.primary} />
        </View>
      </View>

      <Text style={[styles.title, { color: colors.foreground }]}>
        Verification Code
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Enter the code sent to{"\n"}
        <Text style={{ color: colors.foreground, fontWeight: "600" }}>{phone}</Text>
      </Text>

      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={[styles.codeContainer, { borderColor: colors.border }]}
      >
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          style={[styles.codeInput, { color: colors.foreground }]}
          autoFocus
          textAlign="center"
          letterSpacing={12}
          fontSize={28}
          fontWeight="700"
        />
      </Pressable>

      {error && (
        <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
      )}

      <Pressable
        onPress={handleVerify}
        disabled={loading}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>Verify</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  back: { marginBottom: 24 },
  iconWrapper: { alignItems: "center", marginBottom: 24 },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  codeContainer: {
    borderWidth: 1.5,
    borderRadius: 14,
    marginBottom: 16,
    paddingVertical: 8,
  },
  codeInput: {
    height: 60,
    paddingHorizontal: 16,
  },
  error: {
    textAlign: "center",
    fontSize: 13,
    marginBottom: 12,
  },
  button: {
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonText: { color: "white", fontSize: 17, fontWeight: "700" },
});
