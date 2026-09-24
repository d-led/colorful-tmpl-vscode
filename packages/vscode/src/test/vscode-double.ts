/**
 * Minimal `vscode` API double for unit tests of extension behaviour.
 *
 * Tests swap it in with `vi.mock("vscode", () => import("./test/vscode-double.js"))`.
 * It records what the extension paints instead of rendering it, so tests can
 * assert on the *decorations* an editor receives: which source text is covered
 * and with which background color.
 *
 * `Position` carries the character offset it was created from. Real VS Code
 * positions expose line/character instead, but offsets keep range assertions
 * readable and stay faithful to the offset-based tokenizer the extension uses.
 */

export const ColorThemeKind = {
  Light: 1,
  Dark: 2,
  HighContrast: 3,
  HighContrastLight: 4,
} as const;

export type ThemeKindName = keyof typeof ColorThemeKind;

export class Position {
  constructor(readonly offset: number) {}
}

export class Range {
  constructor(
    readonly start: Position,
    readonly end: Position,
  ) {}
}

export type DecorationType = {
  readonly color: string;
  dispose(): void;
};

export class TestDocument {
  readonly uri: { toString(): string; path: string };

  constructor(
    readonly text: string,
    readonly languageId: string,
    fileName = `document.${languageId}`,
  ) {
    this.uri = {
      toString: () => `test:${languageId}:${text.length}`,
      path: `/${fileName}`,
    };
  }

  getText(): string {
    return this.text;
  }

  positionAt(offset: number): Position {
    return new Position(offset);
  }
}

/** An editor that remembers the ranges painted for each decoration color. */
export class TestEditor {
  private readonly painted = new Map<string, Range[]>();

  constructor(readonly document: TestDocument) {}

  setDecorations(type: DecorationType, ranges: Range[]): void {
    this.painted.set(type.color, ranges);
  }

  /** Source text covered by the decoration with this background color. */
  textPaintedWith(color: string): string[] {
    return (this.painted.get(color) ?? []).map((r) =>
      this.document.text.slice(r.start.offset, r.end.offset),
    );
  }

  /** Colors the editor received, including ones that ended up with no ranges. */
  paintedColors(): string[] {
    return [...this.painted.keys()];
  }
}

type VscodeDoubleState = {
  settings: Record<string, unknown>;
  themeKind: number;
  visibleEditors: TestEditor[];
};

const state: VscodeDoubleState = {
  settings: {},
  themeKind: ColorThemeKind.Dark,
  visibleEditors: [],
};

/** Restores the double to a clean, dark-themed state. */
export function resetVscodeDouble(): void {
  state.settings = {};
  state.themeKind = ColorThemeKind.Dark;
  state.visibleEditors = [];
}

/** Sets a setting under its full name, e.g. `colorful-tmpl.palette.preset`. */
export function setSetting(name: string, value: unknown): void {
  state.settings[name] = value;
}

export function useColorTheme(kind: ThemeKindName): void {
  state.themeKind = ColorThemeKind[kind];
}

export function showEditors(...editors: TestEditor[]): void {
  state.visibleEditors = editors;
}

/** Creates an editor for a document of the given language. */
export function editorFor(
  text: string,
  languageId: string,
  fileName?: string,
): TestEditor {
  return new TestEditor(new TestDocument(text, languageId, fileName));
}

function configurationFor(section: string) {
  return {
    get: (key: string, fallback?: unknown) =>
      state.settings[`${section}.${key}`] ?? fallback,
    inspect: () => undefined,
    update: async () => undefined,
  };
}

const noopDisposable = { dispose: () => undefined };

export const window = {
  get activeColorTheme() {
    return { kind: state.themeKind };
  },
  get visibleTextEditors() {
    return state.visibleEditors;
  },
  createTextEditorDecorationType(options: {
    backgroundColor?: string;
  }): DecorationType {
    return {
      color: options.backgroundColor ?? "",
      dispose: () => undefined,
    };
  },
  onDidChangeActiveTextEditor: () => noopDisposable,
  onDidChangeVisibleTextEditors: () => noopDisposable,
  showQuickPick: async () => undefined,
};

export const workspace = {
  getConfiguration: (section: string) => configurationFor(section),
  onDidChangeTextDocument: () => noopDisposable,
  onDidOpenTextDocument: () => noopDisposable,
  onDidChangeConfiguration: () => noopDisposable,
};

export const languages = {
  registerDocumentSemanticTokensProvider: () => noopDisposable,
};

export const commands = {
  registerCommand: () => noopDisposable,
};

export class SemanticTokensLegend {
  constructor(
    readonly tokenTypes: string[],
    readonly tokenModifiers: string[],
  ) {}
}

export type PushedToken = {
  range: Range;
  type: string;
  modifiers: string[];
};

/** Collects pushed tokens so a test can read back the provider's answer. */
export class SemanticTokensBuilder {
  readonly pushed: PushedToken[] = [];

  constructor(readonly legend: SemanticTokensLegend) {}

  push(range: Range, type: string, modifiers: string[] = []): void {
    this.pushed.push({ range, type, modifiers });
  }

  build(): PushedToken[] {
    return this.pushed;
  }
}
