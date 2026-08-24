import { tokenize, TokenType } from "@colorful-tmpl/highlight-core";
import * as vscode from "vscode";

const LANG = "colorful-tmpl";
const CFG = "colorful-tmpl.rainbow";

// Must mirror the injectTo list in package.json — these languages get rainbow decorations automatically.
const INJECTION_LANGS = new Set([
  "yaml",
  "json",
  "html",
  "xml",
  "markdown",
  "cmake",
  "sql",
  "python",
  "shellscript",
  "toml",
  "ruby",
  "go",
  "nginx",
]);

type Span = { start: number; end: number };

const PALETTES = {
  dark: [
    "rgba(178,218,232,0.18)",
    "rgba(160,235,178,0.18)",
    "rgba(255,222,192,0.20)",
    "rgba(236,190,238,0.18)",
    "rgba(255,252,180,0.18)",
    "rgba(255,198,208,0.18)",
  ],
  light: [
    "rgba(173,216,230,0.30)",
    "rgba(144,238,144,0.30)",
    "rgba(255,218,185,0.35)",
    "rgba(221,160,221,0.30)",
    "rgba(255,255,150,0.30)",
    "rgba(255,182,193,0.30)",
  ],
};

function isLightTheme(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return (
    kind === vscode.ColorThemeKind.Light ||
    kind === vscode.ColorThemeKind.HighContrastLight
  );
}

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

type SemanticRanges = {
  varDef: vscode.Range[];
  varAssign: vscode.Range[];
  varUse: vscode.Range[];
  func: vscode.Range[];
  pipe: vscode.Range[];
  comment: vscode.Range[];
  ctrlByLevel: Map<number, vscode.Range[]>;
};

type ActionBlockInfo = {
  range: vscode.Range;
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
  rng: (s: number, e: number) => vscode.Range,
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
        range: rng(bs, tokens[j].end),
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
function collectBlockRanges(
  tokens: ReturnType<typeof tokenize>,
  rng: (s: number, e: number) => vscode.Range,
): Pick<SemanticRanges, "comment" | "ctrlByLevel"> {
  const comment: vscode.Range[] = [];
  const ctrlByLevel = new Map<number, vscode.Range[]>();
  for (const block of scanActionBlocks(tokens, rng)) {
    if (block.hasComment) comment.push(block.range);
    else if (block.hasCtrl) {
      const list = ctrlByLevel.get(block.ctrlLevel) ?? [];
      list.push(block.range);
      ctrlByLevel.set(block.ctrlLevel, list);
    }
  }
  return { comment, ctrlByLevel };
}

// Token pass: variables, field access, function names, and pipes.
function collectTokenRanges(
  tokens: ReturnType<typeof tokenize>,
  rng: (s: number, e: number) => vscode.Range,
): Pick<SemanticRanges, "varDef" | "varAssign" | "varUse" | "func" | "pipe"> {
  const varDef: vscode.Range[] = [];
  const varAssign: vscode.Range[] = [];
  const varUse: vscode.Range[] = [];
  const func: vscode.Range[] = [];
  const pipe: vscode.Range[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case TokenType.VariableDef:
        varDef.push(rng(t.start, t.end));
        break;
      case TokenType.VariableAssign:
        varAssign.push(rng(t.start, t.end));
        break;
      case TokenType.VariableUse:
      case TokenType.Dot:
      case TokenType.Field:
        varUse.push(rng(t.start, t.end));
        break;
      case TokenType.Function:
        func.push(rng(t.start, t.end));
        break;
      case TokenType.Pipe:
        pipe.push(rng(t.start, t.end));
        break;
      default:
        break;
    }
  }
  return { varDef, varAssign, varUse, func, pipe };
}

