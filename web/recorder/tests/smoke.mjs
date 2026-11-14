// End-to-end smoke test in real Chromium with a fake camera, mic and screen:
// loads the built app, shares a screen, switches scenes, records ~4 s and
// checks that a real video file comes out.
//   npm run build && npm test
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.env.OUT_DIR || 'test-results';
mkdirSync(OUT, { recursive: true });

const PORT = 4318;
const { preview } = await import('vite');
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'silent' });

// A tiny valid PDF with one line of text per page.
function makePdf(lines) {
  const objs = [];
  const kids = lines.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${lines.length} >>`);
  lines.forEach((t, i) => {
    const content = `BT /F1 64 Tf 80 300 Td (${t}) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`);
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failed = true;
};

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--auto-accept-this-tab-capture',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.grantPermissions(['camera', 'microphone']);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => ['warning', 'error'].includes(m.type()) && console.log(`  [browser ${m.type()}] ${m.text().slice(0, 300)}`));
  // The real folder picker needs a person: hand the app the browser's
  // private test folder (OPFS) instead, which behaves like a real folder.
  await page.addInitScript(() => {
    window.showDirectoryPicker = () => navigator.storage.getDirectory();
    try {
      if (!sessionStorage.getItem('seen')) {
        localStorage.setItem('recorder.welcomed', 'true'); // tour is tested later
        sessionStorage.setItem('seen', '1');
      }
    } catch {
      /* sandboxed teaching-tool frame */
    }
    // Headless Chromium crashes when asked about speech recognition.
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.stage canvas');
  await page.waitForTimeout(2500);

  const camOn = await page.getAttribute('button[aria-label="Camera"]', 'aria-pressed');
  check(camOn === 'true', 'camera starts automatically');

  // Fake screen share: an animated "slide" canvas stands in for a shared tab
  // (headless Chrome has no real screen to pick).
  await page.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement('canvas');
      c.width = 1600;
      c.height = 1000;
      const x = c.getContext('2d');
      let t = 0;
      setInterval(() => {
        t++;
        x.fillStyle = '#ffffff';
        x.fillRect(0, 0, 1600, 1000);
        x.fillStyle = '#4a55a8';
        x.font = 'bold 90px sans-serif';
        x.fillText('Shared slide', 120, 220);
        x.fillStyle = '#f29b52';
        x.fillRect(120 + ((t * 12) % 1200), 420, 200, 200);
      }, 33);
      return c.captureStream(30);
    };
  });
  await page.click('text=Share screen');
  await page.waitForTimeout(800);
  check((await page.getAttribute('.tbtn >> nth=0', 'aria-pressed')) === 'true', 'screen share starts');

  // Pixels: the stage must not be blank.
  const lit = await page.evaluate(() => {
    const c = document.querySelector('.stage canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 997) if (d[i] + d[i + 1] + d[i + 2] > 60) n++;
    return n;
  });
  check(lit > 100, `stage draws video (${lit} bright samples)`);
  await page.screenshot({ path: `${OUT}/lesson.png` });

  for (const [key, name] of [['3', 'side'], ['1', 'welcome'], ['4', 'justme'], ['7', 'trythis'], ['9', 'outro']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  check((await page.getAttribute('.scene-card.active', 'aria-pressed')) === 'true', 'keyboard switches scenes');
  await page.keyboard.press('2');

  // Camera effects: MediaPipe must load from our own server and run.
  await page.click('role=tab[name="Effects"]');
  await page.click('role=radio[name="Blur"]');
  await page.waitForFunction(() => !document.body.innerText.includes('Loading effects'), null, { timeout: 30000 });
  check(!(await page.isVisible('text=Effects could not start')), 'background blur loads and runs');
  await page.keyboard.press('6');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/presenter.png` });
  check((await page.textContent('.scene-card.active')).includes('Presenter'), 'Presenter scene with background removal');
  await page.keyboard.press('4');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/blur.png` });
  await page.click('role=radio[name="Off"]');
  await page.keyboard.press('2');

  // Content: a PDF slide deck replaces the screen share.
  const pdf = makePdf(['Slide one', 'Slide two']);
  await page.click('role=tab[name="Content"]');
  await page.setInputFiles('input[accept=".pdf,application/pdf"]', { name: 'lesson.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.waitForSelector('text=Slide 1 of 2', { timeout: 20000 });
  await page.keyboard.press('ArrowRight');
  await page.waitForSelector('text=Slide 2 of 2', { timeout: 10000 });
  check(true, 'PDF slides open and advance with the arrow keys');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/slides.png` });
  await page.click('text=Go back to screen share');

  // Content: an HTML tool runs inside the recorder and is captured.
  const tool = '<!doctype html><body style="margin:0;background:#1db954;font:bold 80px sans-serif;color:#fff;display:grid;place-items:center;height:100vh">My tool</body>';
  await page.setInputFiles('input[accept=".html,.htm,text/html"]', { name: 'balance-tool.html', mimeType: 'text/html', buffer: Buffer.from(tool) });
  await page.waitForSelector('.tool-host iframe');
  await page.waitForTimeout(2500);
  // Headless Chrome answers with a fake whole-screen share, not "this tab",
  // so Element Capture can't be exercised here: check the app refuses to
  // record the wrong surface and explains what to pick.
  await page.waitForTimeout(500);
  check(await page.isVisible('.tool-host iframe'), 'HTML tool runs inside the recorder');
  check(await page.isVisible('text=choose “This tab”'), 'wrong share surface is refused with a clear hint');
  check(await page.isVisible('.tool-capture'), '"Show this tool in the recording" stays available');
  await page.screenshot({ path: `${OUT}/tool.png` });
  await page.keyboard.press('2');

  // Scene builder: the real engine previews the scene; drag, restyle, save.
  await page.click('text=New scene');
  await page.waitForSelector('.builder .stage canvas');
  check((await page.$$('.hit')).length === 0, 'new scenes start empty');
  await page.click('.chip >> text=Float over the loop');
  await page.waitForTimeout(800);
  const pix = (x, y) =>
    page.evaluate(([x, y]) => [...document.querySelector('.builder .stage canvas').getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3), [x, y]);
  const corner = await pix(1880, 40);
  check(corner[2] > 40 && corner[2] > corner[1], `builder previews the aurora background live (rgb ${corner.join(',')})`);
  const hit = page.locator('.hit').nth(1); // the shared-screen layer
  const box = await hit.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  const moved = await hit.boundingBox();
  check(Math.abs(moved.x - box.x - 60) < 6, 'layers can be dragged on the preview');
  await page.click('.layer-row >> text=Camera');
  await page.click('role=switch[name="Remove background"]'); // cutout off so shapes apply
  await page.click('.shape-opt >> text=Cookie');
  await page.fill('.builder-right .name-input', 'My camera');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/builder.png` });
  await page.click('text=Save scene');
  await page.waitForSelector('.scene-card-wrap .scene-card.active', { timeout: 5000 });
  check((await page.textContent('.scene-card-wrap .scene-card.active')).includes('Float over the loop'), 'saved scene joins the scene list and is live');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/custom-scene.png` });

  // Settings: accent color re-themes the app; scene packs round-trip.
  await page.click('role=tab[name="Settings"]');
  await page.click('.nav-item >> text=Appearance');
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
  await page.click('role=button[name="Teal"]');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
  check(before !== after && after !== '', `accent color re-themes the app (${before} → ${after})`);
  await page.screenshot({ path: `${OUT}/settings.png` });
  await page.click('.nav-item >> text=Scene packs');
  const packDl = page.waitForEvent('download');
  await page.click('text=Export pack');
  const pack = await packDl;
  const packPath = `${OUT}/My scenes.recorderpack`;
  await pack.saveAs(packPath);
  await page.setInputFiles('input[accept=".recorderpack,.json,application/json"]', packPath);
  page.once('dialog', (d) => d.dismiss());
  await page.waitForSelector('.toast >> text=Added 1 scene', { timeout: 10000 });
  check((await page.$$('.scene-card-wrap')).length === 2, 'scene pack exports and imports');
  await page.click('.nav-item >> text=About');
  await page.click('text=Show the welcome tour again');
  await page.waitForSelector('.welcome');
  await page.click('text=Get started');
  await page.fill('.welcome input >> nth=0', 'Ms. Rivera');
  await page.click('.w-next');
  await page.click('.w-next');
  await page.click('.w-next');
  await page.screenshot({ path: `${OUT}/welcome.png` });
  await page.click('text=Open the recorder');
  check(!(await page.isVisible('.welcome')) && (await page.evaluate(() => JSON.parse(localStorage.getItem('recorder.text')).name)) === 'Ms. Rivera', 'welcome tour sets your name and returns to the recorder');
  await page.keyboard.press('2');

  await page.click('button[aria-label="Start recording"]');
  await page.waitForTimeout(4500);
  check(await page.isVisible('.rec-chip'), 'REC chip shows while recording');
  await page.keyboard.press('5');
  await page.waitForTimeout(1500);
  await page.keyboard.press('3');
  await page.waitForTimeout(1500);
  await page.click('button[aria-label="Stop recording"]');
  await page.waitForSelector('.toast >> text=Saved', { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/saved.png` });

  // Inspect what landed in the folder.
  const saved = await page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const files = {};
    for await (const [n, h] of dir.entries()) files[n] = h;
    const mp4 = Object.keys(files).find((n) => n.endsWith('.mp4'));
    const json = Object.keys(files).find((n) => n.endsWith('.json'));
    const f = await files[mp4].getFile();
    const head = new Uint8Array(await f.slice(0, 12).arrayBuffer());
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(f);
    await new Promise((r, j) => ((v.onloadedmetadata = r), (v.onerror = j)));
    return {
      names: Object.keys(files),
      size: f.size,
      ftyp: String.fromCharCode(...head.slice(4, 8)),
      w: v.videoWidth,
      h: v.videoHeight,
      d: v.duration,
      meta: json ? JSON.parse(await (await files[json].getFile()).text()) : null,
    };
  });
  check(saved.size > 50_000, `recording saved into the folder (${saved.size} bytes)`);
  check(saved.ftyp === 'ftyp', 'recording is a real MP4 file');
  check(saved.w === 1920 && saved.h === 1080, `video is ${saved.w}x${saved.h}`);
  check(saved.d > 3, `video is ${saved.d.toFixed(1)} s long`);
  const chapterNames = saved.meta?.chapters?.map((c) => c.scene).join(', ');
  check(chapterNames === 'Lesson, Screen only, Side by side', `chapters saved (${chapterNames})`);

  // Library: lists it, plays it, saves a trimmed copy.
  await page.click('role=tab[name="Library"]');
  await page.waitForSelector('.rec-card', { timeout: 15000 });
  await page.click('.rec-card');
  await page.waitForFunction(() => document.querySelector('.lib-video')?.readyState >= 1, null, { timeout: 15000 });
  await page.waitForSelector('.chapter', { timeout: 10000 }).catch(() => {});
  check((await page.$$('.chapter')).length === 3, 'Library shows chapters from scene switches');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/library.png` });
  await page.$eval('.lib-detail input[type=range]', (el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, '2.5');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('text=Save trimmed copy');
  await page.waitForSelector('.toast >> text=(trimmed)', { timeout: 30000 });
  if (process.env.DUMP) {
    const files = await page.evaluate(async () => {
      const dir = await navigator.storage.getDirectory();
      const out = {};
      for await (const [n, h] of dir.entries()) {
        const b = new Uint8Array(await (await h.getFile()).arrayBuffer());
        let s = '';
        for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768));
        out[n] = btoa(s);
      }
      return out;
    });
    const { writeFileSync } = await import('node:fs');
    for (const [n, b64] of Object.entries(files)) writeFileSync(`${OUT}/${n.includes('trimmed') ? 'trimmed' : 'original'}${n.slice(n.lastIndexOf('.'))}`, Buffer.from(b64, 'base64'));
  }
  const trimmed = await page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    for await (const [n, h] of dir.entries()) {
      if (!n.includes('(trimmed)') || !n.endsWith('.mp4')) continue;
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(await h.getFile());
      await new Promise((r, j) => ((v.onloadedmetadata = r), (v.onerror = () => j(v.error?.message))));
      return { d: v.duration, w: v.videoWidth };
    }
    return null;
  });
  check(!!trimmed && trimmed.w === 1920 && trimmed.d > 1 && trimmed.d < saved.d, `trimmed copy plays (${trimmed?.d?.toFixed(1)} s of ${saved.d.toFixed(1)} s)`);
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
