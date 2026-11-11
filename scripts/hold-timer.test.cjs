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

function timer() {
  let now = 1000;
  let tick;
  let onActive;
  let successCount = 0;
  const completed = [];
  const { HoldTimer } = load('src/components/workout/HoldTimer.tsx', {
    react: React,
    'react-native': {
      View: 'View', Text: 'Text',
      AppState: { addEventListener: (_, callback) => {
        onActive = callback;
        return { remove: () => { onActive = undefined; } };
      } },
    },
    '../../constants/theme': { Colors: {} },
    '../ui/Button': { Button: 'Button' },
    '../ui/GradientButton': { GradientButton: 'GradientButton' },
    '../../lib/timedExercise': load('src/lib/timedExercise.ts'),
    '../../lib/feedback': { haptic: { success: () => { successCount += 1; } } },
  }, {
    Date: { now: () => now },
    setInterval: (callback) => { tick = callback; return 1; },
    clearInterval: () => { tick = undefined; },
  });
  let tree;
  const render = (key = 'effort-1') => act(() => {
    const element = React.createElement(HoldTimer, { key, target: 3, disabled: false, onComplete: (value) => completed.push(value) });
    if (tree) tree.update(element);
    else tree = create(element);
  });
  render();
  return {
    completed, render,
    startOrPause: () => act(() => tree.root.findByType('GradientButton').props.onPress()),
    complete: (twice = false) => act(() => {
      const button = tree.root.findAllByType('Button').find((node) => node.props.title === 'Complete Hold');
      assert.equal(button.props.disabled, false);
      button.props.onPress();
      if (twice) button.props.onPress();
    }),
    reset: () => act(() => tree.root.findAllByType('Button').find((node) => node.props.title === 'Reset Timer').props.onPress()),
    advance: (milliseconds, foreground = false) => act(() => {
      now += milliseconds;
      if (foreground) onActive?.('active');
      else tick?.();
    }),
    successCount: () => successCount,
    stop: () => act(() => tree.unmount()),
  };
}

test('pause and resume preserve fractional active time and exclude paused time', () => {
  const t = timer();
  try {
    t.startOrPause();
    t.advance(1900);
    t.startOrPause();
    t.advance(10000);
    t.startOrPause();
    t.advance(1900);
    t.complete();
    assert.deepEqual(t.completed, [3]);
  } finally { t.stop(); }
});

test('reset clears elapsed time and permits a fresh target notification', () => {
  const t = timer();
  try {
    t.startOrPause();
    t.advance(4000);
    t.advance(1000);
    assert.equal(t.successCount(), 1);
    t.reset();
    t.startOrPause();
    t.advance(3100);
    assert.equal(t.successCount(), 2);
    t.complete();
    assert.deepEqual(t.completed, [3]);
  } finally { t.stop(); }
});

test('background elapsed time counts, completion saves once, and a new effort resets', () => {
  const t = timer();
  try {
    t.startOrPause();
    t.advance(45000, true);
    t.complete(true);
    assert.deepEqual(t.completed, [45]);
    t.render('effort-2');
    t.startOrPause();
    t.advance(2100);
    t.complete();
    assert.deepEqual(t.completed, [45, 2]);
  } finally { t.stop(); }
});
