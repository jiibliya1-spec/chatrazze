import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { User } from "@/types";

interface AuthContextType {
  session: Session | null;
  supabaseUser: SupabaseUser | null;
  user: User | null;
  loading: boolean;
  signInWithPhone: (phone: string) => Promise<{ error: string | null }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = useCallback(async (userId: string, userData?: SupabaseUser) => {
    try {
      const { data } = await supabase.from("users").select("*").eq("id", userId).single();
      if (data) {
        setUser(data);
      } else if (userData) {
        // Create user profile if doesn't exist
        // phone is NOT NULL in schema; use empty string fallback for email-only accounts
        const newUser = {
          id: userId,
          phone: userData.phone ?? "",
          display_name: userData.email?.split("@")[0] ?? userData.phone ?? null,
          about: "Available",
          avatar_url: null,
          is_online: true,
          last_seen: new Date().toISOString(),
        };
        const { data: created } = await supabase.from("users").insert(newUser).select().single();
        if (created) setUser(created);
      }
    } catch (err) {
      console.warn("fetchUserProfile error:", err);
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      if (!isSupabaseConfigured) {
        setSession(null);
        setSupabaseUser(null);
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setSupabaseUser(session?.user ?? null);
        if (session?.user) await fetchUserProfile(session.user.id, session.user);
      } catch (err) {
        console.error("Auth initialization error:", err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    if (!isSupabaseConfigured) {
      return;
    }

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setSupabaseUser(session?.user ?? null);
      if (session?.user) {
        try {
          await fetchUserProfile(session.user.id, session.user);
        } catch (err) {
          console.error("Profile fetch error:", err);
        } finally {
          setLoading(false);
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => listener?.subscription?.unsubscribe();
  }, [fetchUserProfile]);

  const signInWithPhone = async (phone: string) => {
    if (!isSupabaseConfigured) {
      return { error: "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY." };
    }
    const { error } = await supabase.auth.signInWithOtp({ phone });
    return { error: error?.message ?? null };
  };

  const verifyOtp = async (phone: string, token: string) => {
    if (!isSupabaseConfigured) {
      return { error: "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY." };
    }
    const { error, data } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    if (!isSupabaseConfigured) {
      setSession(null);
      setSupabaseUser(null);
      setUser(null);
      return;
    }
    if (supabaseUser) {
      await supabase.from("users").update({ is_online: false, last_seen: new Date().toISOString() }).eq("id", supabaseUser.id);
    }
    await supabase.auth.signOut();
  };

  const refreshUser = async () => {
    if (!isSupabaseConfigured) return;
    if (supabaseUser) await fetchUserProfile(supabaseUser.id, supabaseUser);
  };

  return (
    <AuthContext.Provider value={{ session, supabaseUser, user, loading, signInWithPhone, verifyOtp, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}