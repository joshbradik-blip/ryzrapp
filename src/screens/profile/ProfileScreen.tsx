import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Platform,
  Linking,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';
import { useProfileStore } from '../../store/profileStore';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { useWorkoutStore } from '../../store/workoutStore';
import { generateWorkoutPlan } from '../../lib/anthropic';
import { kgToDisplay, displayToKg, weightLabel } from '../../lib/units';
import { InjurySeverity } from '../../types';

const BODY_PARTS = ['lower_back','knees','left_shoulder','right_shoulder','wrists','elbows','neck','hips','ankles'];
const PART_LABELS: Record<string, string> = {
  lower_back: 'Lower Back', knees: 'Knees', left_shoulder: 'Left Shoulder',
  right_shoulder: 'Right Shoulder', wrists: 'Wrists', elbows: 'Elbows',
  neck: 'Neck', hips: 'Hips', ankles: 'Ankles',
};
const SEVERITIES: { value: InjurySeverity; label: string }[] = [
  { value: 'cautious', label: 'Cautious' },
  { value: 'active_pain', label: 'Active pain' },
  { value: 'avoid', label: 'Avoid' },
];
const GOAL_OPTIONS = [
  { value: 'build_muscle', label: 'Get stronger & build muscle' },
  { value: 'lose_fat', label: 'Lose fat & get leaner' },
  { value: 'specific_activity', label: 'Improve at a specific activity' },
  { value: 'rehab', label: 'Rehab / return from injury' },
  { value: 'general_fitness', label: 'General fitness & feel better' },
];

const EQUIPMENT_OPTIONS: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'dumbbell',         label: 'Dumbbells',         icon: 'barbell-outline' },
  { id: 'barbell',          label: 'Barbell + Plates',  icon: 'barbell-outline' },
  { id: 'kettlebell',       label: 'Kettlebells',        icon: 'ellipse-outline' },
  { id: 'resistance_band',  label: 'Resistance Bands',  icon: 'git-branch-outline' },
  { id: 'pull_up_bar',      label: 'Pull-Up Bar',        icon: 'trending-up-outline' },
  { id: 'bench',            label: 'Bench',              icon: 'reorder-two-outline' },
  { id: 'cable_machine',    label: 'Cable Machine',      icon: 'settings-outline' },
  { id: 'cardio_treadmill', label: 'Treadmill',          icon: 'walk-outline' },
  { id: 'cardio_bike',      label: 'Exercise Bike',      icon: 'bicycle-outline' },
  { id: 'cardio_rower',     label: 'Rowing Machine',     icon: 'boat-outline' },
  { id: 'box',              label: 'Plyo Box',           icon: 'cube-outline' },
  { id: 'jump_rope',        label: 'Jump Rope',          icon: 'git-commit-outline' },
];

function SettingRow({
  icon, label, value, onPress, rightElement,
}: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value?: string; onPress?: () => void; rightElement?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 14,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
      }}
    >
      <Ionicons name={icon} size={20} color={Colors.textSecondary} style={{ width: 24 }} />
      <Text style={{ color: Colors.text, fontSize: 15, flex: 1, fontWeight: '500' }}>{label}</Text>
      {value && <Text style={{ color: Colors.muted, fontSize: 14 }}>{value}</Text>}
      {rightElement}
      {onPress && <Ionicons name="chevron-forward" size={16} color={Colors.muted} />}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 }}>
      {title}
    </Text>
  );
}

