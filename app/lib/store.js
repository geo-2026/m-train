// 학급별 데이터베이스 (SQLite, better-sqlite3).
//  - 학생 질문은 *익명*으로 저장합니다. 학번·이름은 절대 서버/DB에 저장하지 않습니다.
//    (학번·이름은 학생 단말기에서 PDF로만 보관됩니다.)
//  - 교사의 Claude API 키도 어디에도 저장하지 않습니다.
//  - 익명 식별자(clientId)는 같은 학생이 질문을 고쳐 보낼 때 중복이 쌓이지 않도록
//    클라이언트가 만든 임의 토큰이며, 개인을 식별하는 정보가 아닙니다.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const CLASSES = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6'];

const db = new Database(path.join(DATA_DIR, 'mtrain.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    cls      TEXT    NOT NULL,
    clientId TEXT    NOT NULL,
    kantQ    TEXT    DEFAULT '',
    leopoldQ TEXT    DEFAULT '',
    ts       INTEGER NOT NULL,
    PRIMARY KEY (cls, clientId)
  );
  CREATE TABLE IF NOT EXISTS chats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cls         TEXT    NOT NULL,
    philosopher TEXT    NOT NULL,
    role        TEXT    NOT NULL,
    content     TEXT    NOT NULL,
    ts          INTEGER NOT NULL
  );
`);

// 폴링용 버전 카운터 (질문이 바뀔 때마다 증가). 단일 프로세스 메모리에만 둡니다.
const versions = new Map();
CLASSES.forEach((c) => versions.set(c, 0));

const stmts = {
  upsertQ: db.prepare(`
    INSERT INTO questions (cls, clientId, kantQ, leopoldQ, ts)
    VALUES (@cls, @clientId, @kantQ, @leopoldQ, @ts)
    ON CONFLICT(cls, clientId) DO UPDATE SET
      kantQ = excluded.kantQ, leopoldQ = excluded.leopoldQ, ts = excluded.ts
  `),
  listQ: db.prepare(`SELECT kantQ, leopoldQ, ts FROM questions WHERE cls = ? ORDER BY ts ASC`),
  insertChat: db.prepare(`INSERT INTO chats (cls, philosopher, role, content, ts) VALUES (?, ?, ?, ?, ?)`),
  listChat: db.prepare(`SELECT role, content FROM chats WHERE cls = ? AND philosopher = ? ORDER BY id ASC`),
  clearChat: db.prepare(`DELETE FROM chats WHERE cls = ? AND philosopher = ?`),
  clearChatAll: db.prepare(`DELETE FROM chats WHERE cls = ?`),
};

function isValidClass(cls) {
  return CLASSES.includes(cls);
}

// 학생이 익명으로 질문 제출/수정 (clientId로 중복 방지). 학번·이름은 받지도 저장하지도 않음.
function submitQuestions(cls, { clientId, kantQ, leopoldQ }) {
  if (!isValidClass(cls)) return;
  const id = String(clientId || '').trim() || ('anon-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  stmts.upsertQ.run({
    cls,
    clientId: id,
    kantQ: String(kantQ || ''),
    leopoldQ: String(leopoldQ || ''),
    ts: Date.now(),
  });
  versions.set(cls, (versions.get(cls) || 0) + 1);
}

// 교사 화면/PDF용: 익명 질문 목록 (식별정보 없음)
function getQuestions(cls) {
  if (!isValidClass(cls)) return [];
  return stmts.listQ.all(cls);
}

function getVersion(cls) {
  return versions.get(cls) || 0;
}

function getChat(cls, philosopher) {
  if (!isValidClass(cls)) return [];
  const p = philosopher === 'leopold' ? 'leopold' : 'kant';
  return stmts.listChat.all(cls, p);
}

function appendChat(cls, philosopher, userMsg, assistantMsg) {
  if (!isValidClass(cls)) return;
  const p = philosopher === 'leopold' ? 'leopold' : 'kant';
  const ts = Date.now();
  if (userMsg != null) stmts.insertChat.run(cls, p, 'user', String(userMsg), ts);
  if (assistantMsg != null) stmts.insertChat.run(cls, p, 'assistant', String(assistantMsg), ts);
}

function clearChat(cls, philosopher) {
  if (!isValidClass(cls)) return;
  if (philosopher === 'kant' || philosopher === 'leopold') stmts.clearChat.run(cls, philosopher);
  else stmts.clearChatAll.run(cls);
}

module.exports = {
  CLASSES, isValidClass,
  submitQuestions, getQuestions, getVersion,
  getChat, appendChat, clearChat,
};
