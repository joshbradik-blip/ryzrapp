import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';
import { useProfileStore } from '../../store/profileStore';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { useNutritionStore } from '../../store/nutritionStore';
import { deriveTargets, sumEntries, localDayKey } from '../../lib/nutrition';
import { MealType, NutritionTargets } from '../../types';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { GradientButton } from '../../components/ui/GradientButton';
import { PremiumModal } from '../../components/ui/PremiumModal';
import { CalorieRing } from '../../components/nutrition/CalorieRing';
import { AiLogSheet } from '../../components/nutrition/AiLogSheet';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

/** Best-guess meal from the time of day, used as the AI sheet's default. */
function mealForNow(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 20) return 'dinner';
  return 'snack';
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00`); // noon avoids DST edge cases on the shift
  d.setDate(d.getDate() + delta);
  return localDayKey(d);
}

function dayLabel(day: string): string {
  const today = localDayKey();
  if (day === today) return 'Today';
  if (day === shiftDay(today, -1)) return 'Yesterday';
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function MacroBar({ label, consumed, target, color }: { label: string; consumed: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ color: Colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{label}</Text>
        <Text style={{ color: Colors.muted, fontSize: 12 }}>
          {Math.round(consumed)}/{target}g
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: Colors.surface3, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
      </View>
    </View>
  );
}

export function NutritionScreen() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const { profile, schedulePrefs, goals } = useProfileStore();
  const { isPremium } = useSubscriptionStore();
  const { entries, day, fetchDay, addEntry, deleteEntry } = useNutritionStore();

  const [addOpen, setAddOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [meal, setMeal] = useState<MealType>('breakfast');
  const [name, setName] = useState('');
  const [cal, setCal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userId) fetchDay(userId);
  }, [userId]);

  const targets: NutritionTargets | null = useMemo(
    () => (profile ? deriveTargets(profile, schedulePrefs, goals) : null),
    [profile, schedulePrefs, goals]
  );
  const totals = useMemo(() => sumEntries(entries), [entries]);

  const resetForm = () => {
    setName(''); setCal(''); setProtein(''); setCarbs(''); setFat('');
  };

  const handleSave = async () => {
    if (!userId) return;
    const calories = parseInt(cal, 10);
    if (!name.trim() || !calories || calories <= 0) {
      Alert.alert('Add a name and calories', 'Every entry needs at least a name and a calorie amount.');
      return;
    }
    const num = (v: string) => {
      const n = parseFloat(v);
      return isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
    };
    setSaving(true);
    const ok = await addEntry(userId, {
      logged_on: useNutritionStore.getState().day,
      meal,
      name: name.trim(),
      calories,
      protein_g: num(protein),
      carbs_g: num(carbs),
      fat_g: num(fat),
    });
    setSaving(false);
    if (ok) {
      resetForm();
      setAddOpen(false);
    } else {
      Alert.alert('Could not save', 'Please try again.');
    }
  };

  const confirmDelete = (id: string, label: string) => {
    Alert.alert('Remove entry', `Remove "${label}" from today?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => userId && deleteEntry(userId, id) },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ padding: 24, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900' }}>Nutrition</Text>
          <TouchableOpacity
            onPress={() => setAddOpen(true)}
            style={{ backgroundColor: Colors.primary + '22', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: Colors.primary, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Ionicons name="add" size={18} color={Colors.primary} />
            <Text style={{ color: Colors.primary, fontWeight: '800', fontSize: 14 }}>Log food</Text>
          </TouchableOpacity>
        </View>

        {/* Day switcher */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity
            onPress={() => userId && fetchDay(userId, shiftDay(day, -1))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: 6 }}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={{ color: Colors.textSecondary, fontSize: 15, fontWeight: '700' }}>{dayLabel(day)}</Text>
          <TouchableOpacity
            onPress={() => day < localDayKey() && userId && fetchDay(userId, shiftDay(day, 1))}
            disabled={day >= localDayKey()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: 6, opacity: day >= localDayKey() ? 0.3 : 1 }}
          >
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {!profile ? (
          <View style={{ marginHorizontal: 24, marginTop: 16, backgroundColor: Colors.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
            <Ionicons name="restaurant-outline" size={32} color={Colors.muted} style={{ marginBottom: 8 }} />
            <Text style={{ color: Colors.textSecondary, fontSize: 14, textAlign: 'center' }}>
              Complete your profile to get personalized calorie and macro targets.
            </Text>
          </View>
        ) : (
          <>
            {/* Calorie ring + macros */}
            <View style={{ marginHorizontal: 24, marginTop: 8, backgroundColor: Colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center' }}>
              <CalorieRing consumed={totals.calories} target={targets!.calories} />
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 20, alignSelf: 'stretch' }}>
                <MacroBar label="Protein" consumed={totals.protein_g} target={targets!.protein_g} color={Colors.primary} />
                <MacroBar label="Carbs" consumed={totals.carbs_g} target={targets!.carbs_g} color={Colors.info} />
                <MacroBar label="Fat" consumed={totals.fat_g} target={targets!.fat_g} color={Colors.warning} />
              </View>
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 16, textAlign: 'center', lineHeight: 16 }}>
                Targets estimated from your profile, training days, and goal — a starting point you can refine as you track.
              </Text>
            </View>

            {/* AI describe-a-meal (premium) */}
            <TouchableOpacity
              onPress={() => (isPremium ? setAiOpen(true) : setPremiumOpen(true))}
              style={{ marginHorizontal: 24, marginTop: 16, backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.primary + '55', flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="camera" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '800' }}>Snap or describe a meal</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 1 }}>
                  {isPremium ? 'Photo or text — AI estimates the calories & macros' : 'Premium — AI estimates calories from a photo or text'}
                </Text>
              </View>
              <Ionicons name={isPremium ? 'chevron-forward' : 'lock-closed'} size={18} color={isPremium ? Colors.primary : Colors.muted} />
            </TouchableOpacity>

            {/* Meals */}
            <View style={{ marginHorizontal: 24, marginTop: 24 }}>
              {MEALS.map((m) => {
                const mealEntries = entries.filter((e) => e.meal === m);
                const mealCals = mealEntries.reduce((s, e) => s + e.calories, 0);
                return (
                  <View key={m} style={{ marginBottom: 16, backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: mealEntries.length ? 10 : 0 }}>
                      <SectionLabel>{MEAL_LABEL[m]}</SectionLabel>
                      <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '700' }}>{mealCals} kcal</Text>
                    </View>
                    {mealEntries.length === 0 ? (
                      <TouchableOpacity onPress={() => { setMeal(m); setAddOpen(true); }} style={{ paddingVertical: 8 }}>
                        <Text style={{ color: Colors.muted, fontSize: 13 }}>+ Add to {MEAL_LABEL[m].toLowerCase()}</Text>
                      </TouchableOpacity>
                    ) : (
                      mealEntries.map((e, i) => (
                        <TouchableOpacity
                          key={e.id}
                          onLongPress={() => confirmDelete(e.id, e.name)}
                          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < mealEntries.length - 1 ? 1 : 0, borderBottomColor: Colors.border }}
                        >
                          <View style={{ flex: 1, paddingRight: 12 }}>
                            <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{e.name}</Text>
                            <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                              P {e.protein_g} · C {e.carbs_g} · F {e.fat_g}
                            </Text>
                          </View>
                          <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '800' }}>{e.calories}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                );
              })}
              {entries.length > 0 && (
                <Text style={{ color: Colors.muted, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
                  Long-press an entry to remove it.
                </Text>
              )}
            </View>
          </>
        )}

        {/* Add food modal */}
        <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0A0A0Acc' }}>
            <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, borderWidth: 1, borderColor: Colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '900' }}>Log food</Text>
                <TouchableOpacity onPress={() => setAddOpen(false)}>
                  <Ionicons name="close" size={24} color={Colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Meal chips */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {MEALS.map((m) => {
                  const active = m === meal;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setMeal(m)}
                      style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: active ? Colors.primary + '22' : Colors.surface2, borderWidth: 1, borderColor: active ? Colors.primary : Colors.border }}
                    >
                      <Text style={{ color: active ? Colors.primary : Colors.textSecondary, fontWeight: '700', fontSize: 12 }}>{MEAL_LABEL[m]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Food name"
                placeholderTextColor={Colors.muted}
                autoFocus
                style={{ backgroundColor: Colors.surface2, borderRadius: 10, padding: 12, color: Colors.text, fontSize: 16, fontWeight: '600', borderWidth: 1, borderColor: Colors.border, marginBottom: 12 }}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 15, width: 90 }}>Calories</Text>
                <TextInput
                  value={cal}
                  onChangeText={setCal}
                  keyboardType="number-pad"
                  placeholder="kcal"
                  placeholderTextColor={Colors.muted}
                  style={{ flex: 1, backgroundColor: Colors.surface2, borderRadius: 10, padding: 12, color: Colors.text, fontSize: 16, fontWeight: '700', borderWidth: 1, borderColor: Colors.border }}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                {([['Protein', protein, setProtein], ['Carbs', carbs, setCarbs], ['Fat', fat, setFat]] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
                  <View key={label} style={{ flex: 1 }}>
                    <Text style={{ color: Colors.textSecondary, fontSize: 12, marginBottom: 4 }}>{label} (g)</Text>
                    <TextInput
                      value={val}
                      onChangeText={setter}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={Colors.muted}
                      style={{ backgroundColor: Colors.surface2, borderRadius: 10, padding: 12, color: Colors.text, fontSize: 15, fontWeight: '700', borderWidth: 1, borderColor: Colors.border }}
                    />
                  </View>
                ))}
              </View>

              <GradientButton title="Add entry" onPress={handleSave} loading={saving} />
            </View>
          </View>
        </Modal>

        {userId && (
          <AiLogSheet
            visible={aiOpen}
            onClose={() => setAiOpen(false)}
            userId={userId}
            day={day}
            defaultMeal={mealForNow()}
          />
        )}

        <PremiumModal
          visible={premiumOpen}
          onClose={() => setPremiumOpen(false)}
          featureTitle="AI Meal Logging"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
