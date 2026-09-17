// ═══════════════════════════════════════════════════════════
// lib/teachlab_src.js 만들기 — 파이썬 라이브러리를 JS 안에 심는다
// ═══════════════════════════════════════════════════════════
// "파이썬으로 내보내기" 는 teachlab 패키지 소스를 zip 에 담는다.
// 예전에는 사이트에서 fetch('./python/teachlab/*.py') 로 받아 왔는데,
// 배포 쪽에서 python/ 을 빼면 404 로 조용히 깨졌다. 배포 설정에 기대지 않도록
// 소스를 이 파일에 문자열로 심어 둔다.
//
//   node tools/gen-teachlab-src.mjs          다시 만들기
//   node tools/gen-teachlab-src.mjs --check  최신인지 확인만 (CI 용)

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'python', 'teachlab');
const OUT = path.join(ROOT, 'lib', 'teachlab_src.js');

const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.py')).sort();
if (!files.length) {
  console.error('python/teachlab 에 .py 가 없습니다');
  process.exit(1);
}

const body = files
  .map(name => '  ' + JSON.stringify(name) + ': ' + JSON.stringify(fs.readFileSync(path.join(SRC_DIR, name), 'utf8')) + ',')
  .join('\n');

const out = `// ═══════════════════════════════════════════════════════════
// teachlab 파이썬 라이브러리 소스 — 자동 생성 파일
// ═══════════════════════════════════════════════════════════
// 고치지 말 것. python/teachlab/*.py 를 고친 뒤 다시 만든다.
//
//   node tools/gen-teachlab-src.mjs
//
// "파이썬으로 내보내기" 가 이 내용을 zip 의 teachlab/ 폴더에 그대로 쓴다.
// 사이트에서 따로 받아 오지 않으므로 배포 설정과 무관하게 동작한다.

export const TEACHLAB_SRC = {
${body}
};
`;

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== out) {
    console.error('lib/teachlab_src.js 가 python/teachlab/ 와 다릅니다.');
    console.error('  node tools/gen-teachlab-src.mjs 를 돌리고 커밋하세요.');
    process.exit(1);
  }
  console.log('lib/teachlab_src.js 최신 (' + files.length + '개 파일)');
} else {
  fs.writeFileSync(OUT, out);
  const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
  console.log('lib/teachlab_src.js 생성: ' + files.length + '개 파일, ' + kb + 'KB');
}
