const { _electron: electron } = require('playwright');
const path = require('path');

const screenshotDir = path.join(__dirname, '../../screenshots');

async function run() {
  const app = await electron.launch({
    args: [path.join(__dirname, '../../app')],
    env: { ...process.env, NODE_ENV: 'production' },
  });

  const window = await app.firstWindow();

  // Capture ALL console output from the very start
  window.on('console', msg => {
    console.log(`[${msg.type()}] ${msg.text()}`);
  });
  window.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.message}`);
    console.log(err.stack);
  });

  await window.waitForLoadState('load');
  await window.waitForTimeout(5000);

  // Also evaluate for errors
  const jsErrors = await window.evaluate(() => {
    // Check if React mounted
    const root = document.getElementById('root');
    const hasContent = root && root.innerHTML.length > 0;

    // Try to manually check if the script executed
    return {
      rootHasContent: hasContent,
      rootChildCount: root ? root.childNodes.length : 0,
      windowKeys: Object.keys(window).filter(k => k.startsWith('__')).slice(0, 10),
    };
  });
  console.log('\nJS state:', JSON.stringify(jsErrors, null, 2));

  await window.screenshot({ path: path.join(screenshotDir, '05-debug-errors.png') });
  await app.close();
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
