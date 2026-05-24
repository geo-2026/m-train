// Korean-safe PDF generation using pdfkit + system Malgun Gothic font.
// Streams directly to an Express response with an RFC 5987 (UTF-8) filename
// so Hangul filenames like "학번_이름.pdf" are preserved by browsers.

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Locate a Korean-capable TTF. Prefer the bundled Nanum Gothic (works on any OS,
// incl. Linux cloud hosts); fall back to Windows system fonts for local runs.
function findFonts() {
  const fontDir = path.join(__dirname, '..', 'fonts');
  const candidates = [
    { reg: path.join(fontDir, 'NanumGothic-Regular.ttf'), bold: path.join(fontDir, 'NanumGothic-Bold.ttf') },
    { reg: 'C:/Windows/Fonts/malgun.ttf', bold: 'C:/Windows/Fonts/malgunbd.ttf' },
    { reg: 'C:/Windows/Fonts/NanumGothic.ttf', bold: 'C:/Windows/Fonts/NanumGothicBold.ttf' },
    { reg: 'C:/Windows/Fonts/gulim.ttc', bold: 'C:/Windows/Fonts/gulim.ttc' },
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.reg)) {
      return { reg: c.reg, bold: fs.existsSync(c.bold) ? c.bold : c.reg };
    }
  }
  return null;
}

const FONTS = findFonts();

const COLORS = {
  ink: '#1a1a1a',
  blue: '#1c5fb0',
  navy: '#15324f',
  yellow: '#ffd23f',
  red: '#e23b3b',
  green: '#2e9e5b',
  gray: '#5b5b5b',
  lightYellow: '#fff7d6',
  lightBlue: '#e8f1fb',
  lightGreen: '#e7f6ec',
  border: '#1a1a1a',
};

function newDoc() {
  if (!FONTS) throw new Error('한글 글꼴(Malgun Gothic 등)을 찾을 수 없습니다.');
  const doc = new PDFDocument({ size: 'A4', margin: 46, bufferPages: true });
  doc.registerFont('kr', FONTS.reg);
  doc.registerFont('krb', FONTS.bold);
  doc.font('kr');
  return doc;
}

// Set headers and stream. filename may contain Hangul.
function streamToResponse(doc, res, filename) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(filename);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
  );
  doc.pipe(res);
  doc.end();
}

// ---- drawing helpers (webtoon / comic-panel look) ----

function pageWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

// Big comic title banner
function titleBanner(doc, title, subtitle) {
  const w = pageWidth(doc);
  const x = doc.page.margins.left;
  const y = doc.y;
  const h = subtitle ? 64 : 50;
  // shadow
  doc.save();
  doc.roundedRect(x + 3, y + 4, w, h, 8).fill('#1a1a1a');
  doc.roundedRect(x, y, w, h, 8).fill(COLORS.yellow);
  doc.lineWidth(2.5).roundedRect(x, y, w, h, 8).stroke('#1a1a1a');
  doc.fill(COLORS.navy).font('krb').fontSize(20).text(title, x + 16, y + 12, { width: w - 32 });
  if (subtitle) {
    doc.fill(COLORS.gray).font('kr').fontSize(10.5).text(subtitle, x + 16, y + 40, { width: w - 32 });
  }
  doc.restore();
  doc.x = x;
  doc.y = y + h + 16;
}

// Colored section header bar
function sectionHeader(doc, label, color) {
  ensureSpace(doc, 46);
  const w = pageWidth(doc);
  const x = doc.page.margins.left;
  const y = doc.y;
  doc.save();
  doc.roundedRect(x, y, w, 26, 5).fill(color || COLORS.blue);
  doc.fill('#ffffff').font('krb').fontSize(13).text(label, x + 12, y + 6, { width: w - 24 });
  doc.restore();
  doc.x = x;
  doc.y = y + 34;
}

