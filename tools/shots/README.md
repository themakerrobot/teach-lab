# 화면 캡처 만들기

설명서(`docs/manual`)와 README(`docs/img`)의 그림을 실제 웹캠 없이 찍는다.
가짜 카메라에 합성 장면을 넣고 Playwright(Chromium)로 화면을 찍는다.

## 준비 (한 번)

```bash
npm i -D playwright            # 브라우저는 시스템 Chromium 을 쓴다 (스크립트의 executablePath)
mkdir -p tools/shots/scene
```

`tools/shots/scene/` 에 아래를 넣는다 (크기 때문에 저장소에는 넣지 않는다).

| 파일 | 무엇 |
|---|---|
| `apple-00.png` … `apple-09.png` | "사과" 종류로 넣을 사진 10장 이상 |
| `banana-00.png` … | "바나나" 종류로 넣을 사진 10장 이상 |
| `camera.y4m` | 가짜 웹캠에 보일 영상. 사진 한 장을 돌려도 된다: `ffmpeg -loop 1 -i camera.png -t 3 -pix_fmt yuv420p camera.y4m` |

## 찍기

```bash
python3 -m http.server 8099            # 저장소 루트에서 (MIME 은 tools/shots 스크립트가 신경 쓰지 않는다 — wasm 이 안 뜨면 DEVELOP.md 의 MIME 표를 볼 것)
node tools/shots/readme-shots.mjs      # → docs/img/{teach,test,sound,storage}.png
node tools/shots/manual.mjs            # → tools/shots/out-manual/*.png + boxes.json
python3 tools/shots/callouts.py tools/shots/out-manual docs/manual   # 번호 배지를 그려 docs/manual 로
```

- 화면 크기는 1440×900 고정. 바꾸면 `manual.mjs` 의 잘라 내는 좌표(`2-sources.png`)와
  `readme-shots.mjs` 의 소리 화면 clip 도 같이 맞춘다.
- 카메라 장치 이름이 파일 경로로 나오므로 스크립트가 "웹캠"/"마이크"로 바꿔 보여 준다.
- 소리 화면은 `AudioContext.createMediaStreamSource` 를 가로채 220Hz 사인파를 넣어 찍는다.
