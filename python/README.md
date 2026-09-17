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
print(clf.predict(frame))             # BGR 로 봅니다
print(clf.predict(rgb_array, bgr=False))
```

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
teachlab info    model
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
    r = clf.predict(frame)
    if r.score >= 0.6:
        print(r.label)
```

## 왜 답이 같나요

브라우저와 파이썬이 **같은 순서**로 처리하기 때문입니다.

1. 가운데를 정사각형으로 자른다 (찌그러뜨리지 않는다)
2. 224×224 로 줄인다
3. MediaPipe ImageEmbedder(`l2_normalize=True`)로 1024개 숫자를 뽑는다
4. Dense(64, relu) → Dense(N, softmax) 를 numpy 로 계산한다

브라우저 캔버스와 OpenCV 의 축소 보간이 완전히 같지는 않습니다. 실제로 재어 보면
임베딩의 코사인 유사도가 **0.99 언저리**, 확률은 1~2%p 안에서 다릅니다.
답(가장 높은 종류)이 바뀔 정도는 아닙니다.

## 라이선스

MIT
