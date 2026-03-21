/**
 * ICP Import Pipeline Profiler
 *
 * Automated E2E test that measures the import performance of a large ICP project file.
 * Runs N rounds and collects detailed timing data from instrumented code.
 *
 * Usage: node test/e2e/import-profiler.js [rounds] [icp-path]
 */

const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '../..');
const ROUNDS = parseInt(process.argv[2]) || 5;
const ICP_PATH = process.argv[3] || 'C:/Users/mail/Desktop/iconfontV/iconfont.icp';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runRound(roundNum) {
  console.log(`\n── Round ${roundNum}/${ROUNDS} ──────────────────────────────────`);

  const app = await electron.launch({
    args: [projectRoot],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const win = await app.firstWindow();

  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));

  await win.waitForLoadState('load');
  await sleep(3000);

  // Mock the file dialog to return our ICP file
  const icpPathForMock = ICP_PATH.replace(/\\/g, '/');
  await app.evaluate(
    ({ dialog }, icpPath) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [icpPath],
      });
    },
    icpPathForMock
  );

  // Clear any previous profiler data
  await win.evaluate(() => {
    const p = window.__BOBCORN_PERF__;
    if (p) p.clear();
  });

  // Click "打开项目文件" to trigger import
  const t0 = Date.now();
  const openBtn = win.locator('button:has-text("打开项目文件")');
  await openBtn.click();

  // Wait for icons to appear in the grid (import complete)
  await win.waitForSelector('[data-testid="icon-block"]', { timeout: 30000 });
  const t1 = Date.now();
  const wallClockMs = t1 - t0;

  // Collect profiler data from the renderer
  const profData = await win.evaluate(() => {
    const p = window.__BOBCORN_PERF__;
    if (!p) return null;
    const latest = p.getLatest();
    return latest;
  });

  // Count rendered icon blocks
  const iconBlockCount = await win.locator('[data-testid="icon-block"]').count();

  // Collect DOM metrics
  const domMetrics = await win.evaluate(() => ({
    totalNodes: document.querySelectorAll('*').length,
    iconBlocks: document.querySelectorAll('[data-testid="icon-block"]').length,
    heapUsed: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : 'N/A',
  }));

  // Print results
  console.log(`  Wall clock (click → first icon visible): ${wallClockMs}ms`);
  console.log(`  Icon blocks rendered: ${iconBlockCount}`);
  console.log(`  Total DOM nodes: ${domMetrics.totalNodes}`);
  console.log(`  JS Heap: ${domMetrics.heapUsed}MB`);

  if (profData && profData.entries) {
    console.log(`  Total (profiler): ${Math.round(profData.totalDuration)}ms`);
    console.log(`  ── Breakdown ──`);
    for (const entry of profData.entries) {
      console.log(`    ${entry.name.padEnd(35)} ${entry.duration.toFixed(1)}ms`);
    }
  } else {
    console.log(`  [WARN] No profiler data collected`);
  }

  if (errors.length > 0) {
    console.log(`  [ERRORS] ${errors.length}: ${errors[0].substring(0, 100)}`);
  }

  await app.close();

  return {
    round: roundNum,
    wallClockMs,
    iconBlockCount,
    domNodes: domMetrics.totalNodes,
    heapMB: domMetrics.heapUsed,
    profiler: profData,
    errors: errors.length,
  };
}

async function main() {
  console.log('====================================================');
  console.log('  Bobcorn ICP Import Profiler');
  console.log(`  Rounds: ${ROUNDS}`);
  console.log(`  ICP file: ${ICP_PATH}`);
  console.log('====================================================');

  if (!fs.existsSync(ICP_PATH)) {
    console.error(`\nERROR: ICP file not found: ${ICP_PATH}`);
    process.exit(1);
  }

  const icpSize = fs.statSync(ICP_PATH).size;
  console.log(`  ICP size: ${(icpSize / 1024 / 1024).toFixed(1)}MB`);

  const results = [];
  for (let i = 1; i <= ROUNDS; i++) {
    try {
      const result = await runRound(i);
      results.push(result);
    } catch (e) {
      console.error(`  Round ${i} FAILED: ${e.message}`);
    }
  }

  // Summary statistics
  console.log('\n====================================================');
  console.log('  AGGREGATE RESULTS');
  console.log('====================================================');

  if (results.length === 0) {
    console.log('  No successful rounds.');
    process.exit(1);
  }

  const wallClocks = results.map((r) => r.wallClockMs);
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const min = (arr) => Math.min(...arr);
  const max = (arr) => Math.max(...arr);

  console.log(`\n  Wall clock (click → icons visible):`);
  console.log(`    Min: ${min(wallClocks)}ms  Avg: ${Math.round(avg(wallClocks))}ms  Max: ${max(wallClocks)}ms`);

  // Aggregate per-phase timings
  const phaseMap = {};
  for (const r of results) {
    if (!r.profiler || !r.profiler.entries) continue;
    for (const entry of r.profiler.entries) {
      if (!phaseMap[entry.name]) phaseMap[entry.name] = [];
      phaseMap[entry.name].push(entry.duration);
    }
  }

  console.log(`\n  Per-phase breakdown (avg of ${results.length} rounds):`);
  console.log(`  ${'Phase'.padEnd(37)} ${'Min'.padStart(8)} ${'Avg'.padStart(8)} ${'Max'.padStart(8)}  ${'%'.padStart(5)}`);
  console.log(`  ${'─'.repeat(70)}`);

  const avgTotal = avg(results.filter((r) => r.profiler).map((r) => r.profiler.totalDuration));
  const sortedPhases = Object.entries(phaseMap).sort((a, b) => avg(b[1]) - avg(a[1]));

  for (const [name, durations] of sortedPhases) {
    const a = avg(durations);
    const pct = ((a / avgTotal) * 100).toFixed(1);
    console.log(
      `  ${name.padEnd(37)} ${min(durations).toFixed(1).padStart(8)} ${a.toFixed(1).padStart(8)} ${max(durations).toFixed(1).padStart(8)}  ${(pct + '%').padStart(5)}`
    );
  }

  console.log(`\n  DOM & Memory:`);
  console.log(`    Avg DOM nodes: ${Math.round(avg(results.map((r) => r.domNodes)))}`);
  console.log(`    Avg icon blocks: ${Math.round(avg(results.map((r) => r.iconBlockCount)))}`);
  console.log(`    Avg heap: ${typeof results[0].heapMB === 'number' ? Math.round(avg(results.map((r) => r.heapMB))) + 'MB' : 'N/A'}`);

  // Write raw data to file
  const outputPath = path.join(__dirname, '../../docs/import-profiler-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n  Raw data: ${outputPath}`);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
