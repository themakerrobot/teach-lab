# -*- coding: utf-8 -*-
"""Model — 폴더 하나만 주면 바로 맞히기 시작한다.

Teach Lab 이 내보낸 모델은 소스가 다섯 가지다. 무엇으로 배웠는지는
``model/project.json`` 의 ``source`` 에 적혀 있고, 이 클래스가 그에 맞는
특징 추출기를 알아서 연다.

  image             사진 → 임베딩 1024
  hand/face/pose    사진·영상 프레임 → 좌표·표정 점수
  sound             소리 샘플 → YAMNet 521
"""

from __future__ import annotations

import json
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import numpy as np

from .audio import SOUND_TRANSFORM, SoundEmbedder, apply_transform, read_wav
from .classifier import Classifier, Prediction
from .embedder import ImageEmbedder
from .landmarks import LandmarkExtractor
from .preprocess import load_rgb

IMAGE_SOURCE = "image"
SOUND_SOURCE = "sound"
LANDMARK_SOURCES = ("hand", "face", "pose")


class Model:
    """Teach Lab 이 내보낸 모델.

    쓰는 법::

        from teachlab import Model

        m = Model("model")
        print(m.source)                     # image / hand / face / pose / sound
        print(m.predict_file("사진.jpg"))    # 사진·좌표 소스
        print(m.predict_wav("소리.wav"))     # 소리 소스

    ``source`` 로 줄 수 있는 것:
      · 파이썬 내보내기의 ``model/`` 폴더 (특징 추출 모델이 같이 있다)
      · 압축을 푼 ``.teachlab.zip`` 폴더 — 이때는 ``extractor=`` 로
        모델 파일(.tflite/.task) 경로를 따로 알려 준다
      · zip 파일 그대로
    """

    def __init__(self, source: str | Path, extractor: str | Path | None = None):
        folder, self._tempdir = _as_folder(Path(source))
        self.folder = folder

        self.project: dict[str, Any] = {}
        project_path = folder / "project.json"
        if project_path.exists():
            self.project = json.loads(project_path.read_text(encoding="utf-8"))

        self.classifier = Classifier.from_dir(folder)
        self.classes = self.classifier.classes

        spec = self.project.get("embedder", {}) or {}
        self.spec = spec
        self.source = self.project.get("source") or spec.get("source") or IMAGE_SOURCE
        self.variant = self.project.get("variant") or spec.get("variant")
        # 학습할 때 웹캠 프레임을 거울로 썼는지 (이미지 소스만 True)
        self.mirror = bool(spec.get("mirror", False))
        # 소리 점수를 어떻게 다듬어 배웠는지 (옛 모델은 날것)
        self.sound_transform = spec.get("featureTransform", "raw")

        path = Path(extractor) if extractor else _find_extractor(folder, spec, self.source)
        if self.source == IMAGE_SOURCE:
            self.extractor = ImageEmbedder(
                path,
                input_size=int(spec.get("inputSize", 224)),
                l2_normalize=bool(spec.get("l2Normalize", True)),
                quantize=bool(spec.get("quantize", False)),
            )
        elif self.source in LANDMARK_SOURCES:
            self.extractor = LandmarkExtractor(self.source, path, self.variant)
        elif self.source == SOUND_SOURCE:
            self.extractor = SoundEmbedder(path, dim=int(spec.get("dim", 521)))
        else:
            raise ValueError(f"모르는 소스예요: {self.source}")

    # ── 특징 뽑기 ──
    def vector(self, data: Any, bgr: bool | None = None, mirror: bool = False,
               sample_rate: int = 16000) -> np.ndarray | None:
        """입력 → 특징 벡터. 아무것도 안 잡히면 None (소리·이미지는 항상 값이 있다)."""
        if self.source == SOUND_SOURCE:
            vec = self.extractor.vector(data, sample_rate)
            return None if vec is None else apply_transform(vec, self.sound_transform)
        rgb = load_rgb(data, bgr=bgr)
        if self.source == IMAGE_SOURCE:
            return self.extractor.embed_rgb(rgb, flip=mirror)
        return self.extractor.vector(rgb)          # 좌표는 원본 프레임에서

    # ── 맞히기 ──
    def predict(self, data: Any, bgr: bool | None = None, mirror: bool = False,
                sample_rate: int = 16000) -> Prediction | None:
        """한 장(또는 한 토막)을 분류한다. 아무것도 안 보이면 None."""
        vec = self.vector(data, bgr=bgr, mirror=mirror, sample_rate=sample_rate)
        if vec is None:
            return None
        return self.classifier.predict(vec)

    def predict_file(self, path: str | Path) -> Prediction | None:
        """사진 파일 한 장 (이미지·손·얼굴·포즈 소스)."""
        return self.predict(Path(path))

    def predict_webcam(self, frame: Any, bgr: bool | None = None) -> Prediction | None:
        """웹캠 프레임. 학습할 때와 같은 방향(거울)으로 맞춘다.

        이미지 소스만 거울을 건다. 손·얼굴·포즈는 원본 프레임에서 좌표를
        뽑으므로 뒤집지 않는다 (뒤집으면 왼손/오른손이 반대가 된다).
        """
        return self.predict(frame, bgr=bgr, mirror=self.mirror)

    def predict_audio(self, samples: Any, sample_rate: int = 16000) -> Prediction | None:
        """모노 float32 샘플 한 토막 (소리 소스). 0.975초(15600샘플)면 딱 맞고, 길면 뒤에서 한 창만 쓴다."""
        return self.predict(samples, sample_rate=sample_rate)

    def predict_wav(self, path: str | Path) -> Prediction | None:
        """wav 파일 (소리 소스)."""
        samples, rate = read_wav(path)
        return self.predict_audio(samples, rate)

    def predict_proba(self, data: Any, **kw) -> np.ndarray | None:
        vec = self.vector(data, **kw)
        return None if vec is None else self.classifier.predict_proba(vec)

    # ── 정리 ──
    def close(self) -> None:
        self.extractor.close()
        if self._tempdir is not None:
            self._tempdir.cleanup()
            self._tempdir = None

    def __enter__(self) -> "Model":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def __repr__(self) -> str:
        acc = self.project.get("accuracy")
        tail = f", accuracy={acc:.2f}" if isinstance(acc, (int, float)) else ""
        var = f", variant={self.variant!r}" if self.variant else ""
        return f"Model(source={self.source!r}{var}, classes={self.classes!r}{tail})"


# 예전 이름 (이미지 전용이던 시절). 지금은 다섯 소스를 모두 다룬다.
ImageClassifier = Model


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


_FALLBACK = {
    "image": "mobilenet_v3_small_embedder.tflite",
    "hand": "hand_landmarker.task",
    "face": "face_landmarker.task",
    "pose": "pose_landmarker_lite.task",
    "sound": "yamnet.tflite",
}


def _find_extractor(folder: Path, spec: dict, source: str) -> Path:
    for name in (spec.get("file"), _FALLBACK.get(source)):
        if name and (folder / name).exists():
            return folder / name
    found = sorted(folder.glob("*.tflite")) + sorted(folder.glob("*.task"))
    if found:
        return found[0]
    raise FileNotFoundError(
        "특징 추출 모델(.tflite/.task)을 찾지 못했어요. 파이썬 내보내기의 model/ 폴더를\n"
        "쓰거나, Model(폴더, extractor='...') 처럼 경로를 알려 주세요."
    )
