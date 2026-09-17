// ═══════════════════════════════════════════════════════════
// 학습실 — 예시 모으기 → 배우기 → 결과 → 저장
// ═══════════════════════════════════════════════════════════

import { loadEmbedder, cropSquare, thumbFrom, EMBEDDER, accentColor, accentRgba } from './embedder.js';
import { trainModel } from './trainer.js';
import { serialize } from './classifier.js';
import { Store, examplesToRecord, examplesFromRecord } from './project.js';

const $ = id => document.getElementById(id);
const T = s => (typeof GL_T === 'function' ? GL_T(s) : s);

const MAX_CLASSES = 10;
const MAX_SAMPLES = 200;        // 종류 하나에 모을 수 있는 예시 수
const CAP_INTERVAL = 100;       // 꾹 누르는 동안 초당 10장
const SEE_INTERVAL = 90;        // 화면 미리보기·임베딩 주기 (약 11Hz)
const SHOW_NUMS = 24;           // 1024개 중 화면에 보여 줄 앞쪽 개수

let emb = null;                 // { embed, close }
let stream = null;
let classes = [];               // [{ name, vecs: [Float32Array], thumbs: [dataURL] }]
let selected = -1;
let capturing = false, lastCap = 0, lastSee = 0;
let lastVec = null;
let trained = null;             // { model, accuracy, confusion, history, classes, saved }
let training = false;

// 임베딩에 넣기 전 그림을 만드는 작업용 캔버스 (화면에 붙이지 않는다)
const workCv = document.createElement('canvas');
workCv.width = EMBEDDER.inputSize;
workCv.height = EMBEDDER.inputSize;

// ── 알림 ──
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

// ── 단계 표시 ──
function steps() {
  const st = [
    classes.length > 0,
    classes.some(c => c.vecs.length > 0),
    !!trained,
    !!(trained && trained.saved),
  ];
  [1, 2, 3, 4].forEach((n, i) => {
    const el = $('s' + n);
    el.classList.toggle('done', st[i]);
    el.classList.toggle('on', !st[i] && (i === 0 || st[i - 1]));
  });
}

function progress(label, pct, ratio) {
  $('prgLabel').textContent = label;
  $('prgPct').textContent = pct == null ? '' : pct;
  if (ratio != null) $('prgFill').style.width = Math.round(ratio * 100) + '%';
}

// ── 임베더 준비 ──
async function boot() {
  $('engine').textContent = T('준비 중…');
  progress(T('준비 중'), '');
  try {
    emb = await loadEmbedder();
    $('engine').textContent = T('준비 완료');
    progress(T('준비 완료'), '');
  } catch (e) {
    console.error(e);
    $('engine').textContent = T('불러오지 못했어요');
    progress(T('불러오지 못했어요. 새로고침해 주세요'), '', 0);
  }
  refreshUI();
}

// ── 카메라 ──
async function listCams() {
  const sel = $('camSel');
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    const cur = sel.value;
    sel.innerHTML = '';
    devs.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      const full = d.label || (T('카메라') + ' ' + (i + 1));
      const cut = full.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '').trim();
      o.textContent = cut.length > 22 ? cut.slice(0, 21) + '…' : cut;
      o.title = full;
      sel.appendChild(o);
    });
    if (cur && devs.some(d => d.deviceId === cur)) sel.value = cur;
  } catch (e) { /* 무시 */ }
}

async function camOn() {
  if (stream) return true;
  try {
    const want = { width: { ideal: 640 }, height: { ideal: 480 } };
    if ($('camSel').value) want.deviceId = { exact: $('camSel').value };
    stream = await navigator.mediaDevices.getUserMedia({ video: want, audio: false });
    $('camVid').srcObject = stream;
    await $('camVid').play();
    syncAspect();
    $('camVid').addEventListener('loadedmetadata', syncAspect);
    $('camOff').style.display = 'none';
    $('cropBox').style.display = 'block';
    setCamBtn(true);
    await listCams();
    refreshUI();
    return true;
  } catch (e) {
    toast(T('카메라가 안 보여요. 연결을 확인해 주세요'));
    return false;
  }
}

function camStop() {
  stopCap();
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  $('camVid').srcObject = null;
  $('camOff').style.display = '';
  $('cropBox').style.display = 'none';
  setCamBtn(false);
  lastVec = null;
  renderSee(false);
  refreshUI();
}

function setCamBtn(on) {
  $('camBtn').innerHTML = '<i class="fa-solid ' + (on ? 'fa-video-slash' : 'fa-video') + '"></i> ' +
    (on ? T('카메라 끄기') : T('카메라 켜기'));
}

