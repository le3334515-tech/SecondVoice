/* ============================================================
   语音：Web Speech 播报 + 真实取消
   有 boundary 事件就逐词高亮；没有（Safari 等）就按节拍推进。
   ============================================================ */

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

export const MAX_MESSAGE = 1800;

export function supportsSpeech() {
  return !!synth;
}

export function loadVoices() {
  return new Promise((resolve) => {
    if (!synth) return resolve([]);
    const read = () => synth.getVoices() || [];
    const now = read();
    if (now.length) return resolve(sortVoices(now));
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve(sortVoices(read()));
    };
    synth.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, 1400);
  });
}

function sortVoices(list) {
  const score = (v) => {
    const n = `${v.name} ${v.voiceURI}`.toLowerCase();
    let s = 0;
    if (/^(zh|cmn|yue)/i.test(v.lang || '')) s += 8;
    if (/zh-cn|cmn-hans/i.test(v.lang || '')) s += 3;
    if (/natural|neural|online|premium|enhanced/.test(n)) s += 3;
    if (/xiaoxiao|xiaoyi|yunxi|huihui|yaoyao|kangkang|tingting|li-mu|hanhan|zhiyu/.test(n)) s += 2;
    return s;
  };
  return [...list].sort((a, b) => score(b) - score(a) || (a.name || '').localeCompare(b.name || ''));
}

/**
 * 播一句话。
 * @param {string} text
 * @param {{voice?: SpeechSynthesisVoice|null, rate?: number, pitch?: number}} opts
 * @param {{onWord?: (charIndex:number)=>void, onDone?: ()=>void, onError?: (msg:string)=>void}} cb
 * @returns {{cancel: ()=>void, finished: ()=>boolean}}
 */
export function speak(text, opts, cb) {
  const { onWord, onDone, onError } = cb || {};
  const rate = clamp(opts?.rate ?? 1, 0.5, 2);
  const pitch = clamp(opts?.pitch ?? 1, 0, 2);

  let cancelled = false;
  let done = false;
  let timer = null;
  let boundarySeen = false;

  const finish = (kind, payload) => {
    if (cancelled || done) return;
    done = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (kind === 'done') onDone?.();
    else onError?.(payload || 'unknown');
  };

  if (!synth) {
    // 没有语音引擎：按节拍推进，行为仍然完整
    let i = 0;
    const step = () => {
      if (cancelled || done) return;
      i += 12;
      if (i >= text.length) { onWord?.(text.length); finish('done'); return; }
      onWord?.(i);
      timer = setTimeout(step, 420 / rate);
    };
    timer = setTimeout(step, 380 / rate);
    return {
      cancel() { cancelled = true; if (timer) clearTimeout(timer); },
      finished: () => done,
    };
  }

  const u = new SpeechSynthesisUtterance(text);
  const voice = opts?.voice;
  if (voice) { u.voice = voice; u.lang = voice.lang || 'zh-CN'; }
  else u.lang = 'zh-CN';
  u.rate = rate;
  u.pitch = pitch;
  u.volume = 1;

  u.onboundary = (e) => {
    boundarySeen = true;
    if (cancelled) return;
    onWord?.(typeof e.charIndex === 'number' ? e.charIndex : 0);
  };
  u.onend = () => finish('done');
  u.onerror = (e) => {
    if (e?.error === 'interrupted' || e?.error === 'canceled') { cancelled = true; return; }
    finish('error', e?.error || 'speech-error');
  };

  // 保底节拍：既覆盖"没有 boundary"的浏览器，也覆盖"boundary 中途停了"的情况
  let fallbackAt = 0;
  const fallback = () => {
    if (cancelled || done) return;
    if (!boundarySeen) {
      fallbackAt = Math.min(text.length, fallbackAt + 14);
      onWord?.(fallbackAt);
    }
    timer = setTimeout(fallback, Math.max(160, 380 / rate));
  };
  timer = setTimeout(fallback, Math.max(200, 460 / rate));

  try {
    synth.cancel();            // 清掉可能残留的上一句
    synth.speak(u);
  } catch (err) {
    finish('error', String(err));
  }

  return {
    cancel() {
      cancelled = true;
      if (timer) { clearTimeout(timer); timer = null; }
      try { synth.cancel(); } catch { /* noop */ }
      try { synth.resume(); } catch { /* 某些实现 cancel 后需要 resume 才恢复队列 */ }
    },
    finished: () => done,
  };
}

export function stopAll() {
  if (!synth) return;
  try { synth.cancel(); } catch { /* noop */ }
}

/** 有些 Chrome 版本要求先有一次用户手势才允许发声：首次点击时静默解锁 */
export function unlockSpeech() {
  if (!synth) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
    synth.cancel();
  } catch { /* noop */ }
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
