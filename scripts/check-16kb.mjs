#!/usr/bin/env node
//
// Verifies that every native library in a release AAB/APK is aligned to a
// 16 KB page boundary, as required by Play for Android 15+ devices
// ("App must support 16 KB memory page sizes", enforced 2025-10-31).
//
//   node scripts/check-16kb.mjs ~/Downloads/ryzr-release.aab
//
// Play raises that warning against the uploaded artifact, not the source tree,
// so checking the actual bundle before upload is the only meaningful test.
//
// Alignment lives in the ELF program headers: each PT_LOAD segment carries a
// p_align, and the largest one is the page size the library was linked for.
// 4096 means the library will not load on a 16 KB-page device.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const REQUIRED_ALIGN = 16 * 1024;

// 32-bit ABIs run only on devices that predate 16 KB pages, so Play does not
// hold them to it. Only the 64-bit ones matter.
const ENFORCED_ABIS = ['arm64-v8a', 'x86_64'];

const PT_LOAD = 1;

/** Largest p_align across the PT_LOAD segments, or null if not a 64-bit ELF. */
function loadAlignment(file) {
  const buf = readFileSync(file);
  if (buf.length < 64) return null;
  if (buf.readUInt32BE(0) !== 0x7f454c46) return null; // \x7fELF
  if (buf[4] !== 2) return null; // not ELFCLASS64
  const little = buf[5] === 1;
  const u16 = (o) => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u64 = (o) => (little ? buf.readBigUInt64LE(o) : buf.readBigUInt64BE(o));
  const u32 = (o) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));

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
  console.error('usage: node scripts/check-16kb.mjs <path-to .aab or .apk>');
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'ryzr-16kb-'));
try {
  try {
    // Both AABs and APKs are zips; only the .so entries are of interest.
    execFileSync('unzip', ['-q', '-o', archive, '*.so', '-d', work], { stdio: 'pipe' });
  } catch (err) {
    // unzip exits 11 when the pattern matched nothing — worth saying plainly.
    if (err.status === 11) {
      console.error(`No .so entries in ${archive}. Is this a release bundle?`);
      process.exit(1);
    }
    throw err;
  }

  const libs = walk(work).filter((f) => f.endsWith('.so'));
  const rows = [];
  for (const lib of libs) {
    const rel = relative(work, lib);
    const abi = ENFORCED_ABIS.find((a) => rel.includes(`/${a}/`) || rel.startsWith(`${a}/`));
    if (!abi) continue;
    rows.push({ rel, align: loadAlignment(lib) });
  }

  if (rows.length === 0) {
    console.error(`No 64-bit native libraries found in ${archive} (looked for ${ENFORCED_ABIS.join(', ')}).`);
    process.exit(1);
  }

  rows.sort((a, b) => a.rel.localeCompare(b.rel));
  const bad = rows.filter((r) => !r.align || r.align < REQUIRED_ALIGN);

  for (const r of rows) {
    const ok = r.align && r.align >= REQUIRED_ALIGN;
    const shown = r.align ? `${r.align / 1024} KB` : 'unreadable';
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${shown.padStart(12)}  ${r.rel}`);
  }

  console.log(`\n${rows.length - bad.length}/${rows.length} libraries aligned to 16 KB or more.`);
  if (bad.length) {
    console.log('\nUnder-aligned — Play will reject this bundle:');
    for (const r of bad) console.log(`  ${r.rel}`);
    console.log('\nBump the dependency each library belongs to and rebuild.');
    process.exit(1);
  }
  console.log('16 KB page size: OK.');
} finally {
  rmSync(work, { recursive: true, force: true });
}
