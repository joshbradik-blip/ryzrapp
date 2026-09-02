#!/usr/bin/env node
//
// Verifies that every native library in a release AAB/APK is aligned to a
// 16 KB page boundary, as required by Play for Android 15+ devices
// ("App must support 16 KB memory page sizes", enforced 2025-10-31).
//
//   node scripts/check-16kb.mjs ~/Downloads/ryzr-release.aab
//   node scripts/check-16kb.mjs C:\Users\you\Downloads\ryzr-release.aab
//
// Play raises that warning against the uploaded artifact, not the source tree,
// so checking the actual bundle before upload is the only meaningful test.
//
// Alignment lives in the ELF program headers: each PT_LOAD segment carries a
// p_align, and the largest one is the page size the library was linked for.
// 4096 means the library will not load on a 16 KB-page device.
//
// The zip is read with a small reader below rather than by shelling out to
// `unzip`, which does not exist on a stock Windows box — the one machine that
// most often has the downloaded bundle sitting in Downloads.

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const REQUIRED_ALIGN = 16 * 1024;

// 32-bit ABIs run only on devices that predate 16 KB pages, so Play does not
// hold them to it. Only the 64-bit ones matter.
const ENFORCED_ABIS = ['arm64-v8a', 'x86_64'];

const PT_LOAD = 1;

// ---------------------------------------------------------------------------
// Minimal zip reader
//
// Enough of the format to list entries and pull the few we care about: the
// central directory for names and offsets, local headers for where each
// entry's bytes start, and raw deflate for the ones that are compressed.
// ZIP64 is handled because an AAB carrying a large model asset can cross the
// 4 GB/65535-entry fields that the classic headers cap out at.
// ---------------------------------------------------------------------------

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;

/** Offset of the End Of Central Directory record, scanning back from the end. */
function findEocd(buf) {
  const limit = Math.min(buf.length, U16_MAX + 22);
  for (let back = 22; back <= limit; back++) {
    const off = buf.length - back;
    if (buf.readUInt32LE(off) === SIG_EOCD) return off;
  }
  return -1;
}

/** { offset, count } of the central directory, following ZIP64 when present. */
function centralDirectory(buf) {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('not a zip archive (no end-of-central-directory record)');

  let count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const needsZip64 = count === U16_MAX || offset === U32_MAX;
  if (!needsZip64) return { offset, count };

  const locator = eocd - 20;
  if (locator < 0 || buf.readUInt32LE(locator) !== SIG_EOCD64_LOCATOR) {
    throw new Error('zip needs ZIP64 but the locator record is missing');
  }
  const eocd64 = Number(buf.readBigUInt64LE(locator + 8));
  if (buf.readUInt32LE(eocd64) !== SIG_EOCD64) {
    throw new Error('ZIP64 end-of-central-directory record is malformed');
  }
  count = Number(buf.readBigUInt64LE(eocd64 + 32));
  offset = Number(buf.readBigUInt64LE(eocd64 + 48));
  return { offset, count };
}

/**
 * Pull the 8-byte ZIP64 replacements out of an entry's extra field.
 *
 * They appear in a fixed order but only for the fields that overflowed, so
 * which ones are present depends on which of the 32-bit values read as -1.
 */
function readZip64Extra(extra, want) {
  const out = {};
  let p = 0;
  while (p + 4 <= extra.length) {
    const id = extra.readUInt16LE(p);
    const size = extra.readUInt16LE(p + 2);
    const body = extra.subarray(p + 4, p + 4 + size);
    if (id === 0x0001) {
      let q = 0;
      for (const field of ['uncompressedSize', 'compressedSize', 'localOffset']) {
        if (!want.includes(field)) continue;
        if (q + 8 > body.length) break;
        out[field] = Number(body.readBigUInt64LE(q));
        q += 8;
      }
      break;
    }
    p += 4 + size;
  }
  return out;
}

/** Every entry in the archive, as { name, method, compressedSize, localOffset }. */
function listEntries(buf) {
  const { offset, count } = centralDirectory(buf);
  const entries = [];
  let p = offset;

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) break;

    const method = buf.readUInt16LE(p + 10);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    let compressedSize = buf.readUInt32LE(p + 20);
    let uncompressedSize = buf.readUInt32LE(p + 24);
    let localOffset = buf.readUInt32LE(p + 42);

    const want = [];
    if (uncompressedSize === U32_MAX) want.push('uncompressedSize');
    if (compressedSize === U32_MAX) want.push('compressedSize');
    if (localOffset === U32_MAX) want.push('localOffset');
    if (want.length) {
      const extra = buf.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
      const z = readZip64Extra(extra, want);
      if (z.compressedSize !== undefined) compressedSize = z.compressedSize;
      if (z.localOffset !== undefined) localOffset = z.localOffset;
    }

    entries.push({ name, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * The entry's bytes.
 *
 * The central directory's name/extra lengths do not have to match the local
 * header's, so the data offset is computed from the local header itself.
 */
function readEntry(buf, entry) {
  const p = entry.localOffset;
  if (buf.readUInt32LE(p) !== SIG_LOCAL) {
    throw new Error(`local header missing for ${entry.name}`);
  }
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return raw; // stored
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(`${entry.name}: unsupported compression method ${entry.method}`);
}

// ---------------------------------------------------------------------------
// ELF
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------

const archive = process.argv[2];
if (!archive) {
  console.error('usage: node scripts/check-16kb.mjs <path-to .aab or .apk>');
  process.exit(2);
}

let buf;
try {
  buf = readFileSync(archive);
} catch (err) {
  console.error(`Cannot read ${archive}: ${err.message}`);
  process.exit(2);
}

let entries;
try {
  entries = listEntries(buf);
} catch (err) {
  console.error(`${archive}: ${err.message}`);
  process.exit(1);
}

// An AAB keeps libraries under base/lib/<abi>/, an APK under lib/<abi>/.
const libs = entries.filter((e) => {
  if (!e.name.endsWith('.so')) return false;
  return ENFORCED_ABIS.some((abi) => e.name.includes(`/${abi}/`) || e.name.startsWith(`${abi}/`));
});

if (libs.length === 0) {
  const anySo = entries.some((e) => e.name.endsWith('.so'));
  console.error(
    anySo
      ? `No 64-bit native libraries in ${archive} (looked for ${ENFORCED_ABIS.join(', ')}).`
      : `No .so entries in ${archive}. Is this a release bundle?`
  );
  process.exit(1);
}

const rows = [];
for (const lib of libs) {
  try {
    rows.push({ name: lib.name, align: loadAlignment(readEntry(buf, lib)) });
  } catch (err) {
    console.error(`  ! ${lib.name}: ${err.message}`);
    rows.push({ name: lib.name, align: null });
  }
}

rows.sort((a, b) => a.name.localeCompare(b.name));
const bad = rows.filter((r) => !r.align || r.align < REQUIRED_ALIGN);

for (const r of rows) {
  const ok = r.align && r.align >= REQUIRED_ALIGN;
  const shown = r.align ? `${r.align / 1024} KB` : 'unreadable';
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${shown.padStart(12)}  ${r.name}`);
}

console.log(`\n${rows.length - bad.length}/${rows.length} libraries aligned to 16 KB or more.`);
if (bad.length) {
  console.log('\nUnder-aligned — Play will reject this bundle:');
  for (const r of bad) console.log(`  ${r.name}`);
  console.log('\nBump the dependency each library belongs to and rebuild.');
  process.exit(1);
}
console.log('16 KB page size: OK.');
