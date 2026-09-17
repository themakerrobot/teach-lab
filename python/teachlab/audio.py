# -*- coding: utf-8 -*-
"""소리 → 특징 벡터 (YAMNet 521개 점수).

브라우저의 lib/sound.js 와 같다: 최근 1초를 YAMNet 에 넣고 521가지 점수를
그대로 특징 벡터로 쓴다. 학습할 때 브라우저는 16kHz 모노 · 1초 창을 썼다.
MediaPipe 가 다른 샘플레이트도 알아서 맞춰 주므로, 넣을 때 굳이 리샘플하지
않아도 된다.
"""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

from .modelfile import read_model

SOUND_DIM = 521
SAMPLE_RATE = 16000

# YAMNet 한 창의 길이. 16000(1초)이 아니라 15600(0.975초)이다.
# 1초를 통째로 넣으면 MediaPipe 가 창을 둘로 쪼개고, 둘째 창은 0으로 채운
# 꼬리라 늘 "Silence" 가 1등이 된다. 브라우저(lib/sound.js)도 같은 길이를 쓴다.
WINDOW_SAMPLES = 15600
WINDOW_SECONDS = WINDOW_SAMPLES / SAMPLE_RATE

# ── 소리 특징 다듬기 (브라우저 lib/sources.js 와 같은 식) ──
# YAMNet 점수는 sigmoid 출력이라 대부분 0 근처에 몰려 있고 값도 작다.
# 제곱근으로 펴 주고 L2 로 크기를 맞추면 훨씬 잘 갈린다.
# 옛 모델은 날것으로 배웠으므로 project.json 의 featureTransform 을 따른다.
SOUND_TRANSFORM = "sqrt-l2"


def apply_transform(vec: np.ndarray, kind: str = SOUND_TRANSFORM) -> np.ndarray:
    """521개 점수를 학습할 때와 같은 방식으로 다듬는다."""
    if kind != "sqrt-l2":                 # "raw" 또는 옛 모델
        return vec
    out = np.sqrt(np.maximum(vec, 0.0, dtype=np.float32))
    n = float(np.linalg.norm(out)) or 1.0
    return (out / n).astype(np.float32)


class SoundEmbedder:
    """MediaPipe AudioClassifier(YAMNet) 감싸기."""

    def __init__(self, model_path: str | Path, dim: int = SOUND_DIM):
        try:
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import audio as mp_audio
            from mediapipe.tasks.python.components import containers
        except ImportError as e:                       # pragma: no cover
            raise ImportError(
                "소리 모델을 돌리려면 MediaPipe 가 필요해요:\n"
                "    pip install \"teachlab[sound]\""
            ) from e

        self._containers = containers
        self.model_path = Path(model_path)
        self.dim = int(dim)

        options = mp_audio.AudioClassifierOptions(
            # 경로가 아니라 바이트로 넘긴다 — 한글 경로에서 깨지지 않게
            base_options=mp_python.BaseOptions(model_asset_buffer=read_model(self.model_path)),
            running_mode=mp_audio.RunningMode.AUDIO_CLIPS,
            max_results=self.dim,
        )
        self._task = mp_audio.AudioClassifier.create_from_options(options)

    def _trim(self, samples, sample_rate: int):
        """창 하나가 되도록 뒤에서 0.975초만 잘라 낸다."""
        buf = np.asarray(samples, dtype=np.float32).reshape(-1)
        want = int(round(WINDOW_SECONDS * sample_rate))
        if buf.size > want:
            buf = buf[-want:]
        return np.ascontiguousarray(buf)

    def vector(self, samples, sample_rate: int = SAMPLE_RATE) -> np.ndarray | None:
        """모노 float32 샘플 → 521차원. 창이 여러 개면 첫 창을 쓴다."""
        buf = self._trim(samples, sample_rate)
        if buf.size == 0:
            return None
        audio = self._containers.AudioData.create_from_array(buf, sample_rate)
        results = self._task.classify(audio)
        if not results:
            return None
        categories = results[0].classifications[0].categories
        vec = np.zeros(self.dim, dtype=np.float32)
        for c in categories:
            if 0 <= c.index < self.dim:
                vec[c.index] = c.score
        return vec

    def top(self, samples, sample_rate: int = SAMPLE_RATE, n: int = 8):
        """지금 들리는 소리 이름 상위 n개 — 눈으로 확인할 때 쓴다."""
        buf = self._trim(samples, sample_rate)
        audio = self._containers.AudioData.create_from_array(buf, sample_rate)
        results = self._task.classify(audio)
        if not results:
            return []
        cats = sorted(results[0].classifications[0].categories,
                      key=lambda c: c.score, reverse=True)[:n]
        return [(c.category_name, float(c.score)) for c in cats]

    def close(self) -> None:
        try:
            self._task.close()
        except Exception:
            pass

    def __enter__(self) -> "SoundEmbedder":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


def read_wav(path: str | Path) -> tuple[np.ndarray, int]:
    """wav 파일 → (모노 float32 -1~1, 샘플레이트). 표준 라이브러리만 쓴다."""
    path = Path(path)
    with wave.open(str(path), "rb") as wf:
        channels = wf.getnchannels()
        width = wf.getsampwidth()
        rate = wf.getframerate()
        raw = wf.readframes(wf.getnframes())

    if width == 1:                       # 8-bit 는 부호 없는 값이다
        data = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    elif width == 2:
        data = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    elif width == 4:
        data = np.frombuffer(raw, dtype="<i4").astype(np.float32) / 2147483648.0
    else:
        raise ValueError(f"지원하지 않는 wav 형식이에요 ({width * 8}bit).")

    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return np.ascontiguousarray(data, dtype=np.float32), rate
