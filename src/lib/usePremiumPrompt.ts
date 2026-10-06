import { useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { useOpenMembership } from './openMembership';
import { useSubscriptionStore } from '../store/subscriptionStore';
import { getFreeTrial } from './trial';
import { premiumPromptCopy } from './trialHeadline';
import { logFunnelStep } from './funnel';

/**
 * Shown when a free user taps a premium feature. A small prompt, not a redirect:
 * the user chooses "View Premium" to open Store → Membership, or "Not now" to
 * stay where they are. `source` names the feature for the funnel; the wording
 * itself stays generic. For explicit upgrade buttons use useOpenMembership.
 */
export function usePremiumPrompt() {
  const openMembership = useOpenMembership();
  const packages = useSubscriptionStore((s) => s.packages);
  const fetchOfferings = useSubscriptionStore((s) => s.fetchOfferings);

  // Offerings are normally loaded by the Store tab; make sure the trial is known here too.
  useEffect(() => {
    if (packages.length === 0) fetchOfferings();
  }, []);

  return useCallback(
    (source: string) => {
      const trial =
        getFreeTrial(packages.find((p) => p.packageType === 'ANNUAL')) ??
        getFreeTrial(packages.find((p) => p.packageType === 'MONTHLY'));
      const copy = premiumPromptCopy(trial?.duration);
      logFunnelStep('premium_prompt_shown', { source }, false);
      Alert.alert(copy.title, copy.message, [
        { text: 'Not now', style: 'cancel' },
        { text: copy.action, onPress: () => openMembership(source) },
      ]);
    },
    [packages, openMembership],
  );
}
