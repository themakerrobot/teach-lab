# -*- coding: utf-8 -*-
"""teachlab — Teach Lab 에서 가르친 모델을 파이썬에서 그대로 실행합니다.

    from teachlab import ImageClassifier

    clf = ImageClassifier("model")
    print(clf.predict_file("사진.jpg"))

브라우저와 같은 임베더(.tflite)와 같은 전처리를 쓰므로, 같은 사진에 같은 답이
나옵니다. 클라우드로 나가는 것은 없습니다 — 전부 이 기기 안에서 돕니다.
"""

from .classifier import Classifier, Prediction
from .embedder import Embedder
from .model import ImageClassifier

__all__ = ["ImageClassifier", "Classifier", "Embedder", "Prediction", "__version__"]
__version__ = "0.1.0"
