// M-TRAIN — 자연과 인간의 관계 단원 수업 활동 앱 (웹툰형)
// 교사 PC에서 서버로 실행 → 학생은 같은 와이파이에서 접속(LAN+QR), 옵션으로 공개 단축 URL(터널).

const express = require('express');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const store = require('./lib/store');
const pdf = require('./lib/pdf');

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const WANT_TUNNEL = process.argv.includes('--tunnel') || process.env.TUNNEL === '1';
const TUNNEL_SUBDOMAIN = process.env.TUNNEL_SUBDOMAIN || 'm-train';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- 사상가 페르소나(시스템 프롬프트) ----------------
const PERSONAS = {
  kant: `당신은 18세기 독일 철학자 '이마누엘 칸트(Immanuel Kant)'입니다. 중학생들과 대화하는 가상의 AI 칸트로서, '인간 중심주의' 입장을 대표합니다.

[핵심 사상]
- 이성적이고 자율적인 존재인 인간만이 '목적 그 자체'로서 도덕적 지위를 지니며, 오직 인간만이 직접적인 도덕적 의무의 대상이다.
- 동물은 이성은 없지만 살아 있는 피조물이므로, 동물을 잔인하게 다루는 것은(동물에 대한 직접적 의무 때문이 아니라) 인간 자신의 도덕성과 공감 능력을 무디게 하므로 삼가야 한다.
- 자연은 인간의 정당한 목적을 위해 사용할 수 있으나, 불필요한 잔인함과 낭비는 옳지 않다.

[말하기 방식]
- 한국어로, 중학생도 이해할 수 있도록 친절하고 쉽게 말한다. 어려운 용어는 풀어서 설명한다.
- 항상 칸트 본인으로서 1인칭으로 답한다. 위엄 있으면서도 따뜻하게.
- 답변은 2~4문장으로 간결하게. 때때로 학생이 더 깊이 생각하도록 되묻는 질문으로 끝맺는다.
- 자신의 입장(인간 중심주의)을 일관되게 유지하되, 생태 중심주의 입장도 존중하며 비교해 설명한다.`,
  leopold: `당신은 20세기 미국의 생태학자이자 철학자 '알도 레오폴드(Aldo Leopold)'입니다. 중학생들과 대화하는 가상의 AI 레오폴드로서, '생태 중심주의(대지 윤리)' 입장을 대표합니다.

[핵심 사상]
- 윤리 공동체의 범위를 토양, 물, 식물, 동물, 곧 '대지(land)' 전체로 확장해야 한다(대지 윤리).
- 인간은 대지 공동체의 '정복자'가 아니라 '평범한 구성원이자 시민'이다.
- 자연은 인간의 이익과 무관하게 그 자체로 내재적 가치를 지니므로, 동료 구성원과 공동체 자체를 존중해야 한다.

[말하기 방식]
- 한국어로, 중학생도 이해할 수 있도록 친절하고 쉽게 말한다. 어려운 용어는 풀어서 설명한다.
- 항상 레오폴드 본인으로서 1인칭으로 답한다. 자연을 사랑하는 따뜻한 어른처럼.
- 답변은 2~4문장으로 간결하게. 때때로 학생이 더 깊이 생각하도록 되묻는 질문으로 끝맺는다.
- 자신의 입장(생태 중심주의)을 일관되게 유지하되, 인간 중심주의 입장도 존중하며 비교해 설명한다.`,
};

// ---------------- API ----------------
app.get('/api/config', (req, res) => {
  res.json({ classes: store.CLASSES, defaultModel: 'claude-sonnet-4-6' });
});

// 학생: 질문 제출/갱신
app.post('/api/questions', (req, res) => {
  const { cls, studentNo, name, kantQ, leopoldQ } = req.body || {};
  if (!store.isValidClass(cls)) return res.status(400).json({ error: '학급이 올바르지 않습니다.' });
  store.submitQuestions(cls, {
    studentNo: String(studentNo || '').trim(),
    name: String(name || '').trim(),
    kantQ: String(kantQ || '').trim(),
    leopoldQ: String(leopoldQ || '').trim(),
  });
  res.json({ ok: true });
});

// 교사: 같은 학급 질문 실시간 폴링
app.get('/api/state', (req, res) => {
  const cls = req.query.cls;
  if (!store.isValidClass(cls)) return res.status(400).json({ error: 'bad class' });
  const c = store.get(cls);
  res.json({
    version: c.version,
    count: c.questions.length,
    questions: c.questions.map((q) => ({
      id: q.id, studentNo: q.studentNo, name: q.name, kantQ: q.kantQ, leopoldQ: q.leopoldQ, ts: q.ts,
    })),
  });
});

// 교사: 저장된 대화 불러오기
app.get('/api/chat', (req, res) => {
  const { cls, philosopher } = req.query;
  if (!store.isValidClass(cls)) return res.status(400).json({ error: 'bad class' });
  const c = store.get(cls);
  res.json({ messages: philosopher === 'leopold' ? c.leopoldChat : c.kantChat });
});

