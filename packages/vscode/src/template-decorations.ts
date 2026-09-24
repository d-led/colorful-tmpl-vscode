import { tokenize, TokenType } from "@colorful-tmpl/highlight-core";

import { goStringContents, type Span } from "./go-strings.js";
import { templateScope } from "./template-host.js";

export type { Span };

/** Every decoration range the decorator paints, expressed as source spans. */
export type Decorations = {
  byPaletteIndex: Map<number, Span[]>;
  comment: Span[];
  varDef: Span[];
  varAssign: Span[];
  varUse: Span[];
  func: Span[];
  pipe: Span[];
};

/** How many ranges each decoration class holds; used for logs and diagnostics. */
export type DecorationCounts = {
  definitions: number;
  assignments: number;
  uses: number;
  functions: number;
  bands: number;
};

function subtractRanges(parents: Span[], children: Span[]): Span[] {
  let result = [...parents];
  for (const child of children) {
    const next: Span[] = [];
    for (const p of result) {
      if (child.end <= p.start || child.start >= p.end) next.push(p);
      else {
        if (p.start < child.start)
          next.push({ start: p.start, end: child.start });
        if (child.end < p.end) next.push({ start: child.end, end: p.end });
      }
    }
    result = next;
  }
  return result;
}

function groupTextRangesByLevel(
  tokens: ReturnType<typeof tokenize>,
  insideAction: (pos: number) => boolean,
): Map<number, Span[]> {
  const byLevel = new Map<number, Span[]>();
  for (const t of tokens) {
    if (t.type !== TokenType.Text) continue;
    if (t.nestingLevel === 0 || insideAction(t.start)) continue;
    const list = byLevel.get(t.nestingLevel) ?? [];
    const prev = list.at(-1);
    if (prev && t.start <= prev.end) {
      if (t.end > prev.end) prev.end = t.end;
    } else list.push({ start: t.start, end: t.end });
    byLevel.set(t.nestingLevel, list);
  }
  return byLevel;
}

// True when no non-action text token falls between two positions, i.e. only a {{ }} block separates them.
function onlyActionBetween(
  tokens: ReturnType<typeof tokenize>,
  insideAction: (pos: number) => boolean,
  from: number,
  to: number,
): boolean {
  return !tokens.some(
    (t) =>
      t.type === TokenType.Text &&
      !insideAction(t.start) &&
      t.start >= from &&
      t.start < to,
  );
}

function extendRangesAcrossActions(
  ranges: Span[],
  tokens: ReturnType<typeof tokenize>,
  insideAction: (pos: number) => boolean,
): Span[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const rr of sorted) {
    const prev = merged.at(-1);
    if (prev && onlyActionBetween(tokens, insideAction, prev.end, rr.start)) {
      prev.end = rr.end;
      continue;
    }
    merged.push({ ...rr });
  }
  return merged;
}

// Text-only nesting ranges per level, merged so adjacent same-level text spans (across a single
// {{ }} action) become one contiguous range.
function buildLevelTextRanges(
  tokens: ReturnType<typeof tokenize>,
  insideAction: (pos: number) => boolean,
): Map<number, Span[]> {
  const byLevel = groupTextRangesByLevel(tokens, insideAction);
  for (const [level, ranges] of byLevel) {
    byLevel.set(level, extendRangesAcrossActions(ranges, tokens, insideAction));
  }
  return byLevel;
}

// Deepest levels paint on top; shallower levels are clipped to the areas deeper levels don't cover.
function computePaintedLevels(
  byLevel: Map<number, Span[]>,
): Map<number, Span[]> {
  const sortedLevels = [...byLevel.keys()].sort((a, b) => b - a);
  const painted = new Map<number, Span[]>();
  for (const level of sortedLevels) {
    let ranges = byLevel.get(level) ?? [];
    for (const [cl, cr] of painted) {
      if (cl <= level) continue;
      ranges = subtractRanges(ranges, cr);
    }
    if (ranges.length > 0) painted.set(level, ranges);
  }
  return painted;
}

type ActionBlockInfo = {
  span: Span;
  ctrlLevel: number;
  hasCtrl: boolean;
  hasComment: boolean;
};

