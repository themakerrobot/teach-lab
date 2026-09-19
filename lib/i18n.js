// ═══════════════════════════════════════════════════════════
// 다국어 (한국어 / English) — sense-lab 과 같은 방식
// ═══════════════════════════════════════════════════════════
// 설계
//  · 한국어 원문을 그대로 '키' 로 쓴다 → 사전에 없으면 한국어가 그대로 나오므로
//    번역이 빠져도 화면이 깨지지 않는다.
//  · HTML 은 손대지 않는다. 페이지가 뜨면 DOM 을 훑어서 텍스트를 바꾼다.
//  · 언어 설정은 자매 서비스와 같은 localStorage 키 'language' 를 쓴다.
//  · 학생이 입력한 종류·모델 이름은 사전에 없으므로 번역되지 않는다 (의도된 동작).

const GL_LANG = (function () {
  try {
    const saved = localStorage.getItem('language');
    if (saved === 'ko' || saved === 'en') return saved;
  } catch (e) {}
  const nav = (navigator.language || navigator.userLanguage || 'ko');
  return nav.toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en';
})();

const GL_I18N = {
  // ── 페이지 / 헤더 ──
  'Teach Lab — 학습실': 'Teach Lab — Teach',
  'Teach Lab — 시험실': 'Teach Lab — Test',
  'Teach Lab — 보관함': 'Teach Lab — Models',
  '학습실': 'Teach',
  '시험실': 'Test',
  '보관함': 'Models',
  '전체화면': 'Full screen',
  '준비 중…': 'Getting ready…',
  '준비 중': 'Getting ready',
  '준비 완료': 'Ready',
  '불러오지 못했어요': 'Could not load',
  '불러오지 못했어요. 새로고침해 주세요': 'Could not load. Please refresh',

  // ── 단계 ──
  '종류 만들기': 'Make kinds',
  '예시 모으기': 'Collect examples',
  '배우기': 'Teach',
  '저장하기': 'Save',

  // ── 학습실: 소스 고르기 ──
  '무엇을 보고 배울까요?': 'What should the AI watch?',
  '이미지': 'Image',
  '손': 'Hand',
  '얼굴': 'Face',
  '포즈': 'Body',
  '소리': 'Sound',
  '한 손': 'One hand',
  '두 손': 'Two hands',
  '상반신': 'Upper body',
  '전신': 'Whole body',
  '몇 개 볼까요?': 'How many hands?',
  '어디까지 볼까요?': 'How much to watch?',
  '보는 것을 바꾸면 모은 예시가 지워져요. 바꿀까요?':
    'Changing what it watches clears the examples. Change it?',
  '무엇을 보나요': 'Watches',

  // ── 학습실: 종류 ──
  '종류': 'Kinds',
  '이름 (예: 사과)': 'Name (e.g. Apple)',
  '종류 더하기': 'Add a kind',
  '맞히고 싶은 것마다 종류를 만들어요.': 'Make a kind for each thing to guess.',
  '종류를 누른 뒤 예시를 모아요.': 'Pick a kind, then collect examples.',
  '같은 이름이 이미 있어요': 'That name is already taken',
  '종류는 10개까지 만들 수 있어요': 'You can make up to 10 kinds',
  '지우기': 'Delete',
  '누르면 이 예시를 지워요': 'Click to remove this example',
  '장': '',

  // ── 학습실: 카메라 · 예시 ──
  '카메라 & 예시': 'Camera & examples',
  '카메라': 'Camera',
  '카메라 켜기': 'Turn camera on',
  '카메라 끄기': 'Turn camera off',
  '카메라가 꺼져 있어요': 'The camera is off',
  '카메라가 안 보여요. 연결을 확인해 주세요': 'No camera found. Please check the connection',
  '여기 보이는 그대로 AI가 배워요. 사진은 이 컴퓨터 밖으로 나가지 않아요':
    'The AI learns exactly what you see here. Pictures never leave this computer',
  '여기 보이는 그대로 AI가 맞혀요. 사진은 이 컴퓨터 밖으로 나가지 않아요':
    'The AI guesses from exactly what you see here. Pictures never leave this computer',
  '종류를 골라 주세요': 'Please pick a kind',
  '고른 종류': 'Chosen kind',
  '꾹 눌러서 예시 모으기': 'Hold to collect examples',
  '사진 파일에서 더하기': 'Add from image files',
  '사진을 더했어요': 'Added pictures',
  '사진을 읽지 못했어요': 'Could not read the picture',
  '예시는 종류마다 200장까지예요': 'Up to 200 examples per kind',
  '찍은 영상은 이 컴퓨터 밖으로 나가지 않아요': 'Your video never leaves this computer',
  '아직 안 보여요. 카메라 앞에 서 보세요': 'Nothing yet. Try standing in front of the camera',

  // ── 학습실: 마이크 (소리 소스) ──
  '마이크 & 예시': 'Microphone & examples',
  '마이크': 'Microphone',
  '마이크 켜기': 'Turn mic on',
  '마이크 끄기': 'Turn mic off',
  '마이크가 꺼져 있어요': 'The mic is off',
  '마이크가 안 보여요. 연결을 확인해 주세요': 'No mic found. Please check the connection',
  '마이크를 켜 주세요': 'Please turn the mic on',
  '들리는 소리는 이 컴퓨터 밖으로 나가지 않아요': 'What it hears never leaves this computer',
  '꾹 눌러서 소리 모으기': 'Hold to collect sounds',
  '들려요': 'Hearing',
  '안 들려요': 'Nothing to hear',
  '소리를 듣는 중이에요': 'Listening…',
  '마이크를 켜면 숫자가 나와요': 'Turn the mic on to see the numbers',

  // ── AI가 보는 숫자 ──
  'AI가 보는 숫자': 'The numbers the AI sees',
  '아직 안 봐요': 'Not looking yet',
  '보고 있어요': 'Looking',
  '카메라를 켜면 숫자가 나와요': 'Turn the camera on to see the numbers',
  'AI는 사진을 1024개의 숫자로 바꿔서 봐요.': 'The AI turns each picture into 1024 numbers.',
  'AI는 손을 21개 점의 좌표로 봐요.': 'The AI sees the hand as 21 points.',
  'AI는 얼굴을 52가지 표정 점수로 봐요.': 'The AI sees the face as 52 expression scores.',
  'AI는 몸을 관절 점의 좌표로 봐요.': 'The AI sees the body as joint points.',
  'AI는 소리를 521가지 점수로 바꿔서 봐요.': 'The AI turns each sound into 521 scores.',
  '이름': 'Name',
  '값': 'Value',
  '점': 'Point',

  // ── 학습실: 배우기 · 결과 ──
  '배우기 & 결과': 'Teaching & results',
  '배우기 시작': 'Start teaching',
  '종류 2개에 예시를 모은 뒤에 눌러요.': 'Collect examples for 2 kinds first.',
  '종류 2개에 예시가 있어야 해요': 'Two kinds need examples',
  '배우는 중': 'Learning',
  '맞힌 비율': 'Correct',
  '오차': 'Error',
  '다 배웠어요': 'All done',
  '배우다가 멈췄어요. 다시 해 보세요': 'Learning stopped. Please try again',
  '아직 헷갈려 해요. 예시를 더 모아 볼까요?': 'Still mixed up. Shall we collect more examples?',
  '잘 배웠어요! 이제 시험해 보세요': 'Nicely learned! Now go and test it',
  '결과': 'Result',
  '헷갈린 표 — 왼쪽이 진짜, 위쪽이 AI의 답이에요.': 'Mix-up table — rows are the truth, columns the AI answer.',
  '숫자가 대각선에 모이면 잘 배운 거예요.': 'Numbers on the diagonal mean it learned well.',
  '모델 이름 (예: 과일 맞히기)': 'Model name (e.g. Fruit guesser)',
  '저장': 'Save',
  '저장한 모델은 시험실·보관함에서 볼 수 있어요.': 'Saved models appear in Test and Models.',
  '모델 이름을 적어 주세요': 'Please type a model name',
  '같은 이름이 있어요. 바꿔 쓸까요?': 'That name exists. Replace it?',
  '저장했어요': 'Saved',
  '저장하지 못했어요': 'Could not save',
  '이어 할 예시가 없어요': 'There are no examples to continue with',
  '이어서 시작해요': 'Continuing',
  '모델을 불러오지 못했어요': 'Could not load the model',

  // ── 시험실 ──
  '내 모델': 'My models',
  '어떤 모델로 시험할까요?': 'Which model should we test?',
  '아직 저장한 모델이 없어요. 학습실에서 먼저 가르쳐 주세요.':
    'No saved models yet. Teach one first in Teach.',
  'AI의 답': "The AI's answer",
  '모델을 골라 주세요': 'Please pick a model',
  '카메라를 켜 주세요': 'Please turn the camera on',
  '아직 안 보여요': 'Nothing yet',
  '사진으로 맞혔어요': 'Guessed from the photo',
  '모르겠어요': "I'm not sure",
  '확신 정도': 'How sure',
  '이보다 덜 확실하면 모르겠어요 라고 답해요.': "Less sure than this, and it answers \"I'm not sure\".",
  '모델 정보': 'Model info',
  '모델을 고르면 여기에 나와요.': 'Pick a model to see it here.',
  '사진 파일로 시험하기': 'Test with an image file',
  '예시': 'Examples',
  '이 모델은 지금 버전과 맞지 않아요': 'This model does not match the current version',

  // ── 보관함 ──
  '저장한 모델': 'Saved models',
  '파일로 주고받기': 'Send and receive as files',
  '다시 불러오기': 'Bring one back',
  '내보낸 파일을 여기에 놓으면 다시 들어와요.': 'Drop an exported file here to bring it back.',
  '(눌러서 고르기)': '(Or click to choose)',
  '내보내기': 'Export',
  '프로젝트 파일은 다른 컴퓨터의 Teach Lab 에서 그대로 열려요. 예시까지 들어 있어 이어서 배울 수 있어요.':
    'A project file opens as-is in Teach Lab on another computer. It keeps the examples, so you can keep teaching.',
  '파이썬은 모델과 실행 코드를 같이 받아요. 압축을 풀고 pip install -r requirements.txt 한 뒤 python predict.py 사진.jpg 로 바로 돌아가요.':
    'The Python export bundles the model with runnable code. Unzip it, run pip install -r requirements.txt, then python predict.py photo.jpg.',
  '알아 두기': 'Good to know',
  '모델은 이 컴퓨터의 브라우저 안에만 저장돼요. 다른 곳으로 옮기거나 오래 보관할 때는 꼭 내보내기를 쓰세요.':
    'Models live only in this browser. Use Export to move them or keep them for long.',
  '만든 날': 'Made on',
  '시험하기': 'Test it',
  '이어서 배우기': 'Keep teaching',
  '프로젝트 파일로 내보내기': 'Export as a project file',
  '파이썬으로 내보내기': 'Export for Python',
  '이름 바꾸기': 'Rename',
  '새 이름을 적어 주세요': 'Type a new name',
  '이름을 바꿨어요': 'Renamed',
  '바꾸지 못했어요': 'Could not rename',
  '정말 지울까요?': 'Really delete it?',
  '지웠어요': 'Deleted',
  '지우지 못했어요': 'Could not delete',
  '내보냈어요': 'Exported',
  '내보내지 못했어요': 'Could not export',
  '들어왔어요': 'Imported',
  '파일을 읽지 못했어요. 내보낸 파일이 맞는지 확인해 주세요':
    'Could not read the file. Is it an exported project file?',

  // ── 튜토리얼 ──
  '도움말': 'Help',
  '그만 볼래요': 'Skip',
  '다음': 'Next',
  '다 봤어요': 'Got it',
  '안녕! 여기는 학습실이에요.\nAI에게 직접 가르쳐요.':
    'Hi! This is the Teach room.\nYou teach the AI yourself.',
  '무엇을 보고 배울지 골라요.\n사진, 손, 얼굴, 포즈, 소리!':
    'Pick what the AI watches.\nImage, hand, face, body or sound!',
  '맞히고 싶은 종류를 만들어요.\n예: 사과, 바나나':
    'Make a kind for each answer.\ne.g. Apple, Banana',
  '카메라나 마이크를 켜요.': 'Turn on the camera or the mic.',
  '종류를 고른 뒤,\n꾹 눌러서 예시를 모아요.':
    'Pick a kind, then hold\nthe button to collect examples.',
  'AI는 그림이 아니라\n이 숫자를 보고 배워요.':
    'The AI learns from these numbers,\nnot from the picture itself.',
  '예시를 다 모으면\n배우기 시작을 눌러요.':
    'When you have enough examples,\npress Start teaching.',
  '이름을 짓고 저장해요.\n시험실에서 만나요!':
    'Name it and save.\nSee you in the Test room!',
  '여기는 시험실이에요.\n배운 AI를 시험해요.':
    'This is the Test room.\nTry out what the AI learned.',
  '시험할 모델을 골라요.': 'Pick a model to test.',
  '카메라를 켜고 보여 주면\n바로 맞혀요.':
    'Turn the camera on and show it\nsomething — it answers right away.',
  '덜 확실하면 모르겠다고\n답하게 할 수 있어요.':
    'You can make it say "not sure"\nwhen it is not confident.',
  '여기는 보관함이에요.\n저장한 모델이 모여 있어요.':
    'This is the Models room.\nEverything you saved lives here.',
  '내보낸 파일을 여기에 놓으면\n다시 들어와요.':
    'Drop an exported file here\nto bring it back.',
};

