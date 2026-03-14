const { _electron: electron } = require('playwright');
const path = require('path');

const screenshotDir = path.join(__dirname, '../../screenshots');

async function run() {
  console.log('Launching Electron app...');

  const app = await electron.launch({
    args: [path.join(__dirname, '../../app')],
    env: { ...process.env, NODE_ENV: 'production' },
  });

  const window = await app.firstWindow();
  console.log('Window opened');

  // Wait for load
  await window.waitForLoadState('load');
  console.log('Load state reached');

  // Wait extra time for React to render
  await window.waitForTimeout(5000);

  // Check DOM content
  const domInfo = await window.evaluate(() => {
    const root = document.getElementById('root');
    return {
      rootExists: !!root,
      rootInnerHTML: root ? root.innerHTML.substring(0, 500) : 'no root',
      bodyChildren: document.body.children.length,
      bodyHTML: document.body.innerHTML.substring(0, 1000),
      allScripts: Array.from(document.querySelectorAll('script')).map(s => s.src || s.textContent.substring(0, 100)),
      allStyles: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(s => s.href),
      consoleErrors: [],
      documentReady: document.readyState,
    };
  });
  console.log('DOM info:', JSON.stringify(domInfo, null, 2));

  // Check for JS errors
  const errors = [];
  window.on('pageerror', err => errors.push(err.message));
  window.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    console.log(`[console.${msg.type()}] ${msg.text()}`);
  });

  // Wait and collect errors
  await window.waitForTimeout(3000);

  // Screenshot
  await window.screenshot({ path: path.join(screenshotDir, '04-debug.png') });
  console.log('Debug screenshot saved');

  if (errors.length) {
    console.log('\nErrors found:', errors);
  }

  await app.close();
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
