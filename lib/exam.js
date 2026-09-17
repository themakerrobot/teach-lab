// ═══════════════════════════════════════════════════════════
// 시험실 — 가르친 모델로 바로 맞혀 보기
// ═══════════════════════════════════════════════════════════
// TF.js 를 쓰지 않는다. 분류기는 lib/classifier.js 의 순수 JS 계산으로 돈다.

import { loadEmbedder, cropTo, EMBEDDER } from './embedder.js';
import { deserialize, predict } from './classifier.js';
import { Store } from './project.js';

const $ = id => document.getElementById(id);
const T = s => (typeof GL_T === 'function' ? GL_T(s) : s);

const SEE_INTERVAL = 90;        // 약 11Hz
const SHOW_NUMS = 24;
const THR_KEY = 'teachlab-threshold';

let emb = null;
let stream = null;
let clf = null;                 // 지금 고른 분류기
let clfName = '';
let lastSee = 0, lastVec = null;
let threshold = 0.6;

// 웹캠 프레임은 화면의 미리보기 캔버스에 바로 그린다 — 보이는 것이 곧 입력이다.
const camCv = $('camCv');
// 사진 파일은 미리보기를 건드리지 않게 따로 만든 캔버스에 그린다.
const fileCv = document.createElement('canvas');
fileCv.width = EMBEDDER.inputSize;
fileCv.height = EMBEDDER.inputSize;

