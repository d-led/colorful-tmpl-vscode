import { tokenize, TokenType } from "@colorful-tmpl/highlight-core";
import * as vscode from "vscode";

const LANG = "colorful-tmpl";
const CFG = "colorful-tmpl.rainbow";

type Span = { start: number; end: number };

const PALETTES = {
  dark:  ["rgba(173,216,230,0.14)","rgba(144,238,144,0.14)","rgba(255,218,185,0.16)","rgba(221,160,221,0.14)","rgba(255,255,150,0.14)","rgba(255,182,193,0.14)"],
  light: ["rgba(173,216,230,0.30)","rgba(144,238,144,0.30)","rgba(255,218,185,0.35)","rgba(221,160,221,0.30)","rgba(255,255,150,0.30)","rgba(255,182,193,0.30)"],
};

function isLightTheme(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
}

function subtractRanges(parents: Span[], children: Span[]): Span[] {
  let result = [...parents];
  for (const child of children) {
    const next: Span[] = [];
    for (const p of result) {
      if (child.end <= p.start || child.start >= p.end) next.push(p);
      else {
        if (p.start < child.start) next.push({ start: p.start, end: child.start });
        if (child.end < p.end) next.push({ start: child.end, end: p.end });
      }
    }
    result = next;
  }
  return result;
}

export class NestingDecorator {
  private levelDecorations = new Map<number, vscode.TextEditorDecorationType>();
  private ctrlFlowDeco!: vscode.TextEditorDecorationType;
  private varWriteDeco!: vscode.TextEditorDecorationType;
  private varReadDeco!: vscode.TextEditorDecorationType;
  private funcDeco!: vscode.TextEditorDecorationType;
  private commentDeco!: vscode.TextEditorDecorationType;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor() { this.rebuildDecorations(); }

  private rebuildDecorations(): void {
    for (const d of this.levelDecorations.values()) d.dispose();
    this.ctrlFlowDeco?.dispose(); this.varWriteDeco?.dispose(); this.varReadDeco?.dispose();
    this.funcDeco?.dispose(); this.commentDeco?.dispose();
    this.levelDecorations.clear();

    const light = isLightTheme();
    const palette: string[] = vscode.workspace.getConfiguration(CFG).get("palette", light ? PALETTES.light : PALETTES.dark);
    const ctrlFlow = light ? "rgba(135,206,250,0.45)" : "rgba(135,206,250,0.28)";
    const varWrite = light ? "rgba(190,160,50,0.32)"  : "rgba(204,170,50,0.38)";
    const varRead  = light ? "rgba(190,160,50,0.22)"  : "rgba(204,170,50,0.28)";
    const func     = light ? "rgba(255,150,50,0.28)"  : "rgba(255,165,70,0.32)";
    const comment  = light ? "rgba(160,160,160,0.18)" : "rgba(140,140,140,0.20)";

    const mk = (bg: string) => vscode.window.createTextEditorDecorationType({ backgroundColor: bg, borderRadius: "2px", isWholeLine: false });
    for (let i = 0; i < palette.length; i++) this.levelDecorations.set(i, mk(palette[i]));
    this.ctrlFlowDeco = mk(ctrlFlow);
    this.varWriteDeco = mk(varWrite);
    this.varReadDeco  = mk(varRead);
    this.funcDeco     = mk(func);
    this.commentDeco  = mk(comment);
  }

