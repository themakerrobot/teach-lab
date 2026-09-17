# -*- coding: utf-8 -*-
"""명령줄 도구.

    teachlab info    model
    teachlab predict model 사진.jpg [...]      # 이미지·손·얼굴·포즈
    teachlab predict model 소리.wav [...]      # 소리
    teachlab webcam  model [--camera 0] [--threshold 0.6] [--no-window]
    teachlab listen  model [--seconds 10]      # 마이크 (sounddevice 필요)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .model import LANDMARK_SOURCES, SOUND_SOURCE, Model

SOURCE_KO = {
    "image": "이미지", "hand": "손", "face": "얼굴", "pose": "포즈", "sound": "소리",
}


def _cmd_info(args: argparse.Namespace) -> int:
    with Model(args.model) as m:
        project = m.project
        print(f"이름      : {project.get('name', '(없음)')}")
        print(f"무엇을 보나요 : {SOURCE_KO.get(m.source, m.source)}"
              + (f" ({m.variant})" if m.variant else ""))
        print(f"종류      : {', '.join(m.classes)}")
        counts = project.get("sampleCounts")
        if counts:
            print(f"예시      : {sum(counts)}개 {counts}")
        acc = project.get("accuracy")
        if isinstance(acc, (int, float)):
            print(f"맞힌 비율 : {acc * 100:.1f}%")
        print(f"특징 뽑기 : {Path(m.spec.get('file', '?')).name} → {m.classifier.input_dim}개 숫자")
        if m.source == "image":
            print(f"웹캠 거울 : {'켬' if m.mirror else '끔'}")
        if m.source == SOUND_SOURCE:
            print(f"소리 특징 : {m.sound_transform}")
    return 0


def _cmd_predict(args: argparse.Namespace) -> int:
    with Model(args.model) as m:
        for path in args.inputs:
            if m.source == SOUND_SOURCE:
                result = m.predict_wav(path)
            else:
                result = m.predict_file(path)
            if result is None:
                print(f"{path}  ->  아무것도 안 보여요")
                continue
            print(f"{path}  ->  {result.label}  ({result.score * 100:.1f}%)")
            if args.verbose:
                for name, score in result.ranked():
                    print(f"    {name:<16} {score * 100:5.1f}%")
    return 0


def _cmd_webcam(args: argparse.Namespace) -> int:
    try:
        import cv2
    except ImportError:
        print("웹캠을 쓰려면 opencv-python 이 필요해요:  pip install opencv-python")
        return 1

    with Model(args.model) as m:
        if m.source == SOUND_SOURCE:
            print("이 모델은 소리로 배웠어요.  teachlab listen 을 쓰세요.")
            return 1
        cap = cv2.VideoCapture(args.camera)
        if not cap.isOpened():
            print(f"카메라 {args.camera} 를 열지 못했어요.")
            return 1
        show = not args.no_window
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                result = m.predict_webcam(frame)          # BGR ndarray 를 그대로
                if result is None:
                    text = "안 보여요"
                elif result.score >= args.threshold:
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


def _cmd_listen(args: argparse.Namespace) -> int:
    try:
        import sounddevice as sd
    except ImportError:
        print("마이크를 쓰려면 sounddevice 가 필요해요:  pip install sounddevice")
        return 1
    import numpy as np

    from .audio import WINDOW_SECONDS

    rate = 16000
    window = int(round(WINDOW_SECONDS * rate))   # 브라우저와 같은 창 (0.975초)
    hop = int(rate * 0.25)

    with Model(args.model) as m:
        if m.source != SOUND_SOURCE:
            print("이 모델은 소리로 배운 게 아니에요.  teachlab webcam 을 쓰세요.")
            return 1
        ring = np.zeros(window, dtype=np.float32)
        elapsed = 0.0
        with sd.InputStream(samplerate=rate, channels=1, dtype="float32",
                            blocksize=hop) as stream:
            print("듣는 중이에요. Ctrl+C 로 멈춰요.")
            try:
                while args.seconds <= 0 or elapsed < args.seconds:
                    block, _ = stream.read(hop)
                    ring = np.roll(ring, -hop)
                    ring[-hop:] = block[:, 0]
                    elapsed += hop / rate
                    result = m.predict_audio(ring, rate)
                    if result is None:
                        continue
                    if result.score >= args.threshold:
                        print(f"{result.label} {result.score * 100:.0f}%", flush=True)
                    else:
                        print(f"모르겠어요 {result.score * 100:.0f}%", flush=True)
            except KeyboardInterrupt:
                pass
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="teachlab",
                                     description="Teach Lab 모델을 실행합니다.")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("info", help="모델 정보 보기")
    p.add_argument("model", type=Path)
    p.set_defaults(func=_cmd_info)

    p = sub.add_parser("predict", help="사진·소리 파일 분류하기")
    p.add_argument("model", type=Path)
    p.add_argument("inputs", nargs="+", help="사진(.jpg/.png) 또는 소리(.wav) 파일")
    p.add_argument("-v", "--verbose", action="store_true", help="종류별 확률까지 보기")
    p.set_defaults(func=_cmd_predict)

    p = sub.add_parser("webcam", help="웹캠으로 실시간 분류하기")
    p.add_argument("model", type=Path)
    p.add_argument("--camera", type=int, default=0)
    p.add_argument("--threshold", type=float, default=0.6,
                   help="이 값보다 덜 확실하면 '모르겠어요'")
    p.add_argument("--no-window", action="store_true", help="화면 없이 글자만 출력")
    p.set_defaults(func=_cmd_webcam)

    p = sub.add_parser("listen", help="마이크로 실시간 분류하기 (소리 모델)")
    p.add_argument("model", type=Path)
    p.add_argument("--seconds", type=float, default=0, help="몇 초만 듣기 (0=계속)")
    p.add_argument("--threshold", type=float, default=0.6)
    p.set_defaults(func=_cmd_listen)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