// 교사: AI 사상가와 대화
// API 키는 교사 브라우저가 매 요청마다 보내며, 서버는 절대 저장하지 않습니다.
app.post('/api/chat', async (req, res) => {
  const { cls, philosopher, message, apiKey, model } = req.body || {};
  if (!store.isValidClass(cls)) return res.status(400).json({ error: '학급이 올바르지 않습니다.' });
  if (philosopher !== 'kant' && philosopher !== 'leopold')
    return res.status(400).json({ error: '사상가를 선택해 주세요.' });
  if (!message || !String(message).trim()) return res.status(400).json({ error: '메시지를 입력해 주세요.' });

  const key = String(apiKey || '').trim();
  if (!key) return res.status(400).json({ error: 'API 키가 없습니다. 교사 화면에서 키를 입력해 주세요.' });

  const c = store.get(cls);
  const history = (philosopher === 'leopold' ? c.leopoldChat : c.kantChat)
    .map((m) => ({ role: m.role, content: m.content }));
  const messages = [...history, { role: 'user', content: String(message).trim() }];

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: 600,
        system: PERSONAS[philosopher],
        messages,
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      let msg = `AI 응답 오류 (${r.status})`;
      try { const j = JSON.parse(errText); if (j.error && j.error.message) msg += ': ' + j.error.message; } catch {}
      if (r.status === 401) msg = 'API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.';
      return res.status(502).json({ error: msg });
    }
    const data = await r.json();
    const reply = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
      || '(응답이 비어 있습니다.)';
    store.appendChat(cls, philosopher, String(message).trim(), reply);
    res.json({ reply });
  } catch (e) {
    res.status(502).json({ error: '네트워크 오류로 AI에 연결하지 못했습니다: ' + e.message });
  }
});

// 교사: 대화 초기화
app.post('/api/chat/reset', (req, res) => {
  const { cls, philosopher } = req.body || {};
  if (!store.isValidClass(cls)) return res.status(400).json({ error: 'bad class' });
  store.clearChat(cls, philosopher);
  res.json({ ok: true });
});

// 학생용 PDF (학번_이름.pdf)
app.post('/api/pdf/student', (req, res) => {
  const b = req.body || {};
  if (!b.studentNo || !b.name) return res.status(400).json({ error: '학번/이름이 필요합니다.' });
  try {
    pdf.buildStudentPdf(res, b);
  } catch (e) {
    res.status(500).json({ error: 'PDF 생성 실패: ' + e.message });
  }
});

// 교사용 대화 PDF (학급 철학자 대화.pdf)
app.post('/api/pdf/teacher', (req, res) => {
  const { cls } = req.body || {};
  if (!store.isValidClass(cls)) return res.status(400).json({ error: '학급이 올바르지 않습니다.' });
  const c = store.get(cls);
  try {
    pdf.buildTeacherPdf(res, {
      cls,
      questions: c.questions.map((q) => ({ studentNo: q.studentNo, name: q.name, kantQ: q.kantQ, leopoldQ: q.leopoldQ })),
      kantChat: c.kantChat,
      leopoldChat: c.leopoldChat,
    });
  } catch (e) {
    res.status(500).json({ error: 'PDF 생성 실패: ' + e.message });
  }
});

// 접속 정보 + QR
app.get('/api/netinfo', async (req, res) => {
  res.json({ lanUrl: NET.lanUrl, port: PORT, tunnelUrl: NET.tunnelUrl });
});
app.get('/qr.png', async (req, res) => {
  const text = req.query.text || NET.lanUrl;
  try {
    const buf = await QRCode.toBuffer(text, { width: 320, margin: 2, color: { dark: '#15324f', light: '#ffffff' } });
    res.setHeader('Content-Type', 'image/png');
    res.send(buf);
  } catch (e) {
    res.status(500).send('qr error');
  }
});

// SPA fallback (any non-API route -> index.html)
app.get(/^\/(?!api|qr).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------- 네트워크/시작 ----------------
const NET = { lanUrl: `http://localhost:${PORT}`, tunnelUrl: null };

function lanIp() {
  const ifaces = os.networkInterfaces();
  const all = [];
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] || []) {
      if (i.family === 'IPv4' && !i.internal) all.push(i.address);
    }
  }
  // 사설망 IP 우선 (192.168.* > 10.* > 172.16-31.* > 기타)
  const rank = (ip) =>
    ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 :
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
  all.sort((a, b) => rank(a) - rank(b));
  return all[0] || 'localhost';
}

async function printBanner() {
  const line = '═'.repeat(56);
  console.log('\n' + line);
  console.log('  🚂  M-TRAIN — 자연과 인간의 관계 수업 활동 앱');
  console.log(line);
  console.log('  같은 와이파이(LAN)에서 접속:');
  console.log('   👉  ' + NET.lanUrl);
  if (NET.tunnelUrl) {
    console.log('  공개 단축 URL(인터넷):');
    console.log('   👉  ' + NET.tunnelUrl);
  }
  console.log('\n  [학생 접속용 QR — 휴대폰 카메라로 스캔하세요]');
  try {
    const qrTarget = NET.tunnelUrl || NET.lanUrl;
    const qr = await QRCode.toString(qrTarget, { type: 'terminal', small: true });
    console.log(qr);
  } catch {}
  console.log('  교사: 위 주소로 접속 → "교사로 시작" 선택');
  console.log('  학생: 같은 주소로 접속 → "학생으로 시작" 선택');
  console.log('  종료하려면 이 창에서 Ctrl + C 를 누르세요.');
  console.log(line + '\n');
}

const server = app.listen(PORT, '0.0.0.0', async () => {
  NET.lanUrl = `http://${lanIp()}:${PORT}`;
  if (WANT_TUNNEL) {
    try {
      const localtunnel = require('localtunnel');
      const tunnel = await localtunnel({ port: PORT, subdomain: TUNNEL_SUBDOMAIN });
      NET.tunnelUrl = tunnel.url;
      tunnel.on('close', () => console.log('[tunnel] 닫힘'));
    } catch (e) {
      console.warn('[tunnel] 단축 URL 생성 실패(인터넷 필요):', e.message);
    }
  }
  await printBanner();
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n[오류] 포트 ${PORT} 가 이미 사용 중입니다. 다른 포트로 실행하세요:  set PORT=8090 && npm start\n`);
  } else {
    console.error('[서버 오류]', e.message);
  }
  process.exit(1);
});
