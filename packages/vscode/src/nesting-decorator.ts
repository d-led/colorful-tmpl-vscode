import { tokenize } from "@colorful-tmpl/highlight-core";
import * as vscode from "vscode";

import type { Span } from "./go-strings.js";
import {
  computeDecorations,
  computeGoDecorations,
} from "./template-decorations.js";
import { templateScope } from "./template-host.js";

const CFG = "colorful-tmpl.palette";

type ThemeKind = "dark" | "light";
type PaletteName = "default" | "highContrast";

// Palette nesting-level colors. Each entry is one full rotation of 6 levels.
const PALETTES: Record<ThemeKind, Record<PaletteName, string[]>> = {
  dark: {
    default: [
      "rgba(178,218,232,0.18)",
      "rgba(160,235,178,0.18)",
      "rgba(255,222,192,0.20)",
      "rgba(236,190,238,0.18)",
      "rgba(255,252,180,0.18)",
      "rgba(255,198,208,0.18)",
    ],
    highContrast: [
      "rgba(89,183,255,0.50)",
      "rgba(120,255,176,0.50)",
      "rgba(255,186,92,0.50)",
      "rgba(255,142,255,0.50)",
      "rgba(255,245,108,0.50)",
      "rgba(255,123,143,0.50)",
    ],
  },
  light: {
    default: [
      "rgba(173,216,230,0.30)",
      "rgba(144,238,144,0.30)",
      "rgba(255,218,185,0.35)",
      "rgba(221,160,221,0.30)",
      "rgba(255,255,150,0.30)",
      "rgba(255,182,193,0.30)",
    ],
    highContrast: [
      "rgba(0,102,204,0.40)",
      "rgba(0,143,57,0.40)",
      "rgba(204,102,0,0.40)",
      "rgba(153,51,204,0.40)",
      "rgba(204,170,0,0.40)",
      "rgba(204,0,68,0.40)",
    ],
  },
};

type SingleUseColorKey =
  "varDef" | "varAssign" | "varUse" | "func" | "pipe" | "comment";

// Single-use semantic colors (variables, functions, pipes, comments).
const SINGLE_USE_COLORS: Record<
  ThemeKind,
  Record<PaletteName, Record<SingleUseColorKey, string>>
> = {
  dark: {
    default: {
      varDef: "rgba(150,238,178,0.30)",
      varAssign: "rgba(255,208,134,0.30)",
      varUse: "rgba(156,196,255,0.30)",
      func: "rgba(216,188,252,0.30)",
      pipe: "rgba(146,228,236,0.30)",
      comment: "rgba(182,184,196,0.16)",
    },
    highContrast: {
      varDef: "rgba(120,255,176,0.55)",
      varAssign: "rgba(255,186,92,0.55)",
      varUse: "rgba(89,183,255,0.55)",
      func: "rgba(224,172,255,0.55)",
      pipe: "rgba(111,229,240,0.55)",
      comment: "rgba(210,212,222,0.35)",
    },
  },
  light: {
    default: {
      varDef: "rgba(46,160,67,0.22)",
      varAssign: "rgba(230,126,34,0.28)",
      varUse: "rgba(33,102,172,0.22)",
      func: "rgba(124,77,255,0.20)",
      pipe: "rgba(0,131,143,0.24)",
      comment: "rgba(160,160,160,0.18)",
    },
    highContrast: {
      varDef: "rgba(0,143,57,0.40)",
      varAssign: "rgba(204,102,0,0.40)",
      varUse: "rgba(0,86,179,0.40)",
      func: "rgba(102,51,153,0.40)",
      pipe: "rgba(0,115,125,0.40)",
      comment: "rgba(130,130,130,0.30)",
    },
  },
};

function isLightTheme(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return (
    kind === vscode.ColorThemeKind.Light ||
    kind === vscode.ColorThemeKind.HighContrastLight
  );
}

function themeKind(): ThemeKind {
  return isLightTheme() ? "light" : "dark";
}

// Resolves the configured palette name, collapsing "custom" to "default" for
// settings that only offer default/highContrast variants.
function resolvedPaletteName(cfg: vscode.WorkspaceConfiguration): PaletteName {
  return cfg.get<string>("preset", "default") === "highContrast"
    ? "highContrast"
    : "default";
}

function resolveLevelColors(cfg: vscode.WorkspaceConfiguration): string[] {
  if (cfg.get<string>("preset", "default") === "custom") {
    return cfg.get<string[]>("custom", PALETTES[themeKind()].default);
  }
  return PALETTES[themeKind()][resolvedPaletteName(cfg)];
}

