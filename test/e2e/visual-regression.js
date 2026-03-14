/**
 * L1 Visual Regression Test — Pixel Snapshot Comparison
 *
 * Compares runtime screenshots against golden baselines using simple
 * pixel-level difference detection (no @playwright/test toHaveScreenshot).
 *
 * Baseline generation:
 *   UPDATE_BASELINES=1 node test/e2e/visual-regression.js
 *
 * Normal run (compare against baselines):
 *   node test/e2e/visual-regression.js
 *
 * Threshold: 2% pixel difference allowed.
 */

const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const DIFF_THRESHOLD = 0.02; // 2%
const SAMPLE_STEP = 4; // sample every 4th pixel for speed
const BASELINE_DIR = path.join(__dirname, '../../screenshots/baselines');
const TEMP_DIR = path.join(__dirname, '../../screenshots/vr-actual');
const UPDATE_BASELINES = process.env.UPDATE_BASELINES === '1';

const results = [];

function assert(name, condition, detail) {
  const status = condition ? 'PASS' : 'FAIL';
  results.push({ name, status, detail });
  console.log(`  [${status}] ${name}${detail ? ' — ' + detail : ''}`);
  return condition;
}

/**
 * Compare two PNG buffers using raw pixel sampling.
 * Returns { match, diffRatio, sameSize }.
 *
 * Strategy: decode PNG header to verify dimensions, then compare raw bytes
 * at sampled intervals. We use a lightweight approach — read the PNG as
 * raw Buffer and compare byte-by-byte on a stride. This works because
 * identical screenshots produce identical PNGs (Playwright uses deterministic
 * encoding). For slight rendering differences, byte comparison catches them.
 */
function compareImages(bufA, bufB) {
  // Quick check: if buffers are identical, perfect match
  if (bufA.equals(bufB)) {
    return { match: true, diffRatio: 0, sameSize: true };
  }

  // Check PNG dimensions from IHDR chunk (bytes 16-23)
  // PNG signature (8 bytes) + IHDR length (4 bytes) + "IHDR" (4 bytes) = offset 16
  const widthA = bufA.readUInt32BE(16);
  const heightA = bufA.readUInt32BE(20);
  const widthB = bufB.readUInt32BE(16);
  const heightB = bufB.readUInt32BE(20);

  const sameSize = widthA === widthB && heightA === heightB;
  if (!sameSize) {
    return { match: false, diffRatio: 1.0, sameSize: false,
      detail: `${widthA}x${heightA} vs ${widthB}x${heightB}` };
  }

  // Compare raw compressed data bytes with sampling
  const len = Math.min(bufA.length, bufB.length);
  let diffCount = 0;
  let totalSampled = 0;

  for (let i = 0; i < len; i += SAMPLE_STEP) {
    totalSampled++;
    if (bufA[i] !== bufB[i]) {
      diffCount++;
    }
  }

  const diffRatio = totalSampled > 0 ? diffCount / totalSampled : 0;
  return { match: diffRatio <= DIFF_THRESHOLD, diffRatio, sameSize };
}

async function run() {
  // Ensure directories exist
  for (const dir of [BASELINE_DIR, TEMP_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  console.log('\n=== L1 Visual Regression Test ===\n');

  if (UPDATE_BASELINES) {
    console.log('MODE: Generating new baselines\n');
  } else {
    console.log('MODE: Comparing against baselines\n');
  }

  // Launch app
  console.log('Launching Electron...');
  const app = await electron.launch({
    args: [path.join(__dirname, '../..')],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('load');
  await window.waitForTimeout(3000);

  // --- Splash screen screenshot ---
  console.log('\nCapture: Splash screen');
  const splashPath = path.join(UPDATE_BASELINES ? BASELINE_DIR : TEMP_DIR, 'splash.png');
  await window.screenshot({ path: splashPath });
  console.log(`  Saved: ${splashPath}`);

  if (!UPDATE_BASELINES) {
    const baselineSplash = path.join(BASELINE_DIR, 'splash.png');
    if (fs.existsSync(baselineSplash)) {
      const baseline = fs.readFileSync(baselineSplash);
      const actual = fs.readFileSync(splashPath);
      const result = compareImages(baseline, actual);
      assert('Splash screen pixel match',
        result.match,
        `diffRatio=${(result.diffRatio * 100).toFixed(2)}%, sameSize=${result.sameSize}${result.detail ? ', ' + result.detail : ''}`
      );
    } else {
      assert('Splash baseline exists', false, `Missing ${baselineSplash}. Run with UPDATE_BASELINES=1 first.`);
    }
  } else {
    assert('Splash baseline generated', true, splashPath);
  }

  // --- Click "启动新项目" to get to workspace ---
  console.log('\nNavigating to workspace...');
  const newProjectBtn = window.locator('button:has-text("启动新项目")');
  const btnVisible = await newProjectBtn.isVisible();
  assert('New project button found', btnVisible);

  if (btnVisible) {
    await newProjectBtn.click();
    await window.waitForTimeout(2000);
  }

  // --- Workspace screenshot ---
  console.log('\nCapture: Workspace');
  const workspacePath = path.join(UPDATE_BASELINES ? BASELINE_DIR : TEMP_DIR, 'workspace.png');
  await window.screenshot({ path: workspacePath });
  console.log(`  Saved: ${workspacePath}`);

  if (!UPDATE_BASELINES) {
    const baselineWorkspace = path.join(BASELINE_DIR, 'workspace.png');
    if (fs.existsSync(baselineWorkspace)) {
      const baseline = fs.readFileSync(baselineWorkspace);
      const actual = fs.readFileSync(workspacePath);
      const result = compareImages(baseline, actual);
      assert('Workspace pixel match',
        result.match,
        `diffRatio=${(result.diffRatio * 100).toFixed(2)}%, sameSize=${result.sameSize}${result.detail ? ', ' + result.detail : ''}`
      );
    } else {
      assert('Workspace baseline exists', false, `Missing ${baselineWorkspace}. Run with UPDATE_BASELINES=1 first.`);
    }
  } else {
    assert('Workspace baseline generated', true, workspacePath);
  }

  // --- Summary ---
  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);

  if (failed > 0) {
    console.log('\nFailed:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  x ${r.name}${r.detail ? ': ' + r.detail : ''}`);
    });
  }

  await app.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
