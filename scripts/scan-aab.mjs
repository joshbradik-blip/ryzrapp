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
//
// Node only — the zip is read in-process rather than shelled out to `unzip`,
// so this runs the same on Windows, where the release builds are kicked off.

import { inflateRawSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';

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
    rule: 'consumer rules shipped by react-native-health-connect',
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

// --- zip ------------------------------------------------------------------
//
// AABs and APKs are zips. Only the central directory is walked up front; entry
// bodies are inflated on demand so the 9 MB model and the JS bundle are never
// materialised.

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const CD_ENTRY_SIG = 0x02014b50;

function readZip(path) {
  const buf = readFileSync(path);

  // The EOCD is last, after a comment of up to 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip archive (no end-of-central-directory record)');

  let count = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);

  // Over 65535 entries or past 4 GB, the real values live in the zip64 record.
  if (count === 0xffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || buf.readUInt32LE(loc) !== ZIP64_LOCATOR_SIG) {
      throw new Error('zip64 archive without a locator record');
    }
    const z64 = Number(buf.readBigUInt64LE(loc + 8));
    count = Number(buf.readBigUInt64LE(z64 + 32));
    cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
  }

  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CD_ENTRY_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    let compressedSize = buf.readUInt32LE(p + 20);
    let uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    let localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // Any 0xffffffff field is a pointer into the zip64 extended-information
    // extra field, whose values appear in a fixed order, only for the fields
    // that overflowed.
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      const extraStart = p + 46 + nameLen;
      let e = extraStart;
      while (e < extraStart + extraLen - 4) {
        const id = buf.readUInt16LE(e);
        const size = buf.readUInt16LE(e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          const next = () => {
            const v = Number(buf.readBigUInt64LE(q));
            q += 8;
            return v;
          };
          if (uncompressedSize === 0xffffffff) uncompressedSize = next();
          if (compressedSize === 0xffffffff) compressedSize = next();
          if (localOffset === 0xffffffff) localOffset = next();
          break;
        }
        e += 4 + size;
      }
    }

    entries.push({
      name,
      size: uncompressedSize,
      read() {
        // The central directory's name/extra lengths need not match the local
        // header's, so the data offset is read from the local header itself.
        const lnameLen = buf.readUInt16LE(localOffset + 26);
        const lextraLen = buf.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + lnameLen + lextraLen;
        const raw = buf.subarray(start, start + compressedSize);
        if (method === 0) return raw;
        if (method === 8) return inflateRawSync(raw);
        throw new Error(`${name}: unsupported compression method ${method}`);
      },
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// --- elf ------------------------------------------------------------------

/** Largest p_align across the PT_LOAD segments, or null if not a 64-bit ELF. */
function loadAlignment(buf) {
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
if (!existsSync(archive)) {
  console.error(`No such file: ${archive}`);
  process.exit(2);
}

function section(title) {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

const entries = readZip(archive);
let failed = false;

// ---- 1. 16 KB page alignment ----------------------------------------------
section('16 KB page alignment');
const rows = [];
for (const entry of entries) {
  if (!entry.name.endsWith('.so')) continue;
  if (!ENFORCED_ABIS.some((a) => entry.name.includes(`/${a}/`) || entry.name.startsWith(`${a}/`))) {
    continue;
  }
  rows.push({ name: entry.name, align: loadAlignment(entry.read()) });
}
if (rows.length === 0) {
  console.log('FAIL  no 64-bit native libraries found — is this a release bundle?');
  failed = true;
} else {
  rows.sort((a, b) => a.name.localeCompare(b.name));
  for (const r of rows) {
    const ok = r.align && r.align >= REQUIRED_ALIGN;
    if (!ok) failed = true;
    const shown = r.align ? `${r.align / 1024} KB` : 'unreadable';
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${shown.padStart(9)}  ${r.name}`);
  }
  const good = rows.filter((r) => r.align >= REQUIRED_ALIGN).length;
  console.log(`\n${good}/${rows.length} libraries aligned to 16 KB or more.`);
}

// ---- 2. R8 survival --------------------------------------------------------
section('R8 survival (classes the keep rules protect)');
const dexEntries = entries.filter((e) => e.name.endsWith('.dex'));
if (dexEntries.length === 0) {
  console.log('FAIL  no .dex found — cannot verify minification.');
  failed = true;
} else {
  const strings = new Set();
  for (const dex of dexEntries) dexStrings(dex.read(), strings);
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
  const hit = entries.find((e) => req.pattern.test(e.name));
  if (!hit) failed = true;
  console.log(`${hit ? 'PASS' : 'FAIL'}  ${req.what}${hit ? `  ${hit.name}` : ''}`);
}

console.log(
  failed
    ? '\nFAILED — do not upload this bundle until the lines above are resolved.'
    : '\nAll checks passed. Nothing here proves the app runs; it proves nothing the ' +
        'keep rules protect was stripped. Still get a Play pre-launch report before promoting.',
);
process.exit(failed ? 1 : 0);
