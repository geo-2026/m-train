// In-memory per-class store with light JSON persistence so a server restart
// doesn't lose collected questions during a lesson.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'state.json');

const CLASSES = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6'];

function blankClass() {
  return {
    questions: [],   // {id, studentNo, name, kantQ, leopoldQ, ts}
    apiKey: '',      // teacher Anthropic key (never sent to students)
    model: 'claude-sonnet-4-6',
    kantChat: [],    // [{role:'user'|'assistant', content}]
    leopoldChat: [],
    version: 0,      // bumped whenever questions change (for polling)
  };
}

const state = {};
CLASSES.forEach((c) => (state[c] = blankClass()));

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      for (const c of CLASSES) {
        if (saved[c]) state[c] = Object.assign(blankClass(), saved[c]);
      }
    }
  } catch (e) {
    console.warn('[store] 저장된 상태를 불러오지 못했습니다:', e.message);
  }
}

let saveTimer = null;
function persist() {
  // Persist everything EXCEPT the API key (keep secrets out of disk).
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const out = {};
      for (const c of CLASSES) {
        const { apiKey, ...rest } = state[c];
        out[c] = rest;
      }
      fs.writeFileSync(FILE, JSON.stringify(out, null, 1), 'utf8');
    } catch (e) {
      console.warn('[store] 상태 저장 실패:', e.message);
    }
  }, 400);
}

function get(cls) {
  return state[cls];
}

function isValidClass(cls) {
  return CLASSES.includes(cls);
}

// Student submits/updates their questions. Keyed by studentNo within a class.
function submitQuestions(cls, { studentNo, name, kantQ, leopoldQ }) {
  const c = state[cls];
  if (!c) return null;
  const existing = c.questions.find((q) => q.studentNo === studentNo && studentNo);
  const ts = Date.now();
  if (existing) {
    existing.name = name;
    existing.kantQ = kantQ;
    existing.leopoldQ = leopoldQ;
    existing.ts = ts;
  } else {
    c.questions.push({ id: ts + '-' + Math.random().toString(36).slice(2, 7), studentNo, name, kantQ, leopoldQ, ts });
  }
  c.version++;
  persist();
  return c;
}

function setApiKey(cls, apiKey, model) {
  const c = state[cls];
  if (!c) return false;
  c.apiKey = (apiKey || '').trim();
  if (model) c.model = model;
  return true;
}

function appendChat(cls, philosopher, userMsg, assistantMsg) {
  const c = state[cls];
  if (!c) return;
  const key = philosopher === 'leopold' ? 'leopoldChat' : 'kantChat';
  if (userMsg != null) c[key].push({ role: 'user', content: userMsg });
  if (assistantMsg != null) c[key].push({ role: 'assistant', content: assistantMsg });
  persist();
}

function clearChat(cls, philosopher) {
  const c = state[cls];
  if (!c) return;
  if (philosopher === 'kant') c.kantChat = [];
  else if (philosopher === 'leopold') c.leopoldChat = [];
  else { c.kantChat = []; c.leopoldChat = []; }
  persist();
}

load();

module.exports = { CLASSES, get, isValidClass, submitQuestions, setApiKey, appendChat, clearChat };
