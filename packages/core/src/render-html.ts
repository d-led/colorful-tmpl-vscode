import { tokenize, TokenType } from "@colorful-tmpl/highlight-core";

type Span = { start: number; end: number };

export const PALETTES = {
  dark: {
    bg: "#1e1e2e",
    fg: "#cdd6f4",
    levels: [
      "rgba(173, 216, 230, 0.14)", // light blue
      "rgba(144, 238, 144, 0.14)", // light green
      "rgba(255, 218, 185, 0.16)", // peach
      "rgba(221, 160, 221, 0.14)", // plum
      "rgba(255, 255, 150, 0.14)", // yellow
      "rgba(255, 182, 193, 0.14)", // pink
    ],
    varDef: "rgba(144, 238, 144, 0.40)", // green: $x :=
    varAssign: "rgba(255, 183, 77, 0.45)", // orange: $x =
    varUse: "rgba(130, 170, 255, 0.45)", // blue: $x / .field
    func: "rgba(198, 160, 246, 0.45)", // violet: print / coll.Slice
    pipe: "rgba(128, 222, 234, 0.50)", // cyan: |
    comment: "rgba(140, 140, 140, 0.20)", // grey
  },
  light: {
    bg: "#ffffff",
    fg: "#1e293b",
    levels: [
      "rgba(173, 216, 230, 0.30)", // light blue
      "rgba(144, 238, 144, 0.30)", // light green
      "rgba(255, 218, 185, 0.35)", // peach
      "rgba(221, 160, 221, 0.30)", // plum
      "rgba(255, 255, 150, 0.30)", // yellow
      "rgba(255, 182, 193, 0.30)", // pink
    ],
    varDef: "rgba(46, 160, 67, 0.22)", // green
    varAssign: "rgba(230, 126, 34, 0.28)", // orange
    varUse: "rgba(33, 102, 172, 0.22)", // blue
    func: "rgba(124, 77, 255, 0.20)", // violet
    pipe: "rgba(0, 131, 143, 0.24)", // cyan
    comment: "rgba(160, 160, 160, 0.18)", // grey
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
        if (p.start < child.start)
          next.push({ start: p.start, end: child.start });
        if (child.end < p.end) next.push({ start: child.end, end: p.end });
      }
    }
    result = next;
  }
  return result;
}

type ColorPalette = typeof PALETTES.dark;

function findActionSpans(tokens: ReturnType<typeof tokenize>): Span[] {
  const out: Span[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].type !== TokenType.DelimOpen) { i++; continue; }
    const start = tokens[i].start;
    i++;
    while (i < tokens.length && tokens[i].type !== TokenType.DelimClose) i++;
    if (i < tokens.length) out.push({ start, end: tokens[i].end });
    i++;
  }
  return out;
}

function buildTextRangesByLevel(
  tokens: ReturnType<typeof tokenize>,
  actionSpans: Span[],
): Map<number, Span[]> {
  const insideAction = (pos: number) =>
    actionSpans.some((r) => pos >= r.start && pos < r.end);
  const byLevel = new Map<number, Span[]>();
  for (const t of tokens) {
    if (t.type !== TokenType.Text || t.nestingLevel === 0 || insideAction(t.start)) continue;
    const list = byLevel.get(t.nestingLevel) ?? [];
    const prev = list.at(-1);
    if (prev && t.start <= prev.end) { if (t.end > prev.end) prev.end = t.end; }
    else list.push({ start: t.start, end: t.end });
    byLevel.set(t.nestingLevel, list);
  }
  for (const [level, ranges] of byLevel) {
    ranges.sort((a, b) => a.start - b.start);
    const merged: Span[] = [];
    for (const r of ranges) {
      const prev = merged.at(-1);
      const gapIsAllAction =
        prev !== undefined &&
        !tokens.some(
          (t) =>
            t.type === TokenType.Text &&
            !insideAction(t.start) &&
            t.start >= prev.end &&
            t.start < r.start,
        );
      if (gapIsAllAction && prev) { prev.end = r.end; continue; }
      merged.push({ ...r });
    }
    byLevel.set(level, merged);
  }
  return byLevel;
}

