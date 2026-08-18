import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { useSubscriptionStore } from './subscriptionStore';
import * as socialAuth from '../lib/socialAuth';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  passwordRecovery: boolean;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  setSession: (session: Session | null) => void;
  setInitialized: () => void;
  setPasswordRecovery: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: false,
  initialized: false,
  passwordRecovery: false,

  setSession: (session) =>
    set({ session, user: session?.user ?? null }),

  setInitialized: () => set({ initialized: true }),

  setPasswordRecovery: (v) => set({ passwordRecovery: v }),

  signUp: async (email, password, name) => {
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw error;
    } finally {
      set({ loading: false });
    }
  },

  signIn: async (email, password) => {
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Provider sign-in doubles as sign-up: Supabase creates the user on first use.
  signInWithApple: async () => {
    set({ loading: true });
    try {
      await socialAuth.signInWithApple();
    } finally {
      set({ loading: false });
    }
  },

  signInWithGoogle: async () => {
    set({ loading: true });
    try {
      await socialAuth.signInWithGoogle();
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    await useSubscriptionStore.getState().logOut();
    set({ session: null, user: null });
  },

  deleteAccount: async () => {
    set({ loading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.functions.invoke('delete-account', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }
      await supabase.auth.signOut();
      await useSubscriptionStore.getState().logOut();
      set({ session: null, user: null });
    } finally {
      set({ loading: false });
    }
  },
}));
