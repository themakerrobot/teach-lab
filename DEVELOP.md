# 개발·배포 안내 (for developers)

사용자용 소개는 [README.md](./README.md)를 보세요. 이 문서는 개발·운영 전용입니다.

## 원칙

- 백엔드 없음 — 전부 정적 파일. 외부 CDN 금지, 라이브러리·모델 전부 셀프호스팅
- 최초 로드 후 오프라인 동작
- 코드·README 에 계정명·절대 URL 하드코딩 금지 (조직 이전 대비, 전부 상대경로)
- 디자인은 자매 서비스(Sense Lab · 파이보 랩)와 동일 — 공용 규격은 [design/](./design/) 참고.
  `css/maker-ui.css` 는 `design/maker-ui.css` 를 그대로 복사한 것이다. **직접 고치지 말 것.**
  이 서비스 전용 스타일만 `css/app.css` 에 얹는다.

## 지금 범위

이미지 분류 **한 종만** end-to-end 로 구현되어 있다 (수집 → 학습 → 추론 → 내보내기).
손·얼굴·소리·포즈는 아직 없다. 입력이 늘어나도 아래 구조는 그대로 두고
`lib/embedder.js` 자리에 소스별 특징 추출기를 끼우는 방향으로 넓힌다.

## 실행

`file://` 로는 열 수 없습니다. 반드시 http 로 서빙하세요.

```bash
npx http-server -p 8080          # 또는
python3 -m http.server 8080
```

### MIME 주의

서버가 아래 타입을 내보내야 합니다. 틀리면 wasm 스트리밍 컴파일이 실패합니다.

| 확장자 | MIME |
|---|---|
| `.wasm` | `application/wasm` |
| `.tflite` | `application/octet-stream` |
| `.mjs` | `text/javascript` |

Go 서버(`pibo-server` 계열) 사용 시 `mime.AddExtensionType` 로 명시 등록하세요.
Cloudflare 배포용 헤더는 `_headers` 에 있습니다.

## 구조

```
index.html / test.html / storage.html
css/
  maker-ui.css       공용 디자인 킷 (design/maker-ui.css 복사본 — 수정 금지)
  app.css            이 서비스 전용
  all.min.css        Font Awesome
lib/
  nav.js             헤더/탭/전체화면
  i18n.js            한/영 토글 (자매 서비스와 같은 방식)
  embedder.js        MediaPipe ImageEmbedder 로드 + 전처리 (GPU 실패 시 CPU 폴백)
  trainer.js         TF.js 분류기 학습 (Dense64-Dropout-Softmax, webgl→cpu)
  classifier.js      저장 형식 + 추론 (TF.js 없이 도는 순수 JS)
  project.js         IndexedDB 저장 + .teachlab.zip 내보내기/불러오기
  pyexport.js        파이썬 내보내기 zip 만들기
  learn.js / exam.js / storage_page.js   페이지 로직
  jszip.min.js
vendor/
  tasks-vision/      @mediapipe/tasks-vision wasm + vision_bundle.mjs
  tfjs/              @tensorflow/tfjs tf.min.js
models/              mobilenet_v3_small_embedder.tflite (MediaPipe image_embedder)
assets/fonts/        Pretendard (셀프호스팅)
assets/img/          캐릭터·로고·앱 아이콘
design/              공용 디자인 킷 (maker-ui.css + 미리보기)
python/              PyPI 패키지 `teachlab`
```

## 파이프라인

```
카메라/사진 → 가운데 정사각형 자르기 → 224×224
           → MediaPipe ImageEmbedder (l2Normalize) → 1024차원
           → Dense(64, relu) → Dropout(0.2) → Dense(N, softmax)
```

- 자르기 방식(`center-crop-square`)은 브라우저와 파이썬이 **같아야 한다.**
  바꾸면 `python/teachlab/preprocess.py` 도 같이 바꿔야 한다.
- 축소 보간은 브라우저 캔버스 기본값에 맞춰 파이썬에서 `cv2.INTER_LINEAR` 를 쓴다
  (같은 사진에서 임베딩 코사인 유사도 약 0.99).
- 임베딩이 1024차원이라 학습 곱셈이 sense-lab 보다 훨씬 많다.
  그래서 TF.js 백엔드는 `webgl` 먼저, 실패하면 `cpu` 로 내려간다.

## 저장 형식

브라우저 저장은 IndexedDB `teach-lab` / 스토어 `projects` (keyPath: `name`).
가중치는 TF.js 형식이 아니라 **평범한 float32 덩어리**로 둔다 — 파이썬에서
numpy 로 바로 읽기 위해서다.

```
.teachlab.zip
  manifest.json     { format:"teachlab", version, kind:"image", app, createdAt }
  project.json      이름·종류·정확도·임베더 정보
  classifier.json   층마다 kernel/bias 의 shape 과 offset(float32 개수)
  classifier.bin    float32 little-endian 을 순서대로 이어 붙인 것
  samples.json      예시 임베딩 (base64) — 이어서 배우기용
  thumbs/<종류번호>/<번호>.jpg
```

형식을 바꿀 때는 `manifest.version` 을 올리고, 읽는 쪽
(`lib/project.js` · `python/teachlab/classifier.py`)을 함께 고칩니다.

## 벤더 파일 갱신

```bash
npm i @mediapipe/tasks-vision @tensorflow/tfjs
cp node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.*        vendor/tasks-vision/
cp node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.* vendor/tasks-vision/
cp node_modules/@mediapipe/tasks-vision/vision_bundle.mjs                  vendor/tasks-vision/
cp node_modules/@tensorflow/tfjs/dist/tf.min.js                            vendor/tfjs/
```

`vision_wasm_module_internal.*` 은 `FilesetResolver.forVisionTasks(path)` 가
부르지 않으므로 담지 않습니다 (약 12MB 절약).

임베더 모델은 MediaPipe 공식 저장소의
`image_embedder/mobilenet_v3_small/float32/1` 을 받아
`models/mobilenet_v3_small_embedder.tflite` 로 둡니다
(입력 1×224×224×3 float32, 출력 1×1024 float32).

`node_modules` 는 커밋하지 않고, 벤더 파일은 커밋합니다.

## 파이썬 패키지

```bash
cd python
pip install -e .
teachlab info <파이썬내보내기>/model
```

`mediapipe` 가 `libEGL`·`libGLESv2` 를 dlopen 합니다. 헤드리스 리눅스에서는
`libegl1 libgles2 libglx0` 를 설치해야 임포트됩니다.

배포는 `python/` 에서 빌드해 PyPI 에 올립니다 (패키지명 `teachlab`).

## 배포 (자매 서비스와 동일)

- `main` 에 작업 → GitHub Pages 테스트 → 통과하면 `release` 브랜치 머지 → Cloudflare 자동 배포
- Cloudflare 는 Workers 방식: `wrangler.toml` + `.assetsignore` (잠금 없음 — 자산만 서빙)
- 배포 명령: `npx wrangler deploy`
- 캐시 버스팅: 코드 파일만 `?v=N`. 모델·wasm 파일에는 붙이지 않습니다
- 모든 자산 경로는 상대경로 — 하위 경로(`/teach-lab/`) 서빙에서도 동작합니다
