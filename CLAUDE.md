# teach-lab

Teachable Machine 스타일의 브라우저 학습 툴. themakerrobot 라인업(pibo-lab, sense-lab, edge-lab)의 자매 서비스.

## 범위
- 입력 5종: 이미지 / 손(hand) / 얼굴(face) / 소리(sound) / 포즈(pose, 상반신·전신)
- 공통 흐름: 클래스 만들기 → 샘플 수집(웹캠·마이크) → 학습 → 웹에서 즉시 추론
- 임베딩 추출은 MediaPipe(sense-lab과 동일 스택), 분류기는 브라우저에서 학습(TF.js 또는 경량 kNN/MLP)

## Export / Import
- 프로젝트 파일(.teachlab.zip 등) export → 다른 브라우저에서 import 후 그대로 추론
- Python export: 모델 + 실행 코드 다운로드. `pip install teachlab` 후 바로 실행되는 형태.
- PyPI 패키지명 `teachlab` (별도 `python/` 디렉터리)

## 제약
- 정적 웹(GitHub Pages), 서버·클라우드 API 없음
- 디자인은 sense-lab의 design guide 그대로 따를 것 (themakerrobot/sense-lab 참조)
- UI 문구 한국어 우선, 언어 토글은 sense-lab 방식