// 한국어 원문 → 현재 언어. 사전에 없으면 원문 그대로.
function GL_T(ko) {
  if (GL_LANG === 'ko') return ko;
  const v = GL_I18N[ko];
  return (v === undefined) ? ko : v;
}

// ── 화면(HTML) 자동 번역 ──
// HTML 파일은 손대지 않는다. 텍스트 노드와 title/placeholder 만 바꿔치기한다.
function localizeDOM(root) {
  if (GL_LANG === 'ko') return;
  const scope = root || document.body;
  if (!scope) return;

  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
  const hits = [];
  let n;
  while ((n = walker.nextNode())) {
    const tag = n.parentNode && n.parentNode.nodeName;
    if (tag === 'SCRIPT' || tag === 'STYLE') continue;
    const raw = n.nodeValue.trim();
    if (!raw || GL_I18N[raw] === undefined) continue;
    hits.push([n, n.nodeValue.replace(raw, GL_I18N[raw])]);
  }
  hits.forEach(h => { h[0].nodeValue = h[1]; });

  ['title', 'placeholder'].forEach(attr => {
    scope.querySelectorAll('[' + attr + ']').forEach(el => {
      const v = GL_I18N[el.getAttribute(attr).trim()];
      if (v !== undefined) el.setAttribute(attr, v);
    });
  });

  if (document.title && GL_I18N[document.title.trim()] !== undefined)
    document.title = GL_I18N[document.title.trim()];
}

// ── 언어 토글 버튼 (헤더 맨 오른쪽) ──
function setLanguage(v) {
  try { localStorage.setItem('language', v); } catch (e) {}
  location.reload();
}

function mountLangToggle() {
  const bar = document.querySelector('header');
  if (!bar || document.getElementById('langToggle')) return;

  const toKo = (GL_LANG !== 'ko');
  const b = document.createElement('button');
  b.id = 'langToggle';
  b.type = 'button';
  b.textContent = toKo ? '한' : 'EN';
  b.title = '한국어 / English';
  b.addEventListener('click', function () { setLanguage(toKo ? 'ko' : 'en'); });

  bar.appendChild(b);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { localizeDOM(); mountLangToggle(); });
} else {
  localizeDOM(); mountLangToggle();
}