function clearCam() {
  camCv.getContext('2d').clearRect(0, 0, camCv.width, camCv.height);
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ── 임베더 ──
async function boot() {
  $('engine').textContent = T('준비 중…');
  try {
    emb = await loadEmbedder();
    $('engine').textContent = T('준비 완료');
  } catch (e) {
    console.error(e);
    $('engine').textContent = T('불러오지 못했어요');
    toast(T('불러오지 못했어요. 새로고침해 주세요'));
  }
  refreshUI();
}

// ── 모델 목록 ──
async function renderModels() {
  const box = $('mdlList');
  box.innerHTML = '';
  let list = [];
  try { list = await Store.list(); } catch (e) { console.error(e); }
  $('mdlHint').style.display = list.length ? 'none' : '';
  list.forEach(rec => {
    const el = document.createElement('div');
    el.className = 'mradio' + (rec.name === clfName ? ' on' : '');
    const nm = document.createElement('span');
    nm.className = 'nm'; nm.textContent = rec.name;
    const mt = document.createElement('span');
    mt.className = 'mt';
    mt.textContent = rec.classes.length + T('종류') + ' · ' + Math.round((rec.accuracy || 0) * 100) + '%';
    el.appendChild(nm); el.appendChild(mt);
    el.addEventListener('click', () => pickModel(rec.name));
    box.appendChild(el);
  });
}

async function pickModel(name) {
  try {
    const rec = await Store.get(name);
    if (!rec) { toast(T('모델을 불러오지 못했어요')); return; }
    if (rec.embedder && rec.embedder.dim !== EMBEDDER.dim) {
      toast(T('이 모델은 지금 버전과 맞지 않아요'));
      return;
    }
    clf = deserialize(rec.classifier.json, rec.classifier.bin);
    clfName = rec.name;
    $('mdlInfo').innerHTML =
      T('종류') + ': ' + esc(rec.classes.join(', ')) + '<br>' +
      T('예시') + ': ' + (rec.sampleCounts || []).reduce((a, b) => a + b, 0) + T('장') + '<br>' +
      T('맞힌 비율') + ': ' + Math.round((rec.accuracy || 0) * 100) + '%';
    renderModels();
    refreshUI();
    renderAnswer(null);
  } catch (e) {
    console.error(e);
    toast(T('모델을 불러오지 못했어요'));
  }
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
    $('camOff').style.display = 'none';
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
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  $('camVid').srcObject = null;
  $('camOff').style.display = '';
  clearCam();
  setCamBtn(false);
  lastVec = null;
  renderSee(false);
  renderAnswer(null);
  refreshUI();
}

function setCamBtn(on) {
  $('camBtn').innerHTML = '<i class="fa-solid ' + (on ? 'fa-video-slash' : 'fa-video') + '"></i> ' +
    (on ? T('카메라 끄기') : T('카메라 켜기'));
}

function camReady() { return !!(stream && $('camVid').videoWidth); }

// ── 루프 ──
function loop() {
  requestAnimationFrame(loop);
  if (!emb || !camReady()) return;
  const now = performance.now();
  if (now - lastSee < SEE_INTERVAL) return;
  lastSee = now;

  // 학습할 때와 똑같이: 거울 건 정사각형 (EMBEDDER.mirror)
  if (!cropTo($('camVid'), camCv, EMBEDDER.inputSize, EMBEDDER.mirror)) return;
  let vec = null;
  try { vec = emb.embed(camCv); } catch (e) { return; }
  lastVec = vec;
  renderSee(true);
  if (clf && vec) renderAnswer(predict(clf, vec));
}

function renderSee(on) {
  const state = $('seeState');
  const nums = $('seeNums');
  if (!on || !lastVec) {
    state.textContent = T('아직 안 봐요');
    state.style.color = 'var(--ink3)';
    nums.innerHTML = '<span class="ph2">' + T('카메라를 켜면 숫자가 나와요') + '</span>';
    return;
  }
  state.textContent = T('보고 있어요');
  state.style.color = 'var(--acc-ink)';
  const head = [];
  for (let i = 0; i < SHOW_NUMS && i < lastVec.length; i++) head.push(lastVec[i].toFixed(3));
  nums.textContent = head.join(' ') + ' …';
}

// ── 답 · 확률 막대 ──
function renderAnswer(probs) {
  const ans = $('answer');
  const bars = $('exBars');
  if (!clf) {
    ans.textContent = T('모델을 골라 주세요');
    ans.className = 'answer idk';
    bars.innerHTML = '';
    return;
  }
  if (!probs) {
    ans.textContent = T('카메라를 켜 주세요');
    ans.className = 'answer idk';
    bars.innerHTML = renderBars(clf.classes.map(() => 0), -1);
    return;
  }
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  const sure = probs[best] >= threshold;
  ans.textContent = sure ? clf.classes[best] : T('모르겠어요');
  ans.className = 'answer ' + (sure ? 'sure' : 'idk');
  bars.innerHTML = renderBars(probs, best);
}

function renderBars(probs, best) {
  let html = '';
  clf.classes.forEach((name, i) => {
    const p = probs[i] || 0;
    html += '<div class="bar' + (i === best ? ' top' : '') + '">' +
      '<div class="bl"><span>' + esc(name) + '</span><span class="num">' + Math.round(p * 100) + '%</span></div>' +
      '<div class="bt"><div class="bf" style="width:' + (p * 100).toFixed(1) + '%"></div></div></div>';
  });
  return html;
}

// ── 사진 파일로 시험하기 ──
// 파일은 뒤집지 않는다 — 거울은 웹캠에만 건다 (학습할 때와 같은 규칙).
async function testFile(file) {
  if (!emb || !clf || !file) return;
  try {
    const bmp = await createImageBitmap(file);
    cropTo(bmp, fileCv, EMBEDDER.inputSize, false);
    bmp.close();
    const vec = emb.embed(fileCv);
    if (!vec) { toast(T('사진을 읽지 못했어요')); return; }
    lastVec = vec;
    renderSee(true);
    renderAnswer(predict(clf, vec));
  } catch (e) {
    console.error(e);
    toast(T('사진을 읽지 못했어요'));
  }
}

// ── 확신 정도 ──
function setThreshold(v) {
  threshold = v / 100;
  $('thrVal').textContent = v + '%';
  try { localStorage.setItem(THR_KEY, String(v)); } catch (e) {}
}

function refreshUI() {
  $('addFiles').disabled = !(emb && clf);
}

// ── 이벤트 연결 ──
$('camBtn').addEventListener('click', () => (stream ? camStop() : camOn()));
$('camSel').addEventListener('change', () => { if (stream) { camStop(); camOn(); } });
$('thrRange').addEventListener('input', e => setThreshold(Number(e.target.value)));
$('addFiles').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async e => {
  const f = (e.target.files || [])[0];
  e.target.value = '';
  await testFile(f);
});

// ── 시작 ──
(function initThreshold() {
  let v = 60;
  try {
    const saved = Number(localStorage.getItem(THR_KEY));
    if (saved >= 20 && saved <= 95) v = saved;
  } catch (e) {}
  $('thrRange').value = String(v);
  setThreshold(v);
})();

boot();
navigator.mediaDevices && listCams();
renderModels().then(async () => {
  // 학습실에서 넘어왔다면(?use=이름) 그 모델을 바로 고른다
  const use = new URLSearchParams(location.search).get('use');
  const list = await Store.list();
  if (use) await pickModel(use);
  else if (list.length === 1) await pickModel(list[0].name);
});
loop();
refreshUI();
