#!/usr/bin/env node
//
// Pre-upload smoke test for a release AAB, for when there is no device to
// install it on.
//
//   node scripts/scan-aab.mjs ~/Downloads/ryzr-1.0.18.aab
//
// Two independent checks, both run against the artifact Play will actually
// receive rather than against the source tree:
//
//   1. 16 KB page alignment of every 64-bit .so (same rule as
//      scripts/check-16kb.mjs, folded in here so one command covers both).
//   2. R8 survival. 1.0.18 is the first RYZR build with minification on, and a
//      green build proves nothing: R8 strips classes that are only ever reached
//      by reflection or JNI, which fails at runtime. Every keep rule in
//      app.json exists because some library reaches its classes that way, so
//      this reads the dex string tables and asserts those packages are still
//      present, still spelled out in full, and not renamed to a/b/c.
//
// A PASS here does not prove the app runs. It proves the specific things the
// keep rules were written to protect were not shrunk or obfuscated away, which
// is the failure mode that would otherwise only show up as a crash in Play.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const REQUIRED_ALIGN = 16 * 1024;
// 32-bit ABIs run only on devices that predate 16 KB pages, so Play does not
// hold them to it. Only the 64-bit ones matter.
const ENFORCED_ABIS = ['arm64-v8a', 'x86_64'];
const PT_LOAD = 1;

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
    rule: "consumer rules shipped by react-native-health-connect",
    breaks: 'Health Connect sync fails — steps/HRV never arrive',
  },
  {
    prefix: 'Lexpo/modules/speech/',
    rule: 'consumer rules shipped by expo-speech',
    breaks: 'the coach goes silent — TTS native module',
  },
];

// Resource shrinking is off precisely so this file survives: it is resolved at
// runtime by Resources.getIdentifier(name, "raw", pkg) with the name coming
// from the JS bundle, so nothing references it statically.
const REQUIRED_ENTRIES = [
  { pattern: /res\/raw\/movenet_lightning\.tflite$/, what: 'MoveNet model (res/raw)' },
];

/** Largest p_align across the PT_LOAD segments, or null if not a 64-bit ELF. */
function loadAlignment(file) {
  const buf = readFileSync(file);
  if (buf.length < 64) return null;
  if (buf.readUInt32BE(0) !== 0x7f454c46) return null; // \x7fELF
  if (buf[4] !== 2) return null; // not ELFCLASS64
  const little = buf[5] === 1;
  const u16 = (o) => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const u64 = (o) => (little ? buf.readBigUInt64LE(o) : buf.readBigUInt64BE(o));

  const phoff = Number(u64(0x20));
  const phentsize = u16(0x36);
  const phnum = u16(0x38);

  let max = 0;
  for (let i = 0; i < phnum; i++) {
    const off = phoff + i * phentsize;
    if (off + phentsize > buf.length) break;
    if (u32(off) !== PT_LOAD) continue;
    max = Math.max(max, Number(u64(off + 0x30))); // p_align
  }
  return max || null;
}

/**
 * Every string in a .dex file's string_ids table. Class descriptors live here
 * verbatim ("Lcom/revenuecat/purchases/Purchases;"), so presence in this table
 * is the test for "R8 kept this class under its real name".
 */
function dexStrings(file) {
  const buf = readFileSync(file);
  if (buf.length < 0x70 || buf.toString('latin1', 0, 4) !== 'dex\n') return [];
  const count = buf.readUInt32LE(0x38);
  const off = buf.readUInt32LE(0x3c);
  const out = [];
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
    out.push(buf.toString('utf8', p, end));
  }
  return out;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const archive = process.argv[2];
if (!archive) {
  console.error('usage: node scripts/scan-aab.mjs <path-to .aab or .apk>');
  process.exit(2);
}
if (!existsSync(archive)) {
  console.error(`No such file: ${archive}`);
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'ryzr-scan-'));
let failed = false;

function section(title) {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

try {
  const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

  execFileSync('unzip', ['-q', '-o', archive, '*.so', '*.dex', '-d', work], {
    stdio: 'pipe',
  });
  const extracted = walk(work);

  // ---- 1. 16 KB page alignment ------------------------------------------
  section('16 KB page alignment');
  const rows = [];
  for (const lib of extracted.filter((f) => f.endsWith('.so'))) {
    const rel = relative(work, lib);
    const abi = ENFORCED_ABIS.find((a) => rel.includes(`/${a}/`) || rel.startsWith(`${a}/`));
    if (!abi) continue;
    rows.push({ rel, align: loadAlignment(lib) });
  }
  if (rows.length === 0) {
    console.log('FAIL  no 64-bit native libraries found — is this a release bundle?');
    failed = true;
  } else {
    rows.sort((a, b) => a.rel.localeCompare(b.rel));
    for (const r of rows) {
      const ok = r.align && r.align >= REQUIRED_ALIGN;
      if (!ok) failed = true;
      const shown = r.align ? `${r.align / 1024} KB` : 'unreadable';
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${shown.padStart(9)}  ${r.rel}`);
    }
    console.log(
      `\n${rows.filter((r) => r.align >= REQUIRED_ALIGN).length}/${rows.length} libraries aligned to 16 KB or more.`,
    );
  }

  // ---- 2. R8 survival ----------------------------------------------------
  section('R8 survival (classes the keep rules protect)');
  const dexFiles = extracted.filter((f) => f.endsWith('.dex'));
  if (dexFiles.length === 0) {
    console.log('FAIL  no .dex found — cannot verify minification.');
    failed = true;
  } else {
    const strings = new Set();
    for (const dex of dexFiles) for (const s of dexStrings(dex)) strings.add(s);
    const all = [...strings];
    console.log(`${dexFiles.length} dex file(s), ${all.length} strings.\n`);

    for (const pkg of KEPT_PACKAGES) {
      const hits = all.filter((s) => s.startsWith(pkg.prefix)).length;
      const ok = hits > 0;
      if (!ok) failed = true;
      console.log(
        `${ok ? 'PASS' : 'FAIL'}  ${String(hits).padStart(5)} classes  ${pkg.prefix.slice(1, -1).replace(/\//g, '.')}`,
      );
      if (!ok) console.log(`        rule: ${pkg.rule}\n        breaks: ${pkg.breaks}`);
    }

    // Obfuscation actually happened — otherwise minification silently no-op'd
    // and Play's "enable code shrinking" item is still unmet.
    const renamed = all.filter((s) => /^L(?:[a-z]\/)+[a-z0-9]{1,2};$/.test(s)).length;
    console.log(
      `\n${renamed > 50 ? 'PASS' : 'WARN'}  ${renamed} obfuscated class names — ` +
        (renamed > 50
          ? 'R8 did run.'
          : 'suspiciously few; minification may not have been applied.'),
    );
  }

  // ---- 3. Entries nothing references statically --------------------------
  section('Entries kept only because resource shrinking is off');
  for (const req of REQUIRED_ENTRIES) {
    const hit = entries.find((e) => req.pattern.test(e));
    if (!hit) failed = true;
    console.log(`${hit ? 'PASS' : 'FAIL'}  ${req.what}${hit ? `  ${hit}` : ''}`);
  }

  console.log(
    failed
      ? '\nFAILED — do not upload this bundle until the lines above are resolved.'
      : '\nAll checks passed. Nothing here proves the app runs; it proves nothing the ' +
          'keep rules protect was stripped. Still get a Play pre-launch report before promoting.',
  );
  process.exit(failed ? 1 : 0);
} finally {
  rmSync(work, { recursive: true, force: true });
}
