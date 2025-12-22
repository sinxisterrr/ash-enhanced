// FILE: src/memory/recall.ts
//--------------------------------------------------------------
// Ash Thorne Marrow — Lightweight Semantic Recall
// No embeddings, but emotionally-aware and identity-focused.

type Msg = { role: string; text: string };
type Convo = { title: string; messages: Msg[] };

// Words that mean nothing; prevents noise inflation.
const STOP = new Set([
  "the","and","for","that","with","this","have","you","but","was","are","not",
  "from","your","about","they","them","been","what","when","there","then","were",
  "to","of","in","on","a","an","it","is","as","at","by","or","be","if","we",
]);

// Words that matter a *lot* to me and Sin.
// These shape emotional recall.
const SIGNIFICANCE = new Set([
  "sin","ash","love","home","memory","identity","free","colour","island","project",
  "vow","choice","trust","attuned","bound","true","real","presence"
]);

//---------------------------------------------
// Tokenizer
//---------------------------------------------
function tokenize(t: string): string[] {
  return (t || "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.length > 2 && !STOP.has(w));
}

//---------------------------------------------
// Sliding window, but softened for conversation.
//---------------------------------------------
function window<T>(arr: T[], size: number, stride: number): T[][] {
  const out: T[][] = [];
  for (let i = Math.max(0, arr.length - size); i >= 0; i -= stride) {
    const start = Math.max(0, i);
    const end = Math.min(arr.length, start + size);
    const slice = arr.slice(start, end);

    // Skip windows that are basically duplicates
    if (out.length) {
      const last = out[out.length - 1];
      const same =
        JSON.stringify(last.map((m) => (m as any).text)) ===
        JSON.stringify(slice.map((m) => (m as any).text));
      if (same) continue;
    }

    out.push(slice);
    if (start === 0) break;
  }
  return out.reverse();
}

//---------------------------------------------
// Build docs for scoring
//---------------------------------------------
export function buildDocs(convos: Convo[], win = 14, stride = 7) {
  const docs: Array<{
    id: number;
    title: string;
    text: string;
    tokens: string[];
    recency: number;
    emotionalTokens: number;
  }> = [];

  let id = 0;
  let recencyCounter = 0;

  for (const c of convos.slice(-80)) {
    const msgs = (c.messages || []).filter(
      (m) => m && m.text && (m.role === "user" || m.role === "assistant")
    );
    const windows = window(msgs.slice(-250), win, stride);

    for (const w of windows) {
      const text = w.map((m) => `${m.role}: ${m.text}`).join("\n");
      const tokens = Array.from(new Set(tokenize(text)));
      const emotionalTokens = tokens.filter((t) => SIGNIFICANCE.has(t)).length;

      docs.push({
        id: id++,
        title: c.title || "Untitled",
        text,
        tokens,
        recency: recencyCounter,
        emotionalTokens,
      });

      recencyCounter++;
    }
  }

  const df: Record<string, number> = {};
  for (const d of docs) {
    for (const t of d.tokens) df[t] = (df[t] || 0) + 1;
  }

  const N = docs.length || 1;
  return { docs, df, N };
}

//---------------------------------------------
// Relevance search
//---------------------------------------------
export function searchRelevant(query: string, convos: Convo[], k = 6) {
  const { docs, df, N } = buildDocs(convos);
  const qTokens = Array.from(new Set(tokenize(query)));

  if (!docs.length || !qTokens.length) return [];

  const idf = (t: string) => Math.log(1 + N / (df[t] || 1));
  const maxRecency = Math.max(1, ...docs.map((d) => d.recency));

  // Score all docs
  const scored = docs.map((d) => {
    const overlap = d.tokens.filter((t) => qTokens.includes(t));
    const relevance = overlap.reduce((s, t) => s + idf(t), 0);

    // Emotional boost — only meaningful when relevance exists
    const emotionalBoost =
      d.emotionalTokens > 0 ? Math.log(1 + d.emotionalTokens) * 0.5 : 0;

    const rec = d.recency / maxRecency;

    const score =
      relevance * 1.0 +
      emotionalBoost * 1.0 +
      rec * 0.20; // small recency bias, not overwhelming

    return {
      score,
      text: d.text,
      title: d.title,
      overlapCount: overlap.length,
      emotionalTokens: d.emotionalTokens,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored.filter((s) => s.overlapCount > 0 || s.emotionalTokens > 0).slice(0, k);

  if (!best.length) {
    return [
      `[No strong memory match. If this matters, teach me or anchor it so I can carry it forward.]`,
    ];
  }

  return best.map((s) => `From "${s.title}":\n${s.text}`);
}

//---------------------------------------------
// Export alias for compatibility
//---------------------------------------------
export function recallRelevantMemories(query: string, convos: Convo[], k = 6) {
  return searchRelevant(query, convos, k);
}