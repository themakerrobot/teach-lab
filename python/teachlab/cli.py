# -*- coding: utf-8 -*-
"""명령줄 도구.

    teachlab info    model
    teachlab predict model 사진.jpg [사진2.jpg ...]
    teachlab webcam  model [--camera 0] [--threshold 0.6] [--no-window]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .model import ImageClassifier


def _cmd_info(args: argparse.Namespace) -> int:
    with ImageClassifier(args.model) as clf:
        project = clf.project
        print(f"이름      : {project.get('name', '(없음)')}")
        print(f"종류      : {', '.join(clf.classes)}")
        counts = project.get("sampleCounts")
        if counts:
            print(f"예시      : {sum(counts)}장 {counts}")
        acc = project.get("accuracy")
        if isinstance(acc, (int, float)):
            print(f"맞힌 비율 : {acc * 100:.1f}%")
        print(f"임베더    : {clf.embedder.model_path.name} "
              f"({clf.classifier.input_dim}개 숫자, {clf.embedder.input_size}px)")
        print(f"웹캠 거울 : {'켬' if clf.mirror else '끔'}")
    return 0


def _cmd_predict(args: argparse.Namespace) -> int:
    with ImageClassifier(args.model) as clf:
        for path in args.images:
            result = clf.predict_file(path)
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

    with ImageClassifier(args.model) as clf:
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
                result = clf.predict_webcam(frame)    # BGR ndarray 를 그대로 (거울 자동)
                label = result.label if result.score >= args.threshold else "모르겠어요"
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="teachlab",
                                     description="Teach Lab 모델을 실행합니다.")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("info", help="모델 정보 보기")
    p.add_argument("model", type=Path)
    p.set_defaults(func=_cmd_info)

    p = sub.add_parser("predict", help="사진 분류하기")
    p.add_argument("model", type=Path)
    p.add_argument("images", nargs="+")
    p.add_argument("-v", "--verbose", action="store_true", help="종류별 확률까지 보기")
    p.set_defaults(func=_cmd_predict)

    p = sub.add_parser("webcam", help="웹캠으로 실시간 분류하기")
    p.add_argument("model", type=Path)
    p.add_argument("--camera", type=int, default=0)
    p.add_argument("--threshold", type=float, default=0.6,
                   help="이 값보다 덜 확실하면 '모르겠어요'")
    p.add_argument("--no-window", action="store_true", help="화면 없이 글자만 출력")
    p.set_defaults(func=_cmd_webcam)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