function camReady() { return !!(stream && $('camVid').videoWidth); }

// 카메라 상자를 실제 영상 비율에 맞추고, 잘라 쓰는 정사각형을 표시한다.
function syncAspect() {
  const v = $('camVid');
  if (!v.videoWidth) return;
  $('camBox').style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
  const box = $('cropBox');
  if (v.videoWidth >= v.videoHeight) {
    const pad = (1 - v.videoHeight / v.videoWidth) / 2 * 100;
    box.style.inset = '0 ' + pad.toFixed(2) + '%';
  } else {
    const pad = (1 - v.videoWidth / v.videoHeight) / 2 * 100;
    box.style.inset = pad.toFixed(2) + '% 0';
  }
}

// ── 화면 루프 ──
function loop() {
  requestAnimationFrame(loop);
  // 배우는 동안은 임베딩을 쉰다 — GPU 를 잡고 있으면 학습이 느려진다
  if (training || !emb || !camReady()) return;

  const now = performance.now();
  if (now - lastSee < SEE_INTERVAL) return;
  lastSee = now;

  if (!cropSquare($('camVid'), workCv, EMBEDDER.inputSize)) return;
  let vec = null;
  try { vec = emb.embed(workCv); } catch (e) { return; }
  lastVec = vec;
  renderSee(true);

  if (capturing && vec && selected >= 0 && now - lastCap > CAP_INTERVAL) {
    lastCap = now;
    addSample(vec, thumbFrom(workCv));
  }
}

// ── AI가 보는 그림 · 숫자 ──
function renderSee(on) {
  const state = $('seeState');
  const nums = $('seeNums');
  const see = $('seeCv');
  if (!on || !lastVec) {
    state.textContent = T('아직 안 봐요');
    state.style.color = 'var(--ink3)';
    see.getContext('2d').clearRect(0, 0, see.width, see.height);
    nums.innerHTML = '<span class="ph2">' + T('카메라를 켜면 숫자가 나와요') + '</span>';
    return;
  }
  state.textContent = T('보고 있어요');
  state.style.color = 'var(--acc-ink)';
  see.getContext('2d').drawImage(workCv, 0, 0);
  const head = [];
  for (let i = 0; i < SHOW_NUMS && i < lastVec.length; i++) head.push(lastVec[i].toFixed(3));
  nums.textContent = head.join(' ') + ' …';
}

// ── 종류(클래스) ──
function addClass() {
  const name = $('clsName').value.trim();
  if (!name) return;
  if (classes.some(c => c.name === name)) { toast(T('같은 이름이 이미 있어요')); return; }
  if (classes.length >= MAX_CLASSES) { toast(T('종류는 10개까지 만들 수 있어요')); return; }
  classes.push({ name, vecs: [], thumbs: [] });
  $('clsName').value = '';
  selected = classes.length - 1;
  clearTrained();
  renderClasses(); refreshUI(); steps();
}

function delClass(i) {
  classes.splice(i, 1);
  if (selected >= classes.length) selected = classes.length - 1;
  clearTrained();
  renderClasses(); refreshUI(); steps();
}

function delSample(ci, si) {
  const c = classes[ci];
  if (!c || !c.vecs[si]) return;
  c.vecs.splice(si, 1);
  c.thumbs.splice(si, 1);
  clearTrained();
  renderClasses(); refreshUI(); steps();
}

function renderClasses() {
  const box = $('clsList');
  box.innerHTML = '';
  classes.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'cls' + (i === selected ? ' on' : '');
    el.addEventListener('click', ev => {
      if (ev.target.closest('.del')) return;
      selected = i; renderClasses(); refreshUI();
    });
    const top = document.createElement('div');
    top.className = 'top';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = c.name;
    const ct = document.createElement('span'); ct.className = 'ct'; ct.textContent = c.vecs.length + T('장');
    const del = document.createElement('button');
    del.className = 'del'; del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.title = T('지우기');
    del.addEventListener('click', () => delClass(i));
    top.appendChild(nm); top.appendChild(ct); top.appendChild(del);
    el.appendChild(top);

    if (c.thumbs.length) {
      const th = document.createElement('div'); th.className = 'thumbs';
      c.thumbs.forEach((src, si) => {
        const im = document.createElement('img');
        im.src = src;
        im.title = T('누르면 이 예시를 지워요');
        im.addEventListener('click', ev => { ev.stopPropagation(); delSample(i, si); });
        th.appendChild(im);
      });
      el.appendChild(th);
    }
    box.appendChild(el);
  });
  $('clsHint').style.display = classes.length ? 'none' : '';
}

