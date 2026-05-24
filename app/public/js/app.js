/* ============================ M-TRAIN SPA ============================ */
(function () {
  const D = window.MT_DATA;

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

  let toastTimer;
  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 2600);
  }

  async function api(url, opts) {
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error((data && data.error) || ('오류 ' + res.status));
    return data;
  }

  async function downloadPdf(url, body, filename) {
    const res = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = 'PDF 생성 실패';
      try { const j = await res.json(); if (j.error) msg = j.error; } catch (_) {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- state ----------
  const FRESH = {
    cls: null, role: null, studentNo: '', name: '',
    tendency: null,
    quizStageIdx: 0, quizAttempt: null, quizResult: null,
    kantQ: '', leopoldQ: '', integratedThought: '', feeling: '',
    page: 1,
  };
  let S = Object.assign({}, FRESH);

  function save() { try { sessionStorage.setItem('mt_state', JSON.stringify(S)); } catch (_) {} }
  function load() {
    try { const r = sessionStorage.getItem('mt_state'); if (r) S = Object.assign({}, FRESH, JSON.parse(r)); } catch (_) {}
  }

  // ---------- navigation ----------
  const renderers = {};
  function go(n) {
    S.page = n; save();
    $$('.page').forEach((p) => p.classList.remove('active'));
    const pg = $('#page' + n);
    pg.classList.add('active');
    updateTopbar();
    if (renderers[n]) renderers[n]();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function updateTopbar() {
    const tb = $('#topbar');
    if (!S.cls) { tb.style.display = 'none'; return; }
    tb.style.display = 'flex';
    $('#tbCls').textContent = S.cls + '반';
    const who = $('#tbWho');
    if (S.role === 'teacher') { who.textContent = '👩‍🏫 교사'; who.style.display = ''; }
    else if (S.role === 'student') { who.textContent = `🧑‍🎓 ${S.name || '학생'}`; who.style.display = ''; }
    else who.style.display = 'none';
  }

  // ========================================================================
  // PAGE 1 — 학급 + 역할 선택
  // ========================================================================
  renderers[1] = function () {
    const grid = window.MT_CLASSES.map((c) =>
      `<div class="class-card${S.cls === c ? ' sel' : ''}" data-cls="${c}">
         <span class="num">${c}</span>반</div>`).join('');
    $('#page1').innerHTML = `
      <div class="comic-title">
        <h1>자연과 인간의 관계</h1>
        <span class="sub">🚂 산을 오르며 생각하는 사람과 자연 이야기</span>
      </div>
      <div class="panel tilt">
        <div class="section-title yellow">우리 반을 선택하세요!</div>
        <div class="grid-class" id="clsGrid">${grid}</div>
        <div class="role-row">
          <div class="role-card student" id="goStudent">
            <span class="emoji">🧑‍🎓</span><span class="lbl">학생으로 시작</span>
          </div>
          <div class="role-card teacher" id="goTeacher">
            <span class="emoji">👩‍🏫</span><span class="lbl">교사로 시작</span>
          </div>
        </div>
        <hr class="hr">
        <div class="center">
          <button class="btn gray" id="showAccess">📱 학생 접속 주소 / QR 보기</button>
          <div id="accessBox" style="display:none" class="mt"></div>
        </div>
      </div>`;
    $$('#clsGrid .class-card').forEach((el) =>
      el.addEventListener('click', () => { S.cls = el.dataset.cls; save(); renderers[1](); updateTopbar(); }));
    $('#goStudent').addEventListener('click', () => {
      if (!S.cls) return toast('먼저 우리 반을 선택해 주세요!', 'err');
      S.role = 'student'; save(); go(2);
    });
    $('#goTeacher').addEventListener('click', () => {
      if (!S.cls) return toast('먼저 우리 반을 선택해 주세요!', 'err');
      S.role = 'teacher'; save(); go(3);
    });
    $('#showAccess').addEventListener('click', showAccess);
  };

  async function showAccess() {
    const box = $('#accessBox');
    if (box.style.display !== 'none') { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = '<span class="spinner"></span> 주소를 불러오는 중...';
    try {
      const info = await api('/api/netinfo');
      const url = info.tunnelUrl || info.lanUrl;
      box.innerHTML = `
        <div class="qr-box">
          <div class="muted">학생들은 같은 와이파이에서 아래 주소로 접속하거나 QR을 스캔하세요</div>
          <div class="url-pill">${esc(url)}</div>
          ${info.tunnelUrl ? `<div class="muted">LAN: ${esc(info.lanUrl)}</div>` : ''}
          <div><img src="/qr.png?text=${encodeURIComponent(url)}" alt="QR"></div>
        </div>`;
    } catch (e) { box.innerHTML = '<span class="lock-note">주소를 불러오지 못했습니다.</span>'; }
  }

  // ========================================================================
  // PAGE 2 — 학생 정보
  // ========================================================================
  renderers[2] = function () {
    $('#page2').innerHTML = `
      <div class="panel">
        <div class="section-title">🧑‍🎓 학생 정보 입력</div>
        <div class="bubble yellow">안녕하세요! 활동을 시작하기 전에 <b>학번</b>과 <b>이름</b>을 알려주세요.</div>
        <label class="fld">학번</label>
        <input class="txt" id="inNo" inputmode="numeric" placeholder="예) 10123" value="${esc(S.studentNo)}">
        <label class="fld">이름</label>
        <input class="txt" id="inName" placeholder="예) 홍길동" value="${esc(S.name)}">
        <div class="btn-row between mt">
          <button class="btn gray" id="back1">◀ 이전</button>
          <button class="btn blue" id="next4">다음 ▶</button>
        </div>
      </div>`;
    $('#back1').addEventListener('click', () => go(1));
    $('#next4').addEventListener('click', () => {
      const no = $('#inNo').value.trim(), nm = $('#inName').value.trim();
      if (!no) return toast('학번을 입력해 주세요.', 'err');
      if (!nm) return toast('이름을 입력해 주세요.', 'err');
      S.studentNo = no; S.name = nm; save(); updateTopbar(); go(4);
    });
  };

  // ========================================================================
  // PAGE 3 — 교사 API 키
  // ========================================================================
  renderers[3] = function () {
    $('#page3').innerHTML = `
      <div class="panel">
        <div class="section-title">👩‍🏫 교사 시작 — Claude API 키 입력</div>
        <div class="bubble blue">교실 대표로서 AI 사상가(칸트·레오폴드)와 대화하려면 <b>Claude(클로드) API 키</b>가 필요해요.
        키는 이 컴퓨터(서버)에만 저장되며 학생에게는 전송되지 않습니다.</div>
        <label class="fld">Claude API 키</label>
        <input class="txt" id="inKey" type="password" placeholder="sk-ant-..." autocomplete="off">
        <label class="fld">사용할 모델</label>
        <select class="txt" id="inModel">
          <option value="claude-sonnet-4-6">claude-sonnet-4-6 (추천 · 균형)</option>
          <option value="claude-opus-4-7">claude-opus-4-7 (최고 품질)</option>
          <option value="claude-haiku-4-5">claude-haiku-4-5 (빠름·저렴)</option>
        </select>
        <div class="muted mt">※ API 키는 console.anthropic.com 에서 발급받을 수 있어요.</div>
        <div class="btn-row between mt">
          <button class="btn gray" id="back1b">◀ 이전</button>
          <button class="btn blue" id="goManage">시작하기 (질문 수집·대화) ▶</button>
        </div>
      </div>`;
    $('#back1b').addEventListener('click', () => go(1));
    $('#goManage').addEventListener('click', async () => {
      const key = $('#inKey').value.trim();
      const model = $('#inModel').value;
      if (!key) return toast('API 키를 입력해 주세요.', 'err');
      try {
        await api('/api/teacher/apikey', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cls: S.cls, apiKey: key, model }),
        });
        S.model = model; save();
        toast('API 키가 등록되었어요!', 'ok');
        go(10);
      } catch (e) { toast(e.message, 'err'); }
    });
  };

  // ========================================================================
  // PAGE 4 — 산악열차 읽기 + 성향 체크리스트
  // ========================================================================
  renderers[4] = function () {
    const r = D.reading;
    const items = D.checklist.map((it, i) =>
      `<div class="check-item" data-i="${i}">
         <div class="box"></div>
         <div class="t"><span class="check-num">${i + 1}.</span>${esc(it.t)}</div>
       </div>`).join('');
    $('#page4').innerHTML = `
      <div class="panel reading">
        <div class="section-title">📖 함께 읽어요</div>
        <h2 style="margin:4px 0 10px;color:var(--blue-d)">${esc(r.title)}</h2>
        <img src="${r.img}" alt="산악열차" loading="lazy">
        ${r.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
        <p class="note">${esc(r.note)}</p>
      </div>
      <div class="panel">
        <div class="section-title green">✅ 나의 성향 체크리스트</div>
        <div class="bubble green">글을 읽고 <b>내 생각과 같은 것</b>에 모두 체크해 보세요. (몇 개든 괜찮아요!)</div>
        <div id="checks" class="mt">${items}</div>
        <div class="center mt"><button class="btn blue big" id="calcBtn">결과 확인하기 🔎</button></div>
        <div id="tendencyResult"></div>
      </div>`;
    $$('#checks .check-item').forEach((el) =>
      el.addEventListener('click', () => el.classList.toggle('on')));
    $('#calcBtn').addEventListener('click', () => {
      let human = 0, eco = 0;
      $$('#checks .check-item').forEach((el) => {
        if (el.classList.contains('on')) {
          (D.checklist[+el.dataset.i].type === 'human') ? human++ : eco++;
        }
      });
      let label, emoji, desc;
      if (human > eco) { label = '인간 중심주의 성향'; emoji = '🏗️'; desc = '사람의 편리함과 이익을 더 중요하게 생각하는 편이에요.'; }
      else if (eco > human) { label = '생태 중심주의 성향'; emoji = '🌿'; desc = '자연 그 자체의 가치와 보전을 더 중요하게 생각하는 편이에요.'; }
      else { label = '균형 잡힌 통합적 성향'; emoji = '⚖️'; desc = '사람과 자연을 모두 소중히 여기는 균형 잡힌 생각을 가지고 있어요.'; }
      S.tendency = { label, human, eco, total: human + eco }; save();
      $('#tendencyResult').innerHTML = `
        <hr class="hr">
        <div class="result-card">
          <div style="font-size:46px">${emoji}</div>
          <div class="muted">나의 성향은...</div>
          <div class="big">${label}</div>
          <div>${desc}</div>
          <div class="result-bars">
            <div class="rb human"><div>🏗️ 인간 중심</div><div class="n">${human}</div></div>
            <div class="rb eco"><div>🌿 생태 중심</div><div class="n">${eco}</div></div>
          </div>
          <button class="btn green big" id="toLearn">다양한 관점 배우러 가기 ▶</button>
        </div>`;
      $('#toLearn').addEventListener('click', () => { S.quizStageIdx = 0; save(); go(5); });
      $('#tendencyResult').scrollIntoView({ behavior: 'smooth' });
    });
  };

  // ========================================================================
  // PAGE 5 / 6 — 관점 학습
  // ========================================================================
  function learnHTML(p, accent) {
    return `
      <div class="panel">
        <div class="section-title ${accent}">${p === D.anthro ? '🏗️' : '🌿'} ${esc(p.title)} <small>· ${esc(p.badge)}</small></div>
        <div class="fig2">
          ${p.images.map((im) => `<figure class="figure"><img src="${im.src}" loading="lazy"><figcaption>${esc(im.cap)}</figcaption></figure>`).join('')}
        </div>
        <div class="bubble ${accent === 'green' ? 'green' : 'blue'} mt"><b>뜻:</b> ${esc(p.def)}</div>
        <h3 class="mt">특징</h3>
        ${p.features.map((f) => `<div class="feat ${accent === 'green' ? 'green' : ''}"><h4>• ${esc(f.h)}</h4><p>${esc(f.b)}</p></div>`).join('')}
        <h3 class="mt">장점과 한계</h3>
        <div class="pc-grid">
          <div class="pc pros"><h4>👍 장점</h4><ul>${p.pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <div class="pc cons"><h4>⚠️ 한계</h4><ul>${p.cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </div>
        <h3 class="mt">대표 사상가</h3>
        ${p.thinkers.map((t) => `<div class="thinker ${accent === 'green' ? 'green' : ''}"><span class="tn">${esc(t.n)}</span><span>${esc(t.d)}</span></div>`).join('')}
      </div>`;
  }

  renderers[5] = function () {
    $('#page5').innerHTML = learnHTML(D.anthro, 'blue') + `
      <div class="btn-row between">
        <button class="btn gray" id="b5back">◀ 이전</button>
        <button class="btn blue" id="b5next">생태 중심주의 보기 ▶</button>
      </div>`;
    $('#b5back').addEventListener('click', () => go(4));
    $('#b5next').addEventListener('click', () => go(6));
  };

  renderers[6] = function () {
    const stage = D.stages[S.quizStageIdx];
    $('#page6').innerHTML = learnHTML(D.eco, 'green') + `
      <div class="panel center">
        <div class="bubble green" style="display:inline-block">이제 배운 내용을 <b>O·X 형성평가</b>로 확인해 볼까요?</div>
        <div class="muted mt">곧 시작할 도전: <b>${esc(stage.label)}</b> · 8문제 중 <b>${stage.pass}개 이상</b> 맞히면 통과! · 힌트 ${stage.hints}회</div>
        <div class="btn-row mt">
          <button class="btn gray" id="b6back">◀ 인간 중심주의 다시 보기</button>
          <button class="btn red big" id="b6quiz">형성평가 도전하기! ✏️</button>
        </div>
      </div>`;
    $('#b6back').addEventListener('click', () => go(5));
    $('#b6quiz').addEventListener('click', () => { startAttempt(); go(7); });
  };

  // ========================================================================
  // PAGE 7 / 8 — O·X 형성평가
  // ========================================================================
  function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function startAttempt() {
    const stage = D.stages[S.quizStageIdx];
    const qs = shuffle(D.quizBank).slice(0, stage.count);
    S.quizAttempt = {
      stage: stage.stage, label: stage.label, pass: stage.pass,
      questions: qs, answers: new Array(stage.count).fill(null),
      hintsLeft: stage.hints, hintsTotal: stage.hints, hintShown: new Array(stage.count).fill(false),
      idx: 0,
    };
    save();
  }

  renderers[7] = function () {
    const A = S.quizAttempt;
    if (!A) { go(6); return; }
    const i = A.idx, q = A.questions[i];
    const dots = A.questions.map((_, k) =>
      `<span class="dot ${A.answers[k] != null ? 'done' : ''} ${k === i ? 'cur' : ''}"></span>`).join('');
    const cur = A.answers[i];
    $('#page7').innerHTML = `
      <div class="panel">
        <div class="quiz-head">
          <span class="section-title red" style="margin:0">✏️ ${esc(A.label)}</span>
          <span class="chip">문제 ${i + 1} / ${A.questions.length}</span>
          <span class="chip hint">💡 힌트 ${A.hintsLeft} / ${A.hintsTotal}</span>
          <span class="chip">통과 기준 ${A.pass}개</span>
        </div>
        <div class="progress-dots">${dots}</div>
        <div class="bubble yellow mt"><b>맞으면 O, 틀리면 X!</b></div>
        <div class="qbox mt">${esc(q.q)}</div>
        <div class="ox-row">
          <div class="ox-btn o ${cur === 'O' ? 'sel' : ''}" data-ans="O">O</div>
          <div class="ox-btn x ${cur === 'X' ? 'sel' : ''}" data-ans="X">X</div>
        </div>
        <div id="hintArea">${A.hintShown[i] ? `<div class="hint-box">💡 ${esc(q.hint)}</div>` : ''}</div>
        <div class="btn-row between mt">
          <button class="btn gray" id="qPrev" ${i === 0 ? 'disabled' : ''}>◀ 이전</button>
          <button class="btn yellow" id="qHint" ${A.hintsLeft <= 0 || A.hintShown[i] ? 'disabled' : ''}>💡 힌트 보기</button>
          <button class="btn blue" id="qNext">${i === A.questions.length - 1 ? '채점하기 ✅' : '다음 ▶'}</button>
        </div>
      </div>`;
    $$('#page7 .ox-btn').forEach((el) =>
      el.addEventListener('click', () => { A.answers[i] = el.dataset.ans; save(); renderers[7](); }));
    $('#qHint').addEventListener('click', () => {
      if (A.hintsLeft <= 0 || A.hintShown[i]) return;
      A.hintsLeft--; A.hintShown[i] = true; save(); renderers[7]();
    });
    $('#qPrev').addEventListener('click', () => { if (A.idx > 0) { A.idx--; save(); renderers[7](); } });
    $('#qNext').addEventListener('click', () => {
      if (A.answers[i] == null) return toast('O 또는 X를 선택해 주세요!', 'err');
      if (i < A.questions.length - 1) { A.idx++; save(); renderers[7](); }
      else {
        if (A.answers.some((a) => a == null)) {
          const miss = A.answers.findIndex((a) => a == null);
          A.idx = miss; save(); renderers[7](); return toast('아직 안 푼 문제가 있어요!', 'err');
        }
        go(8);
      }
    });
  };

  renderers[8] = function () {
    const A = S.quizAttempt;
    if (!A) { go(6); return; }
    let correct = 0;
    const list = A.questions.map((q, k) => {
      const ok = A.answers[k] === q.a;
      if (ok) correct++;
      return `<div class="grade-item ${ok ? 'ok' : 'no'}">
        <span class="mark">${ok ? '⭕' : '❌'}</span>
        <div><div>${esc(q.q)}</div>
        <div class="muted">내 답: <b>${A.answers[k] || '-'}</b> · 정답: <b>${q.a}</b></div></div></div>`;
    }).join('');
    const passed = correct >= A.pass;
    S.quizResult = { stage: A.stage, correct, total: A.questions.length, passed }; save();

    let footer;
    if (passed) {
      footer = `
        <div class="result-card">
          <div style="font-size:46px">🎉</div>
          <div class="big" style="color:var(--green-d)">통과! 잘했어요!</div>
          <div>8문제 중 <b>${correct}</b>개 정답 (통과 기준 ${A.pass}개)</div>
          <button class="btn green big mt" id="g8next">사상가 만나러 가기 ▶</button>
        </div>`;
    } else {
      footer = `
        <div class="result-card">
          <div style="font-size:46px">📚</div>
          <div class="big" style="color:var(--red)">조금 더 공부해 볼까요?</div>
          <div>8문제 중 <b>${correct}</b>개 정답 (통과하려면 ${A.pass}개 필요)</div>
          <div class="lock-note mt">5·6페이지의 <b>인간 중심주의·생태 중심주의 학습 화면</b>으로 돌아가 다시 공부한 뒤 도전해요!</div>
          <button class="btn blue big mt" id="g8relearn">다시 학습하러 가기 ▶</button>
        </div>`;
    }
    $('#page8').innerHTML = `
      <div class="panel">
        <div class="section-title ${passed ? 'green' : 'red'}">📝 정답 확인 — ${esc(A.label)}</div>
        ${list}
        <hr class="hr">
        ${footer}
      </div>`;
    if (passed) $('#g8next').addEventListener('click', () => go(9));
    else $('#g8relearn').addEventListener('click', () => {
      S.quizStageIdx = Math.min(S.quizStageIdx + 1, D.stages.length - 1);
      S.quizAttempt = null; save(); go(5);
    });
  };

  // ========================================================================
  // PAGE 9 — 사상가 소개 + 질문 입력
  // ========================================================================
  renderers[9] = function () {
    const k = D.philosophers.kant, l = D.philosophers.leopold;
    const card = (p, cls) => `
      <div class="phil-card ${cls}">
        <img src="${p.img}" loading="lazy" alt="${esc(p.name)}">
        <div class="info">
          <h3>${esc(p.name)} <small class="muted">${esc(p.en)}</small></h3>
          <span class="side">${esc(p.side)}</span>
          <p style="margin:8px 0;font-size:15px;line-height:1.5">${esc(p.bio)}</p>
          <div class="phil-quote">“${esc(p.quote)}”</div>
        </div>
      </div>`;
    $('#page9').innerHTML = `
      <div class="panel">
        <div class="section-title">🧠 사상가를 만나요</div>
        ${card(k, '')}
        <hr class="hr">
        ${card(l, 'green')}
      </div>
      <div class="panel">
        <div class="section-title yellow">✉️ 사상가에게 질문하기</div>
        <div class="bubble yellow">두 사상가에게 <b>각각 궁금한 점</b>을 질문으로 적어보세요. 선생님이 교실 대표로 AI 사상가에게 물어봐 줄 거예요!</div>
        <label class="fld">🧠 칸트에게 하고 싶은 질문</label>
        <textarea class="txt" id="qKant" placeholder="예) 동물도 사람처럼 소중하게 대해야 하나요?">${esc(S.kantQ)}</textarea>
        <label class="fld">🌿 레오폴드에게 하고 싶은 질문</label>
        <textarea class="txt" id="qLeo" placeholder="예) 사람도 자연의 한 부분이라는 건 무슨 뜻인가요?">${esc(S.leopoldQ)}</textarea>
        <div class="btn-row between mt">
          <button class="btn gray" id="b9back">◀ 이전</button>
          <button class="btn green big" id="b9send">질문 보내고 다음으로 ▶</button>
        </div>
      </div>`;
    $('#b9back').addEventListener('click', () => go(8));
    $('#b9send').addEventListener('click', async () => {
      const kq = $('#qKant').value.trim(), lq = $('#qLeo').value.trim();
      if (!kq) return toast('칸트에게 할 질문을 적어주세요.', 'err');
      if (!lq) return toast('레오폴드에게 할 질문을 적어주세요.', 'err');
      S.kantQ = kq; S.leopoldQ = lq; save();
      const btn = $('#b9send'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 보내는 중...';
      try {
        await api('/api/questions', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cls: S.cls, studentNo: S.studentNo, name: S.name, kantQ: kq, leopoldQ: lq }),
        });
        toast('질문을 선생님께 전송했어요!', 'ok');
        go(11);
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = '질문 보내고 다음으로 ▶'; }
    });
  };

  // ========================================================================
  // PAGE 10 — 교사: 실시간 질문 + AI 대화 + PDF 저장
  // ========================================================================
  let pollTimer = null, lastVersion = -1, curPhil = 'kant', chats = { kant: [], leopold: [] };

  renderers[10] = function () {
    $('#page10').innerHTML = `
      <div class="comic-title"><h1>교사 진행 화면</h1><span class="sub">${esc(S.cls)}반 · 교실 대표로 AI 사상가와 대화</span></div>
      <div class="teacher-grid">
        <div class="panel">
          <div class="section-title">📥 실시간 학생 질문 <span class="live-dot"></span></div>
          <div class="muted">질문을 클릭하면 아래 대화창에 자동으로 입력돼요.</div>
          <div class="qfeed" id="qfeed"><div class="muted mt">아직 들어온 질문이 없어요...</div></div>
        </div>
        <div class="panel">
          <div class="section-title green">🤖 AI 사상가와 대화</div>
          <div class="chat-tabs">
            <div class="chat-tab kant act" data-p="kant">🧠 AI 칸트</div>
            <div class="chat-tab leopold" data-p="leopold">🌿 AI 레오폴드</div>
          </div>
          <div class="chat-win" id="chatWin"></div>
          <div class="chat-input">
            <input class="txt" id="chatIn" placeholder="교실 대표로 질문을 입력하세요...">
            <button class="btn blue" id="chatSend">전송</button>
          </div>
          <div class="btn-row between mt">
            <button class="btn gray" id="chatReset">현재 대화 초기화</button>
            <button class="btn green" id="savePdf">💾 대화 저장 (PDF)</button>
          </div>
          <div class="muted center mt">키 재입력이 필요하면 <button class="btn gray" id="reKey" style="font-size:13px;padding:4px 10px">API 키 다시 입력</button></div>
        </div>
      </div>`;

    $$('#page10 .chat-tab').forEach((el) =>
      el.addEventListener('click', () => switchPhil(el.dataset.p)));
    $('#chatSend').addEventListener('click', sendChat);
    $('#chatIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
    $('#chatReset').addEventListener('click', resetChat);
    $('#savePdf').addEventListener('click', saveTeacherPdf);
    $('#reKey').addEventListener('click', () => { stopPoll(); go(3); });

    curPhil = 'kant';
    loadChat('kant'); loadChat('leopold');
    startPoll();
  };

  function startPoll() {
    stopPoll(); lastVersion = -1;
    const tick = async () => {
      try {
        const st = await api('/api/state?cls=' + encodeURIComponent(S.cls));
        if (st.version !== lastVersion) { lastVersion = st.version; renderFeed(st.questions); }
      } catch (_) {}
    };
    tick();
    pollTimer = setInterval(tick, 2000);
  }
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function renderFeed(qs) {
    const feed = $('#qfeed'); if (!feed) return;
    if (!qs.length) { feed.innerHTML = '<div class="muted mt">아직 들어온 질문이 없어요...</div>'; return; }
    feed.innerHTML = qs.slice().reverse().map((q) => `
      <div class="qitem" data-k="${esc(q.kantQ)}" data-l="${esc(q.leopoldQ)}">
        <span class="who">${esc(q.studentNo)} ${esc(q.name)}</span>
        ${q.kantQ ? `<span class="ql">🧠 ${esc(q.kantQ)}</span>` : ''}
        ${q.leopoldQ ? `<span class="ql">🌿 ${esc(q.leopoldQ)}</span>` : ''}
      </div>`).join('');
    $$('#qfeed .qitem').forEach((el) => el.addEventListener('click', () => {
      const q = curPhil === 'kant' ? el.dataset.k : el.dataset.l;
      const inp = $('#chatIn'); inp.value = q; inp.focus();
    }));
  }

  function switchPhil(p) {
    curPhil = p;
    $$('#page10 .chat-tab').forEach((el) => el.classList.toggle('act', el.dataset.p === p));
    renderChat();
  }

  async function loadChat(p) {
    try {
      const r = await api(`/api/chat?cls=${encodeURIComponent(S.cls)}&philosopher=${p}`);
      chats[p] = r.messages || [];
      if (p === curPhil) renderChat();
    } catch (_) {}
  }

  function renderChat() {
    const win = $('#chatWin'); if (!win) return;
    const msgs = chats[curPhil] || [];
    const aiName = curPhil === 'kant' ? 'AI 칸트' : 'AI 레오폴드';
    if (!msgs.length) {
      win.innerHTML = `<div class="muted center mt">${aiName}와 대화를 시작해 보세요.<br>왼쪽 학생 질문을 클릭하면 자동으로 입력돼요.</div>`;
      return;
    }
    win.innerHTML = msgs.map((m) =>
      `<div class="msg ${m.role === 'user' ? 'user' : 'ai'}">
        <span class="nm">${m.role === 'user' ? '교실 대표(우리 반)' : aiName}</span>${nl2br(m.content)}</div>`).join('');
    win.scrollTop = win.scrollHeight;
  }

  async function sendChat() {
    const inp = $('#chatIn'); const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    chats[curPhil].push({ role: 'user', content: text });
    const thinking = { role: 'assistant', content: '…' };
    chats[curPhil].push(thinking); renderChat();
    try {
      const r = await api('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cls: S.cls, philosopher: curPhil, message: text }),
      });
      chats[curPhil][chats[curPhil].length - 1] = { role: 'assistant', content: r.reply };
      renderChat();
    } catch (e) {
      chats[curPhil].pop(); // remove thinking
      chats[curPhil].pop(); // remove the user msg we optimistically added (server didn't store on failure)
      renderChat();
      toast(e.message, 'err');
      inp.value = text;
    }
  }

  async function resetChat() {
    if (!confirm(`${curPhil === 'kant' ? 'AI 칸트' : 'AI 레오폴드'} 대화를 모두 지울까요?`)) return;
    try {
      await api('/api/chat/reset', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cls: S.cls, philosopher: curPhil }),
      });
      chats[curPhil] = []; renderChat(); toast('대화를 초기화했어요.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  async function saveTeacherPdf() {
    const btn = $('#savePdf'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 저장 중...';
    try {
      await downloadPdf('/api/pdf/teacher', { cls: S.cls }, `${S.cls}반 철학자 대화.pdf`);
      toast('대화를 PDF로 저장했어요!', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    finally { btn.disabled = false; btn.innerHTML = '💾 대화 저장 (PDF)'; }
  }

  // ========================================================================
  // PAGE 11 — 학생: 통합적 관점 + 느낀 점 + PDF
  // ========================================================================
  renderers[11] = function () {
    const it = D.integrated;
    $('#page11').innerHTML = `
      <div class="panel reading">
        <div class="section-title">🤝 ${esc(it.title)}</div>
        <div class="bubble blue">${esc(it.body)}</div>
        <p style="font-size:17px;margin-top:12px"><b>💭 ${esc(it.prompt)}</b></p>
      </div>
      <div class="panel">
        <div class="section-title yellow">📨 내가 사상가에게 한 질문</div>
        <div class="feat"><h4>🧠 칸트에게</h4><p>${esc(S.kantQ) || '(질문 없음)'}</p></div>
        <div class="feat green"><h4>🌿 레오폴드에게</h4><p>${esc(S.leopoldQ) || '(질문 없음)'}</p></div>
      </div>
      <div class="panel">
        <div class="section-title green">✍️ 나의 생각 정리</div>
        <label class="fld">통합적 관점 — 자연과 사람이 함께 잘 살기 위해 내가 할 수 있는 노력</label>
        <textarea class="txt" id="inThought" placeholder="예) 가까운 거리는 걸어다니고, 쓰레기를 줄이고...">${esc(S.integratedThought)}</textarea>
        <label class="fld">철학자(칸트·레오폴드)와의 대화에서 느낀 점</label>
        <textarea class="txt" id="inFeel" placeholder="예) 동물을 대하는 태도에 대해 다시 생각하게 되었다...">${esc(S.feeling)}</textarea>
        <div class="btn-row between mt">
          <button class="btn gray" id="b11back">◀ 이전</button>
          <button class="btn red big" id="b11pdf">📄 활동지 PDF로 저장하기</button>
        </div>
        <div id="doneBox"></div>
      </div>`;
    $('#b11back').addEventListener('click', () => go(9));
    $('#b11pdf').addEventListener('click', async () => {
      const th = $('#inThought').value.trim(), fe = $('#inFeel').value.trim();
      if (!th) return toast('통합적 관점에 대한 내 생각을 적어주세요.', 'err');
      if (!fe) return toast('철학자와의 대화에서 느낀 점을 적어주세요.', 'err');
      S.integratedThought = th; S.feeling = fe; save();
      const btn = $('#b11pdf'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 만드는 중...';
      try {
        await downloadPdf('/api/pdf/student', {
          cls: S.cls, studentNo: S.studentNo, name: S.name,
          tendency: S.tendency, quiz: S.quizResult,
          kantQ: S.kantQ, leopoldQ: S.leopoldQ,
          integratedThought: th, feeling: fe,
        }, `${S.studentNo}_${S.name}.pdf`);
        $('#doneBox').innerHTML = `
          <hr class="hr">
          <div class="result-card">
            <div style="font-size:46px">✅</div>
            <div class="big" style="color:var(--green-d)">활동지를 저장했어요!</div>
            <div class="muted">파일 이름: <b>${esc(S.studentNo)}_${esc(S.name)}.pdf</b></div>
            <div class="mt">오늘 활동을 모두 마쳤어요. 수고했어요! 🎉</div>
          </div>`;
        $('#doneBox').scrollIntoView({ behavior: 'smooth' });
        toast('PDF를 저장했어요!', 'ok');
      } catch (e) { toast(e.message, 'err'); }
      finally { btn.disabled = false; btn.innerHTML = '📄 활동지 PDF로 저장하기'; }
    });
  };

  // ---------- boot ----------
  window.MT_CLASSES = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6'];
  async function boot() {
    try { const cfg = await api('/api/config'); if (cfg.classes) window.MT_CLASSES = cfg.classes; } catch (_) {}
    load();
    // 교사 페이지를 떠나면 폴링 중지
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopPoll(); });
    // 안전한 시작 페이지로 복귀
    const start = (S.cls && S.page) ? S.page : 1;
    go(start);
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
