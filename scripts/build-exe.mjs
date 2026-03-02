/**
 * Build standalone duocode.exe using Node.js Single Executable Application (SEA).
 *
 * Steps:
 *   1. Bundle dist/bin/duocode.js → build/duocode-bundled.cjs  (esbuild)
 *   2. Generate SEA blob from sea-config.json                   (node --experimental-sea-config)
 *   3. Copy node.exe → build/duocode.exe
 *   4. Inject blob into exe via postject
 *
 * Prerequisites: npm run build (tsc) must have run first.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const buildDir = resolve(root, 'build');

function run(cmd, args, opts = {}) {
  console.log(`  > ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
}

function sizeMB(filePath) {
  return (statSync(filePath).size / 1024 / 1024).toFixed(1);
}

// ── 0. Ensure build dir ──────────────────────────────────────────────────────
if (!existsSync(buildDir)) {
  mkdirSync(buildDir, { recursive: true });
}

// ── 1. Check that tsc output exists ──────────────────────────────────────────
const entryPoint = resolve(root, 'dist/bin/duocode.js');
if (!existsSync(entryPoint)) {
  console.error('ERROR: dist/bin/duocode.js not found. Run "npm run build" (tsc) first.');
  process.exit(1);
}

// ── 2. Bundle with esbuild ───────────────────────────────────────────────────
console.log('\n[1/4] Bundling with esbuild...');

const esbuild = await import('esbuild');
const bundlePath = resolve(buildDir, 'duocode-bundled.cjs');

await esbuild.build({
  entryPoints: [entryPoint],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: bundlePath,
  // simple-git shells out to `git`, no native deps to worry about
  banner: {
    js: 'var __import_meta_url = require("node:url").pathToFileURL(__filename).href;',
  },
  define: {
    'import.meta.url': '__import_meta_url',
  },
});
console.log(`  -> build/duocode-bundled.cjs (${sizeMB(bundlePath)} MB)`);

// ── 3. Generate SEA prep blob ────────────────────────────────────────────────
console.log('\n[2/4] Generating SEA blob...');
run(process.execPath, ['--experimental-sea-config', 'sea-config.json']);
console.log('  -> build/sea-prep.blob');

// ── 4. Copy node.exe → duocode.exe ──────────────────────────────────────────
console.log('\n[3/4] Copying node runtime...');
const exePath = resolve(buildDir, 'duocode.exe');
copyFileSync(process.execPath, exePath);
console.log(`  -> build/duocode.exe (${sizeMB(exePath)} MB)`);

// ── 5. Inject blob with postject ─────────────────────────────────────────────
console.log('\n[4/4] Injecting SEA blob...');
const blobPath = resolve(buildDir, 'sea-prep.blob');

// postject API: inject(executablePath, resourceName, resourceData, options)
// Modifies the file in-place
const { inject } = await import('postject');
await inject(exePath, 'NODE_SEA_BLOB', readFileSync(blobPath), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
});

console.log(`\nDone! build/duocode.exe is ready.`);
console.log(`   Size: ${sizeMB(exePath)} MB`);
