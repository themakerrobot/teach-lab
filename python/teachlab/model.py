# -*- coding: utf-8 -*-
"""ImageClassifier — 폴더 하나만 주면 바로 맞히기 시작한다."""

from __future__ import annotations

import json
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import numpy as np

from .classifier import Classifier, Prediction
from .embedder import Embedder
from .preprocess import load_rgb

DEFAULT_EMBEDDER = "mobilenet_v3_small_embedder.tflite"


class ImageClassifier:
    """Teach Lab 이 내보낸 이미지 분류 모델.

    쓰는 법::

        from teachlab import ImageClassifier

        clf = ImageClassifier("model")
        result = clf.predict_file("사진.jpg")
        print(result.label, result.score)

    웹캠 프레임은 ``predict_webcam`` 을 씁니다 — 학습할 때 브라우저 웹캠이
    거울이었으므로 같은 방향으로 뒤집어 줍니다 (Teachable Machine 과 같은 규칙).
    사진 파일은 뒤집지 않습니다.

    ``source`` 로 줄 수 있는 것:
      · 파이썬 내보내기의 ``model/`` 폴더 (임베더 .tflite 가 같이 있다)
      · 압축을 푼 ``.teachlab.zip`` 폴더 — 이때는 ``embedder=`` 로
        임베더 .tflite 경로를 따로 알려 준다
      · ``.teachlab.zip`` 또는 파이썬 내보내기 zip 파일 그대로
    """

    def __init__(self, source: str | Path, embedder: str | Path | None = None):
        folder, self._tempdir = _as_folder(Path(source))
        self.folder = folder

        self.project: dict[str, Any] = {}
        project_path = folder / "project.json"
        if project_path.exists():
            self.project = json.loads(project_path.read_text(encoding="utf-8"))

        self.classifier = Classifier.from_dir(folder)
        self.classes = self.classifier.classes

        emb_cfg = self.project.get("embedder", {}) or {}
        # 학습할 때 웹캠 프레임을 거울로 썼는지 (predict_webcam 이 이 값을 따른다)
        self.mirror = bool(emb_cfg.get("mirror", False))
        emb_path = Path(embedder) if embedder else _find_embedder(folder, emb_cfg)
        self.embedder = Embedder(
            emb_path,
            input_size=int(emb_cfg.get("inputSize", 224)),
            l2_normalize=bool(emb_cfg.get("l2Normalize", True)),
            quantize=bool(emb_cfg.get("quantize", False)),
        )

    # ── 맞히기 ──
    def embed(self, image: Any, bgr: bool | None = None,
              mirror: bool = False) -> np.ndarray:
        """사진 → 임베딩(숫자 1024개)."""
        return self.embedder.embed_rgb(load_rgb(image, bgr=bgr), flip=mirror)

    def predict(self, image: Any, bgr: bool | None = None,
                mirror: bool = False) -> Prediction:
        """사진 한 장을 분류한다.

        numpy 배열을 주면 OpenCV 의 BGR 로 본다. RGB 배열이면 ``bgr=False``.
        웹캠 프레임이면 ``predict_webcam`` 을 쓰세요 (거울을 알아서 맞춥니다).
        """
        return self.classifier.predict(self.embed(image, bgr=bgr, mirror=mirror))

    def predict_webcam(self, frame: Any, bgr: bool | None = None) -> Prediction:
        """웹캠 프레임을 분류한다. 학습할 때와 같은 방향(거울)으로 맞춘다."""
        return self.predict(frame, bgr=bgr, mirror=self.mirror)

    def predict_file(self, path: str | Path) -> Prediction:
        return self.predict(Path(path))

    def predict_proba(self, image: Any, bgr: bool | None = None,
                      mirror: bool = False) -> np.ndarray:
        return self.classifier.predict_proba(self.embed(image, bgr=bgr, mirror=mirror))

    # ── 정리 ──
    def close(self) -> None:
        self.embedder.close()
        if self._tempdir is not None:
            self._tempdir.cleanup()
            self._tempdir = None

    def __enter__(self) -> "ImageClassifier":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def __repr__(self) -> str:
        acc = self.project.get("accuracy")
        tail = f", accuracy={acc:.2f}" if isinstance(acc, (int, float)) else ""
        return f"ImageClassifier(classes={self.classes!r}{tail})"


def _as_folder(source: Path) -> tuple[Path, tempfile.TemporaryDirectory | None]:
    """zip 이면 임시 폴더에 풀고, 폴더면 그대로 쓴다."""
    if source.is_dir():
        if (source / "classifier.json").exists():
            return source, None
        inner = source / "model"
        if (inner / "classifier.json").exists():
            return inner, None
        raise FileNotFoundError(f"classifier.json 을 찾지 못했어요: {source}")

    if not source.exists():
        raise FileNotFoundError(f"모델을 찾지 못했어요: {source}")

    tmp = tempfile.TemporaryDirectory(prefix="teachlab-")
    root = Path(tmp.name)
    with zipfile.ZipFile(source) as zf:
        zf.extractall(root)
    if (root / "classifier.json").exists():
        return root, tmp
    if (root / "model" / "classifier.json").exists():
        return root / "model", tmp
    tmp.cleanup()
    raise FileNotFoundError(f"zip 안에서 classifier.json 을 찾지 못했어요: {source}")


def _find_embedder(folder: Path, emb_cfg: dict) -> Path:
    names = [emb_cfg.get("file"), DEFAULT_EMBEDDER]
    for name in names:
        if name and (folder / name).exists():
            return folder / name
    found = sorted(folder.glob("*.tflite"))
    if found:
        return found[0]
    raise FileNotFoundError(
        "임베더 .tflite 를 찾지 못했어요. 파이썬 내보내기의 model/ 폴더를 쓰거나,\n"
        "ImageClassifier(폴더, embedder='...tflite') 처럼 경로를 알려 주세요."
    )
