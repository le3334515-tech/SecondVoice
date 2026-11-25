/* ============================================================
   文本：分词（用于逐词高亮）与词级差异（用于"修订"对照）
   ============================================================ */

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;

/** 切成 {text,start,end} 词元；中文用 Intl.Segmenter，退化按字切 */
export function tokenize(text) {
  const src = String(text || '');
  const out = [];
  if (!src) return out;

  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const seg = new Intl.Segmenter('zh', { granularity: 'word' });
      for (const part of seg.segment(src)) {
        const t = part.segment;
        if (!t) continue;
        if (/^\s+$/.test(t)) { out.push({ text: t, start: part.index, end: part.index + t.length, space: true }); continue; }
        out.push({ text: t, start: part.index, end: part.index + t.length });
      }
      return mergePunct(out);
    } catch { /* 走退化路径 */ }
  }

  const re = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]|[A-Za-z0-9'’]+|\s+|[^\s]/g;
  let m;
  while ((m = re.exec(src))) {
    const t = m[0];
    out.push({ text: t, start: m.index, end: m.index + t.length, space: /^\s+$/.test(t) });
  }
  return mergePunct(out);
}

/** 标点并到前一个词上，避免高亮在一堆标点之间跳 */
function mergePunct(tokens) {
  const out = [];
  for (const tk of tokens) {
    const prev = out[out.length - 1];
    if (prev && !prev.space && !tk.space && /^[，。！？；：、…—·）】」』"'']+$/u.test(tk.text)) {
      prev.text += tk.text;
      prev.end = tk.end;
      continue;
    }
    out.push(tk);
  }
  return out;
}

/** charIndex（TTS boundary 事件给的）→ 词元下标 */
export function indexAt(tokens, charIndex) {
  let lo = 0, hi = tokens.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid].start <= charIndex) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

/** 词级 LCS 差异：返回 [{op:'=', 'ins', 'del', text}] */
export function diffWords(before, after) {
  const a = tokenize(before).filter((t) => !t.space).map((t) => t.text);
  const b = tokenize(after).filter((t) => !t.space).map((t) => t.text);
  const n = a.length, m = b.length;
  if (!n && !m) return [];
  if (n * m > 400000) {
    return [{ op: 'del', text: before }, { op: 'ins', text: after }];
  }

  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  const push = (op, text) => {
    const last = ops[ops.length - 1];
    if (last && last.op === op) last.text += text;
    else ops.push({ op, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('=', a[i] + joiner(b[j], b[j + 1])); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', a[i]); i++; }
    else { push('ins', b[j]); j++; }
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('ins', b[j++]);
  return ops;
}

function joiner(cur, next) {
  if (!next) return '';
  return CJK.test(cur) ? '' : ' ';
}

export function diffStat(ops) {
  let add = 0, del = 0;
  for (const o of ops) {
    if (o.op === 'ins') add += countUnits(o.text);
    else if (o.op === 'del') del += countUnits(o.text);
  }
  return { add, del };
}

function countUnits(s) {
  const t = tokenize(s).filter((x) => !x.space);
  return t.length;
}
