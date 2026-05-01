import { create } from 'zustand';
import Purchases, { PurchasesPackage, CustomerInfo } from 'react-native-purchases';

export const REVENUECAT_API_KEY_IOS = 'appl_YOUR_IOS_KEY_HERE';
export const REVENUECAT_API_KEY_ANDROID = 'goog_YOUR_ANDROID_KEY_HERE';

export const ENTITLEMENT_PREMIUM = 'premium';

interface SubscriptionState {
  isPremium: boolean;
  customerInfo: CustomerInfo | null;
  packages: PurchasesPackage[];
  loading: boolean;
  initialized: boolean;

  initialize: (userId: string) => Promise<void>;
  fetchOfferings: () => Promise<void>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<void>;
  checkPremium: () => Promise<void>;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  isPremium: true, // DEV: set false before shipping
  customerInfo: null,
  packages: [],
  loading: false,
  initialized: false,

  initialize: async (userId) => {
    // TESTER MODE: skip RevenueCat, everyone gets premium
    set({ isPremium: true, initialized: true });
    return;

    try {
      Purchases.configure({ apiKey: REVENUECAT_API_KEY_IOS });
      await Purchases.logIn(userId);
      const info = await Purchases.getCustomerInfo();
      const isPremium = info.entitlements.active[ENTITLEMENT_PREMIUM] !== undefined;
      set({ isPremium, customerInfo: info, initialized: true });
    } catch {
      set({ initialized: true });
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
    } catch {
      return false;
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
    // TESTER MODE: always premium
    set({ isPremium: true });
  },
}));
