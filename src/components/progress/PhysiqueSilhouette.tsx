import React from 'react';
import Svg, { Path, Circle, Rect, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Colors, Gradients } from '../../constants/theme';

/**
 * A stylized body silhouette whose torso taper and muscle definition scale
 * with body-fat %. This is deliberately an abstract illustration — never a
 * photo or a claim about a specific person's future body — so it motivates
 * without pretending to predict an exact appearance.
 *
 * Geometry is driven by a single "leanness" factor derived from the body-fat
 * value against sex-specific bounds: leaner → broader shoulders, narrower
 * waist, and muscle-definition lines that fade in.
 */
interface Props {
  bodyFatPct: number;
  sex?: 'male' | 'female';
  /** 'future' fills with ember; 'now' uses a muted grey for contrast. */
  variant?: 'now' | 'future';
  /** Rendered width in px; height is derived from the 120×250 viewBox. */
  width?: number;
}

const VB_W = 120;
const VB_H = 250;
const CX = 60;

// Body-fat bounds that map to fully lean (t=1) and softest (t=0) per sex.
const BOUNDS = {
  male: { lean: 8, soft: 30 },
  female: { lean: 16, soft: 38 },
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function PhysiqueSilhouette({ bodyFatPct, sex = 'male', variant = 'future', width = 110 }: Props) {
  const height = (width * VB_H) / VB_W;
  const gradId = React.useId();

  const b = BOUNDS[sex];
  // Leanness: 1 = very lean, 0 = soft. Higher body fat → lower t.
  const t = clamp01((b.soft - bodyFatPct) / (b.soft - b.lean));

  // Half-widths at each vertical anchor, interpolated by leanness.
  const shoulderHalf = sex === 'female' ? 18 + 5 * t : 22 + 8 * t;
  const waistHalf = sex === 'female' ? 22 - 10 * t : 25 - 12 * t;
  const hipHalf = sex === 'female' ? 23 + t : 18;

  const yShoulder = 60;
  const yWaist = 116;
  const yHip = 150;
  const yLegEnd = 240;

  // Torso outline: shoulders → pinched waist → hips, sides drawn with cubic
  // curves so the waistline reads as a smooth taper rather than a wedge.
  const torso = [
    `M ${CX - shoulderHalf} ${yShoulder}`,
    `L ${CX + shoulderHalf} ${yShoulder}`,
    `C ${CX + shoulderHalf} ${yShoulder + 30} ${CX + waistHalf} ${yWaist - 26} ${CX + waistHalf} ${yWaist}`,
    `C ${CX + waistHalf} ${yWaist + 16} ${CX + hipHalf} ${yHip - 18} ${CX + hipHalf} ${yHip}`,
    `L ${CX - hipHalf} ${yHip}`,
    `C ${CX - hipHalf} ${yHip - 18} ${CX - waistHalf} ${yWaist + 16} ${CX - waistHalf} ${yWaist}`,
    `C ${CX - waistHalf} ${yWaist - 26} ${CX - shoulderHalf} ${yShoulder + 30} ${CX - shoulderHalf} ${yShoulder}`,
    'Z',
  ].join(' ');

  const fill = `url(#${gradId})`;
  const grad =
    variant === 'future' ? Gradients.ember : ([Colors.surface3, Colors.border] as const);

  // Muscle-definition lines only make sense on a lean figure — fade with t.
  const defOpacity = 0.32 * t;
  const armW = 11;
  const armH = yHip - yShoulder - 4;
  const legW = 15;
  const legTop = yHip - 6;
  const legInset = hipHalf / 2;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={grad[0]} />
          <Stop offset="1" stopColor={grad[1]} />
        </LinearGradient>
      </Defs>

      {/* Legs */}
      <Rect x={CX - legInset - legW / 2} y={legTop} width={legW} height={yLegEnd - legTop} rx={legW / 2} fill={fill} />
      <Rect x={CX + legInset - legW / 2} y={legTop} width={legW} height={yLegEnd - legTop} rx={legW / 2} fill={fill} />

      {/* Arms */}
      <Rect x={CX - shoulderHalf - armW + 3} y={yShoulder + 2} width={armW} height={armH} rx={armW / 2} fill={fill} />
      <Rect x={CX + shoulderHalf - 3} y={yShoulder + 2} width={armW} height={armH} rx={armW / 2} fill={fill} />

      {/* Neck + head */}
      <Rect x={CX - 7} y={40} width={14} height={24} rx={6} fill={fill} />
      <Circle cx={CX} cy={26} r={14} fill={fill} />

      {/* Torso */}
      <Path d={torso} fill={fill} />

      {/* Muscle definition (fades in as the figure leans out) */}
      {defOpacity > 0.02 && (
        <>
          {/* linea alba (centre line) */}
          <Line x1={CX} y1={80} x2={CX} y2={112} stroke={Colors.background} strokeWidth={1.4} opacity={defOpacity} strokeLinecap="round" />
          {/* ab creases */}
          {[90, 100, 110].map((y) => (
            <Line key={y} x1={CX - 10} y1={y} x2={CX + 10} y2={y} stroke={Colors.background} strokeWidth={1.2} opacity={defOpacity} strokeLinecap="round" />
          ))}
          {/* chest split */}
          <Line x1={CX} y1={68} x2={CX} y2={80} stroke={Colors.background} strokeWidth={1.4} opacity={defOpacity} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}
