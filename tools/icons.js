// Renders the app icons in icons/ straight from the game (run npm run
// bundle first): a close-up of level 1's red car, with the vehicles around
// it poking in at the edges. Needs Playwright, which isn't a project
// dependency: node tools/icons.js
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');

const root = path.join(__dirname, '..');
const SIZES = { 'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180 };
const BOARD = 1024; // board size in CSS pixels
const ZOOM = 1.45; // icon width as a multiple of the red car's width

// Just the board, large, with nothing around it.
const STYLE = `
  html, body { margin: 0; padding: 0; overflow: hidden; background: #262a30; }
  .app { max-width: none; margin: 0; padding: 0; display: block; }
  .app > :not(.play), .play > :not(.board-wrap), .win { display: none !important; }
  .board { position: fixed; inset: 0; width: ${BOARD}px; height: ${BOARD}px; border-radius: 0; box-shadow: none; }
  .body { border-radius: 16px; }
  /* Grid lines bold enough to read at icon size, centred on the cell edges. */
  .grid {
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.22) 5px, transparent 5px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.22) 5px, transparent 5px);
    background-position: -2.5px -2.5px;
  }
`;

async function open(browser, scale) {
  const page = await browser.newPage({ viewport: { width: BOARD, height: BOARD }, deviceScaleFactor: scale });
  await page.addInitScript(() => localStorage.setItem('gridlock-progress-v1', JSON.stringify({ best: {}, level: 0 })));
  await page.goto('file://' + path.join(root, 'dist', 'index.html'));
  await page.addStyleTag({ content: STYLE });
  await page.waitForTimeout(600);
  return page;
}

(async () => {
  const browser = await chromium.launch();
  // A square centred on the red car.
  const probe = await open(browser, 1);
  const car = await probe.locator('.vehicle.red').boundingBox();
  await probe.close();
  const side = car.width * ZOOM;
  const clip = { x: car.x + car.width / 2 - side / 2, y: car.y + car.height / 2 - side / 2, width: side, height: side };
  // Drawn at each icon's pixel size.
  for (const [name, size] of Object.entries(SIZES)) {
    const page = await open(browser, size / side);
    await page.screenshot({ path: path.join(root, 'icons', name), clip });
    await page.close();
  }
  await browser.close();
})();
