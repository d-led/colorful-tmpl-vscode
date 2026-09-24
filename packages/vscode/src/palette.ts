/**
 * Color policy for the editor highlighting: nesting-level bands and the
 * single-use token colors.
 *
 * Kept free of the `vscode` API so the policy can be specified and tested on
 * its own; `NestingDecorator` only reads settings and turns the result into
 * VS Code decoration types.
 */

export type ThemeKind = "dark" | "light";

/** Palette presets the user can pick; `custom` takes its levels from settings. */
export type PalettePreset = "default" | "highContrast" | "custom";

export type PaletteName = "default" | "highContrast";

/**
 * Token colors that paint at most one thing at a given position, so they can
 * use strong colors without clashing with the nesting bands.
 */
export type SingleUseRole =
  "varDef" | "varAssign" | "varUse" | "func" | "pipe" | "comment";

export type Palette = {
  /** Nesting-level backgrounds, rotated by `level % levels.length`. */
  levels: string[];
  colors: Record<SingleUseRole, string>;
};

/** Nesting-level colors: one full rotation of 6 levels per palette. */
const LEVELS: Record<ThemeKind, Record<PaletteName, string[]>> = {
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

/**
 * Single-use token colors. Light-theme values carry enough alpha to stay
 * visible on white, where the pale nesting bands only need to tint.
 */
const SINGLE_USE: Record<
  ThemeKind,
  Record<PaletteName, Record<SingleUseRole, string>>
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
      varDef: "rgba(46,160,67,0.32)",
      varAssign: "rgba(230,126,34,0.36)",
      varUse: "rgba(33,102,172,0.32)",
      func: "rgba(124,77,255,0.28)",
      pipe: "rgba(0,131,143,0.30)",
      comment: "rgba(160,160,160,0.22)",
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

/**
 * Shipped default for `colorful-tmpl.palette.custom`, mirroring the default in
 * `package.json`: the setting is what reaches users, this is the fallback for
 * readers that do not see the declared default.
 */
export const DEFAULT_CUSTOM_LEVELS: string[] = [
  "rgba(173, 216, 230, 0.20)",
  "rgba(144, 238, 144, 0.20)",
  "rgba(255, 218, 185, 0.20)",
  "rgba(221, 160, 221, 0.20)",
  "rgba(255, 255, 150, 0.20)",
  "rgba(255, 182, 193, 0.20)",
];

/**
 * The two on/off switches. Both default to on: a build that quietly ships with
 * variable spotting off looks exactly like a build that is not running at all.
 */
export type HighlightSwitches = {
  enabled: boolean;
  variableHighlight: boolean;
  functionHighlight: boolean;
};

/** Shipped defaults for the switches, mirroring `default` in `package.json`. */
export const HIGHLIGHT_SWITCH_DEFAULTS: HighlightSwitches = {
  enabled: true,
  variableHighlight: true,
  functionHighlight: true,
};

/** The slice of `vscode.WorkspaceConfiguration` this policy reads. */
export type ConfigurationReader = {
  get<T>(section: string, defaultValue: T): T;
};

/** Reads the switches, falling back to the defaults shipped in `package.json`. */
export function readHighlightSwitches(
  cfg: ConfigurationReader,
): HighlightSwitches {
  return {
    enabled: cfg.get("enabled", HIGHLIGHT_SWITCH_DEFAULTS.enabled),
    variableHighlight: cfg.get(
      "variableHighlight",
      HIGHLIGHT_SWITCH_DEFAULTS.variableHighlight,
    ),
    functionHighlight: cfg.get(
      "functionHighlight",
      HIGHLIGHT_SWITCH_DEFAULTS.functionHighlight,
    ),
  };
}

export type PaletteSettings = {
  isLightTheme: boolean;
  preset: string;
  /** Nesting levels for the `custom` preset; defaults to the shipped ones. */
  customLevels?: string[];
  /** Per-role overrides; `undefined` keeps the palette's own color. */
  colorOverrides?: Partial<Record<SingleUseRole, string | undefined>>;
};

function paletteName(preset: string): PaletteName {
  return preset === "highContrast" ? "highContrast" : "default";
}

/**
 * A colour VS Code can paint. A blank value leaves the decoration type with
 * nothing to paint, which silently switches that class of highlighting off, so
 * it is treated as "not configured".
 */
export function usableColor(
  configured: string | undefined,
): string | undefined {
  const value = configured?.trim();
  return value ? value : undefined;
}

/**
 * Resolves the configured palette. `custom` only replaces the nesting levels;
 * the single-use colors keep following the theme, as documented.
 */
export function resolvePalette(settings: PaletteSettings): Palette {
  const theme: ThemeKind = settings.isLightTheme ? "light" : "dark";
  const name = paletteName(settings.preset);
  const colors = SINGLE_USE[theme][name];
  return {
    levels:
      settings.preset === "custom"
        ? (settings.customLevels ?? DEFAULT_CUSTOM_LEVELS)
        : LEVELS[theme][name],
    colors: {
      varDef: usableColor(settings.colorOverrides?.varDef) ?? colors.varDef,
      varAssign:
        usableColor(settings.colorOverrides?.varAssign) ?? colors.varAssign,
      varUse: usableColor(settings.colorOverrides?.varUse) ?? colors.varUse,
      func: colors.func,
      pipe: colors.pipe,
      comment: colors.comment,
    },
  };
}