// Scans one {{ ... }} action's contents starting right after the opening delimiter token.
function scanActionContents(
  tokens: ReturnType<typeof tokenize>,
  start: number,
): { end: number; ctrlLevel: number; hasCtrl: boolean; hasComment: boolean } {
  let j = start;
  let ctrlLevel = 0;
  let hasCtrl = false;
  let hasComment = false;
  while (j < tokens.length && tokens[j].type !== TokenType.DelimClose) {
    const tt = tokens[j].type;
    if (tt === TokenType.Keyword) {
      if (!hasCtrl) ctrlLevel = tokens[j].nestingLevel;
      hasCtrl = true;
    } else if (tt === TokenType.Comment) {
      hasComment = true;
    }
    j++;
  }
  return { end: j, ctrlLevel, hasCtrl, hasComment };
}

// Scans each {{ }} action once and reports whether it holds a control-flow keyword or a comment.
function scanActionBlocks(
  tokens: ReturnType<typeof tokenize>,
): ActionBlockInfo[] {
  const blocks: ActionBlockInfo[] = [];
  let j = 0;
  while (j < tokens.length) {
    if (tokens[j].type !== TokenType.DelimOpen) {
      j++;
      continue;
    }
    const bs = tokens[j].start;
    const { end, ctrlLevel, hasCtrl, hasComment } = scanActionContents(
      tokens,
      j + 1,
    );
    j = end;
    if (j < tokens.length) {
      blocks.push({
        span: { start: bs, end: tokens[j].end },
        ctrlLevel,
        hasCtrl,
        hasComment,
      });
    }
    j++;
  }
  return blocks;
}

// Whole-{{ }}-block pass: comments and control-flow level chips.
function collectBlockRanges(tokens: ReturnType<typeof tokenize>): {
  comment: Span[];
  ctrlByLevel: Map<number, Span[]>;
} {
  const comment: Span[] = [];
  const ctrlByLevel = new Map<number, Span[]>();
  for (const block of scanActionBlocks(tokens)) {
    if (block.hasComment) comment.push(block.span);
    else if (block.hasCtrl) {
      const list = ctrlByLevel.get(block.ctrlLevel) ?? [];
      list.push(block.span);
      ctrlByLevel.set(block.ctrlLevel, list);
    }
  }
  return { comment, ctrlByLevel };
}

// Token pass: variables, field access, function names, and pipes.
function collectTokenRanges(tokens: ReturnType<typeof tokenize>): {
  varDef: Span[];
  varAssign: Span[];
  varUse: Span[];
  func: Span[];
  pipe: Span[];
} {
  const varDef: Span[] = [];
  const varAssign: Span[] = [];
  const varUse: Span[] = [];
  const func: Span[] = [];
  const pipe: Span[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case TokenType.VariableDef:
        varDef.push({ start: t.start, end: t.end });
        break;
      case TokenType.VariableAssign:
        varAssign.push({ start: t.start, end: t.end });
        break;
      case TokenType.VariableUse:
      case TokenType.Dot:
      case TokenType.Field:
        varUse.push({ start: t.start, end: t.end });
        break;
      case TokenType.Function:
        func.push({ start: t.start, end: t.end });
        break;
      case TokenType.Pipe:
        pipe.push({ start: t.start, end: t.end });
        break;
      default:
        break;
    }
  }
  return { varDef, varAssign, varUse, func, pipe };
}

// Merges nesting-level backgrounds and control-flow chips into per-palette-index span lists,
// pre-seeded so every index gets cleared even when it has no ranges this pass.
function buildPaletteIndexMap(
  painted: Map<number, Span[]>,
  ctrlByLevel: Map<number, Span[]>,
  paletteSize: number,
): Map<number, Span[]> {
  const byPaletteIndex = new Map<number, Span[]>();
  for (let i = 0; i < paletteSize; i++) byPaletteIndex.set(i, []);
  for (const [level, spans] of painted) {
    const idx = level % paletteSize;
    const list = byPaletteIndex.get(idx) ?? [];
    list.push(...spans);
    byPaletteIndex.set(idx, list);
  }
  for (const [level, spans] of ctrlByLevel) {
    const idx = level % paletteSize;
    const list = byPaletteIndex.get(idx) ?? [];
    list.push(...spans);
    byPaletteIndex.set(idx, list);
  }
  return byPaletteIndex;
}

