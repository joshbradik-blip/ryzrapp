//
// Shared reader for release bundles (.aab / .apk).
//
// Two scripts need the same two things — the entries inside the bundle, and
// the page alignment of each native library — and they must never disagree
// about them, so the implementation lives here once:
//
//   scripts/check-16kb.mjs   the 16 KB page-size gate on its own
//   scripts/scan-aab.mjs     that gate plus the R8 keep-rule survival check
//
// The zip is read in-process rather than by shelling out to `unzip`, which
// does not exist on a stock Windows box — the machine that most often has the
// downloaded bundle sitting in Downloads.
//
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
      if (z.uncompressedSize !== undefined) uncompressedSize = z.uncompressedSize;
      if (z.compressedSize !== undefined) compressedSize = z.compressedSize;
      if (z.localOffset !== undefined) localOffset = z.localOffset;
    }

    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
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
// Known-unaligned libraries
//
// These two are prebuilt binaries extracted from
// com.google.ai.edge.litert:{litert,litert-gpu}:1.0.1 by
// react-native-fast-tflite, not compiled here, so no CMake flag reaches them.
// Google shipped that release's arm64-v8a aligned and its x86_64 at 4 KB.
//
// They are tolerated rather than fixed because 16 KB page sizes are an arm64
// device property — no x86_64 Android device has 16 KB pages, so a 4 KB
// x86_64 library cannot fail to load on hardware that cares. Keeping the ABI
// also keeps the app installable on emulators, which is where the
// pre-launch report's virtual devices run.
//
// Clearing them would mean the react-native-fast-tflite 1.6.1 -> 3.0.1
// migration (a required `delegates` argument on loadTensorflowModel, a
// narrowed runSync, its own config plugin, a new peer dependency) — a change
// to the Form Coach inference path, not a version bump.
//
// An entry here suppresses the failure exit code but never the report line:
// the run still prints the library and this reason.
// ---------------------------------------------------------------------------

const KNOWN_UNALIGNED = [
  {
    pattern: /(^|\/)lib\/x86_64\/libtensorflowlite_jni\.so$/,
    why: 'prebuilt in com.google.ai.edge.litert:litert:1.0.1; x86_64 has no 16 KB-page devices',
  },
  {
    pattern: /(^|\/)lib\/x86_64\/libtensorflowlite_gpu_jni\.so$/,
    why: 'prebuilt in com.google.ai.edge.litert:litert-gpu:1.0.1; x86_64 has no 16 KB-page devices',
  },
];

/** The recorded reason this library is allowed to be under-aligned, or null. */
function knownUnaligned(name) {
  return KNOWN_UNALIGNED.find((k) => k.pattern.test(name))?.why ?? null;
}

// ---------------------------------------------------------------------------

/** Open a bundle: its bytes plus its central-directory entries. */
function readBundle(path) {
  const buf = readFileSync(path);
  return { buf, entries: listEntries(buf) };
}

/**
 * One row per 64-bit native library: { name, align, ok, known }.
 *
 * `align` is null when the library could not be read as a 64-bit ELF, which
 * counts as a failure rather than a skip — an unreadable library is not a
 * library that passed.
 */
function alignmentRows(buf, entries) {
  const libs = entries.filter(
    (e) =>
      e.name.endsWith('.so') &&
      ENFORCED_ABIS.some((abi) => e.name.includes(`/${abi}/`) || e.name.startsWith(`${abi}/`)),
  );

  const rows = [];
  for (const lib of libs) {
    let align = null;
    try {
      align = loadAlignment(readEntry(buf, lib));
    } catch (err) {
      console.error(`  ! ${lib.name}: ${err.message}`);
    }
    const ok = Boolean(align) && align >= REQUIRED_ALIGN;
    rows.push({ name: lib.name, align, ok, known: ok ? null : knownUnaligned(lib.name) });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export {
  REQUIRED_ALIGN,
  ENFORCED_ABIS,
  listEntries,
  readEntry,
  loadAlignment,
  knownUnaligned,
  readBundle,
  alignmentRows,
};
