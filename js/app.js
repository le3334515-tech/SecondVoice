/* ============================================================
   SecondVoice · 主程序
   状态机：ready → speaking → (stopped | complete)
   草稿(draft) 与正在被念出去的消息(utterance) 是两件事
   ============================================================ */

import { MAX_MESSAGE, STARTERS, addPhrase, readPhrases, loadState, saveState } from './phrases.js';
import { tokenize, indexAt, diffWords, diffStat } from './text.js';
import { loadVoices, speak, stopAll, supportsSpeech, unlockSpeech } from './speech.js';
import { Ribbon } from './ribbon.js';

const $ = (sel) => document.querySelector(sel);

const el = {
  draft: $('#draft'),
  draftCount: $('#draftCount'),
  speakBtn: $('#speakBtn'),
  speakLabel: $('#speakLabel'),
  savePhraseBtn: $('#savePhraseBtn'),
  starterList: $('#starterList'),
  savedList: $('#savedList'),
  savedCount: $('#savedCount'),
  savedHint: $('#savedHint'),
  clearSaved: $('#clearSaved'),
  notice: $('#notice'),
  msgEmpty: $('#msgEmpty'),
  msgWords: $('#msgWords'),
  ribbon: $('#ribbon'),
  cut: $('#cut'),
  playBtn: $('#playBtn'),
  stopBtn: $('#stopBtn'),
  reviseBtn: $('#reviseBtn'),
  reuseBtn: $('#reuseBtn'),
  statusMeta: $('#statusMeta'),
  voiceSelect: $('#voiceSelect'),
  rate: $('#rate'),
  rateOut: $('#rateOut'),
  pitch: $('#pitch'),
  pitchOut: $('#pitchOut'),
  previewBtn: $('#previewBtn'),
  diffWrap: $('#diffWrap'),
  diffStat: $('#diffStat'),
  diffBody: $('#diffBody'),
  historyList: $('#historyList'),
  historyMeta: $('#historyMeta'),
  contrastBtn: $('#contrastBtn'),
  typeBtn: $('#typeBtn'),
  shareBtn: $('#shareBtn'),
  toast: $('#toast'),
};

const S = {
  status: 'ready',          // ready | speaking | stopped | complete
  utterance: '',
  tokens: [],
  spans: [],
  heard: -1,
  previous: '',
  phrases: [],
  history: [],
  voices: [],
  voiceURI: '',
  rate: 1,
  pitch: 1,
  run: null,
  diffOn: false,
};

const ribbon = new Ribbon(el.ribbon);
ribbon.start();

/* ── 视图 ─────────────────────────────────────────── */

function setNotice(text) { el.notice.textContent = text; }

function setStatus(status, label) {
  S.status = status;
  el.statusMeta.textContent = label || STATUS_LABEL[status] || '就绪';
  el.statusMeta.classList.toggle('is-live', status === 'speaking');
  document.body.classList.toggle('is-live', status === 'speaking');
  ribbon.setState(status === 'speaking' ? 'speaking' : status);
}

const STATUS_LABEL = { ready: '就绪', speaking: '正在念…', stopped: '已打断', complete: '念完了', error: '没能发声' };

function updateButtons() {
  const live = S.status === 'speaking';
  const hasDraft = !!el.draft.value.trim();
  const hasUtterance = !!S.utterance;

  el.speakBtn.disabled = live || !hasDraft;
  el.speakLabel.textContent = live ? '正在念…' : '念出来';
  el.playBtn.disabled = live || !hasDraft;
  el.playBtn.textContent = live ? '● 正在念' : '▶ 播放';
  el.stopBtn.disabled = !live;
  el.stopBtn.classList.toggle('armed', live);
  el.reviseBtn.disabled = !hasUtterance || live;
  el.reuseBtn.disabled = !hasUtterance || live;
  el.savePhraseBtn.disabled = !hasDraft;
}

