import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';

/**
 * Sends a free user to the Membership tab of the Store when they hit a premium
 * feature. `source` names the feature and is what the funnel records as
 * `paywall_viewed` / `paywall_purchased` `props.source`. `nonce` makes repeat
 * taps re-trigger the Store screen's param handling.
 */
export function useOpenMembership() {
  const navigation = useNavigation<any>();
  return useCallback(
    (source: string) => navigation.navigate('Store', { tab: 'membership', source, nonce: Date.now() }),
    [navigation],
  );
}
