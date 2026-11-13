// End-to-end smoke test in real Chromium with a fake camera, mic and screen:
// loads the built app, shares a screen, switches scenes, records ~4 s and
// checks that a real video file comes out.
//   npm run build && npm test
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.env.OUT_DIR || 'test-results';
mkdirSync(OUT, { recursive: true });

const PORT = 4318;
const { preview } = await import('vite');
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'silent' });

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
  // Use the download fallback (the real folder picker needs a person).
  await page.addInitScript(() => {
    delete window.showDirectoryPicker;
    window.showDirectoryPicker = undefined;
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

  const dl = page.waitForEvent('download', { timeout: 30000 });
  await page.click('button[aria-label="Start recording"]');
  await page.waitForTimeout(3200);
  check(await page.isVisible('.rec-chip'), 'REC chip shows while recording');
  await page.keyboard.press('5');
  await page.waitForTimeout(1500);
  await page.keyboard.press('2');
  await page.waitForTimeout(1500);
  await page.click('button[aria-label="Stop recording"]');
  const download = await dl;
  const path = `${OUT}/${download.suggestedFilename()}`;
  await download.saveAs(path);
  const buf = readFileSync(path);
  const isMp4 = buf.subarray(4, 8).toString('latin1') === 'ftyp';
  const isWebm = buf[0] === 0x1a && buf[1] === 0x45;
  check(buf.length > 50_000, `recording has data (${buf.length} bytes, ${download.suggestedFilename()})`);
  check(isMp4 || isWebm, `recording is a real ${isMp4 ? 'MP4' : isWebm ? 'WebM' : 'unknown'} file`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/saved.png` });

  // Probe the file with the browser itself: duration and dimensions.
  const meta = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes]));
    const v = document.createElement('video');
    v.muted = true;
    v.src = url;
    await new Promise((r, j) => ((v.onloadedmetadata = r), (v.onerror = () => j(v.error?.message))));
    if (!isFinite(v.duration)) {
      v.currentTime = 1e9;
      await new Promise((r) => (v.ontimeupdate = r));
    }
    return { w: v.videoWidth, h: v.videoHeight, d: v.duration };
  }, buf.toString('base64'));
  check(meta.w === 1920 && meta.h === 1080, `video is ${meta.w}x${meta.h}`);
  check(meta.d > 3, `video is ${meta.d.toFixed(1)} s long`);
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
