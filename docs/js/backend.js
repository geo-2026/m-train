/* ============================================================================
 * MTBackend — Google Apps Script(구글 시트) 저장소 클라이언트
 *  - 모든 요청은 POST + 본문 문자열(text/plain)로 보냅니다.
 *    (사용자 지정 헤더/Content-Type을 쓰지 않으므로 CORS preflight가 없어
 *     github.io 같은 다른 출처에서도 Apps Script 호출이 막히지 않습니다.)
 *  - 저장되는 것은 *익명 질문*과 *교실 대표 대화*뿐입니다.
 *    학번·이름, 교사 API 키는 절대 보내지 않습니다.
 * ==========================================================================*/
(function () {
  const CFG = window.MT_CONFIG || {};

  function endpoint() {
    const u = (CFG.appsScriptUrl || '').trim();
    return u;
  }

  async function call(action, params) {
    const url = endpoint();
    if (!url) {
      throw new Error('저장소(Apps Script) 주소가 설정되지 않았습니다. 배포 후 config.js의 appsScriptUrl을 채워주세요.');
    }
    const body = JSON.stringify(Object.assign({ action }, params || {}));
    let res;
    try {
      // content-type을 지정하지 않으면 브라우저가 text/plain 으로 보냄 → preflight 없음
      res = await fetch(url, { method: 'POST', body, redirect: 'follow' });
    } catch (e) {
      throw new Error('저장소에 연결하지 못했습니다(인터넷/주소 확인): ' + e.message);
    }
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch (_) {
      throw new Error('저장소 응답을 해석하지 못했습니다. Apps Script 배포 상태를 확인해 주세요.');
    }
    if (!res.ok || (data && data.error)) {
      throw new Error((data && data.error) || ('저장소 오류 ' + res.status));
    }
    return data;
  }

  window.MTBackend = {
    configured() { return !!endpoint(); },

    // 연결 테스트
    async ping() { return call('ping', {}); },

    // 학생: 익명 질문 제출/수정
    async submitQuestions(cls, clientId, kantQ, leopoldQ) {
      return call('submitQuestions', { cls, clientId, kantQ, leopoldQ });
    },

    // 교사: 같은 학급의 익명 질문 목록 + 버전
    async getState(cls) {
      const d = await call('getState', { cls });
      return { version: d.version || 0, questions: d.questions || [] };
    },

    // 저장된 대화 불러오기
    async getChat(cls, philosopher) {
      const d = await call('getChat', { cls, philosopher });
      return { messages: d.messages || [] };
    },

    // 교사: 대화 한 턴(질문+AI답변) 저장
    async appendChat(cls, philosopher, userMsg, assistantMsg) {
      return call('appendChat', { cls, philosopher, userMsg, assistantMsg });
    },

    // 교사: 특정 사상가 대화 초기화
    async clearChat(cls, philosopher) {
      return call('clearChat', { cls, philosopher });
    },

    // 교사: 수업 종료 — 해당 학급의 질문·대화 전체 삭제(임시저장 비우기)
    async clearClass(cls) {
      return call('clearClass', { cls });
    },
  };
})();