export function ProfileScreen() {
  const { signOut, deleteAccount } = useAuthStore();
  const { profile, injuries, disabilities, schedulePrefs, goals, equipment, setEquipment, setDisabilities, setProfile } = useProfileStore();
  const { isPremium } = useSubscriptionStore();
  const { setWorkouts, setTodayWorkout } = useWorkoutStore();

  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const units: 'imperial' | 'metric' = profile?.weight_unit === 'lbs' ? 'imperial' : 'metric';
  const setUnits = (u: 'imperial' | 'metric') =>
    setProfile({ weight_unit: u === 'imperial' ? 'lbs' : 'kg' });
  const [regenerating, setRegenerating] = useState(false);

  // Equipment modal state
  const [equipmentModalVisible, setEquipmentModalVisible] = useState(false);
  const [draftEquipment, setDraftEquipment] = useState<string[]>([]);
  const [bodyweightOnly, setBodyweightOnly] = useState(false);

  // Disabilities modal state
  const [disabilityModalVisible, setDisabilityModalVisible] = useState(false);
  const [draftDisabilities, setDraftDisabilities] = useState<string[]>([]);

  // Body stats modal state
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [draftWeight, setDraftWeight] = useState('');
  const [draftWeightUnit, setDraftWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [draftHeightCm, setDraftHeightCm] = useState('');
  const [draftHeightFt, setDraftHeightFt] = useState('');
  const [draftHeightIn, setDraftHeightIn] = useState('');
  const [draftHeightUnit, setDraftHeightUnit] = useState<'cm' | 'ft'>('cm');

  // Injuries modal state
  const [injuriesModalVisible, setInjuriesModalVisible] = useState(false);
  const [draftInjuries, setDraftInjuries] = useState<typeof injuries>([]);

  // Goals modal state
  const [goalsModalVisible, setGoalsModalVisible] = useState(false);
  const [draftGoalCategory, setDraftGoalCategory] = useState('');

  const openStatsModal = () => {
    const unit = profile?.weight_unit ?? 'kg';
    setDraftWeightUnit(unit);
    setDraftWeight(String(kgToDisplay(profile?.weight_kg ?? 0, unit)));
    const cm = profile?.height_cm ?? 0;
    setDraftHeightCm(String(cm));
    const totalIn = cm / 2.54;
    setDraftHeightFt(String(Math.floor(totalIn / 12)));
    setDraftHeightIn(String(Math.round(totalIn % 12)));
    setDraftHeightUnit('cm');
    setStatsModalVisible(true);
  };

  const toggleDraftWeightUnit = (u: 'kg' | 'lbs') => {
    if (u === draftWeightUnit) return;
    const val = parseFloat(draftWeight);
    if (!isNaN(val)) setDraftWeight((u === 'lbs' ? val * 2.20462 : val * 0.453592).toFixed(1));
    setDraftWeightUnit(u);
  };

  const toggleDraftHeightUnit = (u: 'cm' | 'ft') => {
    if (u === draftHeightUnit) return;
    if (u === 'ft') {
      const cm = parseFloat(draftHeightCm);
      if (!isNaN(cm)) {
        const totalIn = cm / 2.54;
        setDraftHeightFt(String(Math.floor(totalIn / 12)));
        setDraftHeightIn(String(Math.round(totalIn % 12)));
      }
    } else {
      const ft = parseFloat(draftHeightFt) || 0;
      const inches = parseFloat(draftHeightIn) || 0;
      setDraftHeightCm(((ft * 12 + inches) * 2.54).toFixed(1));
    }
    setDraftHeightUnit(u);
  };

  const saveStats = () => {
    const rawWeight = parseFloat(draftWeight);
    const weightKg = draftWeightUnit === 'lbs' ? rawWeight * 0.453592 : rawWeight;
    const heightCm = draftHeightUnit === 'ft'
      ? ((parseFloat(draftHeightFt) || 0) * 12 + (parseFloat(draftHeightIn) || 0)) * 2.54
      : parseFloat(draftHeightCm);
    if (profile) {
      useProfileStore.getState().setProfile({ ...profile, weight_kg: parseFloat(weightKg.toFixed(1)), height_cm: parseFloat(heightCm.toFixed(1)), weight_unit: draftWeightUnit });
    }
    setStatsModalVisible(false);
  };

  const openInjuriesModal = () => {
    setDraftInjuries([...injuries]);
    setInjuriesModalVisible(true);
  };

  const toggleInjuryPart = (part: string) => {
    setDraftInjuries((prev) => {
      const existing = prev.find((i) => i.body_part === part);
      if (existing) return prev.filter((i) => i.body_part !== part);
      return [...prev, { body_part: part, severity: 'cautious' as InjurySeverity }];
    });
  };

  const setInjurySeverity = (part: string, severity: InjurySeverity) => {
    setDraftInjuries((prev) => prev.map((i) => i.body_part === part ? { ...i, severity } : i));
  };

  const saveInjuries = () => {
    useProfileStore.getState().setInjuries(draftInjuries);
    setInjuriesModalVisible(false);
  };

  const openGoalsModal = () => {
    setDraftGoalCategory(goals[0]?.category ?? 'general_fitness');
    setGoalsModalVisible(true);
  };

  const saveGoals = () => {
    useProfileStore.getState().setGoals([{ category: draftGoalCategory as any }]);
    setGoalsModalVisible(false);
  };

  const openEquipmentModal = () => {
    setDraftEquipment([...equipment]);
    setBodyweightOnly(equipment.length === 0);
    setEquipmentModalVisible(true);
  };

  const toggleEquipment = (id: string) => {
    setBodyweightOnly(false);
    setDraftEquipment((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const openDisabilityModal = () => {
    setDraftDisabilities([...disabilities]);
    setDisabilityModalVisible(true);
  };

  const toggleDisability = (id: string) => {
    setDraftDisabilities((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const saveDisabilities = () => {
    setDisabilities(draftDisabilities);
    setDisabilityModalVisible(false);
  };

  const saveEquipment = () => {
    setEquipment(bodyweightOnly ? [] : draftEquipment);
    setEquipmentModalVisible(false);
  };

  const handleRegenerate = async () => {
    if (!profile || !schedulePrefs) {
      Alert.alert('Complete your profile first');
      return;
    }
    if (!isPremium) {
      Alert.alert('Premium Feature', 'Upgrade to RYZR Premium to regenerate your plan with the AI.');
      return;
    }
    Alert.alert('Regenerate Plan?', 'This will build you a fresh AI-powered workout plan based on your current profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Regenerate',
        onPress: async () => {
          setRegenerating(true);
          try {
            const workouts = await generateWorkoutPlan({ profile, injuries, disabilities, schedule: schedulePrefs, goals, equipment });
            setWorkouts(workouts);
            if (workouts.length > 0) setTodayWorkout(workouts[0]);
            Alert.alert('Plan updated!', 'Your new workout plan is ready.');
          } catch {
            Alert.alert('Error', 'Could not generate a new plan. Try again later.');
          } finally {
            setRegenerating(false);
          }
        },
      },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const initials = profile?.name
    ? profile.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Profile header */}
        <View style={{ alignItems: 'center', padding: 32, paddingBottom: 24 }}>
          <View style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: Colors.primary + '22',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 3,
            borderColor: Colors.primary,
            marginBottom: 14,
          }}>
            <Text style={{ color: Colors.primary, fontSize: 30, fontWeight: '900' }}>{initials}</Text>
          </View>
          <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '900' }}>{profile?.name ?? 'Athlete'}</Text>
          {isPremium && (
            <View style={{
              marginTop: 8, paddingHorizontal: 14, paddingVertical: 4,
              backgroundColor: Colors.primary + '22', borderRadius: 12,
              borderWidth: 1, borderColor: Colors.primary,
            }}>
              <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '800' }}>PREMIUM</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 24, marginTop: 20 }}>
            {[{ value: '0', label: 'Sessions' }, { value: '0', label: 'Streak' }, { value: '0', label: 'PRs' }].map((s) => (
              <View key={s.label} style={{ alignItems: 'center' }}>
                <Text style={{ color: Colors.primary, fontSize: 22, fontWeight: '900' }}>{s.value}</Text>
                <Text style={{ color: Colors.muted, fontSize: 12 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Regenerate plan */}
        <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
          <TouchableOpacity
            onPress={handleRegenerate}
            disabled={regenerating}
            style={{
              backgroundColor: isPremium ? Colors.primary + '22' : Colors.surface2,
              borderRadius: 14,
              padding: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              borderWidth: 1,
              borderColor: isPremium ? Colors.primary : Colors.border,
            }}
          >
            <Ionicons name={isPremium ? 'hardware-chip-outline' : 'lock-closed-outline'} size={26} color={isPremium ? Colors.primary : Colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: isPremium ? Colors.primary : Colors.text, fontWeight: '800', fontSize: 15 }}>
                {regenerating ? 'Regenerating...' : 'Regenerate My Plan'}
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                {isPremium ? 'Build a fresh AI plan with your current data' : 'Premium feature'}
              </Text>
            </View>
            {!isPremium && <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: '700' }}>Upgrade</Text>}
          </TouchableOpacity>
        </View>

        {/* Profile settings */}
        <SectionHeader title="MY PROFILE" />
        <View style={{ backgroundColor: Colors.surface, marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
          <SettingRow icon="body-outline" label="Body stats" value={profile?.weight_kg ? `${kgToDisplay(profile.weight_kg, profile.weight_unit ?? 'kg')} ${weightLabel(profile.weight_unit ?? 'kg')}` : '—'} onPress={openStatsModal} />
          <SettingRow icon="medical-outline" label="Injuries & limitations" value={`${injuries.length} noted`} onPress={openInjuriesModal} />
          <SettingRow
            icon="accessibility-outline"
            label="Adaptive needs"
            value={disabilities.length === 0 ? 'None' : `${disabilities.length} selected`}
            onPress={openDisabilityModal}
          />
          <SettingRow icon="calendar-outline" label="Schedule" value={`${schedulePrefs?.days_per_week ?? '—'} days/week`} onPress={() => Alert.alert('Edit schedule', 'Coming soon')} />
          <SettingRow
            icon="barbell-outline"
            label="Equipment"
            value={equipment.length === 0 ? 'Bodyweight only' : `${equipment.length} item${equipment.length !== 1 ? 's' : ''}`}
            onPress={openEquipmentModal}
          />
          <SettingRow icon="flag-outline" label="Goals" value={goals[0]?.category?.replace(/_/g, ' ') ?? '—'} onPress={openGoalsModal} />
        </View>

        {/* App preferences */}
        <SectionHeader title="PREFERENCES" />
        <View style={{ backgroundColor: Colors.surface, marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
          <SettingRow
            icon="resize-outline"
            label="Units"
            rightElement={
              <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
                {(['metric', 'imperial'] as const).map((u) => (
                  <TouchableOpacity key={u} onPress={() => setUnits(u)}
                    style={{ paddingHorizontal: 10, paddingVertical: 5, backgroundColor: units === u ? Colors.primary : Colors.surface2 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: units === u ? '#000' : Colors.textSecondary }}>
                      {u === 'metric' ? 'kg/cm' : 'lb/in'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            }
          />
          <SettingRow
            icon="volume-high-outline"
            label="Voice coaching"
            rightElement={
              <Switch
                value={voiceEnabled}
                onValueChange={setVoiceEnabled}
                trackColor={{ true: Colors.primary, false: Colors.surface3 }}
                thumbColor={Colors.text}
              />
            }
          />
          <SettingRow
            icon="phone-portrait-outline"
            label="Haptics"
            rightElement={
              <Switch
                value={hapticsEnabled}
                onValueChange={setHapticsEnabled}
                trackColor={{ true: Colors.primary, false: Colors.surface3 }}
                thumbColor={Colors.text}
              />
            }
          />
          <SettingRow icon="notifications-outline" label="Notifications" onPress={() => Alert.alert('Notification settings', 'Coming soon')} />
        </View>

        {/* Account */}
        <SectionHeader title="ACCOUNT" />
        <View style={{ backgroundColor: Colors.surface, marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
          <SettingRow icon="share-outline" label="Export my data" onPress={() => Alert.alert('Export data', 'Coming soon')} />
          <SettingRow icon="key-outline" label="Change password" onPress={() => Alert.alert('Change password', 'Coming soon')} />
          <SettingRow icon="log-out-outline" label="Sign out" onPress={handleSignOut} />
        </View>

        {/* Danger zone */}
        <SectionHeader title="DANGER ZONE" />
        <View style={{ backgroundColor: Colors.surface, marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.danger + '44' }}>
          <SettingRow
            icon="trash-outline"
            label="Delete account"
            onPress={() =>
              Alert.alert(
                'Delete Account?',
                'This permanently deletes all your workout data and signs you out. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      await deleteAccount();
                      Linking.openURL(
                        'mailto:josh@bradikenterprises.com' +
                        '?subject=Account%20Deletion%20Request' +
                        '&body=Please%20permanently%20delete%20my%20RYZR%20account%20and%20all%20associated%20data.'
                      );
                    },
                  },
                ]
              )
            }
          />
        </View>

        <Text style={{ color: Colors.muted, fontSize: 12, textAlign: 'center', marginTop: 24 }}>
          RYZR v1.0.0 · Built by Claude
        </Text>
      </ScrollView>

      {/* Equipment editing modal */}
      <Modal
        visible={equipmentModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEquipmentModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          {/* Modal header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: Colors.border,
          }}>
            <TouchableOpacity onPress={() => setEquipmentModalVisible(false)}>
              <Text style={{ color: Colors.textSecondary, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '700' }}>Equipment</Text>
            <TouchableOpacity onPress={saveEquipment}>
              <Text style={{ color: Colors.primary, fontSize: 16, fontWeight: '700' }}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 14, marginBottom: 20, lineHeight: 20 }}>
              Select everything you have access to. Your workout plan and substitute suggestions will update accordingly.
            </Text>

            {/* Bodyweight only toggle */}
            <TouchableOpacity
              onPress={() => { setBodyweightOnly((v) => !v); setDraftEquipment([]); }}
              style={{
                padding: 14, borderRadius: 12, marginBottom: 16,
                backgroundColor: bodyweightOnly ? Colors.primary + '22' : Colors.surface2,
                borderWidth: 1.5, borderColor: bodyweightOnly ? Colors.primary : Colors.border,
                flexDirection: 'row', alignItems: 'center', gap: 12,
              }}
            >
              <Ionicons name="body-outline" size={22} color={bodyweightOnly ? Colors.primary : Colors.textSecondary} />
              <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15, flex: 1 }}>Bodyweight only</Text>
              {bodyweightOnly && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
            </TouchableOpacity>

            {/* Equipment grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {EQUIPMENT_OPTIONS.map((eq) => {
                const isSelected = draftEquipment.includes(eq.id);
                return (
                  <TouchableOpacity
                    key={eq.id}
                    onPress={() => toggleEquipment(eq.id)}
                    style={{
                      width: '47%', padding: 14, borderRadius: 12,
                      backgroundColor: isSelected ? Colors.primary + '22' : Colors.surface2,
                      borderWidth: 1.5, borderColor: isSelected ? Colors.primary : Colors.border,
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                    }}
                  >
                    <Ionicons name={eq.icon} size={20} color={isSelected ? Colors.primary : Colors.textSecondary} />
                    <Text style={{ color: Colors.text, fontWeight: '600', fontSize: 13, flex: 1 }}>{eq.label}</Text>
                    {isSelected && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Body stats modal */}
      <Modal visible={statsModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setStatsModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
            <TouchableOpacity onPress={() => setStatsModalVisible(false)}><Text style={{ color: Colors.textSecondary, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
            <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '700' }}>Body Stats</Text>
            <TouchableOpacity onPress={saveStats}><Text style={{ color: Colors.primary, fontSize: 16, fontWeight: '700' }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
            {/* Weight */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 }}>WEIGHT</Text>
                <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
                  {(['kg', 'lbs'] as const).map((u) => (
                    <TouchableOpacity key={u} onPress={() => toggleDraftWeightUnit(u)} style={{ paddingHorizontal: 12, paddingVertical: 5, backgroundColor: draftWeightUnit === u ? Colors.primary : Colors.surface2 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: draftWeightUnit === u ? '#000' : Colors.textSecondary }}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <TextInput value={draftWeight} onChangeText={setDraftWeight} keyboardType="decimal-pad" placeholder={draftWeightUnit === 'kg' ? 'e.g. 75' : 'e.g. 165'}
                placeholderTextColor={Colors.muted} style={{ backgroundColor: Colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, color: Colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 }} />
            </View>
            {/* Height */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 }}>HEIGHT</Text>
                <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
                  {(['cm', 'ft'] as const).map((u) => (
                    <TouchableOpacity key={u} onPress={() => toggleDraftHeightUnit(u)} style={{ paddingHorizontal: 12, paddingVertical: 5, backgroundColor: draftHeightUnit === u ? Colors.primary : Colors.surface2 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: draftHeightUnit === u ? '#000' : Colors.textSecondary }}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {draftHeightUnit === 'cm' ? (
                <TextInput value={draftHeightCm} onChangeText={setDraftHeightCm} keyboardType="decimal-pad" placeholder="e.g. 175"
                  placeholderTextColor={Colors.muted} style={{ backgroundColor: Colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, color: Colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 }} />
              ) : (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput value={draftHeightFt} onChangeText={setDraftHeightFt} keyboardType="number-pad" placeholder="ft"
                    placeholderTextColor={Colors.muted} style={{ flex: 1, backgroundColor: Colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, color: Colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 }} />
                  <TextInput value={draftHeightIn} onChangeText={setDraftHeightIn} keyboardType="number-pad" placeholder="in"
                    placeholderTextColor={Colors.muted} style={{ flex: 1, backgroundColor: Colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, color: Colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 }} />
                </View>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Injuries modal */}
      <Modal visible={injuriesModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setInjuriesModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
            <TouchableOpacity onPress={() => setInjuriesModalVisible(false)}><Text style={{ color: Colors.textSecondary, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
            <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '700' }}>Injuries</Text>
            <TouchableOpacity onPress={saveInjuries}><Text style={{ color: Colors.primary, fontSize: 16, fontWeight: '700' }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 14, marginBottom: 16, lineHeight: 20 }}>Tap a body part to mark as injured, then set severity.</Text>
            {BODY_PARTS.map((part) => {
              const injury = draftInjuries.find((i) => i.body_part === part);
              return (
                <View key={part} style={{ marginBottom: 10 }}>
                  <TouchableOpacity onPress={() => toggleInjuryPart(part)} style={{ padding: 14, borderRadius: 12, backgroundColor: injury ? Colors.primary + '22' : Colors.surface2, borderWidth: 1.5, borderColor: injury ? Colors.primary : Colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Ionicons name="medical-outline" size={20} color={injury ? Colors.primary : Colors.textSecondary} />
                    <Text style={{ color: Colors.text, fontWeight: '600', fontSize: 15, flex: 1 }}>{PART_LABELS[part]}</Text>
                    {injury && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                  </TouchableOpacity>
                  {injury && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, paddingLeft: 8 }}>
                      {SEVERITIES.map((s) => (
                        <TouchableOpacity key={s.value} onPress={() => setInjurySeverity(part, s.value)}
                          style={{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: injury.severity === s.value ? Colors.primary + '33' : Colors.surface2, borderWidth: 1, borderColor: injury.severity === s.value ? Colors.primary : Colors.border }}>
                          <Text style={{ color: injury.severity === s.value ? Colors.primary : Colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{s.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Goals modal */}
      <Modal visible={goalsModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setGoalsModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
            <TouchableOpacity onPress={() => setGoalsModalVisible(false)}><Text style={{ color: Colors.textSecondary, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
            <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '700' }}>Primary Goal</Text>
            <TouchableOpacity onPress={saveGoals}><Text style={{ color: Colors.primary, fontSize: 16, fontWeight: '700' }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 10 }}>
            {GOAL_OPTIONS.map((g) => (
              <TouchableOpacity key={g.value} onPress={() => setDraftGoalCategory(g.value)}
                style={{ padding: 16, borderRadius: 12, backgroundColor: draftGoalCategory === g.value ? Colors.primary + '22' : Colors.surface2, borderWidth: 1.5, borderColor: draftGoalCategory === g.value ? Colors.primary : Colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ color: Colors.text, fontWeight: '600', fontSize: 15, flex: 1 }}>{g.label}</Text>
                {draftGoalCategory === g.value && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Disabilities editing modal */}
      <Modal
        visible={disabilityModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDisabilityModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: Colors.border,
          }}>
            <TouchableOpacity onPress={() => setDisabilityModalVisible(false)}>
              <Text style={{ color: Colors.textSecondary, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '700' }}>Adaptive Needs</Text>
            <TouchableOpacity onPress={saveDisabilities}>
              <Text style={{ color: Colors.primary, fontSize: 16, fontWeight: '700' }}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 14, marginBottom: 20, lineHeight: 20 }}>
              Select any conditions that apply. Your AI coach will adapt every workout accordingly.
            </Text>
            {[
              { id: 'wheelchair',        label: 'Wheelchair user' },
              { id: 'amputee_arm_left',  label: 'Missing / prosthetic left arm' },
              { id: 'amputee_arm_right', label: 'Missing / prosthetic right arm' },
              { id: 'amputee_leg_left',  label: 'Missing / prosthetic left leg' },
              { id: 'amputee_leg_right', label: 'Missing / prosthetic right leg' },
              { id: 'visually_impaired', label: 'Visually impaired / blind' },
              { id: 'hearing_impaired',  label: 'Hearing impaired / deaf' },
              { id: 'limited_upper',     label: 'Limited upper body mobility' },
              { id: 'limited_lower',     label: 'Limited lower body mobility' },
            ].map((d) => {
              const isSelected = draftDisabilities.includes(d.id);
              return (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => toggleDisability(d.id)}
                  style={{
                    padding: 16, borderRadius: 12, marginBottom: 10,
                    backgroundColor: isSelected ? Colors.primary + '22' : Colors.surface2,
                    borderWidth: 1.5, borderColor: isSelected ? Colors.primary : Colors.border,
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                  }}
                >
                  <Ionicons name="accessibility-outline" size={20} color={isSelected ? Colors.primary : Colors.textSecondary} />
                  <Text style={{ color: Colors.text, fontWeight: '600', fontSize: 15, flex: 1 }}>{d.label}</Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
