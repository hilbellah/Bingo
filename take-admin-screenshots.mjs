import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = 'https://bingo-jk2h.onrender.com';
const dir1 = path.join(__dirname, 'client', 'public', 'screenshots');
const dir2 = path.join(__dirname, 'screenshots');
const adminToken = process.env.ADMIN_SCREENSHOT_TOKEN
  || (process.env.ADMIN_SCREENSHOT_USERNAME && process.env.ADMIN_SCREENSHOT_PASSWORD
    ? Buffer.from(`${process.env.ADMIN_SCREENSHOT_USERNAME}:${process.env.ADMIN_SCREENSHOT_PASSWORD}`).toString('base64')
    : '');
const adminDisplayName = process.env.ADMIN_SCREENSHOT_DISPLAY_NAME || 'Admin';

if (!adminToken) {
  throw new Error('Set ADMIN_SCREENSHOT_TOKEN or ADMIN_SCREENSHOT_USERNAME and ADMIN_SCREENSHOT_PASSWORD to run this script.');
}

async function save(page, name) {
  await page.screenshot({ path: path.join(dir1, name), fullPage: false });
  fs.copyFileSync(path.join(dir1, name), path.join(dir2, name));
  console.log(`  Saved: ${name}`);
}

async function clickSidebarTab(page, tabLabel) {
  const clicked = await page.evaluate((label) => {
    const nav = document.querySelector('nav');
    if (!nav) return false;
    const btns = nav.querySelectorAll('button');
    for (const btn of btns) {
      const spans = btn.querySelectorAll('span');
      for (const sp of spans) {
        if (sp.textContent.trim() === label) {
          btn.click();
          return true;
        }
      }
    }
    return false;
  }, tabLabel);
  if (clicked) {
    console.log(`  Clicked sidebar: ${tabLabel}`);
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log(`  WARNING: Could not find sidebar tab: ${tabLabel}`);
  }
  return clicked;
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Login by setting sessionStorage token directly
  console.log('Setting auth token...');
  await page.goto(`${SITE}/admin`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(({ token, displayName }) => {
    sessionStorage.setItem('admin_token', token);
    sessionStorage.setItem('admin_display_name', displayName);
  }, { token: adminToken, displayName: adminDisplayName });
  await page.goto(`${SITE}/admin/dashboard`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  console.log('Logged in:', page.url());

  // Expand sidebar if collapsed (check if labels are visible)
  const expanded = await page.evaluate(() => {
    const nav = document.querySelector('nav');
    if (!nav) return 'no nav';
    const btns = nav.querySelectorAll('button');
    // Check if any button has a text label span (not just icon)
    for (const btn of btns) {
      const spans = btn.querySelectorAll('span');
      if (spans.length >= 2) return 'already expanded';
    }
    // Sidebar is collapsed - click the toggle button (◀/▶)
    const aside = document.querySelector('aside');
    if (aside) {
      const toggleBtns = aside.querySelectorAll('button');
      for (const tb of toggleBtns) {
        const t = tb.textContent.trim();
        if (t === '▶' || t === '◀') { tb.click(); return 'toggled'; }
      }
    }
    return 'could not toggle';
  });
  console.log('Sidebar expand:', expanded);
  await new Promise(r => setTimeout(r, 1000));

  // Verify we're on the dashboard
  const title = await page.evaluate(() => document.querySelector('h2, h1')?.textContent || 'unknown');
  console.log('Page title:', title);

  // Debug: list all nav button contents
  const navInfo = await page.evaluate(() => {
    const nav = document.querySelector('nav');
    if (!nav) return 'no nav element';
    const btns = nav.querySelectorAll('button');
    return Array.from(btns).map((b, i) => {
      const spans = b.querySelectorAll('span');
      return `btn${i}: spans=${spans.length} text="${Array.from(spans).map(s => s.textContent).join('|')}" full="${b.innerText.substring(0, 30)}"`;
    }).join(', ');
  });
  console.log('Nav buttons:', navInfo);

  // 1. Dashboard
  console.log('1. Dashboard');
  await save(page, 'admin2-dashboard.png');

  // 2. Sessions
  console.log('2. Sessions');
  await clickSidebarTab(page, 'Sessions');
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 1000));
  await save(page, 'admin3-sessions-tab.png');
  await save(page, 'admin4-create-session.png');

  // 3. Check "Special Event" checkbox
  console.log('3. Special Event form');
  // Find checkbox with label containing "Special"
  const checkboxClicked = await page.evaluate(() => {
    // Look for all checkboxes
    const inputs = document.querySelectorAll('input[type="checkbox"]');
    console.log('Found checkboxes:', inputs.length);
    for (const inp of inputs) {
      // Check if nearby text mentions "Special"
      const parent = inp.closest('label, div');
      const text = parent ? parent.textContent : '';
      if (text.includes('Special')) {
        inp.click();
        return `Clicked checkbox near: ${text.substring(0, 50)}`;
      }
    }
    // Fallback: click first checkbox
    if (inputs.length > 0) {
      inputs[0].click();
      return 'Clicked first checkbox';
    }
    return 'No checkboxes found';
  });
  console.log('  Checkbox result:', checkboxClicked);
  await new Promise(r => setTimeout(r, 1500));
  await save(page, 'admin5-special-event.png');

  // 4. Add Package links
  console.log('4. Event packages');
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      const els = document.querySelectorAll('a, button, span');
      for (const el of els) {
        if (el.textContent.trim().includes('Add Package') && el.offsetParent !== null) {
          el.click(); return;
        }
      }
    });
    await new Promise(r => setTimeout(r, 500));
  }
  await save(page, 'admin6-event-packages.png');

  // Uncheck special event
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="checkbox"]');
    for (const inp of inputs) {
      const parent = inp.closest('label, div');
      if (parent && parent.textContent.includes('Special')) { inp.click(); return; }
    }
    if (inputs.length > 0) inputs[0].click();
  });
  await new Promise(r => setTimeout(r, 500));

  // 5. All Sessions list - scroll down
  console.log('5. All Sessions list');
  await page.evaluate(() => {
    const h = document.querySelectorAll('h2, h3');
    for (const el of h) {
      if (el.textContent.includes('All Sessions')) {
        el.scrollIntoView({ behavior: 'instant' });
        return;
      }
    }
    window.scrollTo(0, 500);
  });
  await new Promise(r => setTimeout(r, 1000));
  await save(page, 'admin7-sessions-list.png');

  // 6. Packages
  console.log('6. Packages');
  await clickSidebarTab(page, 'Packages');
  await page.evaluate(() => window.scrollTo(0, 0));
  await save(page, 'admin11-packages.png');

  // 7. Announcements
  console.log('7. Announcements');
  await clickSidebarTab(page, 'Announcements');
  await save(page, 'admin10-announcements.png');

  // 8. Bookings & Reports
  console.log('8. Bookings & Reports');
  await clickSidebarTab(page, 'Bookings & Reports');
  await save(page, 'admin8-bookings.png');

  // 9. Bulk Print
  console.log('9. Bulk Print');
  await clickSidebarTab(page, 'Bulk Print');
  await save(page, 'admin9-bulk-print.png');

  // Customer screenshots
  console.log('10. Customer - seat locked & booking panel');
  await page.goto(SITE, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  // Click a table
  const tableClicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.match(/\d+\s*\n?\s*\d+\/\d+/) && btn.offsetParent) {
        btn.click();
        return btn.textContent.trim().substring(0, 10);
      }
    }
    return 'none';
  });
  console.log('  Clicked table:', tableClicked);
  await new Promise(r => setTimeout(r, 1500));

  // Click chair 1
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.trim() === '1' && btn.offsetParent) {
        const r = btn.getBoundingClientRect();
        if (r.width > 10 && r.width < 80 && r.height > 10 && r.height < 80) {
          btn.click(); return;
        }
      }
    }
  });
  await new Promise(r => setTimeout(r, 2000));
  await save(page, 'step4-seat-locked.png');
  await save(page, 'step5-booking-panel.png');

  console.log('All done!');
  await browser.close();
})();
