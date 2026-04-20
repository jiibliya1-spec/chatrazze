import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ChatModeProvider } from "@/contexts/ChatModeContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { I18nProvider } from "@/contexts/I18nContext";

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => {
    // Ignore native splash timing errors to avoid blocking first paint.
  });
}

// Debug logging
if (__DEV__) {
  console.log("🚀 App starting - RootLayout rendering");
}

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="auth/email" />
      <Stack.Screen name="auth/phone" />
      <Stack.Screen name="auth/otp" />
      <Stack.Screen name="chats/index" />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="new-chat" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="user/[id]" />
      <Stack.Screen name="settings/notifications" />
      <Stack.Screen name="settings/privacy" />
      <Stack.Screen name="contacts" />
      <Stack.Screen name="call/[id]" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if ((fontsLoaded || fontError) && Platform.OS !== "web") {
      SplashScreen.hideAsync().catch(() => {
        // Ignore native splash timing errors to avoid blocking render.
      });
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError && Platform.OS !== "web") return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <ChatModeProvider>
            <ErrorBoundary>
              <QueryClientProvider client={queryClient}>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <AuthProvider>
                    <RootLayoutNav />
                  </AuthProvider>
                </GestureHandlerRootView>
              </QueryClientProvider>
            </ErrorBoundary>
          </ChatModeProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
