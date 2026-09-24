import type { HighlightSwitches } from "./palette.js";
import type { DecorationCounts } from "./template-decorations.js";

export type ActivationState = HighlightSwitches & {
  /** Version of the installed extension, as VS Code reports it. */
  version: string;
  /** Configured palette preset. */
  preset: string;
};

export type DecoratedDocument = DecorationCounts & {
  fileName: string;
  languageId: string;
  /** The switch that decides whether the variable ranges are handed over. */
  variableHighlight: boolean;
  /** The colours handed to the editor, so an unpaintable one is visible. */
  colors: PaintColors;
};

/** The single-use colours the decorator created its decoration types with. */
export type PaintColors = {
  definitions: string;
  uses: string;
  functions: string;
};

function onOff(value: boolean) {
  return value ? "on" : "off";
}

function counts(counted: DecorationCounts) {
  return (
    `${counted.definitions} definitions, ${counted.assignments} assignments, ` +
    `${counted.uses} uses, ${counted.functions} functions, ${counted.bands} bands`
  );
}

function colors(colours: PaintColors) {
  return `def ${colours.definitions} use ${colours.uses} func ${colours.functions}`;
}

/**
 * Names the build that is live and what it will paint.
 *
 * An extension update only takes effect after the window is reloaded, so the
 * common failure is a window that keeps running the previous build. Naming the
 * version and the resolved switches makes that visible instead of leaving
 * "nothing changed" to guesswork.
 */
export function activationLogLine(state: ActivationState): string {
  return (
    `[colorful-tmpl] v${state.version} activated — ` +
    `palette=${state.preset}, ` +
    `backgrounds=${onOff(state.enabled)}, ` +
    `variableSpotting=${onOff(state.variableHighlight)}`
  );
}

/**
 * What was painted for one document, logged the first time the decorator sees
 * it. With the activation line this separates "not running the new build" from
 * "running it but finding nothing to paint".
 */
export function decoratedDocumentLine(document: DecoratedDocument): string {
  return (
    `[colorful-tmpl] ${document.fileName} (${document.languageId}): ` +
    `${counts(document)} | variableSpotting=${onOff(document.variableHighlight)} | ` +
    colors(document.colors)
  );
}

/** The report behind the "Colorful tmpl: Diagnose Highlighting" command. */
export function highlightReport(
  state: ActivationState & DecoratedDocument,
): string {
  return [
    `Colorful tmpl v${state.version}`,
    `palette=${state.preset} · backgrounds=${onOff(state.enabled)} · ` +
      `variableSpotting=${onOff(state.variableHighlight)}`,
    `${state.fileName} (${state.languageId}): ${counts(state)}`,
    `colours: ${colors(state.colors)}`,
  ].join("\n");
}
