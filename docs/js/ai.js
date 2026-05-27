/* ============================================================================
 * MTai — 브라우저에서 Claude(Anthropic) API를 직접 호출
 *  - 교사 API 키는 이 함수 호출 시 인자로만 전달되며, 어디에도 저장하지 않습니다.
 *  - anthropic-dangerous-direct-browser-access 헤더로 브라우저 직접 호출을 허용합니다.
 * ==========================================================================*/
(function () {
  window.MTai = {
    // history: [{role:'user'|'assistant', content}], message: 새 사용자 메시지
    async chat({ persona, history, message, apiKey, model }) {
      const key = String(apiKey || '').trim();
      if (!key) throw new Error('API 키가 없습니다. 교사 화면에서 키를 입력해 주세요.');

      const messages = (history || [])
        .filter((m) => m && m.content && m.content !== '…')
        .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }));
      messages.push({ role: 'user', content: String(message) });

      let res;
      try {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: model || 'claude-sonnet-4-6',
            max_tokens: 600,
            system: persona,
            messages,
          }),
        });
      } catch (e) {
        throw new Error('네트워크 오류로 AI에 연결하지 못했습니다: ' + e.message);
      }

      if (!res.ok) {
        let msg = 'AI 응답 오류 (' + res.status + ')';
        try {
          const j = await res.json();
          if (j.error && j.error.message) msg += ': ' + j.error.message;
        } catch (_) {}
        if (res.status === 401) msg = 'API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.';
        throw new Error(msg);
      }

      const data = await res.json();
      const reply = (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return reply || '(응답이 비어 있습니다.)';
    },
  };
})();
