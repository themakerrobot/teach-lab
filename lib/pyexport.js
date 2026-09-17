// ═══════════════════════════════════════════════════════════
// 파이썬으로 내보내기 — 모델 + 바로 도는 실행 코드
// ═══════════════════════════════════════════════════════════
// 받은 zip 을 풀고 `pip install -r requirements.txt` 한 뒤
// `python predict.py 사진.jpg` (소리 모델이면 `소리.wav`) 로 바로 돌아간다.
//
// teachlab 패키지 소스를 zip 안에 그대로 담는다. PyPI 에 올라가 있지 않아도
// 돌아가야 하고, 교실 PC 에서 한 번에 끝나야 하기 때문이다 (전부 합쳐 약 60KB).
// 특징 뽑는 모델(.tflite/.task)도 같이 담으므로 모델은 인터넷 없이 돈다.
//
//   teachlab/                     실행 라이브러리 (lib/teachlab_src.js 에 심어 둔 것)
//   model/<특징 모델>            임베더 또는 랜드마커
//   model/classifier.json · .bin  내가 가르친 분류기
//   model/labels.txt · project.json
//   predict.py · (webcam.py | listen.py) · requirements.txt · README.md

import { download } from './project.js';
import { TEACHLAB_SRC } from './teachlab_src.js';

const SOURCE_KO = { image: '이미지', hand: '손', face: '얼굴', pose: '포즈', sound: '소리' };

// 소스마다 실제로 필요한 것만 적는다 (teachlab 은 zip 안에 들어 있으므로 빼고).
//   이미지  : LiteRT 로 .tflite 를 직접 돌린다 — MediaPipe 가 필요 없다
//   손·얼굴·포즈·소리 : MediaPipe 가 있어야 한다
const REQUIREMENTS = {
  image: ['numpy>=1.21', 'pillow>=9', 'ai-edge-litert>=1.0', 'opencv-python>=4.8'],
  landmark: ['numpy>=1.21', 'pillow>=9', 'mediapipe>=0.10.9', 'opencv-python>=4.8'],
  sound: ['numpy>=1.21', 'mediapipe>=0.10.9', 'sounddevice>=0.4'],
};

const PY_PREDICT_IMAGE = `# -*- coding: utf-8 -*-
"""사진 한 장을 분류합니다.  사용법:  python predict.py 사진.jpg"""
import sys
from pathlib import Path

from teachlab import Model

HERE = Path(__file__).resolve().parent


def main():
    if len(sys.argv) < 2:
        print("사용법: python predict.py 사진.jpg [사진2.jpg ...]")
        return 1

    with Model(HERE / "model") as m:
        for path in sys.argv[1:]:
            result = m.predict_file(path)
            if result is None:
                print(f"{path}  ->  아무것도 안 보여요")
                continue
            print(f"{path}  ->  {result.label}  ({result.score * 100:.1f}%)")
            for name, score in result.ranked():
                print(f"    {name:<16} {score * 100:5.1f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;

const PY_PREDICT_SOUND = `# -*- coding: utf-8 -*-
"""소리 파일 하나를 분류합니다.  사용법:  python predict.py 소리.wav

wav 만 읽습니다 (표준 라이브러리만 씁니다). mp3 는 먼저 wav 로 바꿔 주세요.
"""
import sys
from pathlib import Path

from teachlab import Model

HERE = Path(__file__).resolve().parent


