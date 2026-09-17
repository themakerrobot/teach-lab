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
WINDOW_SECONDS = 1.0


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

    def vector(self, samples, sample_rate: int = SAMPLE_RATE) -> np.ndarray | None:
        """모노 float32 샘플 → 521차원. 창이 여러 개면 마지막 것을 쓴다."""
        buf = np.asarray(samples, dtype=np.float32).reshape(-1)
        if buf.size == 0:
            return None
        audio = self._containers.AudioData.create_from_array(buf, sample_rate)
        results = self._task.classify(audio)
        if not results:
            return None
        categories = results[-1].classifications[0].categories
        vec = np.zeros(self.dim, dtype=np.float32)
        for c in categories:
            if 0 <= c.index < self.dim:
                vec[c.index] = c.score
        return vec

    def top(self, samples, sample_rate: int = SAMPLE_RATE, n: int = 8):
        """지금 들리는 소리 이름 상위 n개 — 눈으로 확인할 때 쓴다."""
        buf = np.asarray(samples, dtype=np.float32).reshape(-1)
        audio = self._containers.AudioData.create_from_array(buf, sample_rate)
        results = self._task.classify(audio)
        if not results:
            return []
        cats = sorted(results[-1].classifications[0].categories,
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
