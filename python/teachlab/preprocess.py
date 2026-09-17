# -*- coding: utf-8 -*-
"""사진 전처리 — 브라우저와 똑같이 자르고 줄인다.

Teachable Machine 의 cropTo (@teachablemachine/image, src/utils/canvas.ts) 를
그대로 옮긴 것이다. Teach Lab 브라우저 쪽(lib/embedder.js)도 같은 순서를 쓴다.

  1. 짧은 변이 size 가 되도록 전체를 같은 비율로 줄인다 (찌그러뜨리지 않는다)
  2. 가운데 size×size 만 남긴다
  3. 웹캠 프레임이면 좌우를 뒤집는다 (거울)

거울은 웹캠에만 건다. 사진 파일은 뒤집지 않는다 — TM 도 마찬가지로
Webcam(w, h, flip=True) 이 찍을 때 한 번만 걸고, predict(image) 의 기본값은
flipped=False 다.
"""

from __future__ import annotations

import math
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


def crop_to(rgb: np.ndarray, size: int, flip: bool = False) -> np.ndarray:
    """Teachable Machine 의 cropTo 와 같은 결과를 만든다.

    먼저 짧은 변을 size 에 맞춰 전체를 줄이고, 그다음 가운데를 잘라 낸다.
    (자르고 줄이는 게 아니라 줄이고 자르는 순서다 — 반올림까지 TM 과 맞춘다.)
    """
    h, w = rgb.shape[:2]
    if not h or not w:
        raise ValueError("빈 사진이에요.")

    scale = size / min(w, h)
    scaled_w = math.ceil(w * scale)
    scaled_h = math.ceil(h * scale)

    resized = _resize(rgb, scaled_w, scaled_h)

    dx = scaled_w - size
    dy = scaled_h - size
    left = dx // 2
    top = dy // 2
    out = resized[top:top + size, left:left + size]

    if flip:
        out = out[:, ::-1]
    return np.ascontiguousarray(out)


def _resize(rgb: np.ndarray, width: int, height: int) -> np.ndarray:
    if (width, height) == (rgb.shape[1], rgb.shape[0]):
        return rgb

    if cv2 is not None:
        # INTER_LINEAR 를 쓴다. 브라우저 캔버스(drawImage)의 축소와 가장 가깝다 —
        # 같은 사진에서 임베딩 코사인 유사도가 0.99 언저리로 나온다.
        # (INTER_AREA 는 화질은 좋지만 브라우저와 덜 맞는다)
        return cv2.resize(rgb, (width, height), interpolation=cv2.INTER_LINEAR)

    if _PILImage is not None:
        # Pillow 의 BILINEAR 은 축소할 때 필터 폭을 늘려 결과가 꽤 달라진다.
        # 줄일 때는 BOX 가 브라우저 쪽에 더 가깝다.
        shrinking = width < rgb.shape[1] or height < rgb.shape[0]
        resample = _PILImage.BOX if shrinking else _PILImage.BILINEAR
        im = _PILImage.fromarray(rgb).resize((width, height), resample)
        return np.asarray(im, dtype=np.uint8)

    raise RuntimeError("사진을 줄이려면 opencv-python 또는 Pillow 가 필요합니다.")