function updateCount() {
  const n = el.draft.value.length;
  el.draftCount.textContent = `${n} / ${MAX_MESSAGE}`;
}

function renderStarters() {
  el.starterList.innerHTML = '';
  for (const s of STARTERS) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = s.text;
    b.addEventListener('click', () => usePhrase(s.text));
    el.starterList.appendChild(b);
  }
}

function renderSaved() {
  el.savedList.innerHTML = '';
  el.savedCount.textContent = `${S.phrases.length} / 12`;
  el.clearSaved.hidden = !S.phrases.length;
  if (!S.phrases.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = '还没有存的短句。写下常要说的那句，点「存为短语」。';
    el.savedList.appendChild(p);
    return;
  }
  S.phrases.forEach((text, i) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.innerHTML = `<span class="t"></span><span class="x" role="button" aria-label="删除">×</span>`;
    b.querySelector('.t').textContent = text;
    b.addEventListener('click', (e) => {
      if (e.target.classList.contains('x')) return;
      usePhrase(text);
    });
    b.querySelector('.x').addEventListener('click', (e) => {
      e.stopPropagation();
      S.phrases.splice(i, 1);
      persist();
      renderSaved();
    });
    el.savedList.appendChild(b);
  });
}

function renderHistory() {
  el.historyList.innerHTML = '';
  el.historyMeta.textContent = `${S.history.length} 条`;
  if (!S.history.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = '念过的每一句都会留在这里：完成的、被打断的，都在。';
    el.historyList.appendChild(p);
    return;
  }
  for (const item of [...S.history].reverse()) {
    const row = document.createElement('article');
    row.className = 'entry';
    row.dataset.kind = item.kind;
    row.innerHTML = `
      <span class="kind">${item.kind === 'complete' ? '念完' : '打断'}</span>
      <div class="body">
        <div class="text"></div>
        <div class="when"></div>
      </div>
      <div class="acts">
        <button data-act="revise">修订</button>
        <button data-act="again">再念</button>
      </div>`;
    row.querySelector('.text').textContent = item.text;
    row.querySelector('.when').textContent =
      item.kind === 'stopped' && item.heard
        ? `${fmtTime(item.at)} · 念到「${item.heard}…」`
        : `${fmtTime(item.at)} · 念完了`;
    row.querySelector('[data-act="revise"]').addEventListener('click', () => {
      el.draft.value = item.text;
      S.previous = item.text;
      S.diffOn = true;
      updateCount();
      renderDiff();
      el.draft.focus();
      setNotice('这句已经放回纸上。改动会在这里标出增删，然后重新念。');
      updateButtons();
      persist();
    });
    row.querySelector('[data-act="again"]').addEventListener('click', () => speakNow(item.text));
    el.historyList.appendChild(row);
  }
}

function renderWords() {
  el.msgWords.innerHTML = '';
  S.spans = [];
  if (!S.tokens.length) {
    el.msgEmpty.hidden = false;
    return;
  }
  el.msgEmpty.hidden = true;
  for (const tk of S.tokens) {
    if (tk.space) continue;
    const span = document.createElement('span');
    span.className = 'w';
    span.textContent = tk.text;
    el.msgWords.appendChild(span);
    S.spans.push(span);
  }
}

