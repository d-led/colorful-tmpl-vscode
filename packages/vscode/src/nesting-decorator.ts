import { tokenize, TokenType } from "@colorful-tmpl/highlight-core";
import * as vscode from "vscode";

const LANG = "colorful-tmpl";
const CFG = "colorful-tmpl.rainbow";

type Span = { start: number; end: number };

const PALETTES = {
  dark: [
    "rgba(173,216,230,0.14)",
    "rgba(144,238,144,0.14)",
    "rgba(255,218,185,0.16)",
    "rgba(221,160,221,0.14)",
    "rgba(255,255,150,0.14)",
    "rgba(255,182,193,0.14)",
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

export class NestingDecorator {
  private levelDecorations = new Map<number, vscode.TextEditorDecorationType>();
  private varDefDeco!: vscode.TextEditorDecorationType;
  private varAssignDeco!: vscode.TextEditorDecorationType;
  private varUseDeco!: vscode.TextEditorDecorationType;
  private funcDeco!: vscode.TextEditorDecorationType;
  private pipeDeco!: vscode.TextEditorDecorationType;
  private commentDeco!: vscode.TextEditorDecorationType;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.rebuildDecorations();
  }

  private rebuildDecorations(): void {
    for (const d of this.levelDecorations.values()) d.dispose();
    this.varDefDeco?.dispose();
    this.varAssignDeco?.dispose();
    this.varUseDeco?.dispose();
    this.funcDeco?.dispose();
    this.pipeDeco?.dispose();
    this.commentDeco?.dispose();
    this.levelDecorations.clear();

    const light = isLightTheme();
    const palette: string[] = vscode.workspace
      .getConfiguration(CFG)
      .get("palette", light ? PALETTES.light : PALETTES.dark);
    const varDef = light ? "rgba(46,160,67,0.22)" : "rgba(144,238,144,0.40)";
    const varAssign = light ? "rgba(230,126,34,0.28)" : "rgba(255,183,77,0.45)";
    const varUse = light ? "rgba(33,102,172,0.22)" : "rgba(130,170,255,0.45)";
    const func = light ? "rgba(124,77,255,0.20)" : "rgba(198,160,246,0.45)";
    const pipe = light ? "rgba(0,131,143,0.24)" : "rgba(128,222,234,0.50)";
    const comment = light ? "rgba(160,160,160,0.18)" : "rgba(140,140,140,0.20)";

    const mk = (bg: string) =>
      vscode.window.createTextEditorDecorationType({
        backgroundColor: bg,
        borderRadius: "2px",
        isWholeLine: false,
      });
    for (let i = 0; i < palette.length; i++)
      this.levelDecorations.set(i, mk(palette[i]));
    this.varDefDeco = mk(varDef);
    this.varAssignDeco = mk(varAssign);
    this.varUseDeco = mk(varUse);
    this.funcDeco = mk(func);
    this.pipeDeco = mk(pipe);
    this.commentDeco = mk(comment);
  }

  activate(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId === LANG)
          this.scheduleUpdate(vscode.window.activeTextEditor);
      }),
      vscode.window.onDidChangeActiveTextEditor((ed) => {
        if (ed?.document.languageId === LANG) this.updateDecorations(ed);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CFG)) {
          this.rebuildDecorations();
          const ed = vscode.window.activeTextEditor;
          if (ed?.document.languageId === LANG) this.updateDecorations(ed);
        }
      }),
    );
    const ed = vscode.window.activeTextEditor;
    if (ed?.document.languageId === LANG) this.updateDecorations(ed);
  }

  private scheduleUpdate(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== LANG) return;
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      this.timeout = undefined;
      this.updateDecorations(editor);
    }, 150);
  }

  private updateDecorations(editor: vscode.TextEditor): void {
    if (!vscode.workspace.getConfiguration(CFG).get<boolean>("enabled", true)) {
      this.clearDecorations(editor);
      return;
    }

    const source = editor.document.getText();
    const tokens = tokenize(source);
    const paletteSize = this.levelDecorations.size;
    const rng = (s: number, e: number) =>
      new vscode.Range(
        editor.document.positionAt(s),
        editor.document.positionAt(e),
      );

    // ---- Step 0: find {{ }} ranges to exclude interior text ----
    const actionRanges: Span[] = [];
    let ai = 0;
    while (ai < tokens.length) {
      if (tokens[ai].type !== TokenType.DelimOpen) {
        ai++;
        continue;
      }
      const as = tokens[ai].start;
      ai++;
      while (ai < tokens.length && tokens[ai].type !== TokenType.DelimClose)
        ai++;
      if (ai < tokens.length)
        actionRanges.push({ start: as, end: tokens[ai].end });
      ai++;
    }
    const insideAction = (pos: number) =>
      actionRanges.some((r) => pos >= r.start && pos < r.end);

    // ---- nesting backgrounds from TEXT ONLY ----
    const byLevel = new Map<number, Span[]>();
    for (const t of tokens) {
      if (t.type !== TokenType.Text) continue;
      if (t.nestingLevel === 0 || insideAction(t.start)) continue;
      const list = byLevel.get(t.nestingLevel) ?? [];
      const prev = list[list.length - 1];
      if (prev && t.start <= prev.end) {
        if (t.end > prev.end) prev.end = t.end;
      } else list.push({ start: t.start, end: t.end });
      byLevel.set(t.nestingLevel, list);
    }
    // Extend nesting ranges to cover intervening {{ }} blocks at the same level.
    for (const [level, ranges] of byLevel) {
      ranges.sort((a, b) => a.start - b.start);
      const merged: Span[] = [];
      for (const rr of ranges) {
        const prev = merged[merged.length - 1];
        if (prev) {
          let hasOnlyAction = true;
          for (const t of tokens) {
            if (
              t.type === TokenType.Text &&
              !insideAction(t.start) &&
              t.start >= prev.end &&
              t.start < rr.start
            ) {
              hasOnlyAction = false;
              break;
            }
          }
          if (hasOnlyAction) {
            prev.end = rr.end;
            continue;
          }
        }
        merged.push({ ...rr });
      }
      byLevel.set(level, merged);
    }

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
    // ---- semantic coloring: control-flow, comments, variables, functions ----
    const vd: vscode.Range[] = [],
      va: vscode.Range[] = [],
      vu: vscode.Range[] = [],
      f: vscode.Range[] = [],
      p: vscode.Range[] = [],
      c: vscode.Range[] = [];
    const ctrlByLevel = new Map<number, vscode.Range[]>();

    // Whole-block pass: comments and control-flow level chips.
    let j = 0;
    while (j < tokens.length) {
      if (tokens[j].type !== TokenType.DelimOpen) {
        j++;
        continue;
      }
      const bs = tokens[j].start;
      j++;
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
      if (j < tokens.length) {
        const be = tokens[j].end;
        const rr = rng(bs, be);
        if (hasComment) c.push(rr);
        else if (hasCtrl) {
          const list = ctrlByLevel.get(ctrlLevel) ?? [];
          list.push(rr);
          ctrlByLevel.set(ctrlLevel, list);
        }
      }
      j++;
    }

    // Token pass: variables, field access, function names, and pipes.
    for (const t of tokens) {
      switch (t.type) {
        case TokenType.VariableDef:
          vd.push(rng(t.start, t.end));
          break;
        case TokenType.VariableAssign:
          va.push(rng(t.start, t.end));
          break;
        case TokenType.VariableUse:
        case TokenType.Dot:
        case TokenType.Field:
          vu.push(rng(t.start, t.end));
          break;
        case TokenType.Function:
          f.push(rng(t.start, t.end));
          break;
        case TokenType.Pipe:
          p.push(rng(t.start, t.end));
          break;
        default:
          break;
      }
    }

    // ---- level decorations: text backgrounds + control-flow actions ----
    const byPaletteIndex = new Map<number, vscode.Range[]>();
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
    for (const [idx, ranges] of byPaletteIndex) {
      const d = this.levelDecorations.get(idx);
      if (d) editor.setDecorations(d, ranges);
    }

    editor.setDecorations(this.commentDeco, c);
    editor.setDecorations(this.varDefDeco, vd);
    editor.setDecorations(this.varAssignDeco, va);
    editor.setDecorations(this.varUseDeco, vu);
    editor.setDecorations(this.funcDeco, f);
    editor.setDecorations(this.pipeDeco, p);
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
    if (this.timeout) clearTimeout(this.timeout);
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
