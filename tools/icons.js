// Renders level 1 full-bleed as the app icons in icons/, straight from the
// game (run npm run bundle first). Needs Playwright, which isn't a project
// dependency: node tools/icons.js
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');

const root = path.join(__dirname, '..');
const SIZES = { 'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180 };

(async () => {
  const browser = await chromium.launch();
  for (const [name, size] of Object.entries(SIZES)) {
    // Drawn at 512 and scaled, so every size has the same proportions.
    const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
    await page.addInitScript(() => localStorage.setItem('gridlock-progress-v1', JSON.stringify({ best: {}, level: 0 })));
    await page.goto('file://' + path.join(root, 'dist', 'index.html'));
    // Just the board, filling the icon edge to edge.
    await page.addStyleTag({
      content: `
        html, body { margin: 0; padding: 0; overflow: hidden; background: #262a30; }
        .app { max-width: none; margin: 0; padding: 0; display: block; }
        .app > :not(.play), .play > :not(.board-wrap), .win { display: none !important; }
        .board { position: fixed; inset: 0; width: 512px; height: 512px; border-radius: 0; box-shadow: none; }
        .exit span { display: none; }
        .grid { border-radius: 4px; }
      `,
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(root, 'icons', name) });
    await page.close();
  }
  await browser.close();
})();