// A bordered panel containing wrapped text. bg optional.
function panel(doc, text, opts = {}) {
  const w = pageWidth(doc);
  const x = doc.page.margins.left;
  const padX = 12, padY = 10;
  const fontSize = opts.fontSize || 11;
  const labelH = opts.label ? 16 : 0;
  doc.font('kr').fontSize(fontSize);
  const innerW = w - padX * 2;
  const textH = doc.heightOfString(text || '(입력 없음)', { width: innerW, lineGap: 3 });
  const h = padY * 2 + labelH + textH;
  ensureSpace(doc, h + 10);
  const y = doc.y;
  doc.save();
  if (opts.bg) doc.roundedRect(x, y, w, h, 6).fill(opts.bg);
  doc.lineWidth(1.5).roundedRect(x, y, w, h, 6).stroke(opts.borderColor || COLORS.border);
  let ty = y + padY;
  if (opts.label) {
    doc.fill(opts.labelColor || COLORS.blue).font('krb').fontSize(10).text(opts.label, x + padX, ty);
    ty += labelH;
  }
  doc.fill(opts.color || COLORS.ink).font('kr').fontSize(fontSize)
    .text(text || '(입력 없음)', x + padX, ty, { width: innerW, lineGap: 3 });
  doc.restore();
  doc.x = x;
  doc.y = y + h + 12;
}

// label : value line
function field(doc, label, value) {
  const x = doc.page.margins.left;
  doc.x = x;
  doc.font('krb').fontSize(11).fill(COLORS.navy).text(label + '  ', { continued: true });
  doc.font('kr').fill(COLORS.ink).text(value || '-');
  doc.moveDown(0.4);
}

// chat bubble (left = philosopher, right = speaker)
function bubble(doc, who, text, side, accent) {
  const w = pageWidth(doc);
  const x0 = doc.page.margins.left;
  const bubbleW = w * 0.82;
  const padX = 10, padY = 8;
  const innerW = bubbleW - padX * 2;
  doc.font('kr').fontSize(10.5);
  const nameH = 13;
  const textH = doc.heightOfString(text || '', { width: innerW, lineGap: 2 });
  const h = padY * 2 + nameH + textH;
  ensureSpace(doc, h + 8);
  const y = doc.y;
  const bx = side === 'right' ? x0 + (w - bubbleW) : x0;
  doc.save();
  doc.roundedRect(bx, y, bubbleW, h, 8).fill(side === 'right' ? COLORS.lightBlue : COLORS.lightYellow);
  doc.lineWidth(1.2).roundedRect(bx, y, bubbleW, h, 8).stroke(accent || COLORS.border);
  doc.fill(accent || COLORS.navy).font('krb').fontSize(9.5).text(who, bx + padX, y + padY);
  doc.fill(COLORS.ink).font('kr').fontSize(10.5)
    .text(text || '', bx + padX, y + padY + nameH, { width: innerW, lineGap: 2 });
  doc.restore();
  doc.x = x0;
  doc.y = y + h + 8;
}

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function footer(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 30;
    doc.font('kr').fontSize(8).fill(COLORS.gray)
      .text('자연과 인간의 관계 · M-TRAIN 수업 활동', doc.page.margins.left, y,
        { width: pageWidth(doc), align: 'left' });
    doc.font('kr').fontSize(8).fill(COLORS.gray)
      .text(`${i - range.start + 1} / ${range.count}`, doc.page.margins.left, y,
        { width: pageWidth(doc), align: 'right' });
  }
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ============================ STUDENT PDF ============================
// data: { cls, studentNo, name, tendency:{label,human,eco,total},
//         quiz:{stage,correct,total}, kantQ, leopoldQ, integratedThought, feeling }
function buildStudentPdf(res, data) {
  const doc = newDoc();
  titleBanner(doc, '자연과 인간의 관계', '나의 학습 기록장 · 학생 활동지');

  field(doc, '학급', `${data.cls}반`);
  field(doc, '학번 / 이름', `${data.studentNo} / ${data.name}`);
  field(doc, '작성 시각', today());
  doc.moveDown(0.4);

  sectionHeader(doc, '① 나의 성향 진단 (산악열차 체크리스트)', COLORS.blue);
  const t = data.tendency || {};
  const tendencyText =
    `나의 성향: ${t.label || '-'}\n` +
    `인간 중심 응답 ${t.human ?? 0}개 · 생태 중심 응답 ${t.eco ?? 0}개 (총 ${t.total ?? 0}문항)`;
  panel(doc, tendencyText, { bg: COLORS.lightBlue, borderColor: COLORS.blue, label: '진단 결과', labelColor: COLORS.blue });

  sectionHeader(doc, '② 형성평가 결과 (O·X 도전)', COLORS.green);
  const q = data.quiz || {};
  panel(doc,
    `${q.stage ? q.stage + '차 도전' : '도전'}에서 통과했어요! 정답 ${q.correct ?? 0} / ${q.total ?? 8} 개`,
    { bg: COLORS.lightGreen, borderColor: COLORS.green, label: '평가 결과', labelColor: COLORS.green });

  sectionHeader(doc, '③ 사상가에게 한 질문', COLORS.navy);
  panel(doc, data.kantQ, { label: '🧠 칸트에게 한 질문', labelColor: COLORS.blue, bg: COLORS.lightYellow, borderColor: COLORS.blue });
  panel(doc, data.leopoldQ, { label: '🌿 레오폴드에게 한 질문', labelColor: COLORS.green, bg: COLORS.lightGreen, borderColor: COLORS.green });

  sectionHeader(doc, '④ 통합적 관점 — 나의 생각', COLORS.blue);
  panel(doc, data.integratedThought, { borderColor: COLORS.blue });

  sectionHeader(doc, '⑤ 철학자와의 대화에서 느낀 점', COLORS.red);
  panel(doc, data.feeling, { borderColor: COLORS.red });

  footer(doc);
  const filename = `${data.studentNo}_${data.name}.pdf`;
  streamToResponse(doc, res, filename);
}

