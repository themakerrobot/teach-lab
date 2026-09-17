// ═══════════════════════════════════════════════════════════
// 임베더 — MediaPipe Tasks Vision ImageEmbedder
// ═══════════════════════════════════════════════════════════
// 전부 셀프호스팅이다: wasm 은 vendor/tasks-vision/, 모델은 models/.
// 경로는 페이지 기준 상대경로만 쓴다 (하위 경로 배포 대비).
//
// 모델: mobilenet_v3_small (MediaPipe image_embedder float32/1)
//   입력 1×224×224×3 float32 · 출력 1×1024 float32
//   l2Normalize: true — 길이가 1로 맞춰져 조명·거리 차이에 덜 흔들린다.
//
// 브라우저와 파이썬이 같은 숫자를 내려면 전처리가 같아야 한다.
// 그래서 임베딩에 넣기 전에 항상 "가운데 정사각형으로 자르고 224×224 로 줄이기"
// 를 거친다 (PREPROCESS). 화면에 보이는 미리보기·썸네일도 같은 그림이다.

import { FilesetResolver, ImageEmbedder } from '../vendor/tasks-vision/vision_bundle.mjs';

const WASM_DIR = './vendor/tasks-vision';

export const EMBEDDER = {
  name: 'mediapipe/mobilenet_v3_small',
  file: 'mobilenet_v3_small_embedder.tflite',
  path: './models/mobilenet_v3_small_embedder.tflite',
  inputSize: 224,
  dim: 1024,
  l2Normalize: true,
  quantize: false,
  preprocess: 'center-crop-square',   // 가운데 정사각형 → 224×224
};

let visionPromise = null;
function fileset() {
  if (!visionPromise) visionPromise = FilesetResolver.forVisionTasks(WASM_DIR);
  return visionPromise;
}

// 임베더는 한 번만 만들어 캐시한다 (페이지당 하나).
let embPromise = null;

export function loadEmbedder() {
  if (embPromise) return embPromise;
  embPromise = (async () => {
    const vision = await fileset();
    const opt = {
      baseOptions: { modelAssetPath: EMBEDDER.path, delegate: 'GPU' },
      runningMode: 'VIDEO',
      l2Normalize: EMBEDDER.l2Normalize,
      quantize: EMBEDDER.quantize,
    };
    let inst;
    try {
      inst = await ImageEmbedder.createFromOptions(vision, opt);
    } catch (e) {
      console.warn('[embedder] GPU delegate failed, falling back to CPU', e);
      opt.baseOptions.delegate = 'CPU';
      inst = await ImageEmbedder.createFromOptions(vision, opt);
    }

    // runningMode VIDEO 는 타임스탬프가 단조 증가해야 한다.
    // 정지 그림(파일에서 불러오기)도 같은 인스턴스로 처리하므로,
    // 타임스탬프는 바깥 시계와 무관하게 여기서 직접 세어 준다.
    let ts = 0;
    function embed(source) {
      ts += 1;
      const r = inst.embedForVideo(source, ts);
      const e = r && r.embeddings && r.embeddings[0];
      if (!e || !e.floatEmbedding) return null;
      return Float32Array.from(e.floatEmbedding);
    }

    return { embed, close() { try { inst.close(); } catch (e) { /* 무시 */ } } };
  })().catch(e => { embPromise = null; throw e; });
  return embPromise;
}

// ── 전처리 ──
// 어떤 비율의 그림이 들어와도 가운데를 정사각형으로 잘라 size×size 로 줄인다.
// 찌그러뜨리지 않는 것이 중요하다 — 파이썬 쪽도 똑같이 자른다.
export function cropSquare(src, canvas, size) {
  const S = size || EMBEDDER.inputSize;
  const w = src.videoWidth || src.naturalWidth || src.width;
  const h = src.videoHeight || src.naturalHeight || src.height;
  if (!w || !h) return null;
  if (canvas.width !== S || canvas.height !== S) { canvas.width = S; canvas.height = S; }
  const side = Math.min(w, h);
  const sx = (w - side) / 2, sy = (h - side) / 2;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  ctx.drawImage(src, sx, sy, side, side, 0, 0, S, S);
  return canvas;
}

// 화면에 보여 줄 작은 그림 (예시 카드용). 자른 그림 그대로라 AI가 보는 것과 같다.
export function thumbFrom(canvas, size) {
  const S = size || 96;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  cv.getContext('2d').drawImage(canvas, 0, 0, S, S);
  return cv.toDataURL('image/jpeg', 0.7);
}

// 테마 색 (그래프·표 색칠에 쓴다)
// --acc 가 var(--pen-blue) 처럼 다른 토큰을 가리킬 수 있으므로 몇 단계 따라간다.
let accCache = null;
export function accentColor() {
  if (accCache) return accCache;
  const cs = getComputedStyle(document.documentElement);
  let v = (cs.getPropertyValue('--acc') || '').trim();
  for (let i = 0; i < 4 && /^var\(/.test(v); i++) {
    const m = /^var\(\s*(--[\w-]+)/.exec(v);
    if (!m) break;
    v = (cs.getPropertyValue(m[1]) || '').trim();
  }
  accCache = v || '#1F5F7A';
  return accCache;
}

export function accentRgba(alpha) {
  const hex = accentColor();
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}
