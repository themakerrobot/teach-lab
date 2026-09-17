# -*- coding: utf-8 -*-
"""임베더 — MediaPipe ImageEmbedder 로 사진을 1024개의 숫자로 바꾼다.

브라우저(Teach Lab)와 같은 .tflite 파일, 같은 옵션(l2_normalize=True)을 쓴다.
그래서 같은 사진을 넣으면 사실상 같은 숫자가 나온다.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .preprocess import center_crop_square


class Embedder:
    """MediaPipe ImageEmbedder 감싸기. 한 번 만들어 두고 계속 쓴다."""

    def __init__(self, model_path: str | Path, input_size: int = 224,
                 l2_normalize: bool = True, quantize: bool = False):
        import mediapipe as mp                       # 무거우므로 필요할 때 부른다
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision

        self._mp = mp
        self.model_path = Path(model_path)
        if not self.model_path.exists():
            raise FileNotFoundError(f"임베더 파일을 찾지 못했어요: {self.model_path}")
        self.input_size = int(input_size)

        options = mp_vision.ImageEmbedderOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(self.model_path)),
            running_mode=mp_vision.RunningMode.IMAGE,
            l2_normalize=bool(l2_normalize),
            quantize=bool(quantize),
        )
        self._embedder = mp_vision.ImageEmbedder.create_from_options(options)

    def embed_rgb(self, rgb: np.ndarray) -> np.ndarray:
        """RGB uint8 배열 → float32 임베딩. 자르기·줄이기는 여기서 한다."""
        square = center_crop_square(rgb, self.input_size)
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB,
                               data=np.ascontiguousarray(square))
        result = self._embedder.embed(image)
        if not result.embeddings:
            raise RuntimeError("임베딩을 만들지 못했어요.")
        return np.asarray(result.embeddings[0].embedding, dtype=np.float32)

    def close(self) -> None:
        try:
            self._embedder.close()
        except Exception:                             # 이미 닫혔으면 넘어간다
            pass

    def __enter__(self) -> "Embedder":
        return self

    def __exit__(self, *exc) -> None:
        self.close()
