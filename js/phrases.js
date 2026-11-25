/* ============================================================
   短语：起手句 + 浏览器里存的短句（上限 12 条，去重）
   ============================================================ */

export const MAX_PHRASES = 12;
export const MAX_MESSAGE = 1800;
export const STORAGE_KEY = 'secondvoice.v2';

export const STARTERS = [
  { id: 'more-time', text: '我需要一点时间，让我把话说完。' },
  { id: 'ask-me', text: '请直接问我，不要替我回答。' },
  { id: 'not-what-i-meant', text: '这不是我的意思，我重新说一遍。' },
  { id: 'continue', text: '我可以继续了，谢谢。' },
  { id: 'hold-on', text: '等一下，我要先改一句。' },
  { id: 'no', text: '我听见了，但我不同意。' },
];

export function readPhrases(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const p = item.trim();
    if (!p || p.length > MAX_MESSAGE) continue;
    if (out.some((x) => x.toLowerCase() === p.toLowerCase())) continue;
    out.push(p);
    if (out.length >= MAX_PHRASES) break;
  }
  return out;
}

export function addPhrase(list, text) {
  const phrase = String(text || '').trim();
  if (!phrase) return { list, message: '草稿是空的。' };
  if (phrase.length > MAX_MESSAGE) return { list, message: '太长了（上限 1800 字）。' };
  if (list.some((p) => p.toLowerCase() === phrase.toLowerCase())) {
    return { list, message: '这句已经存过了。' };
  }
  if (list.length >= MAX_PHRASES) {
    return { list, message: `12 个位置都满了，先删一条。` };
  }
  return { list: [...list, phrase], message: '已存在这台浏览器里。' };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

export function saveState(patch) {
  try {
    const cur = loadState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, ...patch }));
  } catch { /* 隐私模式等，忽略 */ }
}
