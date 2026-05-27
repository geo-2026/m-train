/****************************************************************************
 * M-TRAIN 저장소 (Google Apps Script 웹앱)
 *  - github.io 정적 앱이 학생의 *익명 질문*과 *교실 대표 대화*를 여기에 저장/조회합니다.
 *  - 학번·이름, 교사 API 키는 절대 받지 않습니다(앱에서 보내지 않음).
 *  - 데이터는 자동 생성되는 구글 시트 "M-TRAIN 데이터"에 저장되며,
 *    교사 화면의 "수업 종료" 버튼(clearClass)으로 학급별로 비울 수 있습니다.
 *
 *  배포: 확장 프로그램 → Apps Script → 배포 → 새 배포 → 유형 "웹 앱"
 *        실행 계정 "나", 액세스 "모든 사용자" → 배포 → /exec URL 복사
 ****************************************************************************/

var CLASSES = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6'];
var Q_HEADERS = ['cls', 'clientId', 'kantQ', 'leopoldQ', 'ts'];
var C_HEADERS = ['cls', 'philosopher', 'role', 'content', 'ts'];

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  // 상태 확인용 (브라우저로 열면 동작 여부를 보여줌)
  return json({ ok: true, app: 'M-TRAIN', sheet: getSpreadsheet().getUrl() });
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    var action = body.action;
    switch (action) {
      case 'ping':            return json({ ok: true, sheet: getSpreadsheet().getUrl() });
      case 'submitQuestions': return json(submitQuestions(body));
      case 'getState':        return json(getState(body));
      case 'getChat':         return json(getChat(body));
      case 'appendChat':      return json(appendChat(body));
      case 'clearChat':       return json(clearChat(body));
      case 'clearClass':      return json(clearClass(body));
      default:                return json({ error: '알 수 없는 요청입니다: ' + action });
    }
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) });
  }
}

/* ---------------- 시트 준비 ---------------- */
function getSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('M-TRAIN 데이터 (자동 생성)');
    props.setProperty('SHEET_ID', ss.getId());
    props.deleteProperty('FMT_DONE'); // 새 시트면 텍스트 형식을 다시 적용
  }
  setupSheet(ss, 'questions', Q_HEADERS);
  setupSheet(ss, 'chats', C_HEADERS);
  ensureTextFormat(ss, props);
  // 기본 시트(Sheet1) 정리
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  return ss;
}
function setupSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}
// 모든 데이터 칸을 '텍스트(@)' 형식으로 고정 → '1-6' 같은 학급 값이 날짜로
// 자동 변환되는 것을 방지한다. (시트마다 한 번만 적용)
function ensureTextFormat(ss, props) {
  if (props.getProperty('FMT_DONE') === '1') return;
  var pairs = [['questions', Q_HEADERS], ['chats', C_HEADERS]];
  for (var i = 0; i < pairs.length; i++) {
    var sh = ss.getSheetByName(pairs[i][0]);
    if (sh) sh.getRange(1, 1, sh.getMaxRows(), pairs[i][1].length).setNumberFormat('@');
  }
  props.setProperty('FMT_DONE', '1');
}
function sheet(name, headers) { return setupSheet(getSpreadsheet(), name, headers); }

// 헤더 제외한 데이터 행(2D 배열) 반환
function rows(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
}
// 데이터 영역을 새 행들로 교체(헤더 유지). 기록 전 텍스트(@) 형식을 강제한다.
function rewrite(sh, headers, data) {
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, headers.length).clearContent();
  if (data.length) {
    var rng = sh.getRange(2, 1, data.length, headers.length);
    rng.setNumberFormat('@');
    rng.setValues(data);
  }
  SpreadsheetApp.flush(); // 변경을 즉시 반영 → 다음 조회에서 바로 보이게
}
// 행 추가 — appendRow 는 텍스트 형식을 무시하므로(학급 '1-6'이 날짜로 변환됨)
// 대상 셀에 텍스트 형식을 지정한 뒤 setValues 로 기록한다.
function appendRows(sh, headers, newRows) {
  if (!newRows.length) return;
  var startRow = sh.getLastRow() + 1;
  var rng = sh.getRange(startRow, 1, newRows.length, headers.length);
  rng.setNumberFormat('@');
  rng.setValues(newRows);
  SpreadsheetApp.flush(); // 변경을 즉시 반영
}