// ============================ TEACHER PDF ============================
// data: { cls, questions:[{studentNo,name,kantQ,leopoldQ}],
//         kantChat:[{role,content}], leopoldChat:[{role,content}] }
function buildTeacherPdf(res, data) {
  const doc = newDoc();
  titleBanner(doc, `${data.cls}반 철학자 대화 기록`, '교실 대표 — AI 사상가와의 대화 · 교사용');

  field(doc, '학급', `${data.cls}반`);
  field(doc, '저장 시각', today());
  doc.moveDown(0.4);

  sectionHeader(doc, '① 학생들이 사상가에게 한 질문', COLORS.navy);
  const qs = data.questions || [];
  if (qs.length === 0) {
    panel(doc, '수집된 질문이 없습니다.');
  } else {
    qs.forEach((it, i) => {
      const head = `${i + 1}. ${it.studentNo || ''} ${it.name || ''}`;
      let body = head + '\n';
      if (it.kantQ) body += `   🧠 칸트: ${it.kantQ}\n`;
      if (it.leopoldQ) body += `   🌿 레오폴드: ${it.leopoldQ}`;
      panel(doc, body.trim(), { fontSize: 10, bg: COLORS.lightYellow, borderColor: COLORS.border });
    });
  }

  sectionHeader(doc, '② AI 칸트와의 대화', COLORS.blue);
  const kc = data.kantChat || [];
  if (kc.length === 0) panel(doc, '대화 내용이 없습니다.');
  else kc.forEach((m) => bubble(doc, m.role === 'user' ? '교실 대표(우리 반)' : 'AI 칸트',
    m.content, m.role === 'user' ? 'right' : 'left', COLORS.blue));

  sectionHeader(doc, '③ AI 레오폴드와의 대화', COLORS.green);
  const lc = data.leopoldChat || [];
  if (lc.length === 0) panel(doc, '대화 내용이 없습니다.');
  else lc.forEach((m) => bubble(doc, m.role === 'user' ? '교실 대표(우리 반)' : 'AI 레오폴드',
    m.content, m.role === 'user' ? 'right' : 'left', COLORS.green));

  footer(doc);
  const filename = `${data.cls}반 철학자 대화.pdf`;
  streamToResponse(doc, res, filename);
}

module.exports = { buildStudentPdf, buildTeacherPdf, hasFont: !!FONTS };
