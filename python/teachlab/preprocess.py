# -*- coding: utf-8 -*-
"""사진 전처리 — 브라우저와 똑같이 자르고 줄인다.

Teach Lab 은 브라우저에서 "가운데를 정사각형으로 잘라 224×224 로 줄인 그림"
을 임베더에 넣는다. 파이썬에서도 같은 답이 나오려면 같은 순서를 지켜야 한다.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

try:                                  # mediapipe 가 opencv 를 함께 설치한다
    import cv2
except ImportError:                   # 없으면 Pillow 로 대신한다
    cv2 = None

try:
    from PIL import Image as _PILImage
except ImportError:
    _PILImage = None


def load_rgb(source: Any, bgr: bool | None = None) -> np.ndarray:
    """어떤 입력이 와도 RGB uint8 (H, W, 3) 배열로 만든다.

    source 로 받을 수 있는 것:
      · 파일 경로 (str / Path)
      · numpy 배열 — OpenCV 로 읽은 BGR 이라고 보고 뒤집는다 (bgr=False 로 끄기)
      · PIL.Image
      · bytes (파일 내용 그대로)
    """
    if isinstance(source, (str, Path)):
        return _read_file(Path(source))

    if isinstance(source, (bytes, bytearray)):
        return _decode_bytes(bytes(source))

    if _PILImage is not None and isinstance(source, _PILImage.Image):
        return np.asarray(source.convert("RGB"), dtype=np.uint8)

    if isinstance(source, np.ndarray):
        arr = source
        if arr.dtype != np.uint8:
            arr = np.clip(arr, 0, 255).astype(np.uint8)
        if arr.ndim == 2:
            arr = np.stack([arr] * 3, axis=-1)
        if arr.ndim != 3 or arr.shape[2] not in (3, 4):
            raise ValueError(f"지원하지 않는 배열 모양입니다: {source.shape}")
        if arr.shape[2] == 4:
            arr = arr[:, :, :3]
        # OpenCV 로 읽은 그림은 BGR 이다. 기본값은 BGR 로 본다.
        if bgr is None or bgr:
            arr = arr[:, :, ::-1]
        return np.ascontiguousarray(arr)

    raise TypeError(f"사진으로 쓸 수 없는 값입니다: {type(source)!r}")


def _read_file(path: Path) -> np.ndarray:
    if not path.exists():
        raise FileNotFoundError(f"사진을 찾지 못했어요: {path}")
    if cv2 is not None:
        # 한글 경로에서도 열리도록 바이트로 읽어 디코드한다
        data = np.fromfile(str(path), dtype=np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError(f"사진을 읽지 못했어요: {path}")
        return np.ascontiguousarray(img[:, :, ::-1])
    if _PILImage is not None:
        with _PILImage.open(path) as im:
            return np.asarray(im.convert("RGB"), dtype=np.uint8)
    raise RuntimeError("사진을 읽으려면 opencv-python 또는 Pillow 가 필요합니다.")


def _decode_bytes(data: bytes) -> np.ndarray:
    if cv2 is not None:
        img = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("사진을 읽지 못했어요.")
        return np.ascontiguousarray(img[:, :, ::-1])
    if _PILImage is not None:
        import io

        with _PILImage.open(io.BytesIO(data)) as im:
            return np.asarray(im.convert("RGB"), dtype=np.uint8)
    raise RuntimeError("사진을 읽으려면 opencv-python 또는 Pillow 가 필요합니다.")


def center_crop_square(rgb: np.ndarray, size: int) -> np.ndarray:
    """가운데를 정사각형으로 자르고 size×size 로 줄인다 (찌그러뜨리지 않는다)."""
    h, w = rgb.shape[:2]
    side = min(h, w)
    top = (h - side) // 2
    left = (w - side) // 2
    cropped = rgb[top:top + side, left:left + side]

    if side == size:
        return np.ascontiguousarray(cropped)

    if cv2 is not None:
        # INTER_LINEAR 를 쓴다. 브라우저 캔버스(drawImage)의 축소와 가장 가깝다 —
        # 같은 사진에서 임베딩 코사인 유사도가 0.99 언저리로 나온다.
        # (INTER_AREA 는 화질은 좋지만 브라우저와 덜 맞는다)
        return np.ascontiguousarray(cv2.resize(cropped, (size, size),
                                               interpolation=cv2.INTER_LINEAR))

    if _PILImage is not None:
        # Pillow 의 BILINEAR 은 축소할 때 필터 폭을 늘려 결과가 꽤 달라진다.
        # 줄일 때는 BOX 가 브라우저 쪽에 더 가깝다.
        resample = _PILImage.BOX if side > size else _PILImage.BILINEAR
        im = _PILImage.fromarray(cropped).resize((size, size), resample)
        return np.asarray(im, dtype=np.uint8)

    raise RuntimeError("사진을 줄이려면 opencv-python 또는 Pillow 가 필요합니다.")
