// Amazon affiliate links for the gear in the `gear_products` Supabase table
// (Store > Gear tab, and the "Refuel" card after a workout).

import { Alert, Linking } from 'react-native';

// Amazon Associates tracking tag. Links without a valid tag still open, they
// just don't earn commission.
export const AMAZON_ASSOCIATE_TAG = 'bradikshop-20';

/** `gear_products.section` for the post-workout supplement/recovery picks. */
export const REFUEL_SECTION = 'Recovery & Fuel';

export function amazonUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}?tag=${AMAZON_ASSOCIATE_TAG}`;
}

export function openAmazonProduct(asin: string): void {
  Linking.openURL(amazonUrl(asin)).catch(() =>
    Alert.alert('Could not open link', 'Please try again in a moment.')
  );
}
