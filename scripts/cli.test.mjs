import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, buildHelpText } from './cli.mjs';

test('parseArgs defaults to help', () => {
  assert.deepEqual(parseArgs(['node', 'ryzr']), { command: 'help', args: [] });
});

test('parseArgs handles explicit commands', () => {
  assert.deepEqual(parseArgs(['node', 'ryzr', 'start']), { command: 'start', args: [] });
  assert.deepEqual(parseArgs(['node', 'ryzr', 'ios', '--dev-client']), { command: 'ios', args: ['--dev-client'] });
});

test('buildHelpText lists the supported commands', () => {
  const help = buildHelpText();
  assert.match(help, /start/);
  assert.match(help, /android/);
  assert.match(help, /ios/);
  assert.match(help, /web/);
});
