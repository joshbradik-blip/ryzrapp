#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const COMMANDS = {
  start: {
    description: 'Start the Expo development server',
    script: 'start',
  },
  android: {
    description: 'Run the Android app build and launch flow',
    script: 'android',
  },
  ios: {
    description: 'Run the iOS app build and launch flow',
    script: 'ios',
  },
  web: {
    description: 'Start the Expo web development server',
    script: 'web',
  },
  help: {
    description: 'Show the available commands',
    script: null,
  },
};

export function parseArgs(argv = process.argv.slice(2)) {
  const normalizedArgs = Array.isArray(argv) ? argv : [];
  const preparedArgs = normalizedArgs[0] === 'node' ? normalizedArgs.slice(2) : normalizedArgs;
  const [rawCommand, ...args] = preparedArgs;
  const command = rawCommand && !rawCommand.startsWith('-') ? rawCommand : 'help';
  return { command, args };
}

export function buildHelpText() {
  const entries = Object.entries(COMMANDS)
    .filter(([name]) => name !== 'help')
    .map(([name, config]) => `  ${name.padEnd(10)} ${config.description}`);

  return [
    'RYZR repo CLI',
    '',
    'Usage:',
    '  npm run cli -- <command>',
    '  node ./scripts/cli.mjs <command>',
    '',
    'Commands:',
    ...entries,
    '',
    'Examples:',
    '  npm run cli -- start',
    '  npm run cli -- android',
  ].join('\n');
}

export function runCommand(command, args = []) {
  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(buildHelpText());
    return 0;
  }

  if (!Object.hasOwn(COMMANDS, command)) {
    console.error(`Unknown command: ${command}`);
    console.error('');
    console.error(buildHelpText());
    return 1;
  }

  const config = COMMANDS[command];
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['run', config.script, ...args], {
    stdio: 'inherit',
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  });

  return result.status ?? 1;
}

export function main(argv = process.argv.slice(2)) {
  const { command, args } = parseArgs(argv);
  return runCommand(command, args);
}

const isDirectExecution = (() => {
  const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
  return entryPath ? entryPath === path.resolve(fileURLToPath(import.meta.url)) : false;
})();

if (isDirectExecution) {
  process.exitCode = main();
}
