import { tokenize, TokenType } from "@colorful-tmpl/highlight-core";

type Span = { start: number; end: number };

export const PALETTES = {
  dark: {
    bg: "#1e1e2e", fg: "#cdd6f4",
    levels: [
      "rgba(173, 216, 230, 0.14)", // light blue
      "rgba(144, 238, 144, 0.14)", // light green
      "rgba(255, 218, 185, 0.16)", // peach
      "rgba(221, 160, 221, 0.14)", // plum
      "rgba(255, 255, 150, 0.14)", // yellow
      "rgba(255, 182, 193, 0.14)", // pink
    ],
    ctrlFlow: "rgba(135, 206, 250, 0.28)", // light blue
    varWrite: "rgba(204, 170, 50, 0.38)",  // ochre
    varRead:  "rgba(204, 170, 50, 0.28)",  // ochre lighter
    func:     "rgba(255, 165, 70, 0.32)",   // light orange
    comment:  "rgba(140, 140, 140, 0.20)",  // grey
  },
  light: {
    bg: "#ffffff", fg: "#1e293b",
    levels: [
      "rgba(173, 216, 230, 0.30)", // light blue
      "rgba(144, 238, 144, 0.30)", // light green
      "rgba(255, 218, 185, 0.35)", // peach
      "rgba(221, 160, 221, 0.30)", // plum
      "rgba(255, 255, 150, 0.30)", // yellow
      "rgba(255, 182, 193, 0.30)", // pink
    ],
    ctrlFlow: "rgba(135, 206, 250, 0.45)",
    varWrite: "rgba(190, 160, 50, 0.32)",
    varRead:  "rgba(190, 160, 50, 0.22)",
    func:     "rgba(255, 150, 50, 0.28)",
    comment:  "rgba(160, 160, 160, 0.18)",
  },
};

export type Theme = keyof typeof PALETTES;

function subtractRanges(parents: Span[], children: Span[]): Span[] {
  let result = [...parents];
  for (const child of children) {
    const next: Span[] = [];
    for (const p of result) {
      if (child.end <= p.start || child.start >= p.end) {
        next.push(p);
      } else {
        if (p.start < child.start) next.push({ start: p.start, end: child.start });
        if (child.end < p.end) next.push({ start: child.end, end: p.end });
      }
    }
    result = next;
  }
  return result;
}

/**
 * Render a Go template string as HTML with nesting-level background colors,
 * matching the VS Code decorator logic exactly.
 *
 * @param theme "dark" or "light" — selects palette and page background.
 */
