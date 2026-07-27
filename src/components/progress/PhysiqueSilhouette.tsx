import React from 'react';
import Svg, { Path, Circle, Rect, Line, Ellipse, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Colors, Gradients } from '../../constants/theme';

/**
 * A stylized body silhouette driven by two factors:
 *  - leanness (from body-fat %): narrows the waist and reveals definition.
 *  - muscle (0..1): broadens shoulders, arms and legs and sharpens the cuts.
 *
 * It is deliberately an abstract illustration — never a photo or a claim about
 * a specific person's future body — so it motivates without pretending to
 * predict an exact appearance.
 */
interface Props {
  bodyFatPct: number;
  /** Muscular development 0..1 (1 = well developed). Defaults to a mid build. */
  muscle?: number;
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

export function PhysiqueSilhouette({ bodyFatPct, muscle = 0.45, sex = 'male', variant = 'future', width = 110 }: Props) {
  const height = (width * VB_H) / VB_W;
  const gradId = React.useId();

  const b = BOUNDS[sex];
  // Leanness: 1 = very lean, 0 = soft. Higher body fat → lower t.
  const t = clamp01((b.soft - bodyFatPct) / (b.soft - b.lean));
  const m = clamp01(muscle);

  // Half-widths at each vertical anchor. Shoulders/arms/legs scale with muscle;
  // the waist is governed by leanness (fat), with a slight taper from a bigger
  // upper body.
  const shoulderHalf = sex === 'female' ? 17 + 4 * t + 5 * m : 20 + 6 * t + 9 * m;
  const waistHalf = sex === 'female' ? 24 - 11 * t : 26 - 12 * t;
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

  // Definition needs low fat to show at all; muscle sharpens it further.
  const defOpacity = 0.34 * t * (0.65 + 0.35 * m);
  const armW = sex === 'female' ? 9 + 3 * m : 10 + 5 * m;
  const armH = yHip - yShoulder - 4;
  const legW = sex === 'female' ? 13 + 3 * m : 14 + 4 * m;
  const legTop = yHip - 6;
  const legInset = hipHalf / 2;
  const deltRx = (sex === 'female' ? 5 : 6) + 5 * m; // shoulder caps grow with muscle

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

      {/* Deltoid caps — read as shoulders, swell with muscle */}
      <Ellipse cx={CX - shoulderHalf + 2} cy={yShoulder + 6} rx={deltRx} ry={deltRx * 0.85} fill={fill} />
      <Ellipse cx={CX + shoulderHalf - 2} cy={yShoulder + 6} rx={deltRx} ry={deltRx * 0.85} fill={fill} />

      {/* Neck + head */}
      <Rect x={CX - 7} y={40} width={14} height={24} rx={6} fill={fill} />
      <Circle cx={CX} cy={26} r={14} fill={fill} />

      {/* Torso */}
      <Path d={torso} fill={fill} />

      {/* Muscle definition (fades in with leanness + muscle) */}
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
          {/* pec / shoulder separation lines, stronger with muscle */}
          <Line x1={CX - shoulderHalf + 4} y1={yShoulder + 10} x2={CX - 4} y2={78} stroke={Colors.background} strokeWidth={1.2} opacity={defOpacity} strokeLinecap="round" />
          <Line x1={CX + shoulderHalf - 4} y1={yShoulder + 10} x2={CX + 4} y2={78} stroke={Colors.background} strokeWidth={1.2} opacity={defOpacity} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}
