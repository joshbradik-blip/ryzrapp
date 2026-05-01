import { NativeModules, Platform } from 'react-native';

const { PrismModule } = NativeModules;

export async function startBodyScan(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    throw new Error('Body scan is currently Android-only. iOS support coming soon.');
  }
  if (!PrismModule) {
    throw new Error('PrismModule not found. Make sure you are running a dev build, not Expo Go.');
  }
  return PrismModule.startScan();
}