export function renderColoredHtml(source: string, theme: Theme = "dark"): string {
  const P = PALETTES[theme];
  const PALETTE = P.levels;
  const tokens = tokenize(source);

  // ---- Step 0: find {{ }} block ranges so we can exclude interior text ----
  const actionRanges: Span[] = [];
  let ai = 0;
  while (ai < tokens.length) {
    if (tokens[ai].type !== TokenType.DelimOpen) { ai++; continue; }
    const as = tokens[ai].start; ai++;
    while (ai < tokens.length && tokens[ai].type !== TokenType.DelimClose) ai++;
    if (ai < tokens.length) { actionRanges.push({ start: as, end: tokens[ai].end }); }
    ai++;
  }
  function insideAction(pos: number): boolean {
    return actionRanges.some(r => pos >= r.start && pos < r.end);
  }

  // ---- Step 1: nesting backgrounds from TEXT ONLY (between {{ }} ) ----
  const byLevel = new Map<number, Span[]>();
  for (const t of tokens) {
    if (t.type !== TokenType.Text) continue;
    if (t.nestingLevel === 0 || insideAction(t.start)) continue;
    const list = byLevel.get(t.nestingLevel) ?? [];
    const prev = list[list.length - 1];
    if (prev && t.start <= prev.end) {
      if (t.end > prev.end) prev.end = t.end;
    } else {
      list.push({ start: t.start, end: t.end });
    }
    byLevel.set(t.nestingLevel, list);
  }

    // Extend nesting ranges to cover intervening {{ }} blocks at the same level,
    // so the background is continuous rather than split into 1px fragments.
    for (const [level, ranges] of byLevel) {
      ranges.sort((a, b) => a.start - b.start);
      const merged: Span[] = [];
      for (const r of ranges) {
        const prev = merged[merged.length - 1];
        // Merge if the gap between prev and current is filled only by a {{ }} block
        // (check: is there any non-action text in the gap?)
        if (prev) {
          let hasOnlyAction = true;
          for (const t of tokens) {
            if (t.type === TokenType.Text && !insideAction(t.start) && t.start >= prev.end && t.start < r.start) {
              hasOnlyAction = false; break; // there's text at another level in the gap — don't merge
            }
          }
          if (hasOnlyAction) {
            prev.end = r.end; // merge: extend prev to cover the gap + current
            continue;
          }
        }
        merged.push({ ...r });
      }
      byLevel.set(level, merged);
    }
  const sortedLevels = [...byLevel.keys()].sort((a, b) => b - a);
  const painted = new Map<number, Span[]>();
  for (const level of sortedLevels) {
    let ranges = byLevel.get(level) ?? [];
    for (const [childLevel, childRanges] of painted) {
      if (childLevel <= level) continue;
      ranges = subtractRanges(ranges, childRanges);
    }
    if (ranges.length > 0) painted.set(level, ranges);
  }

  // ---- Step 3: assign nesting color per position ----
  const nestingBg: (string | null)[] = new Array(source.length).fill(null);
  for (const [level, ranges] of painted) {
    const color = PALETTE[level % PALETTE.length];
    for (const r of ranges) {
      for (let i = r.start; i < r.end; i++) nestingBg[i] = color;
    }
  }

  // ---- Step 4: find {{ }} blocks and classify their semantic type ----
  // Each block gets ONE color covering the full {{...}} range (including spaces).
  const blockColor: (string | null)[] = new Array(source.length).fill(null);
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].type !== TokenType.DelimOpen) { i++; continue; }
    const blockStart = tokens[i].start;
    i++;
    let hasCtrl = false, hasVarWrite = false, hasVarRead = false, hasFunc = false, hasComment = false, hasDot = false;
    while (i < tokens.length && tokens[i].type !== TokenType.DelimClose) {
      const t = tokens[i];
      if (t.type === TokenType.Keyword) hasCtrl = true;
      else if (t.type === TokenType.VariableDef || t.type === TokenType.VariableAssign) hasVarWrite = true;
      else if (t.type === TokenType.VariableUse) hasVarRead = true;
      else if (t.type === TokenType.Function) hasFunc = true;
      else if (t.type === TokenType.Comment) hasComment = true;
      else if (t.type === TokenType.Dot) hasDot = true;
      i++;
    }
    if (i < tokens.length) {
      const blockEnd = tokens[i].end;
      // dot-access (e.g. {{ .name }}) is a variable read, not a function call
      const isVarRead = hasVarRead || hasDot;
      const color = hasComment ? P.comment
                  : hasCtrl ? P.ctrlFlow
                  : hasVarWrite ? P.varWrite
                  : isVarRead ? P.varRead
                  : hasFunc ? P.func
                  : null;
      if (color) {
        for (let j = blockStart; j < blockEnd; j++) blockColor[j] = color;
      }
      // Also color any tokens between DelimOpen and DelimClose that are inside
      // (already covered by the range fill above)
    }
    i++;
  }

  // ---- Step 5: build HTML ----
  const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
  const esc = (ch: string) => escapes[ch] || ch;

  let html = `<pre style="background:${P.bg};color:${P.fg};padding:12px;font:13px monospace;line-height:1.5;margin:0">`;
  let pos = 0;
  while (pos < source.length) {
    const nb = nestingBg[pos];
    const bc = blockColor[pos];

    let j = pos;
    while (j < source.length && nestingBg[j] === nb && blockColor[j] === bc) j++;

    const raw = source.slice(pos, j);
    const text = raw.replace(/[&<>]/g, (c) => esc(c));

    if (nb && bc) {
      html += `<span style="background:${nb}"><span style="background:${bc}">${text}</span></span>`;
    } else if (bc) {
      html += `<span style="background:${bc}">${text}</span>`;
    } else if (nb) {
      html += `<span style="background:${nb}">${text}</span>`;
    } else {
      html += text;
    }
    pos = j;
  }
  html += "</pre>";

  return html;
}
