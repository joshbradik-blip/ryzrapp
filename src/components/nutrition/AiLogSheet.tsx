import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { MealType } from '../../types';
import { parseNutritionText, ParsedFoodItem } from '../../lib/anthropic';
import { useNutritionStore } from '../../store/nutritionStore';
import { GradientButton } from '../ui/GradientButton';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  day: string;
  defaultMeal: MealType;
}

/**
 * Natural-language food logging. The user describes a meal, Claude (Haiku)
 * estimates per-item calories + macros, and the result is shown as an
 * EDITABLE draft — nothing is saved until the user reviews and confirms, so
 * portion guesses can always be corrected first.
 */
export function AiLogSheet({ visible, onClose, userId, day, defaultMeal }: Props) {
  const addEntries = useNutritionStore((s) => s.addEntries);
  const [text, setText] = useState('');
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [items, setItems] = useState<ParsedFoodItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setText(''); setItems(null); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const estimate = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const parsed = await parseNutritionText(text);
      if (parsed.length === 0) {
        Alert.alert('Nothing to log', "Couldn't find any food in that. Try describing what you ate, e.g. \"2 eggs, toast, black coffee\".");
      } else {
        setItems(parsed);
      }
    } catch {
      Alert.alert('Estimate failed', 'Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const patch = (i: number, field: keyof ParsedFoodItem, value: string) => {
    setItems((cur) => {
      if (!cur) return cur;
      const next = [...cur];
      if (field === 'name') next[i] = { ...next[i], name: value };
      else next[i] = { ...next[i], [field]: Math.max(0, parseFloat(value) || 0) };
      return next;
    });
  };

  const removeItem = (i: number) => setItems((cur) => (cur ? cur.filter((_, idx) => idx !== i) : cur));

  const total = (items ?? []).reduce((s, it) => s + (it.calories || 0), 0);

  const save = async () => {
    if (!items || items.length === 0) return;
    setBusy(true);
    const ok = await addEntries(
      userId,
      items
        .filter((it) => it.name.trim())
        .map((it) => ({
          logged_on: day,
          meal,
          name: it.name.trim(),
          calories: Math.round(it.calories),
          protein_g: it.protein_g,
          carbs_g: it.carbs_g,
          fat_g: it.fat_g,
        }))
    );
    setBusy(false);
    if (ok) close();
    else Alert.alert('Could not save', 'Please try again.');
  };

  const numInput = (i: number, field: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g', label: string) => (
    <View style={{ flex: 1 }}>
      <Text style={{ color: Colors.muted, fontSize: 10, marginBottom: 3 }}>{label}</Text>
      <TextInput
        value={String((items as ParsedFoodItem[])[i][field] ?? 0)}
        onChangeText={(v) => patch(i, field, v)}
        keyboardType="decimal-pad"
        selectTextOnFocus
        style={{ backgroundColor: Colors.surface, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8, color: Colors.text, fontSize: 14, fontWeight: '700', borderWidth: 1, borderColor: Colors.border, textAlign: 'center' }}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0A0A0Acc' }}>
        <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 36, borderWidth: 1, borderColor: Colors.border, maxHeight: '88%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '900' }}>Describe your meal</Text>
              <Ionicons name="sparkles" size={15} color={Colors.primary} />
            </View>
            <TouchableOpacity onPress={close}>
              <Ionicons name="close" size={24} color={Colors.muted} />
            </TouchableOpacity>
          </View>

          {!items ? (
            <>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 14, lineHeight: 19 }}>
                Type what you ate in plain language — we'll estimate the calories and macros for you to review.
              </Text>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={'e.g. "grilled chicken breast, cup of rice, side salad with olive oil"'}
                placeholderTextColor={Colors.muted}
                multiline
                autoFocus
                style={{ backgroundColor: Colors.surface2, borderRadius: 12, padding: 14, color: Colors.text, fontSize: 15, minHeight: 96, textAlignVertical: 'top', borderWidth: 1, borderColor: Colors.border, marginBottom: 18 }}
              />
              <GradientButton title={busy ? 'Estimating…' : 'Estimate nutrition'} icon="sparkles" onPress={estimate} loading={busy} disabled={!text.trim()} />
            </>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Meal selector */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {MEALS.map((m) => {
                  const active = m === meal;
                  return (
                    <TouchableOpacity key={m} onPress={() => setMeal(m)} style={{ flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center', backgroundColor: active ? Colors.primary + '22' : Colors.surface2, borderWidth: 1, borderColor: active ? Colors.primary : Colors.border }}>
                      <Text style={{ color: active ? Colors.primary : Colors.textSecondary, fontWeight: '700', fontSize: 12 }}>{MEAL_LABEL[m]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ color: Colors.muted, fontSize: 12, marginBottom: 10 }}>
                AI estimate — tap any value to adjust before saving.
              </Text>

              {items.map((it, i) => (
                <View key={i} style={{ backgroundColor: Colors.surface2, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: Colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <TextInput
                      value={it.name}
                      onChangeText={(v) => patch(i, 'name', v)}
                      style={{ flex: 1, color: Colors.text, fontSize: 15, fontWeight: '700', paddingVertical: 2 }}
                    />
                    <TouchableOpacity onPress={() => removeItem(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={18} color={Colors.muted} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {numInput(i, 'calories', 'KCAL')}
                    {numInput(i, 'protein_g', 'PROTEIN')}
                    {numInput(i, 'carbs_g', 'CARBS')}
                    {numInput(i, 'fat_g', 'FAT')}
                  </View>
                </View>
              ))}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 16 }}>
                <TouchableOpacity onPress={() => setItems(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
                  <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600' }}>Rewrite</Text>
                </TouchableOpacity>
                <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '800' }}>{Math.round(total)} kcal total</Text>
              </View>

              <GradientButton
                title={`Add ${items.length} item${items.length === 1 ? '' : 's'}`}
                icon="checkmark"
                onPress={save}
                loading={busy}
                disabled={items.length === 0}
              />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
