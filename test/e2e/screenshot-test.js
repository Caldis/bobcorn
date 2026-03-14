const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const screenshotDir = path.join(__dirname, '../../screenshots');

async function run() {
  console.log('Launching Electron app...');

  const electronPath = path.join(__dirname, '../../node_modules/.bin/electron');
  const appPath = path.join(__dirname, '../../app');

  const app = await electron.launch({
    args: [appPath],
    env: { ...process.env, NODE_ENV: 'production' },
  });

  const window = await app.firstWindow();
  console.log('Window opened, waiting for content to load...');
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(3000);

  // Screenshot 1: Initial launch (splash screen or main view)
  await window.screenshot({ path: path.join(screenshotDir, '01-launch.png') });
  console.log('Screenshot 1: Initial launch saved');

  // Get window info
  const title = await window.title();
  const size = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return { size: win.getSize(), position: win.getPosition() };
  });
  console.log(`Window title: "${title}", size: ${size.size}, position: ${size.position}`);

  // Check Electron version
  const electronVersion = await app.evaluate(({ app }) => process.versions.electron);
  console.log(`Electron version: ${electronVersion}`);

  // Check webSecurity
  try {
    const webPrefs = await window.evaluate(() => {
      return {
        nodeIntegration: typeof require !== 'undefined',
        hasProcess: typeof process !== 'undefined',
      };
    });
    console.log('WebPreferences check:', JSON.stringify(webPrefs));
  } catch (e) {
    console.log('WebPreferences check skipped:', e.message);
  }

  // Try to interact - click on "New Project" if splash screen is showing
  try {
    // Look for any clickable button on splash screen
    const buttons = await window.locator('button, .ant-btn, [class*="button"], [class*="Button"]').all();
    console.log(`Found ${buttons.length} buttons`);

    if (buttons.length > 0) {
      // Screenshot the buttons area
      for (let i = 0; i < Math.min(buttons.length, 3); i++) {
        const text = await buttons[i].textContent().catch(() => 'no-text');
        const visible = await buttons[i].isVisible().catch(() => false);
        console.log(`  Button ${i}: "${text}" (visible: ${visible})`);
      }

      // Click first visible button to proceed past splash
      for (const btn of buttons) {
        if (await btn.isVisible().catch(() => false)) {
          const text = await btn.textContent().catch(() => '');
          console.log(`Clicking button: "${text}"`);
          await btn.click().catch(() => {});
          await window.waitForTimeout(2000);
          break;
        }
      }
    }
  } catch (e) {
    console.log('Button interaction:', e.message);
  }

  // Screenshot 2: After interaction
  await window.screenshot({ path: path.join(screenshotDir, '02-after-click.png') });
  console.log('Screenshot 2: After interaction saved');

  // Try to find and interact with main content area
  try {
    // Look for the side menu, grid, or other main components
    const elements = await window.evaluate(() => {
      const classNames = [];
      document.querySelectorAll('[class]').forEach(el => {
        if (el.className && typeof el.className === 'string') {
          classNames.push(el.className.split(' ')[0]);
        }
      });
      return [...new Set(classNames)].slice(0, 30);
    });
    console.log('Top-level CSS classes:', elements.join(', '));
  } catch (e) {
    console.log('Class scan:', e.message);
  }

  // Screenshot 3: Full page with DevTools info overlay
  await window.screenshot({ path: path.join(screenshotDir, '03-full-state.png'), fullPage: true });
  console.log('Screenshot 3: Full state saved');

  // Check for console errors
  const consoleMessages = [];
  window.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  await window.waitForTimeout(1000);

  // Check for any errors in console
  const errors = consoleMessages.filter(m => m.type === 'error');
  if (errors.length > 0) {
    console.log('Console errors:', errors.map(e => e.text).join('\n'));
  } else {
    console.log('No console errors detected');
  }

  console.log('\nAll screenshots saved to screenshots/');
  await app.close();
  console.log('App closed successfully');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