function resolveSingleUseColors(cfg: vscode.WorkspaceConfiguration) {
  return SINGLE_USE_COLORS[themeKind()][resolvedPaletteName(cfg)];
}

export class NestingDecorator {
  private readonly levelDecorations = new Map<
    number,
    vscode.TextEditorDecorationType
  >();
  private readonly disposables: vscode.Disposable[] = [];
  // Per-editor debounce timers keyed by document URI; avoids one timer clobbering another.
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private varDefDeco!: vscode.TextEditorDecorationType;
  private varAssignDeco!: vscode.TextEditorDecorationType;
  private varUseDeco!: vscode.TextEditorDecorationType;
  private funcDeco!: vscode.TextEditorDecorationType;
  private pipeDeco!: vscode.TextEditorDecorationType;
  private commentDeco!: vscode.TextEditorDecorationType;

  constructor() {
    this.rebuildDecorations();
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

    const cfg = vscode.workspace.getConfiguration(CFG);
    const palette = resolveLevelColors(cfg);
    const builtIn = resolveSingleUseColors(cfg);
    const colors = {
      varDef: cfg.get<string>("variableDefColor", builtIn.varDef),
      varAssign: cfg.get<string>("variableAssignColor", builtIn.varAssign),
      varUse: cfg.get<string>("variableUseColor", builtIn.varUse),
      func: builtIn.func,
      pipe: builtIn.pipe,
      comment: builtIn.comment,
    };

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
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        for (const ed of vscode.window.visibleTextEditors) {
          if (ed.document === e.document) this.scheduleUpdate(ed);
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((ed) => {
        if (ed) this.updateDecorations(ed);
      }),
      // onDidOpenTextDocument fires when a document is opened or its language changes.
      // VS Code updates ed.document before firing, so URI comparison is sufficient.
      vscode.workspace.onDidOpenTextDocument((doc) => {
        const uri = doc.uri.toString();
        for (const ed of vscode.window.visibleTextEditors) {
          if (ed.document.uri.toString() !== uri) continue;
          this.updateDecorations(ed);
        }
      }),
      // Debounce resize/zoom: onDidChangeVisibleTextEditors fires continuously during those.
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        for (const ed of editors) {
          this.scheduleUpdate(ed);
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CFG)) {
          this.rebuildDecorations();
          for (const ed of vscode.window.visibleTextEditors) {
            this.updateDecorations(ed);
          }
        }
      }),
    );
    // onStartupFinished guarantees activate() runs after VS Code is fully initialized;
    // onDidChangeVisibleTextEditors handles editors that become visible after activate().
    for (const ed of vscode.window.visibleTextEditors) {
      this.updateDecorations(ed);
    }
  }

  private scheduleUpdate(editor: vscode.TextEditor): void {
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
    const cfg = vscode.workspace.getConfiguration(CFG);
    if (!cfg.get<boolean>("enabled", true)) {
      this.clearDecorations(editor);
      return;
    }
    const variableHighlight = cfg.get<boolean>("variableHighlight", true);

    const source = editor.document.getText();
    const scope = templateScope(editor.document.languageId, source);
    if (scope === "none") {
      this.clearDecorations(editor);
      return;
    }

    const paletteSize = this.levelDecorations.size;
    const decorations =
      scope === "strings-only"
        ? computeGoDecorations(source, paletteSize)
        : computeDecorations(tokenize(source), source.length, paletteSize);

    const toRange = (span: Span) =>
      new vscode.Range(
        editor.document.positionAt(span.start),
        editor.document.positionAt(span.end),
      );

    for (const [idx, spans] of decorations.byPaletteIndex) {
      const decoration = this.levelDecorations.get(idx);
      if (decoration) editor.setDecorations(decoration, spans.map(toRange));
    }

    editor.setDecorations(this.commentDeco, decorations.comment.map(toRange));
    editor.setDecorations(
      this.varDefDeco,
      variableHighlight ? decorations.varDef.map(toRange) : [],
    );
    editor.setDecorations(
      this.varAssignDeco,
      variableHighlight ? decorations.varAssign.map(toRange) : [],
    );
    editor.setDecorations(
      this.varUseDeco,
      variableHighlight ? decorations.varUse.map(toRange) : [],
    );
    editor.setDecorations(this.funcDeco, decorations.func.map(toRange));
    editor.setDecorations(this.pipeDeco, decorations.pipe.map(toRange));
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
