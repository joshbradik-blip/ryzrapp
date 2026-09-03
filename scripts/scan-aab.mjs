#!/usr/bin/env node
//
// Pre-upload smoke test for a release AAB, for when there is no device to
// install it on.
//
//   node scripts/scan-aab.mjs ~/Downloads/ryzr-1.0.19.aab
//
// Three checks, all against the artifact Play will actually receive rather
// than against the source tree:
//
//   1. 16 KB page alignment of every 64-bit .so — the same gate as
//      scripts/check-16kb.mjs, run from the same code, so one command covers
//      both Play blockers.
//   2. R8 survival. 1.0.18 was the first RYZR build with minification on, and
//      a green build proves nothing: R8 strips classes that are only ever
//      reached by reflection or JNI, which fails at runtime. Every keep rule
//      in app.json exists because some library reaches its classes that way,
//      so this reads the dex string tables and asserts those packages are
//      still present, spelled out in full, and not renamed to a/b/c.
//   3. Entries that survive only because resource shrinking is off.
//
// A PASS here does not prove the app runs. It proves the specific things the
// keep rules were written to protect were not shrunk or obfuscated away, which
// is the failure mode that would otherwise only show up as a crash in Play.
//
// The bundle is read through scripts/lib/bundle.mjs, shared with
// check-16kb.mjs so the two can never disagree about alignment, and so this
// runs the same on Windows, where the release builds are kicked off.

import { readBundle, readEntry, alignmentRows } from './lib/bundle.mjs';

// Each entry is a package R8 could have removed or renamed, the keep rule that
// is supposed to protect it, and what breaks at runtime if it did not survive.
const KEPT_PACKAGES = [
  {
    prefix: 'Lcom/revenuecat/purchases/',
    rule: '-keep class com.revenuecat.purchases.**',
    breaks: 'paywall opens empty — offerings/prices deserialize reflectively',
  },
  {
    prefix: 'Lcom/facebook/reactnative/androidsdk/',
    rule: '-keep class com.facebook.reactnative.androidsdk.**',
    breaks: 'launch crash — the RN bridge to the Facebook SDK',
  },
  {
    prefix: 'Lcom/mrousavy/camera/',
    rule: '-keep class com.mrousavy.camera.**',
    breaks: 'Form Coach camera never opens — frame processors resolve by name',
  },
  {
    prefix: 'Lcom/tflite/',
    rule: '-keep class com.tflite.**',
    breaks: 'MoveNet never loads — fast-tflite JNI bindings',
  },
  {
    prefix: 'Lexpo/modules/speechrecognition/',
    rule: '-keep class expo.modules.speechrecognition.**',
    breaks: 'mic button does nothing — STT native module',
  },
  {
    prefix: 'Landroidx/health/connect/client/',
    rule: '-keep class androidx.health.connect.client.**',
    breaks: 'Health Connect sync fails — steps/HRV never arrive',
  },
  {
    // react-native-health-connect's own consumer rule, covering the record
    // wrappers it creates with Class.newInstance(). This row doubles as the
    // test that consumer rules were applied to the build at all.
    prefix: 'Ldev/matinzd/healthconnect/records/',
    rule: 'consumer rules shipped by react-native-health-connect',
    breaks: 'every Health Connect read throws — record wrappers built reflectively',
  },
  {
    prefix: 'Lexpo/modules/speech/',
    rule: 'consumer rules shipped by expo-speech',
    breaks: 'the coach goes silent — TTS native module',
  },
];

// Resource shrinking is off precisely so this file survives: it is resolved at
// runtime by name, so nothing references it statically and R8's resource
// shrinker would see an unused blob.
//
// Matched by name anywhere in the bundle rather than at one hardcoded path.
// Metro rewrites an asset's name on the way in — sanitized, lowercased,
// directories folded into underscores — so assets/models/movenet_lightning.tflite
// ships as res/raw/assets_models_movenet_lightning.tflite. Asserting the path
// only produces a FAIL that says nothing about whether the model shipped.
//
// Matched on `movenet` rather than on the .tflite extension alone: ML Kit's
// barcode scanner (pulled in by expo-camera) contributes three .tflite models
// of its own, and an extension-wide match would let those satisfy this check
// with the pose model gone.
const REQUIRED_ENTRIES = [
  { pattern: /movenet[^/]*\.tflite$/i, what: 'MoveNet model' },
];

// --- dex ------------------------------------------------------------------

/**
 * Every string in a .dex file's string_ids table. Class descriptors live here
 * verbatim ("Lcom/revenuecat/purchases/Purchases;"), so presence in this table
 * is the test for "R8 kept this class under its real name".
 */