  activate(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => { if (e.document.languageId === LANG) this.scheduleUpdate(vscode.window.activeTextEditor); }),
      vscode.window.onDidChangeActiveTextEditor(ed => { if (ed?.document.languageId === LANG) this.updateDecorations(ed); }),
      vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration(CFG)) { this.rebuildDecorations(); const ed = vscode.window.activeTextEditor; if (ed?.document.languageId === LANG) this.updateDecorations(ed); } }),
    );
    const ed = vscode.window.activeTextEditor;
    if (ed?.document.languageId === LANG) this.updateDecorations(ed);
  }

  private scheduleUpdate(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== LANG) return;
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => { this.timeout = undefined; this.updateDecorations(editor); }, 150);
  }

  private updateDecorations(editor: vscode.TextEditor): void {
    if (!vscode.workspace.getConfiguration(CFG).get<boolean>("enabled", true)) { this.clearDecorations(editor); return; }

    const source = editor.document.getText();
    const tokens = tokenize(source);
    const paletteSize = this.levelDecorations.size;
    const rng = (s: number, e: number) => new vscode.Range(editor.document.positionAt(s), editor.document.positionAt(e));

    // ---- Step 0: find {{ }} ranges to exclude interior text ----
    const actionRanges: Span[] = [];
    let ai = 0;
    while (ai < tokens.length) {
      if (tokens[ai].type !== TokenType.DelimOpen) { ai++; continue; }
      const as = tokens[ai].start; ai++;
      while (ai < tokens.length && tokens[ai].type !== TokenType.DelimClose) ai++;
      if (ai < tokens.length) actionRanges.push({ start: as, end: tokens[ai].end });
      ai++;
    }
    const insideAction = (pos: number) => actionRanges.some(r => pos >= r.start && pos < r.end);

    // ---- nesting backgrounds from TEXT ONLY ----
    const byLevel = new Map<number, Span[]>();
    for (const t of tokens) {
      if (t.type !== TokenType.Text) continue;
      if (t.nestingLevel === 0 || insideAction(t.start)) continue;
      const list = byLevel.get(t.nestingLevel) ?? [];
      const prev = list[list.length - 1];
      if (prev && t.start <= prev.end) { if (t.end > prev.end) prev.end = t.end; }
      else list.push({ start: t.start, end: t.end });
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
            if (t.type === TokenType.Text && !insideAction(t.start) && t.start >= prev.end && t.start < rr.start) {
              hasOnlyAction = false; break;
            }
          }
          if (hasOnlyAction) { prev.end = rr.end; continue; }
        }
        merged.push({ ...rr });
      }
      byLevel.set(level, merged);
    }

    const sortedLevels = [...byLevel.keys()].sort((a, b) => b - a);
    const painted = new Map<number, Span[]>();
    for (const level of sortedLevels) {
      let ranges = byLevel.get(level) ?? [];
      for (const [cl, cr] of painted) { if (cl <= level) continue; ranges = subtractRanges(ranges, cr); }
      if (ranges.length > 0) painted.set(level, ranges);
    }
    for (const [level, ranges] of painted) {
      const d = this.levelDecorations.get(level % paletteSize);
      if (d) editor.setDecorations(d, ranges.map(r => rng(r.start, r.end)));
    }

    // ---- block-level semantic coloring ----
    const ctrl: vscode.Range[] = [], w: vscode.Range[] = [], r: vscode.Range[] = [], f: vscode.Range[] = [], c: vscode.Range[] = [];
    let j = 0;
    while (j < tokens.length) {
      if (tokens[j].type !== TokenType.DelimOpen) { j++; continue; }
      const bs = tokens[j].start; j++;
      let hasCtrl = false, hasVW = false, hasVR = false, hasF = false, hasC = false, hasDot = false;
      while (j < tokens.length && tokens[j].type !== TokenType.DelimClose) {
        const tt = tokens[j].type;
        if (tt === TokenType.Keyword) hasCtrl = true;
        else if (tt === TokenType.VariableDef || tt === TokenType.VariableAssign) hasVW = true;
        else if (tt === TokenType.VariableUse) hasVR = true;
        else if (tt === TokenType.Function) hasF = true;
        else if (tt === TokenType.Comment) hasC = true;
        else if (tt === TokenType.Dot) hasDot = true;
        j++;
      }
      if (j < tokens.length) {
        const be = tokens[j].end;
        const rr = rng(bs, be);
        const isVR = hasVR || hasDot;
        if (hasC) c.push(rr); else if (hasCtrl) ctrl.push(rr); else if (hasVW) w.push(rr);
        else if (isVR) r.push(rr); else if (hasF) f.push(rr);
      }
      j++;
    }
    editor.setDecorations(this.ctrlFlowDeco, ctrl);
    editor.setDecorations(this.varWriteDeco, w);
    editor.setDecorations(this.varReadDeco, r);
    editor.setDecorations(this.funcDeco, f);
    editor.setDecorations(this.commentDeco, c);
  }

  private clearDecorations(editor: vscode.TextEditor): void {
    for (const d of this.levelDecorations.values()) editor.setDecorations(d, []);
    editor.setDecorations(this.ctrlFlowDeco, []);
    editor.setDecorations(this.varWriteDeco, []);
    editor.setDecorations(this.varReadDeco, []);
    editor.setDecorations(this.funcDeco, []);
    editor.setDecorations(this.commentDeco, []);
  }

  dispose(): void {
    if (this.timeout) clearTimeout(this.timeout);
    for (const d of this.disposables) d.dispose();
    for (const d of this.levelDecorations.values()) d.dispose();
    this.ctrlFlowDeco?.dispose(); this.varWriteDeco?.dispose(); this.varReadDeco?.dispose();
    this.funcDeco?.dispose(); this.commentDeco?.dispose();
  }
}
