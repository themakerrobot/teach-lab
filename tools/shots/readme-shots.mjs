// README 용 깨끗한 화면 캡처 (번호 없음, 튜토리얼 없음) → docs/img/
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);   // tools/shots
const ROOT = path.resolve(HERE, '..', '..');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const SCENE = path.join(HERE, 'scene');
const OUT = path.join(ROOT, 'docs', 'img'); fs.mkdirSync(OUT, { recursive: true });
const files = k => fs.readdirSync(SCENE).filter(f => f.startsWith(k) && f.endsWith('.png')).sort().map(f => path.join(SCENE, f));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-video-capture=' + path.join(SCENE, 'camera.y4m'),
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const ctx = await browser.newContext({
  permissions: ['camera', 'microphone'], locale: 'ko-KR', viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
// 튜토리얼은 본 것으로, 마이크에는 합성음(220Hz 사인파)을 넣는다
await ctx.addInitScript(() => {
  ['index.html', 'test.html', 'storage.html'].forEach(p => {
    try { localStorage.setItem('tl-tour-' + p, '1'); } catch (e) {}
  });
  const orig = AudioContext.prototype.createMediaStreamSource;
  AudioContext.prototype.createMediaStreamSource = function (stream) {
    const ac = this;
    try { ac.resume(); } catch (e) {}
    const out = ac.createGain(); out.gain.value = 1;
    const osc = ac.createOscillator(); osc.type = 'sine'; osc.frequency.value = 220; osc.start();
    const lfo = ac.createOscillator(); lfo.frequency.value = 2.5;
    const depth = ac.createGain(); depth.gain.value = 0.5;
    lfo.connect(depth); depth.connect(out.gain); lfo.start();   // 파형이 출렁이게
    osc.connect(out);
    return out;
  };
});
const page = await ctx.newPage();
page.on('dialog', d => d.accept());   // 소스 바꿀 때 '예시가 지워져요' 확인
const prettyCam = () => page.evaluate(() => {
  const sel = document.getElementById('camSel');
  [...sel.options].forEach(o => { o.textContent = '웹캠'; o.title = '웹캠'; });
});
const prettyMic = () => page.evaluate(() => {
  const sel = document.getElementById('camSel');
  [...sel.options].forEach(o => { o.textContent = '마이크'; o.title = '마이크'; });
});
const ready = () => page.waitForFunction(() => document.getElementById('engine')?.textContent === '준비 완료', null, { timeout: 180000 });
const shot = (name, opts = {}) => page.screenshot({ path: path.join(OUT, name), ...opts });

// 1) 학습실 — 사과/바나나 가르치고 학습까지
await page.goto(BASE + '/index.html');
await ready();
for (const [name, kind] of [['사과', 'apple'], ['바나나', 'banana']]) {
  await page.fill('#clsName', name);
  await page.click('#clsAdd');
  await page.waitForTimeout(100);
  await page.setInputFiles('#fileInput', files(kind));
  await page.waitForFunction(n => document.querySelectorAll('#clsList .cls')[n]?.querySelector('.ct')?.textContent.startsWith('14'),
    (await page.$$('#clsList .cls')).length - 1, { timeout: 180000 });
}
await page.click('#camBtn');
await page.waitForFunction(() => document.getElementById('seeState')?.textContent === '보고 있어요', null, { timeout: 60000 });
await page.click('#trainBtn');
await page.waitForSelector('#resultSec', { state: 'visible', timeout: 180000 });
await page.fill('#mdlName', '과일 맞히기');
await page.waitForTimeout(2600);            // '잘 배웠어요' 토스트가 사라질 때까지
await prettyCam();
await page.waitForTimeout(200);
await shot('teach.png');
await page.click('#mdlSave');
await page.waitForTimeout(1200);

// 2) 소리 모드 — 마이크 켜고 듣는 중
await page.click('#srcPick [data-src="sound"]');
await ready();
await page.click('#camBtn');
await page.waitForFunction(() => document.getElementById('seeState')?.textContent === '들려요', null, { timeout: 60000 });
await page.fill('#clsName', '');
await page.waitForTimeout(9000);            // 파형이 화면을 채울 때까지
await prettyMic();
await page.waitForTimeout(200);
await shot('sound.png', { clip: { x: 294, y: 118, width: 803, height: 764 } });

// 3) 시험실
await page.goto(BASE + '/test.html?use=' + encodeURIComponent('과일 맞히기'));
await ready();
await page.click('#camBtn');
await page.waitForFunction(() => document.getElementById('seeState')?.textContent === '보고 있어요', null, { timeout: 60000 });
await page.waitForTimeout(1500);
await prettyCam();
await page.waitForTimeout(200);
await shot('test.png');

// 4) 보관함
await page.goto(BASE + '/storage.html');
await page.waitForSelector('#stTable tr[data-name]');
await page.waitForTimeout(500);
await shot('storage.png');

console.log('readme shots:', fs.readdirSync(OUT).join(', '));
await browser.close();
