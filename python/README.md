# teachlab

Teach Lab 에서 가르친 모델을 파이썬에서 그대로 실행합니다.
브라우저와 같은 모델·같은 전처리를 쓰므로 같은 답이 나옵니다.

**전부 기기 안에서 돕니다.** 클라우드 API 를 부르지 않고, 인터넷도 필요 없습니다.
TensorFlow 는 설치하지 않습니다.

## 설치

```bash
pip install teachlab                 # 이미지 모델 — 가볍습니다
```

기본 설치는 `numpy` · `Pillow` · `ai-edge-litert` 뿐입니다 (약 110MB).
이미지 모델은 `.tflite` 를 LiteRT 로 직접 돌리므로 MediaPipe 가 필요 없습니다.

손 · 얼굴 · 포즈 · 소리 모델은 MediaPipe 가 있어야 합니다 (약 +700MB).

```bash
pip install "teachlab[landmark]"     # 손 · 얼굴 · 포즈
pip install "teachlab[sound]"        # 소리
pip install "teachlab[webcam]"       # webcam.py (OpenCV)
pip install "teachlab[mic]"          # listen.py (sounddevice)
pip install "teachlab[all]"          # 전부
```

| 소스 | 필요한 것 | 대략 용량 |
|---|---|---|
| 이미지 | numpy · Pillow · LiteRT | 110MB |
| 손 · 얼굴 · 포즈 · 소리 | + MediaPipe | 800MB |

## 모델 준비

Teach Lab 보관함에서 **파이썬으로 내보내기** 를 누르면 zip 을 받습니다.
압축을 풀면 이런 모양입니다.

```
model/
  <특징 모델>.tflite 또는 .task     사진·손·얼굴·포즈·소리 → 숫자
  classifier.json · classifier.bin  내가 가르친 분류기
  labels.txt · project.json
predict.py  webcam.py 또는 listen.py  requirements.txt  README.md
```

## 쓰기

```python
from teachlab import Model

m = Model("model")
print(m.source)                       # image / hand / face / pose / sound

result = m.predict_file("사진.jpg")   # 이미지 · 손 · 얼굴 · 포즈
print(result.label, result.score)     # 사과 0.97
print(result.probs)                   # {'사과': 0.97, '바나나': 0.02, ...}
print(result.ranked())                # [('사과', 0.97), ...]
```

아무것도 안 보이면(손이 화면에 없을 때 등) `None` 이 돌아옵니다.

소리 모델은 이렇게 씁니다.

```python
m = Model("model")                    # source == 'sound'
print(m.predict_wav("소리.wav"))       # wav 파일 (표준 라이브러리로 읽습니다)
print(m.predict_audio(samples, 16000))  # 모노 float32 한 토막 (0.975초 = 15600샘플이면 딱 맞아요. 길면 뒤에서 한 창만 씁니다)
```

OpenCV 프레임(BGR ndarray)을 그대로 넣어도 됩니다.

```python
import cv2

cap = cv2.VideoCapture(0)
ok, frame = cap.read()
print(m.predict_webcam(frame))        # 웹캠 — BGR, 학습할 때와 같은 방향
print(m.predict(rgb_array, bgr=False))
```

zip 파일을 그대로 열 수도 있습니다.

```python
m = Model("과일맞히기-python.zip")
```

`.teachlab.zip`(프로젝트 파일)에는 특징 모델이 들어 있지 않으므로 경로를 알려 줍니다.

```python
m = Model("과일맞히기.teachlab.zip",
          extractor="mobilenet_v3_small_embedder.tflite")
```

## 거울(좌우 반전)

소스마다 규칙이 다릅니다. 일부러 그렇습니다.

| 소스 | 웹캠 프레임 | 왜 |
|---|---|---|
| 이미지 | **뒤집습니다** | Teachable Machine 처럼 거울 화면으로 배웠기 때문 |
| 손 · 얼굴 · 포즈 | 안 뒤집습니다 | 뒤집으면 MediaPipe 의 왼손/오른손 판별이 반대가 됨 |

`predict_webcam(frame)` 이 `model/project.json` 의 `embedder.mirror` 를 보고
알아서 맞춰 줍니다. 사진 파일은 어느 소스든 뒤집지 않습니다.
로봇 카메라처럼 거울이 아닌 화면에 쓸 때는 `m.predict(frame)` 을 쓰세요.

## 명령줄

```bash
teachlab info    model                      # 소스 · 종류 · 정확도
teachlab predict model 사진.jpg -v
teachlab predict model 소리.wav -v          # 소리 모델
teachlab webcam  model --threshold 0.7
teachlab webcam  model --no-window          # 화면 없는 곳에서
teachlab listen  model                      # 소리 모델 · 마이크
```

## 왜 답이 같나요

브라우저와 파이썬이 **같은 순서**로 처리하기 때문입니다.
이미지 전처리는 Teachable Machine 의 `cropTo`
(`@teachablemachine/image`, `src/utils/canvas.ts`) 를 그대로 옮긴 것입니다.

1. 짧은 변이 224 가 되도록 전체를 줄인다 (찌그러뜨리지 않는다)
2. 가운데 224×224 만 남긴다
3. 웹캠 프레임이면 좌우를 뒤집는다 (사진 파일은 안 뒤집는다)
4. `x / 255` 로 0~1 로 만들어 임베더에 넣고, 나온 1024개를 L2 정규화한다
5. Dense(64, relu) → Dense(N, softmax) 를 numpy 로 계산한다

같은 사진에서 나온 임베딩을 재어 보면 브라우저와 코사인 유사도 **0.99 언저리**,
확률은 1~2%p 안에서 다릅니다. 답(가장 높은 종류)이 바뀔 정도는 아닙니다.
차이는 줄일 때의 보간에서만 생깁니다 — 임베더에 같은 224×224 를 넣으면
유사도가 **1.000000** 으로 완전히 같습니다.

손 · 얼굴 · 포즈는 브라우저와 같은 MediaPipe 모델에서 좌표를 뽑고,
`lib/features.js` 와 같은 식으로 정규화합니다 (손목 원점 · 어깨 너비 스케일 등).

## 라이선스

MIT
