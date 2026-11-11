const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, require: (name) => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    }, ...globals,
  });
  return exports;
}

function session(exerciseId = 'plank', targetReps = '30s') {
  let now = 1000;
  let tick;
  const sets = [];
  const native = {
    View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', TextInput: 'TextInput',
    Keyboard: { dismiss() {} }, Alert: { alert() {} },
    AppState: { addEventListener: () => ({ remove() {} }) },
  };
  const common = {
    react: React,
    'react-native': native,
    '../../constants/theme': { Colors: {} },
    '../../lib/feedback': { haptic: { success() {}, impact() {} } },
    '../../lib/timedExercise': load('src/lib/timedExercise.ts'),
  };
  const { HoldTimer } = load('src/components/workout/HoldTimer.tsx', {
    ...common, '../ui/Button': { Button: 'Button' }, '../ui/GradientButton': { GradientButton: 'GradientButton' },
  }, {
    Date: { now: () => now },
    setInterval: (callback) => { tick = callback; return 1; },
    clearInterval: () => { tick = undefined; },
  });
  const exercise = { id: exerciseId, name: exerciseId, muscles_primary: [], setup_cues: [], execution_cues: [] };
  const workout = { id: 'workout', exercises: [{ id: 'effort', exercise, target_reps: targetReps, target_sets: 2, target_rpe: 0, rest_seconds: 60 }] };
  const workoutState = {
    workouts: [workout], currentExerciseIndex: 0, activeSets: sets, exerciseChallenges: {},
    startSession() {}, logSet: (set) => sets.push(set), nextExercise() {}, completeSession() {}, loadChallenges() {},
  };
  const useWorkoutStore = Object.assign(() => workoutState, { getState: () => workoutState });
  const { WorkoutSessionScreen } = load('src/screens/today/WorkoutSessionScreen.tsx', {
    ...common,
    '../../lib/funnel': { trackEvent() {} },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@react-navigation/native': { useIsFocused: () => true },
    '../../store/workoutStore': { useWorkoutStore },
    '../../store/subscriptionStore': { useSubscriptionStore: () => ({ isPremium: false }) },
    '../../store/profileStore': { useProfileStore: () => ({ profile: { weight_unit: 'kg' }, setProfile() {} }) },
    '../../store/historyStore': { useHistoryStore: () => ({ lastSets: {}, bestWeights: {}, lastSessionPerf: {} }) },
    '../../store/authStore': { useAuthStore: (selector) => selector({}) },
    '../../store/wearablesStore': {},
    '../../lib/units': load('src/lib/units.ts'),
    '../../lib/exerciseMedia': { exerciseHeroMedia: () => ({}) },
    '../../components/ui/Button': { Button: 'Button' },
    '../../components/ui/GradientButton': { GradientButton: 'GradientButton' },
    '../../components/workout/ExerciseHero': { ExerciseHero: 'ExerciseHero' },
    '../../components/workout/HoldTimer': { HoldTimer },
    '../../components/workout/WorkoutQuickTip': { WorkoutQuickTip: 'WorkoutQuickTip', useWorkoutQuickTip: () => ({ show: false, dismiss() {} }) },
    '../../lib/pose/coverage': { supportsFormCoach: () => false },
    '../../lib/featureFlags': { useFormCoachEnabled: () => false },
    './WorkoutRestScreen': { WorkoutRestScreen: 'WorkoutRestScreen' },
  });
  let tree;
  act(() => { tree = create(React.createElement(WorkoutSessionScreen, { navigation: {}, route: { params: { workoutId: workout.id } } })); });
  return {
    tree, sets, HoldTimer,
    button: (title) => tree.root.findAll((node) => ['Button', 'GradientButton'].includes(node.type) && node.props.title === title)[0],
    advance: (milliseconds) => act(() => { now += milliseconds; tick?.(); }),
    press(title) { const button = this.button(title); assert.ok(button, title); assert.notEqual(button.props.disabled, true); act(() => button.props.onPress()); },
    stop: () => act(() => tree.unmount()),
  };
}

test('plank logs elapsed duration and returns from separate rest to a fresh timer', () => {
  const s = session();
  try {
    assert.equal(s.tree.root.findAllByType(s.HoldTimer).length, 1);
    assert.equal(s.tree.root.findAllByType('TextInput').length, 0);
    assert.equal(s.button('Log Set'), undefined);
    s.press('Start Timer');
    s.advance(3400);
    s.press('Complete Hold');
    assert.equal(s.sets.length, 1);
    assert.equal(s.sets[0].durationSeconds, 3);
    assert.equal(s.sets[0].reps, 0);
    assert.equal(s.sets[0].weight, 0);
    const rest = s.tree.root.findByType('WorkoutRestScreen');
    assert.equal(rest.props.nextSet, 2);
    assert.equal(rest.props.effortLabel, 'Hold');
    assert.equal(s.tree.root.findByType(s.HoldTimer).props.disabled, true);
    act(() => rest.props.onDone());
    assert.equal(s.tree.root.findAllByType('WorkoutRestScreen').length, 0);
    const clock = s.tree.root.find((node) => node.props.accessibilityRole === 'timer');
    assert.equal(clock.children.join(''), '0:00');
    s.press('Start Timer');
    s.advance(2100);
    s.press('Complete Hold');
    assert.equal(s.sets[1].durationSeconds, 2);
    assert.equal(s.tree.root.findAllByType(s.HoldTimer).length, 0);
    assert.ok(s.button('Finish Workout'));
  } finally { s.stop(); }
});

test('a stale timer completion cannot log the same hold twice before rerender', () => {
  const s = session();
  try {
    const complete = s.tree.root.findByType(s.HoldTimer).props.onComplete;
    act(() => { complete(30); complete(30); });
    assert.equal(s.sets.length, 1);
    assert.equal(s.sets[0].setNumber, 1);
  } finally { s.stop(); }
});

test('weighted sets retain weight/reps, duplicate protection and separate rest', () => {
  const s = session('squat', '8');
  try {
    assert.equal(s.tree.root.findAllByType(s.HoldTimer).length, 0);
    const [weight, reps] = s.tree.root.findAllByType('TextInput');
    act(() => { weight.props.onChangeText('50'); reps.props.onChangeText('8'); });
    const log = s.button('Log Set');
    assert.equal(log.props.disabled, false);
    act(() => { log.props.onPress(); log.props.onPress(); });
    assert.equal(s.sets.length, 1);
    assert.equal(s.sets[0].weight, 50);
    assert.equal(s.sets[0].reps, 8);
    assert.equal(s.sets[0].durationSeconds, undefined);
    assert.equal(s.tree.root.findByType('WorkoutRestScreen').props.effortLabel, 'Set');
  } finally { s.stop(); }
});
