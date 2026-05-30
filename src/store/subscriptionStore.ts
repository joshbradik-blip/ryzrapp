import { create } from 'zustand';
import { Platform } from 'react-native';
import Purchases, { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { supabase } from '../lib/supabase';

export const REVENUECAT_API_KEY_IOS = 'appl_ncBNRQuNkRYHyRUGOxYRenoKvGA';
export const REVENUECAT_API_KEY_ANDROID = 'goog_SqmsQvDGeXhkJJrdDoFDeQAiyeP';

export const ENTITLEMENT_PREMIUM = 'premium';

// ── Beta tester allowlist ─────────────────────────────────────────────────────
// Any account signed in with one of these emails gets isPremium=true
// automatically, regardless of RevenueCat status.  Add / remove freely.
export const BETA_TESTERS: string[] = [
  'sendtojoshperry@gmail.com',
  'aideni1026@gmail.com',
  'carnell.jones@gmail.com',
  'intosurf@gmail.com',
  'isaaccd0711@gmail.com',
  'joerob32189@gmail.com',
  'kgivler@gmail.com',
  'pmanbooking@gmail.com',
  'toasty1mk3vw@gmail.com',
  'anareliclements@gmail.com',
  'jeffneely@gmail.com',
  'jjpprayin@gmail.com',
  'lcoons69@gmail.com',
  'olossus@gmail.com',
  'onegolfnut1330@yahoo.com',
  'jackie.okler@gmail.com',
  'joshbradik@gmail.com',
  'bnolan8@cox.net',
  'bradenrichardson3321@gmail.com',
  'wurkb@hotmail.com',
  'autumnlovesjesus@gmail.com',
  'godlovesgavin@gmail.com',
  'godlovesjp@gmail.com',
  'primadawna@msn.com',
  'briannacake540@gmail.com',
  'thytar@ymail.com',
  'kevster069@hotmail.com',
  'johnny760@me.com',
  'richardkelly88@gmail.com',
  'thomas.lee.verdugo@gmail.com',
  'lukasleddington@gmail.com',
  'cliffgorman2020@gmail.com',
  'angel.perry1201@gmail.com',
  'test@ryzr.com',
];

// Pricing constants — update RevenueCat dashboard to match
export const PRICE_MONTHLY = 14.99;
export const PRICE_ANNUAL = 89.99;
export const PRICE_LIFETIME = 100;
export const LIFETIME_SLOTS_TOTAL = 100;

interface SubscriptionState {
  isPremium: boolean;
  customerInfo: CustomerInfo | null;
  packages: PurchasesPackage[];
  loading: boolean;
  initialized: boolean;
  lifetimeSlotsRemaining: number;

  initialize: (userId: string) => Promise<void>;
  logOut: () => Promise<void>;
  grantPremium: () => void;
  fetchOfferings: () => Promise<void>;
  fetchLifetimeSlots: () => Promise<void>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  purchaseLifetime: () => Promise<boolean>;
  restorePurchases: () => Promise<void>;
  checkPremium: () => Promise<void>;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  isPremium: false,
  customerInfo: null,
  packages: [],
  loading: false,
  initialized: false,
  lifetimeSlotsRemaining: LIFETIME_SLOTS_TOTAL,

  initialize: async (userId) => {
    try {
      const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
      Purchases.configure({ apiKey });
      await Purchases.logIn(userId);
      const info = await Purchases.getCustomerInfo();
      const isPremium = info.entitlements.active[ENTITLEMENT_PREMIUM] !== undefined;
      set({ isPremium, customerInfo: info, initialized: true });
    } catch {
      // RevenueCat not yet configured — default free
      set({ initialized: true });
    }

    // Beta tester override — grant premium to whitelisted emails regardless of RC
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email && BETA_TESTERS.includes(user.email.toLowerCase())) {
        set({ isPremium: true });
      }
    } catch { /* non-critical */ }

    get().fetchLifetimeSlots();
  },

  // Reset RevenueCat to an anonymous user on sign-out so the next account
  // on this device doesn't inherit the previous user's entitlements.
  logOut: async () => {
    try {
      await Purchases.logOut();
    } catch {
      // RevenueCat not configured, or already anonymous — safe to ignore
    }
    set({ isPremium: false, customerInfo: null, packages: [] });
  },

  grantPremium: () => set({ isPremium: true }),

  fetchLifetimeSlots: async () => {
    try {
      // Run this SQL once in Supabase to create the table:
      //   create table promo_config (key text primary key, value integer not null);
      //   insert into promo_config (key, value) values ('lifetime_slots_remaining', 100);
      const { data } = await supabase
        .from('promo_config')
        .select('value')
        .eq('key', 'lifetime_slots_remaining')
        .single();
      if (data) set({ lifetimeSlotsRemaining: data.value });
    } catch {
      // Table not yet created — show full 100 slots
    }
  },

  fetchOfferings: async () => {
    set({ loading: true });
    try {
      const offerings = await Purchases.getOfferings();
      const pkgs = offerings.current?.availablePackages ?? [];
      set({ packages: pkgs });
    } finally {
      set({ loading: false });
    }
  },

  purchasePackage: async (pkg) => {
    set({ loading: true });
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const isPremium = customerInfo.entitlements.active[ENTITLEMENT_PREMIUM] !== undefined;
      set({ isPremium, customerInfo });
      return isPremium;
    } catch (e: any) {
      if (e?.userCancelled) return false;
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  purchaseLifetime: async () => {
    set({ loading: true });
    try {
      const pkg = get().packages.find((p) => p.packageType === 'LIFETIME');
      if (!pkg) {
        // Offerings not loaded yet — don't grant access
        return false;
      }
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const isPremium = customerInfo.entitlements.active[ENTITLEMENT_PREMIUM] !== undefined;
      if (isPremium) {
        set({ isPremium, customerInfo });
        await supabase.rpc('decrement_lifetime_slots');
        await get().fetchLifetimeSlots();
      }
      return isPremium;
    } catch (e: any) {
      if (e?.userCancelled) return false;
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  restorePurchases: async () => {
    set({ loading: true });
    try {
      const info = await Purchases.restorePurchases();
      const isPremium = info.entitlements.active[ENTITLEMENT_PREMIUM] !== undefined;
      set({ isPremium, customerInfo: info });
    } finally {
      set({ loading: false });
    }
  },

  checkPremium: async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      const isPremium = info.entitlements.active[ENTITLEMENT_PREMIUM] !== undefined;
      set({ isPremium, customerInfo: info });
    } catch {
      // Ignore
    }
  },
}));
