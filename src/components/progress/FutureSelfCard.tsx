import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { kgToDisplay, weightLabel, WeightUnit } from '../../lib/units';
import { TrendProjection, BodyFatOutlook } from '../../lib/futureSelf';
import { useSettingsStore } from '../../store/settingsStore';
import { SectionLabel } from '../ui/SectionLabel';
import { PhysiqueSilhouette } from './PhysiqueSilhouette';
import { FutureSelfConsentModal } from './FutureSelfConsentModal';

interface Props {
  liftProjection: TrendProjection | null;
  bodyProjection: TrendProjection | null;
  outlook: BodyFatOutlook | null;
  sex?: 'male' | 'female';
  unit: WeightUnit;
}

function shortDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * "Future You" — a data-grounded projection card. When body-fat history
 * supports it, an abstract silhouette morphs from the user's current
 * composition to a projected milestone (4 / 8 / 12 weeks). The figure is an
 * illustration, not a photo or a promise; the numbers come straight from the
 * clamped linear fit in futureSelf.ts.
 */
export function FutureSelfCard({ liftProjection, bodyProjection, outlook, sex, unit }: Props) {
  const milestones = outlook?.milestones ?? [];
  // Default to the furthest horizon — the most visible (and most motivating)
  // change — but keep it tappable back to the nearer, more conservative ones.
  const [selectedIdx, setSelectedIdx] = useState(Math.max(0, milestones.length - 1));
  const { futureSelfConsent, setFutureSelfConsent } = useSettingsStore();
  const [consentOpen, setConsentOpen] = useState(false);

  if (!liftProjection && !bodyProjection && !outlook) return null;

  const selected = milestones[Math.min(selectedIdx, milestones.length - 1)];
  const bfDelta =
    outlook && selected ? Math.round((outlook.currentBf - selected.projectedBf) * 10) / 10 : null;

  return (
    <View
      style={{
        marginHorizontal: 24,
        marginBottom: 24,
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: Colors.primary + '44',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <SectionLabel>Future You</SectionLabel>
        <Ionicons name="trending-up" size={13} color={Colors.primary} />
      </View>

      {/* Consent gate for the body visual — numbers below still show. */}
      {outlook && selected && !futureSelfConsent && (
        <TouchableOpacity
          onPress={() => setConsentOpen(true)}
          style={{ backgroundColor: Colors.surface2, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.primary + '55', flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="body-outline" size={20} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '800' }}>See your visual projection</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 1 }}>
              Watch an illustrated you lean out and build over 4–12 weeks
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
        </TouchableOpacity>
      )}

      {outlook && selected && futureSelfConsent && (
        <>
          {/* Milestone selector */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {milestones.map((m, i) => {
              const active = i === Math.min(selectedIdx, milestones.length - 1);
              return (
                <TouchableOpacity
                  key={m.weeksAhead}
                  onPress={() => setSelectedIdx(i)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 12,
                    alignItems: 'center',
                    backgroundColor: active ? Colors.primary + '22' : Colors.surface2,
                    borderWidth: 1,
                    borderColor: active ? Colors.primary : Colors.border,
                  }}
                >
                  <Text style={{ color: active ? Colors.primary : Colors.text, fontWeight: '800', fontSize: 14 }}>
                    {m.weeksAhead} wk
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Now → projected silhouettes */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 4 }}>
            <View style={{ alignItems: 'center' }}>
              <PhysiqueSilhouette bodyFatPct={outlook.currentBf} muscle={outlook.currentMuscle} sex={sex} variant="now" width={104} />
              <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 4 }}>NOW</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 15, fontWeight: '800' }}>{outlook.currentBf}%</Text>
            </View>

            <Ionicons name="arrow-forward" size={22} color={Colors.primary} />

            <View style={{ alignItems: 'center' }}>
              <PhysiqueSilhouette bodyFatPct={selected.projectedBf} muscle={selected.muscleLevel} sex={sex} variant="future" width={104} />
              <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 4 }}>
                {selected.weeksAhead} WEEKS
              </Text>
              <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '900' }}>{selected.projectedBf}%</Text>
            </View>
          </View>

          {/* Delta pill */}
          {bfDelta !== null && bfDelta !== 0 && (
            <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 4 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: (bfDelta > 0 ? Colors.success : Colors.warning) + '22',
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                }}
              >
                <Ionicons
                  name={bfDelta > 0 ? 'arrow-down' : 'arrow-up'}
                  size={13}
                  color={bfDelta > 0 ? Colors.success : Colors.warning}
                />
                <Text style={{ color: bfDelta > 0 ? Colors.success : Colors.warning, fontSize: 13, fontWeight: '800' }}>
                  {Math.abs(bfDelta)}% body fat by {shortDate(selected.asOfDate)}
                </Text>
              </View>
            </View>
          )}
        </>
      )}

      {/* Text projections (shown even without body-fat history) */}
      {liftProjection && (
        <Text style={{ color: Colors.text, fontSize: 14, lineHeight: 21, marginTop: outlook ? 12 : 0, marginBottom: bodyProjection ? 10 : 0 }}>
          At your current pace, <Text style={{ fontWeight: '800' }}>{liftProjection.label}</Text> projects to{' '}
          <Text style={{ fontWeight: '800' }}>{kgToDisplay(liftProjection.projectedValue, unit)} {weightLabel(unit)}</Text> (est. 1RM) by{' '}
          {shortDate(liftProjection.asOfDate)} — up from {kgToDisplay(liftProjection.currentValue, unit)} {weightLabel(unit)} today.
        </Text>
      )}
      {bodyProjection && (
        <Text style={{ color: Colors.text, fontSize: 14, lineHeight: 21, marginTop: !liftProjection && outlook ? 12 : 0 }}>
          {bodyProjection.unit === '%' ? (
            <>Your body fat trend puts you at <Text style={{ fontWeight: '800' }}>{bodyProjection.projectedValue}%</Text> by{' '}
            {shortDate(bodyProjection.asOfDate)}, from {bodyProjection.currentValue}% today.</>
          ) : (
            <>Your weight trend puts you at <Text style={{ fontWeight: '800' }}>{kgToDisplay(bodyProjection.projectedValue, unit)} {weightLabel(unit)}</Text> by{' '}
            {shortDate(bodyProjection.asOfDate)}, from {kgToDisplay(bodyProjection.currentValue, unit)} {weightLabel(unit)} today.</>
          )}
        </Text>
      )}

      <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 12, lineHeight: 16 }}>
        An illustration of your logged trend, not a guarantee — the figure is a stylized guide, not a photo. Ask your coach for a projection on any lift or goal.
      </Text>

      <FutureSelfConsentModal
        visible={consentOpen}
        onConsent={() => { setFutureSelfConsent(true); setConsentOpen(false); }}
        onClose={() => setConsentOpen(false)}
      />
    </View>
  );
}
