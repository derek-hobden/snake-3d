import { chromium } from 'playwright';
import path from 'path';

const outDir = '/opt/cursor/artifacts/screenshots';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

console.log('Navigating to game...');
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1000);

// Click Play button
console.log('Starting game...');
await page.click('button:has-text("Play")');
await page.waitForTimeout(500);

// Wait for snake to eat food (score becomes 1)
console.log('Waiting for snake to eat food...');
await page.waitForFunction(() => {
  const scoreEl = document.querySelector('#score');
  return scoreEl && parseInt(scoreEl.textContent) >= 1;
}, { timeout: 10000 });

await page.waitForTimeout(300);

// Now crash the snake by turning it back into itself
// Snake is moving right, so turn down, then left (back into body)
console.log('Crashing snake into itself...');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(200);
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(1000);

// Check for game over - use a more flexible selector
console.log('Checking for game over...');
const gameOverVisible = await page.evaluate(() => {
  const title = document.querySelector('#overlay-title');
  return title && title.textContent.includes('over');
});

console.log('Game over visible:', gameOverVisible);
await page.waitForTimeout(500);

// Screenshot 3: Game over
console.log('Taking game over screenshot...');
await page.screenshot({ path: path.join(outDir, 'game-over.png') });

console.log('Game over screenshot captured!');
await browser.close();
