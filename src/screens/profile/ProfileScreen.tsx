import React, { useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';
import { useProfileStore } from '../../store/profileStore';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { useWorkoutStore } from '../../store/workoutStore';
import { generateWorkoutPlan } from '../../lib/anthropic';

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
  const { profile, injuries, schedulePrefs, goals, equipment, setEquipment } = useProfileStore();
  const { isPremium } = useSubscriptionStore();
  const { setWorkouts, setTodayWorkout } = useWorkoutStore();

  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [units, setUnits] = useState<'imperial' | 'metric'>('metric');
  const [regenerating, setRegenerating] = useState(false);

  // Equipment modal state
  const [equipmentModalVisible, setEquipmentModalVisible] = useState(false);
  const [draftEquipment, setDraftEquipment] = useState<string[]>([]);
  const [bodyweightOnly, setBodyweightOnly] = useState(false);

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
            const workouts = await generateWorkoutPlan({ profile, injuries, schedule: schedulePrefs, goals, equipment });
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
            {[{ value: '48', label: 'Sessions' }, { value: '12', label: 'Streak' }, { value: '4', label: 'PRs' }].map((s) => (
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
          <SettingRow icon="body-outline" label="Body stats" value={`${profile?.weight_kg ?? '—'} kg`} onPress={() => Alert.alert('Edit body stats', 'Coming soon')} />
          <SettingRow icon="medical-outline" label="Injuries & limitations" value={`${injuries.length} noted`} onPress={() => Alert.alert('Edit injuries', 'Coming soon')} />
          <SettingRow icon="calendar-outline" label="Schedule" value={`${schedulePrefs?.days_per_week ?? '—'} days/week`} onPress={() => Alert.alert('Edit schedule', 'Coming soon')} />
          <SettingRow
            icon="barbell-outline"
            label="Equipment"
            value={equipment.length === 0 ? 'Bodyweight only' : `${equipment.length} item${equipment.length !== 1 ? 's' : ''}`}
            onPress={openEquipmentModal}
          />
          <SettingRow icon="flag-outline" label="Goals" value={goals[0]?.category?.replace('_', ' ') ?? '—'} onPress={() => Alert.alert('Edit goals', 'Coming soon')} />
        </View>

        {/* App preferences */}
        <SectionHeader title="PREFERENCES" />
        <View style={{ backgroundColor: Colors.surface, marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
          <SettingRow
            icon="resize-outline"
            label="Units"
            value={units === 'metric' ? 'Metric (kg/cm)' : 'Imperial (lb/in)'}
            onPress={() => setUnits((u) => u === 'metric' ? 'imperial' : 'metric')}
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
    </SafeAreaView>
  );
}
