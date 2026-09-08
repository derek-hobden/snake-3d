import { chromium } from 'playwright';
import path from 'path';

const outDir = '/opt/cursor/artifacts/screenshots';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

console.log('Navigating to game...');
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1000);

// Screenshot 1: Start screen
console.log('Taking start screen screenshot...');
await page.screenshot({ path: path.join(outDir, 'start-playfield.png') });

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

await page.waitForTimeout(200);

// Screenshot 2: Mid-game with score 1+
console.log('Taking mid-game screenshot...');
await page.screenshot({ path: path.join(outDir, 'mid-game-ate.png') });

// Press Down key repeatedly to crash into bottom wall
console.log('Crashing snake into wall...');
for (let i = 0; i < 20; i++) {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(50);
}

// Wait for game over overlay
console.log('Waiting for game over...');
await page.waitForFunction(() => {
  const overlay = document.querySelector('#overlay');
  const title = document.querySelector('#overlay-title');
  return overlay && !overlay.classList.contains('hidden') && 
         title && title.textContent === 'Game over';
}, { timeout: 10000 });

await page.waitForTimeout(300);

// Screenshot 3: Game over
console.log('Taking game over screenshot...');
await page.screenshot({ path: path.join(outDir, 'game-over.png') });

console.log('All screenshots captured successfully!');
await browser.close();
