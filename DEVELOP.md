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
카메라/사진 → cropTo(224, flip) → MediaPipe ImageEmbedder (l2Normalize) → 1024차원
           → Dense(64, relu) → Dropout(0.2) → Dense(N, softmax)
```

전처리(`cropTo`)는 **Teachable Machine 것을 그대로 옮겼다**
(`@teachablemachine/image`, `src/utils/canvas.ts`).

1. 짧은 변이 224 가 되도록 전체를 줄인다 (찌그러뜨리지 않는다)
2. 가운데 224×224 만 남긴다
3. 웹캠이면 좌우를 뒤집는다 — TM 의 `Webcam(w, h, flip=true)` 과 같다

- **거울은 웹캠에만 건다.** 사진 파일은 안 뒤집는다. TM 도 같다:
  거울은 `Webcam` 클래스가 찍을 때 한 번 걸고, `predict(image, flipped=false)`
  가 기본이다.
- 거울을 걸고 학습했으므로 파이썬 쪽도 웹캠 프레임은 뒤집어야 맞는다.
  `project.json` 의 `embedder.mirror` 가 그 표시이고, `predict_webcam()` 이
  그 값을 따른다. 거울이 아닌 카메라(로봇 카메라 등)는 `predict()` 를 쓴다.
- 화면 미리보기는 잘라 낸 정사각형 캔버스(`#camCv`)를 그대로 보여 준다.
  `<video>` 는 원본일 뿐이라 화면에 붙이지 않는다 — TM 이 `webcam.canvas` 를
  붙여 보여 주는 것과 같다. **보이는 것이 곧 학습 입력이다.**
- 자르기·거울을 바꾸면 `python/teachlab/preprocess.py` 도 같이 바꿔야 한다.
- 축소 보간은 브라우저 캔버스 기본값에 맞춰 파이썬에서 `cv2.INTER_LINEAR` 를 쓴다
  (같은 사진에서 임베딩 코사인 유사도 약 0.99).
- 임베딩이 1024차원이라 학습 곱셈이 sense-lab 보다 훨씬 많다.
  그래서 TF.js 백엔드는 `webgl` 먼저, 실패하면 `cpu` 로 내려간다.

### Teachable Machine 과 다른 점

전처리·거울은 TM 과 같게 맞췄고, 아래 둘만 다르다.

| | Teachable Machine | Teach Lab |
|---|---|---|
| 임베더 | MobileNet v2 (tfjs), 1280차원, 입력 [-1,1] | MediaPipe MobileNetV3-Small, 1024차원, l2 정규화 |
| 헤드 | Dense(denseUnits, relu) → Dense(N, softmax, useBias=false) | Dense(64, relu) → Dropout(0.2) → Dense(N, softmax) |

임베더는 CLAUDE.md 가 정한 것이다 (sense-lab 과 같은 MediaPipe 스택).

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

**기본 설치를 가볍게 유지할 것.** 이미지 모델은 `.tflite` 를 LiteRT 로 직접
돌린다 (`teachlab/embedder.py`). MediaPipe 를 쓰지 않는 이유는 무게다.

| | 받는 것 | 대략 |
|---|---|---|
| 기본 (이미지) | numpy · Pillow · ai-edge-litert | 110MB |
| `[landmark]` `[sound]` | + mediapipe (opencv-contrib·matplotlib 동반) | 800MB |

- MediaPipe ImageEmbedder 가 이 모델에 쓰는 정규화는 `x / 255` 다.
  LiteRT 로 같은 값을 넣으면 임베딩이 **완전히 같다** (코사인 1.000000).
  바꾸기 전에 반드시 다시 재 볼 것.
- 축소 보간은 numpy 로 직접 짠 쌍선형(`preprocess.resize_bilinear`)을 쓴다.
  브라우저 캔버스의 기본 축소와 같은 격자라 OpenCV·Pillow 없이도 맞는다.
- `mediapipe` 는 `libEGL`·`libGLESv2` 를 dlopen 한다. 헤드리스 리눅스에서
  `[landmark]`/`[sound]` 를 쓰려면 `libegl1 libgles2 libglx0` 가 필요하다.
- TensorFlow 는 설치하지 않는다 (LiteRT 는 TFLite 런타임만 담고 있다).

배포는 `python/` 에서 빌드해 PyPI 에 올립니다 (패키지명 `teachlab`).

## 배포 (자매 서비스와 동일)

- `main` 에 작업 → GitHub Pages 테스트 → 통과하면 `release` 브랜치 머지 → Cloudflare 자동 배포
- Cloudflare 는 Workers 방식: `wrangler.toml` + `.assetsignore` (잠금 없음 — 자산만 서빙)
- 배포 명령: `npx wrangler deploy`
- 캐시 버스팅: 코드 파일만 `?v=N`. 모델·wasm 파일에는 붙이지 않습니다
- 모든 자산 경로는 상대경로 — 하위 경로(`/teach-lab/`) 서빙에서도 동작합니다

## 오프라인 exe (자매 서비스와 동일)

`v*` 태그를 푸시하면 GitHub Actions 가 사이트 전체를 담은 단일
`TeachLab.exe` 를 빌드해 Release 에 첨부합니다 (인터넷 없이 동작).

```bash
git tag v0.1.0 && git push origin v0.1.0
```

- 구성: `.github/workflows/build-exe.yml` + `tools/portable/` (Go embed 서버)
- 서버는 `.wasm`/`.task`/`.tflite`/`.mjs` MIME 을 명시 등록합니다
- Actions 탭에서 workflow_dispatch 로 수동 빌드도 가능합니다
- 사이트가 약 66MB 라 exe 는 약 75MB 가 됩니다 (모델·wasm 이 대부분)

## 파이썬 패키지 배포

```bash
cd python
python -m build          # dist/teachlab-<ver>-py3-none-any.whl + .tar.gz
python -m twine check dist/*
python -m twine upload dist/*     # PyPI 토큰 필요
```

버전은 `pyproject.toml` 과 `teachlab/__init__.py` 두 곳에 있습니다.
내보낸 zip 의 `requirements.txt` 가 `teachlab>=<ver>` 를 가리키므로
`lib/pyexport.js` 의 버전도 같이 올려야 합니다.

## 화면 캡처 (docs/manual)

설명서 그림은 실제 웹캠 없이 만듭니다. 가짜 카메라에 합성 장면(Y4M)을
넣고 Playwright 로 찍은 뒤, 번호 배지를 그려 넣습니다.
장면과 번호 위치를 바꾸려면 캡처 스크립트를 다시 돌리세요.