def main():
    if len(sys.argv) < 2:
        print("사용법: python predict.py 소리.wav [소리2.wav ...]")
        return 1

    with Model(HERE / "model") as m:
        for path in sys.argv[1:]:
            result = m.predict_wav(path)
            if result is None:
                print(f"{path}  ->  아무것도 안 들려요")
                continue
            print(f"{path}  ->  {result.label}  ({result.score * 100:.1f}%)")
            for name, score in result.ranked():
                print(f"    {name:<16} {score * 100:5.1f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;

const PY_WEBCAM = `# -*- coding: utf-8 -*-
"""웹캠으로 실시간 분류합니다.  사용법:  python webcam.py [카메라번호]

q 를 누르면 끝납니다. 화면 없이(헤드리스) 돌리려면 --no-window 를 붙이세요.
"""
import sys
from pathlib import Path

import cv2

from teachlab import Model

HERE = Path(__file__).resolve().parent
THRESHOLD = 0.6      # 이 값보다 덜 확실하면 "모르겠어요"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    show = "--no-window" not in sys.argv
    cam_index = int(args[0]) if args else 0

    with Model(HERE / "model") as m:
        cap = cv2.VideoCapture(cam_index)
        if not cap.isOpened():
            print(f"카메라 {cam_index} 를 열지 못했어요.")
            return 1
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                # 학습할 때와 같은 방향으로 맞춰 줍니다 (이미지 소스는 거울)
                result = m.predict_webcam(frame)
                if result is None:
                    text = "안 보여요"
                elif result.score >= THRESHOLD:
                    text = f"{result.label} {result.score * 100:.0f}%"
                else:
                    text = f"모르겠어요 {result.score * 100:.0f}%"
                if show:
                    cv2.putText(frame, text, (12, 36), cv2.FONT_HERSHEY_SIMPLEX,
                                1.0, (255, 255, 255), 2, cv2.LINE_AA)
                    cv2.imshow("teachlab", frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
                else:
                    print(text, flush=True)
        finally:
            cap.release()
            if show:
                cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;

const PY_LISTEN = `# -*- coding: utf-8 -*-
"""마이크로 실시간 분류합니다.  사용법:  python listen.py

Ctrl+C 로 멈춥니다. 브라우저와 같이 16kHz · 1초 창을 250ms 마다 밀며 듣습니다.
"""
from pathlib import Path

import numpy as np
import sounddevice as sd

from teachlab import Model

HERE = Path(__file__).resolve().parent
RATE = 16000
WINDOW = RATE          # 1초
HOP = RATE // 4        # 250ms
THRESHOLD = 0.6


def main():
    with Model(HERE / "model") as m:
        ring = np.zeros(WINDOW, dtype=np.float32)
        with sd.InputStream(samplerate=RATE, channels=1, dtype="float32",
                            blocksize=HOP) as stream:
            print("듣는 중이에요. Ctrl+C 로 멈춰요.")
            try:
                while True:
                    block, _ = stream.read(HOP)
                    ring = np.roll(ring, -HOP)
                    ring[-HOP:] = block[:, 0]
                    result = m.predict_audio(ring, RATE)
                    if result is None:
                        continue
                    if result.score >= THRESHOLD:
                        print(f"{result.label} {result.score * 100:.0f}%", flush=True)
                    else:
                        print(f"모르겠어요 {result.score * 100:.0f}%", flush=True)
            except KeyboardInterrupt:
                pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;

function readme(rec, source) {
  const classes = rec.classes.map(c => '- ' + c).join('\n');
  const isSound = source === 'sound';
  const isImage = source === 'image';
  const runner = isSound ? 'listen.py' : 'webcam.py';
  const sample = isSound ? '소리.wav' : '사진.jpg';
  // 이미지만 MediaPipe 없이 돈다 (LiteRT 로 .tflite 를 직접 돌린다)
  const weight = isImage
    ? 'numpy · Pillow · LiteRT 만 받습니다 (약 110MB). MediaPipe 는 필요 없어요.'
    : 'MediaPipe 가 함께 설치됩니다 (약 800MB). 이 소스는 MediaPipe 가 있어야 돌아가요.';

  const mirrorNote = isImage
    ? `## 거울(좌우 반전)

Teach Lab 은 Teachable Machine 과 같이 **웹캠 화면을 거울로 두고 학습**합니다.
그래서 웹캠 프레임은 같은 방향으로 뒤집어야 맞습니다 — \`predict_webcam\` 이
\`model/project.json\` 의 \`embedder.mirror\` 를 보고 알아서 해 줍니다.
사진 파일은 뒤집지 않습니다.

로봇 카메라처럼 **거울이 아닌 화면**에 쓸 때는 \`m.predict(frame)\` 으로
뒤집지 않고 넣으세요.
`
    : (isSound ? '' : `## 거울(좌우 반전)

손·얼굴·포즈는 **원본 프레임**에서 좌표를 뽑습니다 (뒤집지 않습니다).
뒤집으면 MediaPipe 의 왼손/오른손 판별이 반대가 되어 맞히지 못합니다.
\`predict_webcam\` 과 \`predict\` 가 같은 일을 합니다.
`);

  const use = isSound
    ? `result = m.predict_wav("소리.wav")            # wav 파일
result = m.predict_audio(samples, 16000)     # 모노 float32 샘플 한 토막`
    : `result = m.predict_file("사진.jpg")           # 사진 파일
result = m.predict_webcam(frame)             # 웹캠 프레임 (BGR ndarray)`;

  return `# ${rec.name} — Teach Lab 파이썬 내보내기

Teach Lab 에서 **${SOURCE_KO[source] || source}** 로 가르친 모델입니다.
인터넷 없이 이 폴더 안에서 돕니다.

## 종류

${classes}

맞힌 비율(학습할 때): ${Math.round((rec.accuracy || 0) * 100)}%

## 설치

\`\`\`bash
pip install -r requirements.txt
\`\`\`

${weight}

실행 라이브러리(\`teachlab/\`)는 이 폴더 안에 들어 있어서 따로 받지 않아도 됩니다.

## 실행

\`\`\`bash
python predict.py ${sample}        # 파일 하나 분류
python ${runner}${isSound ? '                  # 마이크로 실시간' : '                   # 웹캠으로 실시간'}
\`\`\`
${isSound ? '' : `
화면이 없는 곳(서버·SSH)에서는:

\`\`\`bash
python webcam.py --no-window
\`\`\`
`}
## 내 코드에 넣기

\`\`\`python
from teachlab import Model

m = Model("model")
print(m.source)              # ${source}
${use}
print(result.label, result.score)
print(result.probs)          # {종류이름: 확률}
\`\`\`

${mirrorNote}
## 폴더 안에 무엇이 있나요

| 파일 | 쓰임 |
|---|---|
| \`model/${rec.embedder.file}\` | ${SOURCE_KO[source] || source}(을)를 숫자 ${rec.embedder.dim}개로 바꾸는 모델 |
| \`model/classifier.json\` · \`classifier.bin\` | 내가 가르친 분류기 (구조 · 가중치) |
| \`model/labels.txt\` | 종류 이름 (한 줄에 하나) |
| \`model/project.json\` | 소스 · 정규화 방법 · 정확도 등 |
| \`teachlab/\` | 실행 라이브러리 (건드리지 않아도 돼요) |

브라우저와 같은 답이 나오도록, \`teachlab\` 이 브라우저와 **같은 순서로**
전처리합니다. 자세한 것은 프로젝트의 \`DEVELOP.md\` 를 보세요.
`;
}

