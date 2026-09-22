# 개발·배포 안내 (for developers)

사용자용 소개는 [README.md](./README.md)를 보세요. 이 문서는 개발·운영 전용입니다.

## 원칙

- 백엔드 없음 — 전부 정적 파일. 외부 CDN 금지, 라이브러리·모델 전부 셀프호스팅
- 최초 로드 후 오프라인 동작
- 코드에 계정명·절대 URL 하드코딩 금지 (조직 이전 대비, 전부 상대경로).
  예외는 README 의 사이트 링크·배지뿐이다 — 이전할 때 그곳만 고친다
- 디자인은 자매 서비스(Sense Lab · 파이보 랩)와 동일 — 공용 규격은 [design/](./design/) 참고.
  `css/maker-ui.css` 는 `design/maker-ui.css` 를 그대로 복사한 것이다. **직접 고치지 말 것.**
  이 서비스 전용 스타일만 `css/app.css` 에 얹는다.

## 지금 범위

다섯 소스(이미지 · 손 · 얼굴 · 포즈 · 소리)가 전부 end-to-end 로 돈다
(수집 → 학습 → 추론 → 프로젝트/파이썬 내보내기 → 파이썬 실행).
소스마다 다른 것은 `lib/sources.js` 의 스펙과 "숫자로 바꾸는" 모듈
(`embedder.js` · `landmarker.js`+`features.js` · `sound.js`)뿐이고,
수집·학습·저장·시험은 한 길을 같이 쓴다. 소스를 더할 때도 그 자리에만 끼운다.

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
  theme.js           강조색 읽기 (캔버스에 그릴 때 CSS 변수 값을 쓴다)
  tour.js            첫 방문 튜토리얼 (캐릭터 안내)
  sources.js         소스 5종 정의 · 갈래 · 차원 · 추출기 스펙 · 소리 특징 다듬기
  embedder.js        MediaPipe ImageEmbedder 로드 + cropTo 전처리 (GPU 실패 시 CPU 폴백)
  landmarker.js      Hand/Face/Pose Landmarker 로드 + 화면에 그리기
  features.js        랜드마크 → 특징 벡터 (sense-lab 과 같은 정규화)
  sound.js           마이크 + YAMNet (MediaPipe Tasks Audio)
  trainer.js         TF.js 분류기 학습 (Dense64-Dropout-Softmax, webgl→cpu)
  classifier.js      저장 형식 + 추론 (TF.js 없이 도는 순수 JS)
  project.js         IndexedDB 저장 + .teachlab.zip 내보내기/불러오기
  pyexport.js        파이썬 내보내기 zip 만들기
  teachlab_src.js    python/teachlab 소스를 문자열로 심은 것 (tools/gen-teachlab-src.mjs 가 만든다)
  learn.js / exam.js / storage_page.js   페이지 로직
  jszip.min.js
vendor/
  tasks-vision/      @mediapipe/tasks-vision wasm + vision_bundle.mjs
  tasks-audio/       @mediapipe/tasks-audio wasm + audio_bundle.mjs
  tfjs/              @tensorflow/tfjs tf.min.js
models/              mobilenet_v3_small_embedder.tflite · hand/face/pose *.task · yamnet.tflite
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

### 소리: 창 길이를 반드시 15600 샘플로

YAMNet 한 창은 **15600 샘플(0.975초)** 이다. 1초(16000)를 통째로 넣으면
MediaPipe 가 창을 둘로 쪼개는데, 둘째 창은 400샘플만 진짜이고 나머지는 0으로
채운 꼬리라 **늘 "Silence" 가 1등**으로 나온다. 거기에 더해 예전 코드는
`results[results.length - 1]` 로 **그 꼬리 창을 골라 썼다.**

```
1초(16000) 를 넣었을 때
  창0 (ts=0)    Sine wave 0.891   ← 진짜 내용
  창1 (ts=975)  Silence 0.801     ← 0으로 채운 꼬리
```

그래서 링 버퍼를 `0.975 × ctx.sampleRate` 로 잡고 `results[0]` 을 쓴다
(`lib/sound.js`). 파이썬도 같다 (`teachlab/audio.py` 의 `WINDOW_SAMPLES`).
합성 소리로 재어 보면 이 하나로 4종 분류가 70% → 99.7% 로 올라간다.

### 소리: 점수를 그대로 넣지 않는다

YAMNet 점수는 sigmoid 출력이라 521칸 중 60칸 남짓만 0이 아니고 값도 작다.
제곱근으로 펴고 L2 로 크기를 맞춘다 (`applySoundTransform`, `sqrt-l2`).
비슷한 소리 4종·종류당 12개·잡음 있는 조건에서 80.0% → 89.4%
(최악의 경우 40% → 73%).

