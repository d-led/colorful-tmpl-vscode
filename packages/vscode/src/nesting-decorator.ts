import { basename } from "node:path";

import * as vscode from "vscode";

import type { Span } from "./go-strings.js";
import { decoratedDocumentLine, type PaintColors } from "./highlight-log.js";
import { readHighlightSwitches, resolvePalette } from "./palette.js";
import {
  computeDecorations,
  countDecorations,
  decorationsForDocument,
} from "./template-decorations.js";
import { templateScope } from "./template-host.js";

const CFG = "colorful-tmpl.palette";

function isLightTheme(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return (
    kind === vscode.ColorThemeKind.Light ||
    kind === vscode.ColorThemeKind.HighContrastLight
  );
}

/** The palette the current theme and settings resolve to. */
export function configuredPalette(cfg: vscode.WorkspaceConfiguration) {
  return resolvePalette({
    isLightTheme: isLightTheme(),
    preset: cfg.get<string>("preset", "default"),
    customLevels: cfg.get<string[]>("custom"),
    colorOverrides: {
      varDef: cfg.get<string>("variableDefColor"),
      varAssign: cfg.get<string>("variableAssignColor"),
      varUse: cfg.get<string>("variableUseColor"),
    },
  });
}

export class NestingDecorator {
  private readonly levelDecorations = new Map<
    number,
    vscode.TextEditorDecorationType
  >();
  private readonly disposables: vscode.Disposable[] = [];
  // Per-editor debounce timers keyed by document URI; avoids one timer clobbering another.
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  // Documents already reported to the log, so the report is one line per file.
  private readonly reported = new Set<string>();
  private paintColors!: PaintColors;
  private varDefDeco!: vscode.TextEditorDecorationType;
  private varAssignDeco!: vscode.TextEditorDecorationType;
  private varUseDeco!: vscode.TextEditorDecorationType;
  private funcDeco!: vscode.TextEditorDecorationType;
  private pipeDeco!: vscode.TextEditorDecorationType;
  private commentDeco!: vscode.TextEditorDecorationType;

  constructor(private readonly log?: (line: string) => void) {
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

    const palette = configuredPalette(vscode.workspace.getConfiguration(CFG));

    const mk = (bg: string) =>
      vscode.window.createTextEditorDecorationType({
        backgroundColor: bg,
        borderRadius: "2px",
        isWholeLine: false,
      });
    palette.levels.forEach((level, i) =>
      this.levelDecorations.set(i, mk(level)),
    );
    this.varDefDeco = mk(palette.colors.varDef);
    this.varAssignDeco = mk(palette.colors.varAssign);
    this.varUseDeco = mk(palette.colors.varUse);
    this.funcDeco = mk(palette.colors.func);
    this.pipeDeco = mk(palette.colors.pipe);
    this.commentDeco = mk(palette.colors.comment);
    this.paintColors = {
      definitions: palette.colors.varDef,
      uses: palette.colors.varUse,
      functions: palette.colors.func,
    };
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
    const { enabled, variableHighlight } = readHighlightSwitches(cfg);
    if (!enabled) {
      this.clearDecorations(editor);
      return;
    }

    const source = editor.document.getText();
    const scope = templateScope(editor.document.languageId, source);
    if (scope === "none") {
      this.clearDecorations(editor);
      return;
    }

    const paletteSize = this.levelDecorations.size;
    const decorations = decorationsForDocument(
      editor.document.languageId,
      source,
      paletteSize,
    );
    this.reportDecorated(editor, decorations, variableHighlight);

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

  /** Reports what this document got, once per file, for the log channel. */
  private reportDecorated(
    editor: vscode.TextEditor,
    decorations: ReturnType<typeof computeDecorations>,
    variableHighlight: boolean,
  ): void {
    const uri = editor.document.uri.toString();
    if (!this.log || this.reported.has(uri)) return;
    this.reported.add(uri);
    this.log(
      decoratedDocumentLine({
        fileName: basename(editor.document.uri.path),
        languageId: editor.document.languageId,
        variableHighlight,
        colors: this.paintColors,
        ...countDecorations(decorations),
      }),
    );
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
