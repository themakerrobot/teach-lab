// ═══════════════════════════════════════════════════════════
// 파이썬으로 내보내기 — 모델 + 바로 도는 실행 코드
// ═══════════════════════════════════════════════════════════
// 받은 zip 을 풀고 `pip install teachlab` 한 뒤 `python predict.py 사진.jpg` 로
// 바로 돌아간다. 임베더(.tflite)까지 같이 담으므로 인터넷 없이도 동작한다.
//
//   model/mobilenet_v3_small_embedder.tflite   임베더 (약 4MB)
//   model/classifier.json · classifier.bin     내가 가르친 분류기
//   model/labels.txt · project.json            종류 이름 · 정보
//   predict.py · webcam.py · requirements.txt · README.md

import { download } from './project.js';

const PY_PREDICT = `# -*- coding: utf-8 -*-
"""사진 한 장을 분류합니다.  사용법:  python predict.py 사진.jpg"""
import sys
from pathlib import Path

from teachlab import ImageClassifier

HERE = Path(__file__).resolve().parent


def main():
    if len(sys.argv) < 2:
        print("사용법: python predict.py 사진.jpg [사진2.jpg ...]")
        return 1

    with ImageClassifier(HERE / "model") as clf:
        for path in sys.argv[1:]:
            result = clf.predict_file(path)
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

from teachlab import ImageClassifier

HERE = Path(__file__).resolve().parent
THRESHOLD = 0.6      # 이 값보다 덜 확실하면 "모르겠어요"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    show = "--no-window" not in sys.argv
    cam_index = int(args[0]) if args else 0

    with ImageClassifier(HERE / "model") as clf:
        cap = cv2.VideoCapture(cam_index)
        if not cap.isOpened():
            print(f"카메라 {cam_index} 를 열지 못했어요.")
            return 1
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                # 학습할 때 웹캠이 거울이었으므로 같은 방향으로 맞춰 줍니다
                result = clf.predict_webcam(frame)
                label = result.label if result.score >= THRESHOLD else "모르겠어요"
                text = f"{label} {result.score * 100:.0f}%"
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

function readme(rec) {
  const classes = rec.classes.map(c => '- ' + c).join('\n');
  return `# ${rec.name} — Teach Lab 파이썬 내보내기

Teach Lab 에서 가르친 이미지 분류 모델입니다. 인터넷 없이 이 폴더 안에서 돕니다.

## 종류

${classes}

맞힌 비율(학습할 때): ${Math.round((rec.accuracy || 0) * 100)}%

## 설치

\`\`\`bash
pip install teachlab
\`\`\`

\`teachlab\` 은 임베딩 계산에 \`mediapipe\`, 배열 계산에 \`numpy\` 를 씁니다.
\`webcam.py\` 를 쓰려면 \`opencv-python\` 도 필요합니다.

## 실행

\`\`\`bash
python predict.py 사진.jpg        # 사진 한 장 분류
python webcam.py                  # 웹캠으로 실시간 분류
\`\`\`

라즈베리파이처럼 화면이 없는 곳에서는:

\`\`\`bash
python webcam.py --no-window
\`\`\`

## 내 코드에 넣기

\`\`\`python
from teachlab import ImageClassifier

clf = ImageClassifier("model")

result = clf.predict_file("사진.jpg")   # 사진 파일 — 그대로
print(result.label, result.score)
print(result.probs)                     # {종류이름: 확률}

result = clf.predict_webcam(frame)      # 웹캠 프레임 — 거울을 알아서 맞춤
\`\`\`

## 거울(좌우 반전)

Teach Lab 은 Teachable Machine 과 같이 **웹캠 화면을 거울로 두고 학습**합니다.
그래서 웹캠 프레임은 같은 방향으로 뒤집어야 맞습니다 — \`predict_webcam\` 이
\`model/project.json\` 의 \`embedder.mirror\` 를 보고 알아서 해 줍니다.
사진 파일은 뒤집지 않습니다.

로봇 카메라처럼 **거울이 아닌 화면**에 쓸 때는 \`clf.predict(frame)\` 으로
뒤집지 않고 넣으세요. 좌우가 다른 것(글자·화살표)을 맞힐 때 차이가 납니다.

## 폴더 안에 무엇이 있나요

| 파일 | 쓰임 |
|---|---|
| \`model/mobilenet_v3_small_embedder.tflite\` | 사진을 1024개의 숫자로 바꾸는 임베더 |
| \`model/classifier.json\` · \`classifier.bin\` | 내가 가르친 분류기 (구조 · 가중치) |
| \`model/labels.txt\` | 종류 이름 (한 줄에 하나) |
| \`model/project.json\` | 임베더 설정 · 정확도 등 |

브라우저와 같은 답이 나오도록, 사진은 Teachable Machine 과 같은 순서로
**짧은 변을 224 에 맞춰 줄이고 → 가운데 224×224 를 잘라서** 임베더에 넣습니다.
\`teachlab\` 이 알아서 해 줍니다.
`;
}

// rec: Store 에 저장한 프로젝트 레코드
export async function exportPython(rec) {
  const zip = new JSZip();
  const model = zip.folder('model');

  model.file('classifier.json', JSON.stringify(rec.classifier.json, null, 2));
  model.file('classifier.bin', rec.classifier.bin);
  model.file('labels.txt', rec.classes.join('\n') + '\n');
  model.file('project.json', JSON.stringify({
    name: rec.name,
    kind: rec.kind || 'image',
    classes: rec.classes,
    sampleCounts: rec.sampleCounts,
    accuracy: rec.accuracy,
    embedder: rec.embedder,
    trainedAt: rec.createdAt,
  }, null, 2));

  // 임베더 파일은 같은 사이트에서 가져와 그대로 담는다 (오프라인 실행용)
  const res = await fetch(rec.embedder.path || ('./models/' + rec.embedder.file));
  if (!res.ok) throw new Error('embedder fetch failed: ' + res.status);
  model.file(rec.embedder.file, await res.arrayBuffer());

  zip.file('predict.py', PY_PREDICT);
  zip.file('webcam.py', PY_WEBCAM);
  zip.file('requirements.txt', 'teachlab>=0.1.0\nopencv-python>=4.8\n');
  zip.file('README.md', readme(rec));

  const blob = await zip.generateAsync({ type: 'blob' });
  download(blob, rec.name + '-python.zip');
}