옛 모델은 날것으로 배웠으므로 `project.json` 의 `embedder.featureTransform`
에 어느 쪽인지 적는다. 값이 없으면 `raw` 로 본다. 시험실은 고른 모델이 배운
방식을 따르고, "이어서 배우기" 는 옛 예시를 새 방식으로 변환해 둔다.

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

## 버전·태그·릴리스

번호가 두 줄이다. 섞지 않는다.

| 무엇 | 태그 | 번호가 사는 곳 | 올리는 곳 |
|---|---|---|---|
| 웹앱 (사이트 · `TeachLab.exe`) | `v0.1.1` | 태그 · Release · `CHANGELOG.md` | GitHub Release |
| 파이썬 `teachlab` | `py-v0.4.0` | `python/pyproject.toml` · `python/teachlab/__init__.py` · `CHANGELOG.md` | PyPI |

- 사이트는 `release` 브랜치가 곧 배포라 태그가 없어도 늘 최신이다. `v*` 태그는
  "이 시점의 exe 와 릴리스 노트"를 남기는 표시다. **사용자에게 보이는 변화가 쌓이면** 하나 끊는다.
- 파이썬은 PyPI 에 같은 번호를 두 번 올릴 수 없다. 올리기 전에 반드시 번호를 올린다.
- `MAJOR.MINOR.PATCH`: 고치기만 했으면 PATCH, 기능이 늘었으면 MINOR, 저장 형식·API 가 깨지면 MAJOR.
  파이썬은 `project.json` 을 읽는 쪽이라 **저장 형식이 바뀌면 둘 다 올린다.**

### 웹앱 릴리스 절차

1. `CHANGELOG.md` 의 "아직 안 올린 것" 을 새 `vX.Y.Z — 날짜` 로 바꾸고 커밋
2. `main` 푸시 → CI 초록 확인 → `release` 에 같은 커밋 푸시 (Cloudflare 자동 배포)
3. exe + Release: 둘 중 하나
   - `git tag vX.Y.Z && git push origin vX.Y.Z` (태그 푸시가 막힌 환경도 있다)
   - Actions → **Build TeachLab.exe** → Run workflow → `tag` 에 `vX.Y.Z` 입력.
     태그가 없으면 릴리스 액션이 만들어 준다
4. Release 본문은 워크플로가 `CHANGELOG.md` 의 `### vX.Y.Z` 절을 잘라 넣는다. 그래서 1번을 빼먹으면 본문이 빈다

### 파이썬 릴리스 절차

1. `python/pyproject.toml` 과 `python/teachlab/__init__.py` 의 버전을 같이 올린다
2. `node tools/gen-teachlab-src.mjs` 로 `lib/teachlab_src.js` 를 다시 만든다 (CI 가 검사한다)
3. `CHANGELOG.md` 파이썬 절에 적고 커밋 · `main` 푸시
4. Actions → **Publish teachlab to PyPI** → Run workflow (target `pypi`) 또는 `py-vX.Y.Z` 태그 푸시.
   자세한 것은 아래 "파이썬 패키지 배포 (PyPI)"

### 오프라인 exe (자매 서비스와 동일)

`v*` 태그(또는 workflow_dispatch 의 `tag` 입력)로 GitHub Actions 가 사이트 전체를 담은 단일
`TeachLab.exe` 를 빌드해 Release 에 첨부한다 (인터넷 없이 동작).

- 구성: `.github/workflows/build-exe.yml` + `tools/portable/` (Go embed 서버)
- 서버는 `.wasm`/`.task`/`.tflite`/`.mjs` MIME 을 명시 등록한다
- 사이트가 약 66MB 라 exe 는 약 75MB 가 된다 (모델·wasm 이 대부분)

## 저장소 About (GitHub)

저장소 첫 화면 오른쪽 **About** 은 코드가 아니라 저장소 설정이다 (관리자 권한 · 톱니 아이콘).
아래로 맞춰 둔다. 바꾸면 여기도 같이 고친다.

**Description** (그대로 붙여 넣기)

```
웹캠·마이크로 보여 준 것을 브라우저 안에서 바로 가르치는 어린이용 Teachable Machine — 이미지·손·얼굴·포즈·소리, 파이썬 내보내기
```

**Website**: 배포 주소 (GitHub Pages 또는 Cloudflare)

**Topics** (쉼표로 나뉘어 있어 한 번에 붙여 넣으면 된다)

```
teachable-machine, machine-learning, mediapipe, tensorflowjs, image-classification, hand-tracking, pose-estimation, audio-classification, education, kids, on-device, browser, pwa, korean, pibo
```

