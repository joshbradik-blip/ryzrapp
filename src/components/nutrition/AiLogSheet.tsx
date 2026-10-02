import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Image, Platform, ActionSheetIOS, Alert, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../constants/theme';
import { MealType } from '../../types';
import { parseNutritionText, parseNutritionPhoto, scaleFromPer100, ParsedFoodItem } from '../../lib/anthropic';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { useNutritionStore } from '../../store/nutritionStore';
import { GradientButton } from '../ui/GradientButton';
import { WholeDishCamera } from './WholeDishCamera';
import { ReferenceObject, REFERENCE_OBJECTS, REFERENCE_ORDER, servingFraction } from '../../lib/wholeDish';

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
  const { isPremium } = useSubscriptionStore();
  const [text, setText] = useState('');
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [items, setItems] = useState<ParsedFoodItem[] | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wholeDish, setWholeDish] = useState(false);
  const [reference, setReference] = useState<ReferenceObject>('credit_card');
  const [cameraOpen, setCameraOpen] = useState(false);

  const reset = () => { setText(''); setItems(null); setPhotoUri(null); setBusy(false); setWholeDish(false); };
  const close = () => { reset(); onClose(); };

  const applyResult = (parsed: ParsedFoodItem[]) => {
    if (parsed.length === 0) {
      Alert.alert('Nothing to log', "Couldn't find any food. Try again with a clearer photo or description.");
      return;
    }
    setItems(parsed);
  };

  const estimate = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      applyResult(await parseNutritionText(text));
    } catch {
      Alert.alert('Estimate failed', 'Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const analyzePhoto = async (base64: string, uri: string) => {
    setPhotoUri(uri);
    setBusy(true);
    try {
      applyResult(await parseNutritionPhoto(base64, { premium: isPremium, wholeDish: wholeDish ? { reference } : undefined }));
    } catch {
      Alert.alert('Estimate failed', 'Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const pickPhoto = async (fromCamera: boolean) => {
    // Whole-dish shots use the in-app camera so we can show the framing guide.
    if (fromCamera && wholeDish) { setCameraOpen(true); return; }
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', fromCamera ? 'Camera access is required.' : 'Photo library access is required.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8, mediaTypes: 'images' })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.8, mediaTypes: 'images' });
    if (result.canceled || !result.assets[0].base64) return;

    await analyzePhoto(result.assets[0].base64, result.assets[0].uri);
  };

  const choosePhotoSource = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) pickPhoto(true); if (i === 2) pickPhoto(false); }
      );
    } else {
      Alert.alert('Add photo', '', [
        { text: 'Take Photo', onPress: () => pickPhoto(true) },
        { text: 'Choose from Library', onPress: () => pickPhoto(false) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const patch = (i: number, field: keyof ParsedFoodItem, value: string) => {
    setItems((cur) => {
      if (!cur) return cur;
      const next = [...cur];
      if (field === 'name') next[i] = { ...next[i], name: value };
      else if (field === 'eaten') next[i] = { ...next[i], eaten: Math.max(0, parseFloat(value) || 0) };
      else if (field === 'grams' && next[i].per100) {
        // Editing the portion rescales kcal + macros from the per-100g values.
        const grams = Math.max(0, parseFloat(value) || 0);
        next[i] = { ...next[i], grams, ...scaleFromPer100(next[i].per100!, grams) };
      }
      else next[i] = { ...next[i], [field]: Math.max(0, parseFloat(value) || 0) };
      return next;
    });
  };

  const removeItem = (i: number) => setItems((cur) => (cur ? cur.filter((_, idx) => idx !== i) : cur));

  // Whole-dish items carry the full-dish numbers; what's saved is the eaten share.
  const share = (it: ParsedFoodItem) => ((it.servings ?? 1) > 1 ? servingFraction(it.servings!, it.eaten ?? it.servings!) : 1);
  const r1 = (n: number) => Math.round(n * 10) / 10;

  const total = (items ?? []).reduce((s, it) => s + (it.calories || 0) * share(it), 0);

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
          calories: Math.round(it.calories * share(it)),
          protein_g: r1(it.protein_g * share(it)),
          carbs_g: r1(it.carbs_g * share(it)),
          fat_g: r1(it.fat_g * share(it)),
        }))
    );
    setBusy(false);
    if (ok) close();
    else Alert.alert('Could not save', 'Please try again.');
  };

  const numInput = (i: number, field: 'grams' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'eaten', label: string) => (
    <View style={{ flex: 1 }}>
      <Text style={{ color: Colors.muted, fontSize: 10, marginBottom: 3 }}>{label}</Text>
      <TextInput
        value={String((items as ParsedFoodItem[])[i][field] ?? (field === 'eaten' ? (items as ParsedFoodItem[])[i].servings ?? 0 : 0))}
        onChangeText={(v) => patch(i, field, v)}
        keyboardType="decimal-pad"
        selectTextOnFocus
        style={{ backgroundColor: Colors.surface, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8, color: Colors.text, fontSize: 14, fontWeight: '700', borderWidth: 1, borderColor: Colors.border, textAlign: 'center' }}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0A0A0Acc' }}
      >
        <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 36, borderWidth: 1, borderColor: Colors.border, maxHeight: '88%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '900' }}>{items ? 'Review & adjust' : 'Log a meal'}</Text>
              <Ionicons name="sparkles" size={15} color={Colors.primary} />
            </View>
            <TouchableOpacity onPress={close}>
              <Ionicons name="close" size={24} color={Colors.muted} />
            </TouchableOpacity>
          </View>

          {!items ? (
            <ScrollView
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 14, lineHeight: 19 }}>
                Snap a photo or type what you ate — we'll estimate the calories and macros for you to review.
              </Text>

              {/* Photo path */}
              <TouchableOpacity
                onPress={choosePhotoSource}
                disabled={busy}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.surface2, borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: Colors.primary + '55', marginBottom: 16 }}
              >
                <Ionicons name="camera" size={20} color={Colors.primary} />
                <Text style={{ color: Colors.primary, fontSize: 15, fontWeight: '800' }}>Snap a photo of your plate</Text>
              </TouchableOpacity>

              {/* Whole-dish mode: a reference object gives the model real scale */}
              <TouchableOpacity
                onPress={() => setWholeDish((v) => !v)}
                disabled={busy}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: wholeDish ? 10 : 16 }}
              >
                <Ionicons name={wholeDish ? 'checkbox' : 'square-outline'} size={20} color={wholeDish ? Colors.primary : Colors.muted} />
                <Text style={{ color: Colors.textSecondary, fontSize: 13, flex: 1 }}>
                  Whole dish (pizza, cake, tray) — place a reference object beside it
                </Text>
              </TouchableOpacity>
              {wholeDish && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {REFERENCE_ORDER.map((r) => {
                      const active = r === reference;
                      return (
                        <TouchableOpacity key={r} onPress={() => setReference(r)} style={{ paddingVertical: 8, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: active ? Colors.primary + '22' : Colors.surface2, borderWidth: 1, borderColor: active ? Colors.primary : Colors.border }}>
                          <Text style={{ color: active ? Colors.primary : Colors.textSecondary, fontWeight: '700', fontSize: 12 }}>{REFERENCE_OBJECTS[r].label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={{ color: Colors.muted, fontSize: 12, lineHeight: 17 }}>
                    Lay the {REFERENCE_OBJECTS[reference].label.toLowerCase()} flat next to the food, fully in frame, and shoot from above with the whole dish visible. Size is still an estimate — you can adjust it next.
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '700' }}>OR DESCRIBE IT</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
              </View>

              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={'e.g. "grilled chicken breast, cup of rice, side salad with olive oil"'}
                placeholderTextColor={Colors.muted}
                multiline
                style={{ backgroundColor: Colors.surface2, borderRadius: 12, padding: 14, color: Colors.text, fontSize: 15, minHeight: 96, textAlignVertical: 'top', borderWidth: 1, borderColor: Colors.border, marginBottom: 18 }}
              />
              <GradientButton title={busy ? 'Estimating…' : 'Estimate nutrition'} icon="sparkles" onPress={estimate} loading={busy} disabled={busy || !text.trim()} />
            </ScrollView>
          ) : (
            <ScrollView
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
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

              {photoUri && (
                <Image
                  source={{ uri: photoUri }}
                  style={{ width: '100%', height: 140, borderRadius: 12, marginBottom: 12 }}
                  resizeMode="cover"
                />
              )}

              <Text style={{ color: Colors.muted, fontSize: 12, marginBottom: 10 }}>
                AI estimate — tap any value to adjust before saving.
                {items.some((it) => it.per100) ? ' Change the grams and the nutrition updates.' : ''}
              </Text>
              {items.some((it) => it.confidence === 'low') && (
                <Text style={{ color: Colors.warning, fontSize: 12, marginBottom: 10 }}>
                  Some items were hard to identify or measure from the photo — double-check those portions.
                </Text>
              )}

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
                  {it.source && (
                    <Text numberOfLines={1} style={{ color: Colors.muted, fontSize: 11, marginBottom: 8 }}>
                      {it.source === 'usda' ? `USDA: ${it.matchedAs}` : 'AI estimate (no USDA match)'}
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {it.per100 && numInput(i, 'grams', 'GRAMS')}
                    {numInput(i, 'calories', 'KCAL')}
                    {numInput(i, 'protein_g', 'PROTEIN')}
                    {numInput(i, 'carbs_g', 'CARBS')}
                    {numInput(i, 'fat_g', 'FAT')}
                  </View>
                  {(it.servings ?? 1) > 1 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
                      <View style={{ width: 96 }}>{numInput(i, 'eaten', `I ATE (OF ${it.servings})`)}</View>
                      <Text style={{ color: Colors.muted, fontSize: 11, flex: 1 }}>
                        Values above are for the whole dish. Saves {Math.round(it.calories * share(it))} kcal.
                      </Text>
                    </View>
                  )}
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
      </KeyboardAvoidingView>
      <WholeDishCamera
        visible={cameraOpen}
        reference={reference}
        onReferenceChange={setReference}
        onClose={() => setCameraOpen(false)}
        onCapture={(photo) => { setCameraOpen(false); analyzePhoto(photo.base64, photo.uri); }}
      />
    </Modal>
  );
}