function highlight(idx) {
  S.heard = idx;
  const visible = S.spans.length;
  if (!visible) return;
  for (let i = 0; i < visible; i++) {
    const s = S.spans[i];
    s.classList.toggle('heard', i <= idx);
    s.classList.toggle('current', i === idx);
  }
  const p = (idx + 1) / visible;
  ribbon.setProgress(p);
  if (S.status === 'speaking') el.statusMeta.textContent = `正在念 · ${idx + 1}/${visible}`;
  if (S.status === 'speaking') ribbon.pulse();
  const current = S.spans[idx];
  if (current && current.scrollIntoView) {
    current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function renderDiff() {
  const text = el.draft.value;
  if (!S.diffOn || !S.previous) {
    el.diffWrap.hidden = true;
    return;
  }
  el.diffWrap.hidden = false;
  if (text === S.previous) {
    el.diffStat.textContent = '没有改动';
    el.diffBody.textContent = '跟上一版一字不差。';
    return;
  }
  const ops = diffWords(S.previous, text);
  const { add, del } = diffStat(ops);
  el.diffStat.textContent = `+${add} / −${del}`;
  el.diffBody.innerHTML = '';
  for (const op of ops) {
    const node = document.createElement(op.op === '=' ? 'span' : op.op === 'ins' ? 'ins' : 'del');
    node.textContent = op.text;
    el.diffBody.appendChild(node);
  }
}

/* ── 行为 ─────────────────────────────────────────── */

function currentVoice() {
  return S.voices.find((v) => v.voiceURI === S.voiceURI) || S.voices[0] || null;
}

function speakNow(text) {
  const msg = String(text || '').trim();
  if (!msg) { setNotice('先写一句要念的话。'); el.draft.focus(); return; }
  if (!supportsSpeech()) { toast('这个浏览器没有语音引擎'); return; }

  if (S.run) { S.run.cancel(); S.run = null; }

  S.utterance = msg;
  S.tokens = tokenize(msg);
  S.heard = -1;
  S.previous = msg;
  S.diffOn = false;
  el.diffWrap.hidden = true;

  renderWords();
  setStatus('speaking');
  setNotice('正在念你交出去的这一版。纸上的草稿可以继续改，不会影响它。');
  updateButtons();

  S.run = speak(msg, {
    voice: currentVoice(),
    rate: S.rate,
    pitch: S.pitch,
  }, {
    onWord: (charIndex) => {
      const idx = indexAt(S.tokens, charIndex);
      highlight(idx);
    },
    onDone: () => finish(true),
    onError: (err) => {
      toast(`语音中断：${err}`);
      finish(false, err);
    },
  });

  speakIntroOnce();
}

let introSpoken = false;
function speakIntroOnce() {
  if (introSpoken) return;
  introSpoken = true;
  if (!supportsSpeech()) setNotice('这台机器没有中文语音引擎：按钮和记录照常，声音可能出不来。');
}

function finish(completed, error) {
  S.run = null;
  if (completed) {
    if (S.spans.length) {
      highlight(S.spans.length - 1);
      S.spans.forEach((sp) => sp.classList.remove('current'));
    }
    setStatus('complete');
    ribbon.setProgress(1);
    setNotice('念完了。要改就直接改纸上的字，再念一遍就是新的版本。');
    pushHistory('complete');
  } else if (error) {
    // 没能念出去：不算一次"被打断"，也不写进记录
    setStatus('error');
    el.cut.hidden = true;
    const reason = error === 'not-allowed'
      ? '浏览器拦住了这次发声（自动播放限制）：先点一下页面，再按「念出来」。'
      : `浏览器没能发声：${error}。换 Chrome / Edge，或先点一下页面再试。`;
    setNotice(reason);
    toast(reason.slice(0, 40));
  } else {
    setStatus('stopped');
    const p = S.spans.length ? (S.heard + 1) / S.spans.length : 0;
    ribbon.setProgress(p);
    el.cut.hidden = p <= 0;
    el.cut.style.left = `${(p * 100).toFixed(2)}%`;
    setNotice('打断在这儿。要接的话，把这句放回纸上改。');
    pushHistory('stopped');
  }
  updateButtons();
  persist();
}

function stopNow() {
  if (S.status !== 'speaking' || !S.run) return;
  S.run.cancel();
  finish(false);
}

function pushHistory(kind) {
  const heardText = S.heard >= 0 && S.tokens[S.heard] ? lastWords(S.heard) : '';
  S.history.push({
    id: Date.now(),
    text: S.utterance,
    kind,
    at: new Date().toISOString(),
    heard: heardText,
  });
  if (S.history.length > 40) S.history = S.history.slice(-40);
  renderHistory();
}

function lastWords(idx) {
  const slice = S.tokens.slice(Math.max(0, idx - 5), idx + 1).map((t) => t.text).join('');
  return slice.slice(-12);
}

function revise() {
  if (!S.utterance) return;
  el.draft.value = S.utterance;
  S.previous = S.utterance;
  S.diffOn = true;
  updateCount();
  renderDiff();
  el.draft.focus();
  setNotice('刚才那句已经放回纸上。改成你要的样子，改动会标出来，然后重新念。');
  updateButtons();
  persist();
}

function usePhrase(text) {
  el.draft.value = text;
  updateCount();
  el.draft.focus();
  S.previous = S.utterance || '';
  S.diffOn = !!S.previous;
  renderDiff();
  updateButtons();
  persist();
  setNotice('放进纸里了。可以直接念，也可以先改两个词。');
}

function savePhrase() {
  const res = addPhrase(S.phrases, el.draft.value);
  S.phrases = res.list;
  renderSaved();
  persist();
  toast(res.message);
}

/* ── 持久化 / 分享 ───────────────────────────────── */

function persist() {
  saveState({
    draft: el.draft.value,
    phrases: S.phrases,
    history: S.history.slice(-40),
    voiceURI: S.voiceURI,
    rate: S.rate,
    pitch: S.pitch,
    contrast: document.body.classList.contains('hi-contrast'),
    largeType: document.body.classList.contains('large-type'),
  });
}

function encodeShare() {
  const payload = { t: el.draft.value, r: S.rate, p: S.pitch, v: S.voiceURI };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeShare(token) {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

let toastTimer = null;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-on'), 2300);
}

function fmtTime(iso) {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return '—'; }
}

/* ── 事件 ─────────────────────────────────────────── */

el.draft.addEventListener('input', () => {
  updateCount();
  updateButtons();
  if (S.diffOn) renderDiff();
  persist();
});

el.speakBtn.addEventListener('click', () => speakNow(el.draft.value));
el.playBtn.addEventListener('click', () => speakNow(el.draft.value));
el.stopBtn.addEventListener('click', stopNow);
el.reviseBtn.addEventListener('click', revise);
el.reuseBtn.addEventListener('click', () => S.utterance && speakNow(S.utterance));
el.savePhraseBtn.addEventListener('click', savePhrase);
el.clearSaved.addEventListener('click', () => {
  S.phrases = [];
  renderSaved();
  persist();
});

el.rate.addEventListener('input', () => {
  S.rate = Number(el.rate.value);
  el.rateOut.textContent = `${S.rate.toFixed(2)}×`;
  persist();
});
el.pitch.addEventListener('input', () => {
  S.pitch = Number(el.pitch.value);
  el.pitchOut.textContent = `${S.pitch.toFixed(2)}×`;
  persist();
});

el.voiceSelect.addEventListener('change', () => {
  S.voiceURI = el.voiceSelect.value;
  persist();
  if (S.status === 'speaking') setNotice('音色会在下一句生效。');
});

el.previewBtn.addEventListener('click', () => {
  if (!supportsSpeech()) { toast('这个浏览器没有语音引擎'); return; }
  stopAll();
  speak('这是第二声音。念的时候，你可以继续改。', {
    voice: currentVoice(), rate: S.rate, pitch: S.pitch,
  }, { onDone: () => toast('试听结束') });
});

el.contrastBtn.addEventListener('click', () => {
  const on = document.body.classList.toggle('hi-contrast');
  el.contrastBtn.setAttribute('aria-pressed', String(on));
  persist();
});

el.typeBtn.addEventListener('click', () => {
  const on = document.body.classList.toggle('large-type');
  el.typeBtn.setAttribute('aria-pressed', String(on));
  persist();
});

el.shareBtn.addEventListener('click', async () => {
  const token = encodeShare();
  const url = `${location.origin}${location.pathname}#s=${token}`;
  history.replaceState(null, '', `#s=${token}`);
  const ok = await copy(url);
  toast(ok ? '链接已复制（打开即带着这句话）' : '链接已在地址栏');
});

document.addEventListener('keydown', (e) => {
  const typing = /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    speakNow(el.draft.value);
    return;
  }
  if (e.key === 'Escape') { e.preventDefault(); stopNow(); return; }
  if (typing) return;
  if (e.key === 'r' || e.key === 'R') revise();
  else if (e.key === 's' || e.key === 'S') { if (el.draft.value.trim()) savePhrase(); }
});

window.addEventListener('hashchange', () => {
  const data = restoreHash();
  if (data) toast('已载入链接里的那句话');
});

window.addEventListener('beforeunload', () => stopAll());

// 首次手势解锁发声（Chrome 的自动播放策略）
let gestureUsed = false;
document.addEventListener('pointerdown', () => {
  if (gestureUsed) return;
  gestureUsed = true;
  unlockSpeech();
}, { once: true });

/* ── 启动 ─────────────────────────────────────────── */

function restoreHash() {
  if (!location.hash.startsWith('#s=')) return null;
  const data = decodeShare(location.hash.slice(3));
  if (!data || typeof data.t !== 'string') return null;
  el.draft.value = data.t.slice(0, MAX_MESSAGE);
  if (typeof data.r === 'number') S.rate = data.r;
  if (typeof data.p === 'number') S.pitch = data.p;
  if (typeof data.v === 'string') S.voiceURI = data.v;
  return data;
}

(async function boot() {
  const saved = loadState();

  S.phrases = readPhrases(saved.phrases || []);
  S.history = Array.isArray(saved.history) ? saved.history.filter((h) => h && h.text) : [];
  S.rate = typeof saved.rate === 'number' ? saved.rate : 1;
  S.pitch = typeof saved.pitch === 'number' ? saved.pitch : 1;
  S.voiceURI = typeof saved.voiceURI === 'string' ? saved.voiceURI : '';

  if (saved.contrast) { document.body.classList.add('hi-contrast'); el.contrastBtn.setAttribute('aria-pressed', 'true'); }
  if (saved.largeType) { document.body.classList.add('large-type'); el.typeBtn.setAttribute('aria-pressed', 'true'); }

  el.draft.value = typeof saved.draft === 'string' ? saved.draft : '';
  el.rate.value = String(S.rate);
  el.pitch.value = String(S.pitch);
  el.rateOut.textContent = `${S.rate.toFixed(2)}×`;
  el.pitchOut.textContent = `${S.pitch.toFixed(2)}×`;

  renderStarters();
  renderSaved();
  renderHistory();
  updateCount();
  updateButtons();
  setStatus('ready');

  const fromHash = restoreHash();
  if (fromHash) updateCount();

  S.voices = await loadVoices();
  if (S.voices.length) {
    el.voiceSelect.innerHTML = '';
    for (const v of S.voices) {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} · ${v.lang}`;
      el.voiceSelect.appendChild(opt);
    }
    const has = S.voices.some((v) => v.voiceURI === S.voiceURI);
    if (!has) S.voiceURI = S.voices[0].voiceURI;
    el.voiceSelect.value = S.voiceURI;
  } else {
    el.voiceSelect.innerHTML = '<option>无可用音色</option>';
    el.voiceSelect.disabled = true;
    setNotice('这台机器没有可用的语音引擎：界面、记录和分享都正常，但念不出声。换成 Chrome / Edge 试试。');
  }

  if (!fromHash && el.draft.value.trim()) {
    setNotice('纸上有上次没念完的草稿。接着改，或者直接念。');
  }

  el.draft.focus();
  if (el.draft.value) el.draft.setSelectionRange(el.draft.value.length, el.draft.value.length);
})();