// rec: Store 에 저장한 프로젝트 레코드
export async function exportPython(rec) {
  const source = rec.source || 'image';
  const zip = new JSZip();
  const model = zip.folder('model');

  model.file('classifier.json', JSON.stringify(rec.classifier.json, null, 2));
  model.file('classifier.bin', rec.classifier.bin);
  model.file('labels.txt', rec.classes.join('\n') + '\n');
  model.file('project.json', JSON.stringify({
    name: rec.name,
    kind: source,
    source,
    variant: rec.variant || null,
    classes: rec.classes,
    sampleCounts: rec.sampleCounts,
    accuracy: rec.accuracy,
    embedder: rec.embedder,
    trainedAt: rec.createdAt,
  }, null, 2));

  // 특징 뽑는 모델은 같은 사이트에서 가져와 그대로 담는다 (오프라인 실행용)
  const res = await fetch(rec.embedder.path || ('./models/' + rec.embedder.file));
  if (!res.ok) throw new Error('extractor fetch failed: ' + res.status);
  model.file(rec.embedder.file, await res.arrayBuffer());

  if (source === 'sound') {
    zip.file('predict.py', PY_PREDICT_SOUND);
    zip.file('listen.py', PY_LISTEN);
  } else {
    zip.file('predict.py', PY_PREDICT_IMAGE);
    zip.file('webcam.py', PY_WEBCAM);
  }
  const reqKey = source === 'image' ? 'image' : (source === 'sound' ? 'sound' : 'landmark');
  zip.file('requirements.txt', REQUIREMENTS[reqKey].join('\n') + '\n');

  // teachlab 라이브러리를 그대로 담는다 — pip 없이도, 인터넷 없이도 돌아간다.
  // 소스는 lib/teachlab_src.js 에 심어 두었다 (배포에서 python/ 을 빼도 안전하다).
  const pkg = zip.folder('teachlab');
  Object.entries(TEACHLAB_SRC).forEach(([name, text]) => pkg.file(name, text));
  zip.file('README.md', readme(rec, source));

  const blob = await zip.generateAsync({ type: 'blob' });
  download(blob, rec.name + '-python.zip');
}