function validClass(cls) { return CLASSES.indexOf(cls) !== -1; }
function bumpVersion(cls) {
  var p = PropertiesService.getScriptProperties();
  var v = parseInt(p.getProperty('ver_' + cls) || '0', 10) + 1;
  p.setProperty('ver_' + cls, String(v));
  return v;
}
function version(cls) {
  return parseInt(PropertiesService.getScriptProperties().getProperty('ver_' + cls) || '0', 10);
}

/* ---------------- 액션 ---------------- */
function submitQuestions(b) {
  if (!validClass(b.cls)) return { error: '학급이 올바르지 않습니다.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet('questions', Q_HEADERS);
    var data = rows(sh);
    var cid = String(b.clientId || '').trim() || ('anon-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    var now = Date.now();
    var found = false;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]) === b.cls && String(data[i][1]) === cid) {
        data[i][2] = String(b.kantQ || ''); data[i][3] = String(b.leopoldQ || ''); data[i][4] = now;
        found = true; break;
      }
    }
    if (!found) data.push([b.cls, cid, String(b.kantQ || ''), String(b.leopoldQ || ''), now]);
    rewrite(sh, Q_HEADERS, data);
    return { ok: true, version: bumpVersion(b.cls) };
  } finally { lock.releaseLock(); }
}

function getState(b) {
  if (!validClass(b.cls)) return { error: 'bad class' };
  var data = rows(sheet('questions', Q_HEADERS));
  var out = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === b.cls) out.push({ kantQ: data[i][2], leopoldQ: data[i][3], ts: data[i][4] });
  }
  out.sort(function (a, c) { return a.ts - c.ts; });
  return { version: version(b.cls), count: out.length, questions: out };
}

function getChat(b) {
  if (!validClass(b.cls)) return { error: 'bad class' };
  var phil = b.philosopher === 'leopold' ? 'leopold' : 'kant';
  var data = rows(sheet('chats', C_HEADERS));
  var out = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === b.cls && String(data[i][1]) === phil) {
      out.push({ role: data[i][2], content: data[i][3] });
    }
  }
  return { messages: out };
}

function appendChat(b) {
  if (!validClass(b.cls)) return { error: '학급이 올바르지 않습니다.' };
  var phil = b.philosopher === 'leopold' ? 'leopold' : 'kant';
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet('chats', C_HEADERS);
    var now = String(Date.now());
    var add = [];
    if (b.userMsg != null) add.push([b.cls, phil, 'user', String(b.userMsg), now]);
    if (b.assistantMsg != null) add.push([b.cls, phil, 'assistant', String(b.assistantMsg), now]);
    appendRows(sh, C_HEADERS, add);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function clearChat(b) {
  if (!validClass(b.cls)) return { error: 'bad class' };
  var phil = (b.philosopher === 'kant' || b.philosopher === 'leopold') ? b.philosopher : null;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet('chats', C_HEADERS);
    var data = rows(sh);
    var kept = data.filter(function (r) {
      if (String(r[0]) !== b.cls) return true;
      if (phil && String(r[1]) !== phil) return true;
      return false;
    });
    rewrite(sh, C_HEADERS, kept);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function clearClass(b) {
  if (!validClass(b.cls)) return { error: 'bad class' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var qs = sheet('questions', Q_HEADERS);
    rewrite(qs, Q_HEADERS, rows(qs).filter(function (r) { return String(r[0]) !== b.cls; }));
    var cs = sheet('chats', C_HEADERS);
    rewrite(cs, C_HEADERS, rows(cs).filter(function (r) { return String(r[0]) !== b.cls; }));
    bumpVersion(b.cls);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
