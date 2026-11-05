import React from 'react';
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

export const GEAR_IMAGE_DISCLAIMER =
  'Images are AI-generated illustrations. See Amazon for actual product photos and details.';

// The original artwork used on myryzr.com/shop, bundled for offline display.
// Each cell occupies one column and row of a 3-column, 4-row square atlas.
const ARTWORK = require('../../../assets/gear/shop-illustrations.png');
const POSITIONS: Readonly<Record<string, readonly [number, number]>> = {
  B09PH9PNYY: [0, 0], // Phone tripod
  B0CW9MSMK4: [1, 0], // Ring light tripod
  B07837W5NX: [2, 0], // Flexible mount
  B0C37RKB5T: [0, 1], // Resistance tubes
  B084H4Q8VJ: [1, 1], // Workout mat
  B01AVDVHTI: [2, 1], // Mini loop bands
  B07BB3VQ42: [0, 2], // Lifting straps
  B00XM2MXK8: [1, 2], // Foam roller
  B00GL2HMES: [2, 2], // Creatine
  B002DYIZH6: [0, 3], // Whey protein
  B01LZQ8OYE: [1, 3], // Shaker bottle
};

interface Props {
  asin: string;
  icon: keyof typeof Ionicons.glyphMap;
  size?: number;
}

/** Decorative thumbnail: the adjacent product name supplies its accessible label. */
export function GearArtwork({ asin, icon, size = 64 }: Props) {
  const position = Object.prototype.hasOwnProperty.call(POSITIONS, asin)
    ? POSITIONS[asin]
    : undefined;
  const tileHeight = size * 3 / 4;

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: position ? Colors.background : Colors.primary + '22',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {position ? (
        <View style={{ width: size, height: tileHeight, overflow: 'hidden' }}>
          <Image
            source={ARTWORK}
            accessible={false}
            fadeDuration={0}
            resizeMode="stretch"
            style={{
              position: 'absolute',
              width: size * 3,
              height: size * 3,
              left: -position[0] * size,
              top: -position[1] * tileHeight,
            }}
          />
        </View>
      ) : (
        // New catalog products retain their configured icon until art is added.
        <Ionicons name={icon} size={24} color={Colors.primary} />
      )}
    </View>
  );
}