function dexStrings(buf, into) {
  if (buf.length < 0x70 || buf.toString('latin1', 0, 4) !== 'dex\n') return;
  const count = buf.readUInt32LE(0x38);
  const off = buf.readUInt32LE(0x3c);
  for (let i = 0; i < count; i++) {
    let p = buf.readUInt32LE(off + i * 4);
    // ULEB128 length in UTF-16 code units, then MUTF-8 bytes, then NUL.
    let shift = 0;
    for (;;) {
      const b = buf[p++];
      shift += 7;
      if (!(b & 0x80) || shift > 28) break;
    }
    const end = buf.indexOf(0, p);
    if (end < 0) break;
    into.add(buf.toString('utf8', p, end));
  }
}

// --- run ------------------------------------------------------------------

const archive = process.argv[2];
if (!archive) {
  console.error('usage: node scripts/scan-aab.mjs <path-to .aab or .apk>');
  process.exit(2);
}

let bundle;
try {
  bundle = readBundle(archive);
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(`Cannot read ${archive}: ${err.message}`);
    process.exit(2);
  }
  console.error(`${archive}: ${err.message}`);
  process.exit(1);
}

const { buf, entries } = bundle;
let failed = false;

function section(title) {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

// ---- 1. 16 KB page alignment ----------------------------------------------
section('16 KB page alignment');
const rows = alignmentRows(buf, entries);
if (rows.length === 0) {
  console.log('FAIL  no 64-bit native libraries found — is this a release bundle?');
  failed = true;
} else {
  for (const r of rows) {
    const shown = r.align ? `${r.align / 1024} KB` : 'unreadable';
    const label = r.ok ? 'PASS' : r.known ? 'KNOWN' : 'FAIL';
    if (!r.ok && !r.known) failed = true;
    console.log(`${label.padEnd(5)} ${shown.padStart(9)}  ${r.name}`);
  }
  const good = rows.filter((r) => r.ok).length;
  console.log(`\n${good}/${rows.length} libraries aligned to 16 KB or more.`);
  for (const r of rows.filter((r) => !r.ok && r.known)) {
    console.log(`  known: ${r.name}\n    ${r.known}`);
  }
}

// ---- 2. R8 survival --------------------------------------------------------
section('R8 survival (classes the keep rules protect)');
const dexEntries = entries.filter((e) => e.name.endsWith('.dex'));
if (dexEntries.length === 0) {
  console.log('FAIL  no .dex found — cannot verify minification.');
  failed = true;
} else {
  const strings = new Set();
  for (const dex of dexEntries) dexStrings(readEntry(buf, dex), strings);
  const all = [...strings];
  console.log(`${dexEntries.length} dex file(s), ${all.length} strings.\n`);

  for (const pkg of KEPT_PACKAGES) {
    const hits = all.filter((s) => s.startsWith(pkg.prefix)).length;
    const ok = hits > 0;
    if (!ok) failed = true;
    const label = pkg.prefix.slice(1, -1).replace(/\//g, '.');
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(hits).padStart(5)} classes  ${label}`);
    if (!ok) console.log(`        rule: ${pkg.rule}\n        breaks: ${pkg.breaks}`);
  }

  // Obfuscation actually happened — otherwise minification silently no-op'd
  // and Play's "enable code shrinking" item is still unmet.
  const renamed = all.filter((s) => /^L(?:[a-z]\/)+[a-z0-9]{1,2};$/.test(s)).length;
  console.log(
    `\n${renamed > 50 ? 'PASS' : 'WARN'}  ${renamed} obfuscated class names — ` +
      (renamed > 50 ? 'R8 did run.' : 'suspiciously few; minification may not have been applied.'),
  );
}

// ---- 3. Entries nothing references statically ------------------------------
section('Entries kept only because resource shrinking is off');
for (const req of REQUIRED_ENTRIES) {
  const hits = entries.filter((e) => req.pattern.test(e.name));
  if (hits.length === 0) failed = true;
  console.log(`${hits.length ? 'PASS' : 'FAIL'}  ${req.what}`);
  for (const hit of hits) {
    const kb = Math.round((hit.uncompressedSize ?? 0) / 1024);
    console.log(`        ${hit.name}${kb ? `  ${kb} KB` : ''}`);
  }
}

console.log(
  failed
    ? '\nFAILED — do not upload this bundle until the lines above are resolved.'
    : '\nAll checks passed. Nothing here proves the app runs; it proves nothing the ' +
        'keep rules protect was stripped. Still get a Play pre-launch report before promoting.',
);
process.exit(failed ? 1 : 0);