function buildActionMask(
  tokens: ReturnType<typeof tokenize>,
  len: number,
): Uint8Array {
  const mask = new Uint8Array(len);
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].type !== TokenType.DelimOpen) {
      i++;
      continue;
    }
    const start = tokens[i].start;
    i++;
    while (i < tokens.length && tokens[i].type !== TokenType.DelimClose) i++;
    if (i < tokens.length) mask.fill(1, start, tokens[i].end);
    i++;
  }
  return mask;
}

/**
 * Computes decoration spans for a template source whose tokens are relative to
 * the start of that source (offsets `0..sourceLength`).
 */
export function computeDecorations(
  tokens: ReturnType<typeof tokenize>,
  sourceLength: number,
  paletteSize: number,
): Decorations {
  const actionMask = buildActionMask(tokens, sourceLength);
  const insideAction = (pos: number) => actionMask[pos] === 1;

  const byLevel = buildLevelTextRanges(tokens, insideAction);
  const painted = computePaintedLevels(byLevel);
  const { comment, ctrlByLevel } = collectBlockRanges(tokens);
  const { varDef, varAssign, varUse, func, pipe } = collectTokenRanges(tokens);
  const byPaletteIndex = buildPaletteIndexMap(
    painted,
    ctrlByLevel,
    paletteSize,
  );
  return { byPaletteIndex, comment, varDef, varAssign, varUse, func, pipe };
}

function emptyDecorations(paletteSize: number): Decorations {
  const byPaletteIndex = new Map<number, Span[]>();
  for (let i = 0; i < paletteSize; i++) byPaletteIndex.set(i, []);
  return {
    byPaletteIndex,
    comment: [],
    varDef: [],
    varAssign: [],
    varUse: [],
    func: [],
    pipe: [],
  };
}

function mergeDecorations(into: Decorations, from: Decorations): void {
  for (const [idx, spans] of from.byPaletteIndex) {
    const list = into.byPaletteIndex.get(idx) ?? [];
    list.push(...spans);
    into.byPaletteIndex.set(idx, list);
  }
  into.comment.push(...from.comment);
  into.varDef.push(...from.varDef);
  into.varAssign.push(...from.varAssign);
  into.varUse.push(...from.varUse);
  into.func.push(...from.func);
  into.pipe.push(...from.pipe);
}

function offsetDecorations(
  decorations: Decorations,
  offset: number,
): Decorations {
  const shift = (s: Span): Span => ({
    start: s.start + offset,
    end: s.end + offset,
  });
  for (const [idx, spans] of decorations.byPaletteIndex) {
    decorations.byPaletteIndex.set(idx, spans.map(shift));
  }
  decorations.comment = decorations.comment.map(shift);
  decorations.varDef = decorations.varDef.map(shift);
  decorations.varAssign = decorations.varAssign.map(shift);
  decorations.varUse = decorations.varUse.map(shift);
  decorations.func = decorations.func.map(shift);
  decorations.pipe = decorations.pipe.map(shift);
  return decorations;
}

/**
 * Computes decoration spans for Go source by treating each string literal that
 * contains `{{` as its own template, so Go code (composite literals included)
 * is never tokenized.
 */
export function computeGoDecorations(
  source: string,
  paletteSize: number,
): Decorations {
  const merged = emptyDecorations(paletteSize);
  for (const { start, end } of goStringContents(source)) {
    const content = source.slice(start, end);
    if (!content.includes("{{")) continue;
    const decorations = computeDecorations(
      tokenize(content),
      content.length,
      paletteSize,
    );
    mergeDecorations(merged, offsetDecorations(decorations, start));
  }
  return merged;
}

/** Totals per decoration class, for the log line and the diagnose command. */
export function countDecorations(decorations: Decorations): DecorationCounts {
  return {
    definitions: decorations.varDef.length,
    assignments: decorations.varAssign.length,
    uses: decorations.varUse.length,
    functions: decorations.func.length,
    bands: [...decorations.byPaletteIndex.values()].reduce(
      (total, spans) => total + spans.length,
      0,
    ),
  };
}

/**
 * Decorations for a document, using the pass its language calls for: the whole
 * file for a template, or only the string literals of a host language that also
 * uses `{{`/`}}` in its own syntax (Go composite literals).
 */
export function decorationsForDocument(
  languageId: string,
  source: string,
  paletteSize: number,
): Decorations {
  return templateScope(languageId, source) === "strings-only"
    ? computeGoDecorations(source, paletteSize)
    : computeDecorations(tokenize(source), source.length, paletteSize);
}
