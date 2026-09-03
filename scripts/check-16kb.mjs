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
// Do not read the absence of a warning in Play's upload dialog as a pass:
// 1.0.18 (36) uploaded to closed testing without one while carrying eight
// under-aligned libraries. This script measures; Play's silence does not.
//
// Alignment lives in the ELF program headers: each PT_LOAD segment carries a
// p_align, and the largest one is the page size the library was linked for.
// 4096 means the library will not load on a 16 KB-page device.
//
// scan-aab.mjs runs this same check alongside the R8 keep-rule survival
// check; both read the bundle through scripts/lib/bundle.mjs so they cannot
// disagree.
//
// Nothing is tolerated. 1.0.19 (38) reported a pass here and was still
// rejected by Play for 16 KB page sizes, because two prebuilt x86_64 LiteRT
// libraries sat on an allowlist Play does not share. See the note in
// scripts/lib/bundle.mjs.

import { REQUIRED_ALIGN, ENFORCED_ABIS, readBundle, alignmentRows } from './lib/bundle.mjs';

const archive = process.argv[2];
if (!archive) {
  console.error('usage: node scripts/check-16kb.mjs <path-to .aab or .apk>');
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

const rows = alignmentRows(bundle.buf, bundle.entries);

if (rows.length === 0) {
  const anySo = bundle.entries.some((e) => e.name.endsWith('.so'));
  console.error(
    anySo
      ? `No 64-bit native libraries in ${archive} (looked for ${ENFORCED_ABIS.join(', ')}).`
      : `No .so entries in ${archive}. Is this a release bundle?`,
  );
  process.exit(1);
}

for (const r of rows) {
  const shown = r.align ? `${r.align / 1024} KB` : 'unreadable';
  console.log(`${(r.ok ? 'PASS' : 'FAIL').padEnd(5)} ${shown.padStart(12)}  ${r.name}`);
}

const blocking = rows.filter((r) => !r.ok);

console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} libraries aligned to 16 KB or more.`);

if (blocking.length) {
  console.log('\nUnder-aligned — Play will reject this bundle:');
  for (const r of blocking) console.log(`  ${r.name}`);
  console.log(
    '\nFor a library compiled here the fix is a build flag, not a version bump:\n' +
      'pass -DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON to the owning package\n' +
      '(NDK r27 does not align to 16 KB unless asked). See patches/ for two\n' +
      'worked examples. For a prebuilt .so inside an AAR no flag reaches it,\n' +
      'so the choice is a dependency upgrade or dropping the ABI — see\n' +
      'plugins/withArm64Only.js.',
  );
  process.exit(1);
}

console.log('\n16 KB page size: OK.');