// Merges nesting-level backgrounds and control-flow chips into per-palette-index range lists,
// pre-seeded so every index gets cleared even when it has no ranges this pass.
function buildPaletteIndexMap(
  painted: Map<number, Span[]>,
  ctrlByLevel: Map<number, vscode.Range[]>,
  paletteSize: number,
  rng: (s: number, e: number) => vscode.Range,
): Map<number, vscode.Range[]> {
  const byPaletteIndex = new Map<number, vscode.Range[]>();
  for (let i = 0; i < paletteSize; i++) byPaletteIndex.set(i, []);
  for (const [level, spans] of painted) {
    const idx = level % paletteSize;
    const list = byPaletteIndex.get(idx) ?? [];
    list.push(...spans.map((s) => rng(s.start, s.end)));
    byPaletteIndex.set(idx, list);
  }
  for (const [level, ranges] of ctrlByLevel) {
    const idx = level % paletteSize;
    const list = byPaletteIndex.get(idx) ?? [];
    list.push(...ranges);
    byPaletteIndex.set(idx, list);
  }
  return byPaletteIndex;
}

function singleUseColors(light: boolean) {
  return {
    varDef: light ? "rgba(46,160,67,0.22)" : "rgba(150,238,178,0.30)",
    varAssign: light ? "rgba(230,126,34,0.28)" : "rgba(255,208,134,0.30)",
    varUse: light ? "rgba(33,102,172,0.22)" : "rgba(156,196,255,0.30)",
    func: light ? "rgba(124,77,255,0.20)" : "rgba(216,188,252,0.30)",
    pipe: light ? "rgba(0,131,143,0.24)" : "rgba(146,228,236,0.30)",
    comment: light ? "rgba(160,160,160,0.18)" : "rgba(182,184,196,0.16)",
  };
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

export class NestingDecorator {
  private readonly levelDecorations = new Map<
    number,
    vscode.TextEditorDecorationType
  >();
  private readonly disposables: vscode.Disposable[] = [];
  // Per-editor debounce timers keyed by document URI; avoids one timer clobbering another.
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private cachedLanguages: Set<string> = new Set([LANG, ...INJECTION_LANGS]);
  private varDefDeco!: vscode.TextEditorDecorationType;
  private varAssignDeco!: vscode.TextEditorDecorationType;
  private varUseDeco!: vscode.TextEditorDecorationType;
  private funcDeco!: vscode.TextEditorDecorationType;
  private pipeDeco!: vscode.TextEditorDecorationType;
  private commentDeco!: vscode.TextEditorDecorationType;

  constructor() {
    this.rebuildDecorations();
    this.refreshLanguageCache();
  }

  private refreshLanguageCache(): void {
    const extra = vscode.workspace
      .getConfiguration(CFG)
      .get<string[]>("additionalLanguages", []);
    this.cachedLanguages = new Set([LANG, ...INJECTION_LANGS, ...extra]);
  }

  private isActive(languageId: string): boolean {
    return this.cachedLanguages.has(languageId);
  }

  private disposeDecorations(): void {
    for (const d of this.levelDecorations.values()) d.dispose();
    this.varDefDeco?.dispose();
    this.varAssignDeco?.dispose();
    this.varUseDeco?.dispose();
    this.funcDeco?.dispose();
    this.pipeDeco?.dispose();
    this.commentDeco?.dispose();
    this.levelDecorations.clear();
  }

  private rebuildDecorations(): void {
    this.disposeDecorations();

    const light = isLightTheme();
    const palette: string[] = vscode.workspace
      .getConfiguration(CFG)
      .get("palette", light ? PALETTES.light : PALETTES.dark);
    const colors = singleUseColors(light);

    const mk = (bg: string) =>
      vscode.window.createTextEditorDecorationType({
        backgroundColor: bg,
        borderRadius: "2px",
        isWholeLine: false,
      });
    for (let i = 0; i < palette.length; i++)
      this.levelDecorations.set(i, mk(palette[i]));
    this.varDefDeco = mk(colors.varDef);
    this.varAssignDeco = mk(colors.varAssign);
    this.varUseDeco = mk(colors.varUse);
    this.funcDeco = mk(colors.func);
    this.pipeDeco = mk(colors.pipe);
    this.commentDeco = mk(colors.comment);
  }

  activate(): void {
    // Re-read config in case it changed between construction and this call.
    this.refreshLanguageCache();
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.isActive(e.document.languageId)) {
          for (const ed of vscode.window.visibleTextEditors) {
            if (ed.document === e.document) this.scheduleUpdate(ed);
          }
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((ed) => {
        if (!ed) return;
        if (this.isActive(ed.document.languageId)) this.updateDecorations(ed);
        else this.clearDecorations(ed);
      }),
      // onDidOpenTextDocument fires when a document is opened or its language changes.
      // VS Code updates ed.document before firing, so URI comparison is sufficient.
      vscode.workspace.onDidOpenTextDocument((doc) => {
        const uri = doc.uri.toString();
        for (const ed of vscode.window.visibleTextEditors) {
          if (ed.document.uri.toString() !== uri) continue;
          if (this.isActive(doc.languageId)) this.updateDecorations(ed);
          else this.clearDecorations(ed);
        }
      }),
      // Debounce resize/zoom: onDidChangeVisibleTextEditors fires continuously during those.
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        for (const ed of editors) {
          if (this.isActive(ed.document.languageId)) this.scheduleUpdate(ed);
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CFG)) {
          this.refreshLanguageCache();
          this.rebuildDecorations();
          for (const ed of vscode.window.visibleTextEditors) {
            if (this.isActive(ed.document.languageId))
              this.updateDecorations(ed);
          }
        }
      }),
    );
    // onStartupFinished guarantees activate() runs after VS Code is fully initialized;
    // onDidChangeVisibleTextEditors handles editors that become visible after activate().
    for (const ed of vscode.window.visibleTextEditors) {
      if (this.isActive(ed.document.languageId)) this.updateDecorations(ed);
    }
  }

  private scheduleUpdate(editor: vscode.TextEditor): void {
    if (!this.isActive(editor.document.languageId)) return;
    const key = editor.document.uri.toString();
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.updateDecorations(editor);
      }, 150),
    );
  }

  private updateDecorations(editor: vscode.TextEditor): void {
    if (!vscode.workspace.getConfiguration(CFG).get<boolean>("enabled", true)) {
      this.clearDecorations(editor);
      return;
    }

    const source = editor.document.getText();
    // Skip tokenizing files that have no template delimiters (fast path for large non-template files).
    if (editor.document.languageId !== LANG && !source.includes("{{")) {
      this.clearDecorations(editor);
      return;
    }
    const tokens = tokenize(source);
    const paletteSize = this.levelDecorations.size;
    const rng = (s: number, e: number) =>
      new vscode.Range(
        editor.document.positionAt(s),
        editor.document.positionAt(e),
      );

    const actionMask = buildActionMask(tokens, source.length);
    const insideAction = (pos: number) => actionMask[pos] === 1;

    const byLevel = buildLevelTextRanges(tokens, insideAction);
    const painted = computePaintedLevels(byLevel);
    const { comment, ctrlByLevel } = collectBlockRanges(tokens, rng);
    const { varDef, varAssign, varUse, func, pipe } = collectTokenRanges(
      tokens,
      rng,
    );
    const byPaletteIndex = buildPaletteIndexMap(
      painted,
      ctrlByLevel,
      paletteSize,
      rng,
    );

    for (const [idx, ranges] of byPaletteIndex) {
      const d = this.levelDecorations.get(idx);
      if (d) editor.setDecorations(d, ranges);
    }

    editor.setDecorations(this.commentDeco, comment);
    editor.setDecorations(this.varDefDeco, varDef);
    editor.setDecorations(this.varAssignDeco, varAssign);
    editor.setDecorations(this.varUseDeco, varUse);
    editor.setDecorations(this.funcDeco, func);
    editor.setDecorations(this.pipeDeco, pipe);
  }

  private clearDecorations(editor: vscode.TextEditor): void {
    for (const d of this.levelDecorations.values())
      editor.setDecorations(d, []);
    editor.setDecorations(this.varDefDeco, []);
    editor.setDecorations(this.varAssignDeco, []);
    editor.setDecorations(this.varUseDeco, []);
    editor.setDecorations(this.funcDeco, []);
    editor.setDecorations(this.pipeDeco, []);
    editor.setDecorations(this.commentDeco, []);
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const d of this.disposables) d.dispose();
    for (const d of this.levelDecorations.values()) d.dispose();
    this.varDefDeco?.dispose();
    this.varAssignDeco?.dispose();
    this.varUseDeco?.dispose();
    this.funcDeco?.dispose();
    this.pipeDeco?.dispose();
    this.commentDeco?.dispose();
  }
}
