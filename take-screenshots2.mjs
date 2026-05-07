import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, 'client', 'public', 'screenshots');
const SCREENSHOTS_ROOT = path.join(__dirname, 'screenshots');
const BASE = 'https://bingo-jk2h.onrender.com';

async function save(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, name), fullPage: false });
  await page.screenshot({ path: path.join(SCREENSHOTS_ROOT, name), fullPage: false });
  console.log('Saved:', name);
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  // Click the right arrow SVG button (second button with SVG in the nav bar)
  // The right arrow has the path "M9 5l7 7-7 7"
  const clicked = await page.evaluate(() => {
    const svgs = document.querySelectorAll('svg');
    for (const svg of svgs) {
      const path = svg.querySelector('path');
      if (path && path.getAttribute('d') === 'M9 5l7 7-7 7') {
        const btn = svg.closest('button');
        if (btn && !btn.disabled) {
          btn.click();
          return true;
        }
      }
    }
    return false;
  });
  console.log('Clicked next week arrow:', clicked);
  await new Promise(r => setTimeout(r, 2000));
  await save(page, 'step2-special-event.png');

  // Click the Apr 22 special event session button
  const clickedSession = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.includes('Apr 22')) {
        btn.click();
        return btn.textContent.substring(0, 50);
      }
    }
    return false;
  });
  console.log('Clicked session:', clickedSession);
  await new Promise(r => setTimeout(r, 2000));
  await save(page, 'step2-special-selected.png');

  await browser.close();
  console.log('Done!');
})();