function computePaintedSpans(byLevel: Map<number, Span[]>): Map<number, Span[]> {
  const sorted = [...byLevel.keys()].sort((a, b) => b - a);
  const painted = new Map<number, Span[]>();
  for (const level of sorted) {
    let ranges = byLevel.get(level) ?? [];
    for (const [cl, cr] of painted) {
      if (cl <= level) continue;
      ranges = subtractRanges(ranges, cr);
    }
    if (ranges.length > 0) painted.set(level, ranges);
  }
  return painted;
}

function buildNestingBg(painted: Map<number, Span[]>, palette: string[], len: number): (string | null)[] {
  const bg: (string | null)[] = new Array(len).fill(null);
  for (const [level, spans] of painted) {
    const color = palette[level % palette.length];
    for (const r of spans) for (let i = r.start; i < r.end; i++) bg[i] = color;
  }
  return bg;
}

function fillBlockBg(
  tokens: ReturnType<typeof tokenize>,
  P: ColorPalette,
  bg: (string | null)[],
): void {
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].type !== TokenType.DelimOpen) { i++; continue; }
    const blockStart = tokens[i].start;
    i++;
    let ctrlLevel = 0;
    let hasCtrl = false;
    let hasComment = false;
    while (i < tokens.length && tokens[i].type !== TokenType.DelimClose) {
      if (tokens[i].type === TokenType.Keyword) {
        if (!hasCtrl) ctrlLevel = tokens[i].nestingLevel;
        hasCtrl = true;
      } else if (tokens[i].type === TokenType.Comment) {
        hasComment = true;
      }
      i++;
    }
    if (i < tokens.length) {
      const color = hasComment ? P.comment : hasCtrl ? P.levels[ctrlLevel % P.levels.length] : null;
      if (color) for (let k = blockStart; k < tokens[i].end; k++) bg[k] = color;
    }
    i++;
  }
}

function fillTokenBg(
  tokens: ReturnType<typeof tokenize>,
  P: ColorPalette,
  bg: (string | null)[],
): void {
  for (const t of tokens) {
    let color: string | null = null;
    switch (t.type) {
      case TokenType.VariableDef:    color = P.varDef;    break;
      case TokenType.VariableAssign: color = P.varAssign; break;
      case TokenType.VariableUse:
      case TokenType.Dot:
      case TokenType.Field:          color = P.varUse;    break;
      case TokenType.Function:       color = P.func;      break;
      case TokenType.Pipe:           color = P.pipe;      break;
    }
    if (color) for (let k = t.start; k < t.end; k++) bg[k] = color;
  }
}

function buildSemanticBg(
  tokens: ReturnType<typeof tokenize>,
  P: ColorPalette,
  len: number,
): (string | null)[] {
  const bg: (string | null)[] = new Array(len).fill(null);
  fillBlockBg(tokens, P, bg);
  fillTokenBg(tokens, P, bg);
  return bg;
}

function renderHtmlBody(source: string, P: ColorPalette, nestingBg: (string | null)[], semanticBg: (string | null)[]): string {
  const esc = (ch: string) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch] ?? ch);
  let html = `<pre style="background:${P.bg};color:${P.fg};padding:12px;font:13px monospace;line-height:1.5;margin:0">`;
  let pos = 0;
  while (pos < source.length) {
    const nb = nestingBg[pos];
    const bc = semanticBg[pos];
    let j = pos;
    while (j < source.length && nestingBg[j] === nb && semanticBg[j] === bc) j++;
    const text = source.slice(pos, j).replace(/[&<>]/g, esc);
    if (nb && bc)   html += `<span style="background:${nb}"><span style="background:${bc}">${text}</span></span>`;
    else if (bc)    html += `<span style="background:${bc}">${text}</span>`;
    else if (nb)    html += `<span style="background:${nb}">${text}</span>`;
    else            html += text;
    pos = j;
  }
  return html + "</pre>";
}

/**
 * Render a Go template string as HTML with nesting-level background colors,
 * matching the VS Code decorator logic exactly.
 *
 * @param theme "dark" or "light" — selects palette and page background.
 */
export function renderColoredHtml(source: string, theme: Theme = "dark"): string {
  const P = PALETTES[theme];
  const tokens = tokenize(source);
  const actionSpans = findActionSpans(tokens);
  const byLevel = buildTextRangesByLevel(tokens, actionSpans);
  const painted = computePaintedSpans(byLevel);
  const nestingBg = buildNestingBg(painted, P.levels, source.length);
  const semanticBg = buildSemanticBg(tokens, P, source.length);
  return renderHtmlBody(source, P, nestingBg, semanticBg);
}

