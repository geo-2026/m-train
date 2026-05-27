/* ============================================================================
 * MTpdf — 브라우저에서 한글 PDF 생성 (pdf-lib + fontkit, NanumGothic 임베드)
 *  - 서버 없이 학생/교사 PDF를 만들어 단말기에 바로 저장합니다.
 *  - 한글이 깨지지 않도록 NanumGothic TTF를 PDF에 임베드(부분집합)합니다.
 *  - NanumGothic에 없는 이모지/특수기호는 PDF 텍스트에 넣지 않습니다(웹 화면만 사용).
 * ==========================================================================*/
(function () {
  const { PDFDocument, rgb } = window.PDFLib;
  const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const C = {
    ink: hex('#1a1a1a'), blue: hex('#1c5fb0'), navy: hex('#15324f'), yellow: hex('#ffd23f'),
    red: hex('#e23b3b'), green: hex('#2e9e5b'), gray: hex('#5b5b5b'), white: rgb(1, 1, 1),
    lightYellow: hex('#fff7d6'), lightBlue: hex('#e8f1fb'), lightGreen: hex('#e7f6ec'),
  };

  let fontCache = null;
  async function loadFonts() {
    if (fontCache) return fontCache;
    const [reg, bold] = await Promise.all([
      fetch('fonts/NanumGothic-Regular.ttf').then((r) => { if (!r.ok) throw new Error('글꼴 로드 실패'); return r.arrayBuffer(); }),
      fetch('fonts/NanumGothic-Bold.ttf').then((r) => r.ok ? r.arrayBuffer() : null).catch(() => null),
    ]);
    fontCache = { reg, bold: bold || reg };
    return fontCache;
  }

  function today() {
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ---- 문서 빌더 (좌상단 기준 y(=위에서부터 거리)로 흐름 관리) ----
  class Builder {
    constructor(doc, fr, fb) {
      this.doc = doc; this.fr = fr; this.fb = fb;
      this.W = 595.28; this.H = 841.89; this.margin = 46;
      this.cw = this.W - this.margin * 2;
      this.newPage();
    }
    newPage() { this.page = this.doc.addPage([this.W, this.H]); this.y = this.margin; }
    ensure(need) { if (this.y + need > this.H - this.margin) this.newPage(); }
    // 한 줄 텍스트(자동 줄바꿈 없음). topY = 글자 상단 위치
    line(str, x, topY, size, font, color) {
      this.page.drawText(String(str == null ? '' : str), { x, y: this.H - topY - size, size, font, color });
    }
    rect(x, topY, w, h, o) {
      const opt = { x, y: this.H - topY - h, width: w, height: h };
      if (o.fill) opt.color = o.fill;
      if (o.border) { opt.borderColor = o.border; opt.borderWidth = o.borderWidth || 1; }
      this.page.drawRectangle(opt);
    }
    wrap(text, font, size, maxW) {
      const out = [];
      const paras = String(text == null || text === '' ? '(입력 없음)' : text).split('\n');
      for (const para of paras) {
        if (para === '') { out.push(''); continue; }
        let cur = '';
        for (const ch of para) {
          const test = cur + ch;
          if (cur !== '' && font.widthOfTextAtSize(test, size) > maxW) { out.push(cur); cur = ch; }
          else cur = test;
        }
        out.push(cur);
      }
      return out;
    }
    drawLines(lines, x, topY, size, font, color, gap) {
      let yy = topY;
      for (const ln of lines) { this.line(ln, x, yy, size, font, color); yy += size * gap; }
    }
    title(title, sub) {
      const h = sub ? 64 : 50; this.ensure(h + 16);
      this.rect(this.margin + 3, this.y + 4, this.cw, h, { fill: C.ink });
      this.rect(this.margin, this.y, this.cw, h, { fill: C.yellow, border: C.ink, borderWidth: 2.5 });
      this.line(title, this.margin + 16, this.y + 14, 20, this.fb, C.navy);
      if (sub) this.line(sub, this.margin + 16, this.y + 44, 10.5, this.fr, C.gray);
      this.y += h + 16;
    }
    section(label, color) {
      const h = 26; this.ensure(h + 10);
      this.rect(this.margin, this.y, this.cw, h, { fill: color });
      this.line(label, this.margin + 12, this.y + 7, 13, this.fb, C.white);
      this.y += h + 8;
    }
    panel(text, o = {}) {
      const size = o.size || 11, padX = 12, padY = 10, gap = 1.32;
      const innerW = this.cw - padX * 2;
      const labelH = o.label ? 16 : 0;
      const lines = this.wrap(text, this.fr, size, innerW);
      const textH = lines.length * size * gap;
      const h = padY * 2 + labelH + textH; this.ensure(h + 12);
      this.rect(this.margin, this.y, this.cw, h, { fill: o.bg, border: o.border || C.ink, borderWidth: 1.5 });
      let ty = this.y + padY;
      if (o.label) { this.line(o.label, this.margin + padX, ty, 10, this.fb, o.labelColor || C.blue); ty += labelH; }
      this.drawLines(lines, this.margin + padX, ty, size, this.fr, C.ink, gap);
      this.y += h + 12;
    }
    field(label, value) {
      this.ensure(20);
      const lw = this.fb.widthOfTextAtSize(label + '  ', 11);
      this.line(label + '  ', this.margin, this.y, 11, this.fb, C.navy);
      this.line(value, this.margin + lw, this.y, 11, this.fr, C.ink);
      this.y += 11 * 1.6;
    }
    bubble(who, text, side, accent) {
      const bw = this.cw * 0.82, padX = 10, padY = 8, size = 10.5, nameH = 13, gap = 1.3;
      const innerW = bw - padX * 2;
      const lines = this.wrap(text, this.fr, size, innerW);
      const textH = lines.length * size * gap;
      const h = padY * 2 + nameH + textH; this.ensure(h + 8);
      const bx = side === 'right' ? this.margin + (this.cw - bw) : this.margin;
      this.rect(bx, this.y, bw, h, { fill: side === 'right' ? C.lightBlue : C.lightYellow, border: accent || C.ink, borderWidth: 1.2 });
      this.line(who, bx + padX, this.y + padY, 9.5, this.fb, accent || C.navy);
      this.drawLines(lines, bx + padX, this.y + padY + nameH, size, this.fr, C.ink, gap);
      this.y += h + 8;
    }
    footer() {
      const pages = this.doc.getPages();
      pages.forEach((pg, i) => {
        const y = this.H - (this.H - 30);
        pg.drawText('자연과 인간의 관계 · M-TRAIN 수업 활동', { x: this.margin, y: 22, size: 8, font: this.fr, color: C.gray });
        const num = `${i + 1} / ${pages.length}`;
        const w = this.fr.widthOfTextAtSize(num, 8);
        pg.drawText(num, { x: this.W - this.margin - w, y: 22, size: 8, font: this.fr, color: C.gray });
      });
    }
  }

  async function build() {
    const f = await loadFonts();
    const doc = await PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    // subset:false 로 전체 글꼴을 임베드합니다. (subset:true 는 일부 한글 글리프가
    // 깨져 보이는 알려진 문제가 있어, 한글이 항상 제대로 나오도록 전체 임베드합니다.)
    const fr = await doc.embedFont(f.reg, { subset: false });
    const fb = await doc.embedFont(f.bold, { subset: false });
    return { doc, b: new Builder(doc, fr, fb) };
  }

  function download(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  window.MTpdf = {
    // data: { cls, studentNo, name, tendency, quiz, kantQ, leopoldQ, integratedThought, feeling }
    async student(data) {
      const { doc, b } = await build();
      b.title('자연과 인간의 관계', '나의 학습 기록장 · 학생 활동지');
      b.field('학급', `${data.cls}반`);
      b.field('학번 / 이름', `${data.studentNo} / ${data.name}`);
      b.field('작성 시각', today());
      b.y += 6;

      b.section('1. 나의 성향 진단 (산악열차 체크리스트)', C.blue);
      const t = data.tendency || {};
      b.panel(`나의 성향: ${t.label || '-'}\n인간 중심 응답 ${t.human ?? 0}개 · 생태 중심 응답 ${t.eco ?? 0}개 (그렇다 응답 합계 ${t.total ?? 0})`,
        { bg: C.lightBlue, border: C.blue, label: '진단 결과', labelColor: C.blue });

      b.section('2. 형성평가 결과 (O·X 도전)', C.green);
      const q = data.quiz || {};
      b.panel(`${q.stage ? q.stage + '차 도전' : '도전'}에서 통과했어요! 정답 ${q.correct ?? 0} / ${q.total ?? 8} 개`,
        { bg: C.lightGreen, border: C.green, label: '평가 결과', labelColor: C.green });

      b.section('3. 사상가에게 한 질문', C.navy);
      b.panel(data.kantQ, { label: '[칸트에게 한 질문]', labelColor: C.blue, bg: C.lightYellow, border: C.blue });
      b.panel(data.leopoldQ, { label: '[레오폴드에게 한 질문]', labelColor: C.green, bg: C.lightGreen, border: C.green });

      b.section('4. 통합적 관점 — 나의 생각', C.blue);
      b.panel(data.integratedThought, { border: C.blue });

      b.section('5. 철학자와의 대화에서 새롭게 배운 점 · 더 배우고 싶은 점', C.red);
      b.panel(data.feeling, { border: C.red });

      b.footer();
      download(await doc.save(), `${data.studentNo}_${data.name}.pdf`);
    },

    // data: { cls, questions:[{kantQ,leopoldQ}], kantChat:[{role,content}], leopoldChat:[...] }
    async teacher(data) {
      const { doc, b } = await build();
      b.title(`${data.cls}반 철학자 대화 기록`, '교실 대표 — AI 사상가와의 대화 · 교사용');
      b.field('학급', `${data.cls}반`);
      b.field('저장 시각', today());
      b.y += 6;

      b.section('1. 학생들이 사상가에게 한 질문 (익명)', C.navy);
      const qs = data.questions || [];
      if (!qs.length) b.panel('수집된 질문이 없습니다.');
      else qs.forEach((it, i) => {
        let body = `질문 ${i + 1}`;
        if (it.kantQ) body += `\n   - 칸트에게: ${it.kantQ}`;
        if (it.leopoldQ) body += `\n   - 레오폴드에게: ${it.leopoldQ}`;
        b.panel(body, { size: 10, bg: C.lightYellow, border: C.ink });
      });

      b.section('2. AI 칸트와의 대화', C.blue);
      const kc = data.kantChat || [];
      if (!kc.length) b.panel('대화 내용이 없습니다.');
      else kc.forEach((m) => b.bubble(m.role === 'user' ? '교실 대표(우리 반)' : 'AI 칸트', m.content, m.role === 'user' ? 'right' : 'left', C.blue));

      b.section('3. AI 레오폴드와의 대화', C.green);
      const lc = data.leopoldChat || [];
      if (!lc.length) b.panel('대화 내용이 없습니다.');
      else lc.forEach((m) => b.bubble(m.role === 'user' ? '교실 대표(우리 반)' : 'AI 레오폴드', m.content, m.role === 'user' ? 'right' : 'left', C.green));

      b.footer();
      download(await doc.save(), `${data.cls}반 철학자 대화.pdf`);
    },
  };
})();
