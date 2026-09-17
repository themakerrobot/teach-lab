# teachlab

Teach Lab 에서 가르친 이미지 분류
모델을 파이썬에서 그대로 실행합니다. 브라우저와 같은 임베더(MediaPipe
MobileNetV3-Small)와 같은 전처리를 쓰므로, 같은 사진에 같은 답이 나옵니다.

**전부 기기 안에서 돕니다.** 클라우드 API 를 부르지 않고, 인터넷도 필요 없습니다.

## 설치

```bash
pip install teachlab
```

웹캠으로 돌리려면 OpenCV 도 필요합니다.

```bash
pip install "teachlab[webcam]"
```

## 모델 준비

Teach Lab 보관함에서 **파이썬으로 내보내기** 를 누르면 zip 을 받습니다.
압축을 풀면 이런 모양입니다.

```
model/
  mobilenet_v3_small_embedder.tflite   사진 → 숫자 1024개
  classifier.json · classifier.bin     내가 가르친 분류기
  labels.txt · project.json
predict.py  webcam.py  requirements.txt  README.md
```

## 쓰기

```python
from teachlab import ImageClassifier

clf = ImageClassifier("model")

result = clf.predict_file("사진.jpg")
print(result.label, result.score)     # 사과 0.97
print(result.probs)                   # {'사과': 0.97, '바나나': 0.02, ...}
print(result.ranked())                # [('사과', 0.97), ...]
```

OpenCV 프레임(BGR ndarray)을 그대로 넣어도 됩니다.

```python
import cv2

cap = cv2.VideoCapture(0)
ok, frame = cap.read()
print(clf.predict_webcam(frame))      # 웹캠 — BGR, 거울 자동
print(clf.predict(frame))             # 거울 없이 그대로
print(clf.predict(rgb_array, bgr=False))
```

## 거울(좌우 반전)

Teach Lab 은 Teachable Machine 과 같이 **웹캠 화면을 거울로 두고 학습**합니다
(TM 의 `Webcam(w, h, flip=true)`). 그래서 웹캠 프레임은 같은 방향으로 뒤집어야
맞습니다.

| 입력 | 쓸 메서드 | 거울 |
|---|---|---|
| 웹캠(노트북·USB 카메라) | `predict_webcam(frame)` | `project.json` 의 `embedder.mirror` 를 따름 |
| 사진 파일 | `predict_file(path)` / `predict(img)` | 안 걸음 |
| 로봇 카메라처럼 거울이 아닌 화면 | `predict(frame)` | 안 걸음 |

좌우가 다른 것(글자·화살표·한쪽으로 기울인 물건)을 맞힐 때 차이가 납니다.

zip 파일을 그대로 열 수도 있습니다.

```python
clf = ImageClassifier("과일맞히기-python.zip")
```

`.teachlab.zip`(프로젝트 파일)에는 임베더가 들어 있지 않으므로 경로를 알려 줍니다.

```python
clf = ImageClassifier("과일맞히기.teachlab.zip",
                      embedder="mobilenet_v3_small_embedder.tflite")
```

## 명령줄

```bash
teachlab info    model                      # 종류·정확도·웹캠 거울 여부
teachlab predict model 사진.jpg -v
teachlab webcam  model --threshold 0.7
teachlab webcam  model --no-window          # 화면 없는 라즈베리파이에서
```

## 라즈베리파이 / Pibo

64-bit Raspberry Pi OS(aarch64) 에서 `pip install teachlab` 로 그대로 설치됩니다.
CPU 만으로 한 장에 수십 ms 걸립니다. 카메라는 OpenCV 로 열어 프레임을 넘기세요.

```python
import cv2
from teachlab import ImageClassifier

clf = ImageClassifier("model")
cap = cv2.VideoCapture(0)
while True:
    ok, frame = cap.read()
    if not ok:
        break
    r = clf.predict_webcam(frame)
    if r.score >= 0.6:
        print(r.label)
```

파이보처럼 **거울이 아닌 카메라**에 올릴 때는 `clf.predict(frame)` 을 쓰세요.

## 왜 답이 같나요

브라우저와 파이썬이 **같은 순서**로 처리하기 때문입니다.
순서는 Teachable Machine 의 `cropTo` (`@teachablemachine/image`,
`src/utils/canvas.ts`) 를 그대로 옮긴 것입니다.

1. 짧은 변이 224 가 되도록 전체를 줄인다 (찌그러뜨리지 않는다)
2. 가운데 224×224 만 남긴다
3. 웹캠 프레임이면 좌우를 뒤집는다 (사진 파일은 안 뒤집는다)
4. MediaPipe ImageEmbedder(`l2_normalize=True`)로 1024개 숫자를 뽑는다
5. Dense(64, relu) → Dense(N, softmax) 를 numpy 로 계산한다

브라우저 캔버스와 OpenCV 의 축소 보간이 완전히 같지는 않습니다. 실제로 재어 보면
임베딩의 코사인 유사도가 **0.99 언저리**, 확률은 1~2%p 안에서 다릅니다.
답(가장 높은 종류)이 바뀔 정도는 아닙니다.

## 라이선스

MIT
