import React, { useMemo, useState } from 'react';
import { StyleSheet, View, LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { Colors } from '../../constants/theme';
import type { LivePose } from '../../lib/pose/useFormCoach';
import { buildSkeleton } from '../../lib/pose/skeleton';

interface Props {
  pose: LivePose | null;
  /** Joints the current exercise is measured on — drawn in ember. */
  focus: Set<string>;
  /** True when the preview is a mirrored selfie view. */
  previewMirrored: boolean;
  /** Dim the skeleton when the tracker can't count right now. */
  dimmed?: boolean;
}

/**
 * Live pose skeleton drawn over the camera preview.
 *
 * Must sit in the same box as the <Camera>, which renders in "cover" mode —
 * `buildSkeleton` applies that same crop so the lines land on the body.
 */
export function SkeletonOverlay({ pose, focus, previewMirrored, dimmed }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const skeleton = useMemo(() => {
    if (!pose || size.width === 0) return null;
    return buildSkeleton(pose.landmarks, {
      xMax: pose.xMax,
      viewWidth: size.width,
      viewHeight: size.height,
      // The preview and the analysed frame can disagree about mirroring;
      // flip only when they do.
      mirror: previewMirrored !== pose.frameMirrored,
    }, focus);
  }, [pose, size, focus, previewMirrored]);

  const opacity = dimmed ? 0.35 : 1;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {skeleton && (
        <Svg width={size.width} height={size.height} style={{ opacity }}>
          {skeleton.bones.map(b => (
            <Line
              key={b.key}
              x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}
              stroke={b.focus ? Colors.primary : Colors.text}
              strokeOpacity={b.focus ? 0.95 : 0.55}
              strokeWidth={b.focus ? 5 : 3}
              strokeLinecap="round"
            />
          ))}
          {skeleton.joints.map(j => (
            <Circle
              key={j.name}
              cx={j.x} cy={j.y}
              r={j.focus ? 7 : 5}
              fill={j.focus ? Colors.primary : Colors.text}
              fillOpacity={j.focus ? 1 : 0.8}
              stroke={Colors.background}
              strokeWidth={1.5}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}