**Releases** · **Packages** 표시는 켜 두고, Deployments 는 꺼도 된다.

## 내보낸 zip 이 PyPI 없이 도는 이유

`파이썬으로 내보내기` 는 `python/teachlab/*.py` 를 그대로 받아 zip 안에
`teachlab/` 폴더로 넣는다 (약 60KB). PyPI 에 올라가 있지 않아도, 교실 PC 에서
인터넷이 막혀 있어도 `pip install -r requirements.txt` 한 줄이면 돌아간다.

소스는 `lib/teachlab_src.js` 에 문자열로 **심어 둔다**. 사이트에서 받아 오지
않으므로 배포에서 `python/` 을 빼도 안전하다.

> 한때 `fetch('./python/teachlab/*.py')` 로 받아 오게 했다가, 배포 쪽에서
> `python/` 을 빼는 순간 404 로 조용히 깨졌다. 배포 설정에 기대지 말 것.

**파이썬을 고쳤으면 반드시 다시 만든다.**

```bash
node tools/gen-teachlab-src.mjs          # 다시 만들기
node tools/gen-teachlab-src.mjs --check  # 최신인지 확인 (CI 가 이걸 돌린다)
```

안 하면 내보낸 zip 이 옛날 코드를 담는다. `.github/workflows/ci.yml` 이
푸시마다 확인하므로 잊으면 빨간불이 뜬다.

- **모델 파일 경로를 C++ 런타임에 문자열로 넘기지 말 것.**
  `teachlab/modelfile.py` 의 `read_model()` 로 읽어 바이트를 넘긴다.
  윈도우에서 `C:\Users\...\바탕 화면\...` 같은 한글 경로를 넘기면
  "Could not open ... The model allocation is null/empty" 로 죽는다.
  LiteRT 는 `model_content=`, MediaPipe 는 `model_asset_buffer=` 를 쓴다.
- `requirements.txt` 에는 소스별로 실제 필요한 것만 적는다 (`REQUIREMENTS`).
  이미지는 LiteRT, 나머지는 MediaPipe.

## 파이썬 패키지 배포 (PyPI)

GitHub Actions 로 올립니다 — **토큰을 레포에 두지 않습니다.**
PyPI 의 Trusted Publishing(OIDC)을 쓰기 때문에, PyPI 쪽에 "이 레포의 이
워크플로" 를 한 번만 등록해 두면 그 뒤로는 자격증명이 오가지 않습니다.

### 처음 한 번만 (pypi.org 에서)

1. <https://pypi.org/manage/account/publishing/> → **Add a new pending publisher**
2. 아래 그대로 입력

   | 칸 | 값 |
   |---|---|
   | PyPI Project Name | `teachlab` |
   | Owner | `themakerrobot` |
   | Repository name | `teach-lab` |
   | Workflow name | `publish-pypi.yml` |
   | Environment name | `pypi` |

3. TestPyPI 로 먼저 연습하려면 <https://test.pypi.org/manage/account/publishing/>
   에 같은 내용으로 하나 더 등록하고 Environment 는 `testpypi` 로 둡니다.

### 올리기

```bash
# 1. 버전 올리기 — 두 곳을 같이 고친다
#    python/pyproject.toml  ·  python/teachlab/__init__.py
# 2. 커밋·푸시한 뒤
git tag py-v0.3.0 && git push origin py-v0.3.0
```

Actions 탭에서 **Run workflow** 로 수동 실행도 됩니다 (`testpypi` / `pypi` 선택).
exe 빌드는 `v*` 태그, 파이썬 패키지는 `py-v*` 태그로 갈라 두었습니다.

같은 버전 번호는 PyPI 에 두 번 올릴 수 없습니다. 올리기 전에 버전을 올릴 것.

### 로컬에서 빌드만

```bash
cd python
python -m build          # dist/teachlab-<ver>-py3-none-any.whl + .tar.gz
python -m twine check dist/*
```

내보낸 zip 은 `teachlab/` 소스를 품고 있어서 PyPI 배포와 무관하게 돌아갑니다
(바로 위 절 참고). PyPI 배포는 `pip install teachlab` 로 쓰고 싶은 사람을 위한 것입니다.

## 화면 캡처 (docs/manual · docs/img)

설명서 그림(`docs/manual`, 번호 배지 있음)과 README 그림(`docs/img`, 깨끗한 화면)은
실제 웹캠 없이 만든다. 가짜 카메라에 합성 장면(Y4M)을 넣고 Playwright 로 찍는다.
스크립트는 `tools/shots/` 에 있고, 장면 파일은 크기 때문에 저장소에 넣지 않는다 —
`tools/shots/README.md` 대로 `tools/shots/scene/` 을 만들고 돌린다.
