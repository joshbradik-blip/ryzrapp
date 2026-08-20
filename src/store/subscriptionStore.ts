import { create } from 'zustand';
import { Platform, Linking } from 'react-native';
import Purchases, { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { supabase } from '../lib/supabase';
import { getFreeTrial } from '../lib/trial';
import { logFunnelStep } from '../lib/funnel';

export const REVENUECAT_API_KEY_IOS = 'appl_ncBNRQuNkRYHyRUGOxYRenoKvGA';
export const REVENUECAT_API_KEY_ANDROID = 'goog_SqmsQvDGeXhkJJrdDoFDeQAiyeP';

export const ENTITLEMENT_PREMIUM = 'premium';

// Apple reviewer test account + RYZR owner accounts. Other beta testers should use RevenueCat promotional entitlements.
export const BETA_TESTERS: string[] = [
  'test@ryzr.com',
  'joshbradik@gmail.com',
  'sendtojoshperry@gmail.com',
];

// Pricing constants — update RevenueCat dashboard to match
export const PRICE_MONTHLY = 14.99;
export const PRICE_ANNUAL = 89.99;
export const PRICE_LIFETIME = 99.99;
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
  redeemCode: (code?: string) => Promise<void>;
  restorePurchases: () => Promise<boolean>;
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
    // Resolve the signed-in email ONCE, from the locally cached session rather
    // than auth.getUser() — getUser() is a network round-trip, and when it failed
    // the beta-tester override below silently lost premium for whitelisted users.
    let email: string | null = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      email = session?.user?.email ?? null;
    } catch { /* non-critical */ }

    try {
      const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
      Purchases.configure({ apiKey });
      await Purchases.logIn(userId);
      // RevenueCat only knows users by the Supabase UUID we log in with, which
      // makes granting promotional entitlements (free weeks/months) a
      // UUID-lookup chore. Attaching the email makes customers searchable by it
      // in the RevenueCat dashboard.
      if (email) Purchases.setEmail(email).catch(() => {});
      const info = await Purchases.getCustomerInfo();
      const isPremium = info.entitlements.active[ENTITLEMENT_PREMIUM] !== undefined;
      set({ isPremium, customerInfo: info, initialized: true });
      // Pre-load offerings so purchase buttons work immediately
      get().fetchOfferings();
    } catch {
      set({ initialized: true });
    }

    // Beta tester override — grant premium to whitelisted emails regardless of RC
    if (email && BETA_TESTERS.includes(email.toLowerCase())) {
      set({ isPremium: true });
    }

    get().fetchLifetimeSlots();
    get().fetchOfferings();
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
      // Logged here rather than in each paywall so every purchase surface is
      // covered by one call site and none can drift out of sync.
      const trial = getFreeTrial(pkg);
      if (isPremium && trial) {
        logFunnelStep(
          'trial_started',
          { plan: pkg.packageType, days: trial.count, unit: trial.unit },
          false
        );
      }
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

  // Promo / offer code redemption.
  //
  // iOS: StoreKit's native redemption sheet opens over the app — the user types
  //   the code there and the purchase flows back through RevenueCat normally.
  //   Apple gives no result callback, so we re-check entitlements on return.
  // Android: there is no in-app redemption API. The Play Store's redeem page is
  //   the only path; deep-linking it with `?code=` pre-fills the field, which is
  //   as close to in-app as Google allows.
  redeemCode: async (code) => {
    if (Platform.OS === 'ios') {
      await Purchases.presentCodeRedemptionSheet();
      return;
    }
    const trimmed = (code ?? '').trim();
    const url = trimmed
      ? `https://play.google.com/redeem?code=${encodeURIComponent(trimmed)}`
      : 'https://play.google.com/redeem';
    await Linking.openURL(url);
  },

  restorePurchases: async () => {
    set({ loading: true });
    try {
      const info = await Purchases.restorePurchases();
      const isPremium = info.entitlements.active[ENTITLEMENT_PREMIUM] !== undefined;
      set({ isPremium, customerInfo: info });
      return isPremium;
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