// ── 예시 모으기 ──
// 저장하는 것은 숫자(임베딩)와 작은 썸네일뿐이다. 원본 사진은 남기지 않는다.
function addSample(vec, thumbSrc) {
  const c = classes[selected];
  if (!c) return;
  if (c.vecs.length >= MAX_SAMPLES) { toast(T('예시는 종류마다 200장까지예요')); return; }
  c.vecs.push(Float32Array.from(vec));
  c.thumbs.push(thumbSrc);
  clearTrained();
  renderClasses(); refreshUI(); steps();
}

function startCap() {
  if (selected < 0 || !camReady() || !emb || capturing) return;
  capturing = true; lastCap = 0;
}
function stopCap() { capturing = false; }

// 사진 파일에서 예시 더하기 — 웹캠 없이도 가르칠 수 있다
async function addFromFiles(files) {
  if (selected < 0 || !emb) return;
  let added = 0, failed = 0;
  for (const file of files) {
    if (!/^image\//.test(file.type)) { failed++; continue; }
    try {
      const bmp = await createImageBitmap(file);
      cropSquare(bmp, workCv, EMBEDDER.inputSize);
      bmp.close();
      const vec = emb.embed(workCv);
      if (!vec) { failed++; continue; }
      const before = classes[selected].vecs.length;
      addSample(vec, thumbFrom(workCv));
      if (classes[selected].vecs.length > before) added++;
    } catch (e) { failed++; }
  }
  renderSee(!!lastVec && camReady());
  if (added) toast(T('사진을 더했어요') + ': ' + added + T('장'));
  else if (failed) toast(T('사진을 읽지 못했어요'));
}

// ── 배우기 ──
function clearTrained() {
  if (trained) { trained.model.dispose(); trained = null; }
  $('resultSec').style.display = 'none';
  $('chartBox').style.display = 'none';
  refreshUI(); steps();
}

async function train() {
  const usable = classes.filter(c => c.vecs.length > 0);
  if (usable.length < 2) { toast(T('종류 2개에 예시가 있어야 해요')); return; }
  if (training) return;
  training = true;
  refreshUI();

  const dim = EMBEDDER.dim;
  const vecs = [], labels = [];
  usable.forEach((c, i) => c.vecs.forEach(v => { vecs.push(v); labels.push(i); }));

  $('chartBox').style.display = '';
  const hist = [];
  try {
    const t0 = performance.now();
    const out = await trainModel(vecs, labels, usable.length, dim, (ep, total, rec) => {
      hist.push(rec);
      progress(T('배우는 중') + ' ' + ep + '/' + total,
        T('맞힌 비율') + ' ' + Math.round((rec.acc || 0) * 100) + '%', ep / total);
      drawChart(hist);
    });
    console.log('train took', Math.round(performance.now() - t0), 'ms');
    trained = Object.assign(out, { classes: usable.map(c => c.name), saved: false });
    progress(T('다 배웠어요'), T('맞힌 비율') + ' ' + Math.round(out.accuracy * 100) + '%', 1);
    showResult(out, usable);
    if (out.accuracy < 0.85) toast(T('아직 헷갈려 해요. 예시를 더 모아 볼까요?'));
    else toast(T('잘 배웠어요! 이제 시험해 보세요'));
  } catch (e) {
    console.error(e);
    progress(T('배우다가 멈췄어요. 다시 해 보세요'), '', 0);
  }
  training = false;
  refreshUI(); steps();
}

function showResult(out, usable) {
  $('resultSec').style.display = '';
  $('accBig').textContent = Math.round(out.accuracy * 100) + '%';
  $('accWord').textContent = T('맞힌 비율');

  const names = usable.map(c => c.name);
  let html = '<table><tr><th></th>' + names.map(n => '<th title="' + esc(n) + '">' + esc(n) + '</th>').join('') + '</tr>';
  out.confusion.forEach((row, i) => {
    const total = row.reduce((a, b) => a + b, 0) || 1;
    html += '<tr><th title="' + esc(names[i]) + '">' + esc(names[i]) + '</th>';
    row.forEach((v, j) => {
      const bg = accentRgba(((v / total) * 0.75).toFixed(3));
      html += '<td class="' + (i === j ? 'diag' : '') + '" style="background:' + bg + '">' + (v || '') + '</td>';
    });
    html += '</tr>';
  });
  $('cmWrap').innerHTML = html + '</table>';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ── 학습 그래프 ──
function drawChart(hist) {
  const cv = $('chart');
  const W = cv.clientWidth || 280, H = cv.clientHeight || 110;
  if (cv.width !== W * 2) { cv.width = W * 2; cv.height = H * 2; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!hist.length) return;
  const pad = 6;
  const maxLoss = Math.max(0.001, ...hist.map(h => h.loss || 0));
  const px = i => pad + (W - 2 * pad) * (hist.length === 1 ? 1 : i / (hist.length - 1));
  const line = (get, color) => {
    ctx.beginPath();
    hist.forEach((h, i) => {
      const y = pad + (H - 2 * pad) * (1 - Math.max(0, Math.min(1, get(h))));
      i ? ctx.lineTo(px(i), y) : ctx.moveTo(px(i), y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  };
  const warn = (getComputedStyle(document.documentElement).getPropertyValue('--warn') || '').trim() || '#B4451C';
  line(h => (h.loss || 0) / maxLoss, warn);
  line(h => h.acc || 0, accentColor());
}

// ── 저장 ──
async function saveModel() {
  if (!trained) return;
  const name = $('mdlName').value.trim();
  if (!name) { toast(T('모델 이름을 적어 주세요')); return; }
  try {
    const exists = await Store.get(name);
    if (exists && !confirm(T('같은 이름이 있어요. 바꿔 쓸까요?'))) return;
    const usable = classes.filter(c => c.vecs.length > 0);
    const packed = await serialize(trained.model, trained.classes, EMBEDDER.dim);
    await Store.save({
      name,
      kind: 'image',
      classes: trained.classes,
      sampleCounts: usable.map(c => c.vecs.length),
      accuracy: trained.accuracy,
      embedder: EMBEDDER,
      classifier: packed,
      // 예시도 함께 저장한다 — 다음에 이어서 모으고 다시 배울 수 있다
      examples: examplesToRecord(usable, EMBEDDER.dim),
      createdAt: new Date().toISOString(),
    });
    trained.saved = true;
    toast(T('저장했어요') + ': ' + name);
  } catch (e) {
    console.error(e);
    toast(T('저장하지 못했어요'));
  }
  steps();
}

// ── 버튼 상태 ──
function refreshUI() {
  const ready = camReady() && !!emb;
  $('capBtn').disabled = !(ready && selected >= 0);
  $('addFiles').disabled = !(emb && selected >= 0);
  $('selInfo').textContent = selected >= 0
    ? T('고른 종류') + ': ' + classes[selected].name
    : T('종류를 골라 주세요');
  $('selInfo').classList.toggle('on', selected >= 0);
  const shot = classes.filter(c => c.vecs.length > 0).length;
  $('trainBtn').disabled = training || shot < 2;
  $('mdlSave').disabled = !trained;
}

// ── 이벤트 연결 ──
$('clsAdd').addEventListener('click', addClass);
$('clsName').addEventListener('keydown', e => { if (e.key === 'Enter') addClass(); });
$('camBtn').addEventListener('click', () => (stream ? camStop() : camOn()));
$('camSel').addEventListener('change', () => { if (stream) { camStop(); camOn(); } });
const cap = $('capBtn');
cap.addEventListener('pointerdown', e => { cap.setPointerCapture(e.pointerId); startCap(); });
cap.addEventListener('pointerup', stopCap);
cap.addEventListener('pointercancel', stopCap);
cap.addEventListener('contextmenu', e => e.preventDefault());
$('addFiles').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async e => {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  await addFromFiles(files);
});
$('trainBtn').addEventListener('click', train);
$('mdlSave').addEventListener('click', saveModel);

// ── 이어서 배우기 (?load=모델이름) ──
async function restoreWork(name) {
  try {
    const rec = await Store.get(name);
    if (!rec || !rec.examples || !rec.examples.length) { toast(T('이어 할 예시가 없어요')); return; }
    classes = examplesFromRecord(rec.examples, rec.embedder ? rec.embedder.dim : EMBEDDER.dim);
    selected = 0;
    $('mdlName').value = rec.name;
    renderClasses(); refreshUI(); steps();
    toast(T('이어서 시작해요') + ': ' + name);
  } catch (e) {
    console.error(e);
    toast(T('모델을 불러오지 못했어요'));
  }
}

// ── 시작 ──
boot();
navigator.mediaDevices && listCams();
const loadName = new URLSearchParams(location.search).get('load');
if (loadName) restoreWork(loadName);
loop();
steps();
refreshUI();
