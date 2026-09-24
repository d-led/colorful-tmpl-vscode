import { describe, expect, it } from "vitest";

import {
  DEFAULT_CUSTOM_LEVELS,
  readHighlightSwitches,
  resolvePalette,
  type ConfigurationReader,
  type Palette,
  type SingleUseRole,
} from "./palette.js";

const VARIABLE_ROLES: SingleUseRole[] = ["varDef", "varAssign", "varUse"];

function lightDefault(): Palette {
  return resolvePalette({ isLightTheme: true, preset: "default" });
}

function darkDefault(): Palette {
  return resolvePalette({ isLightTheme: false, preset: "default" });
}

function alphaOf(color: string): number {
  const match = /rgba\([^)]*,\s*([0-9.]+)\s*\)/.exec(color);
  if (!match) throw new Error(`not an rgba color: ${color}`);
  return Number(match[1]);
}

describe("resolvePalette", () => {
  it("takes nesting levels from the custom preset", () => {
    const palette = resolvePalette({
      isLightTheme: true,
      preset: "custom",
      customLevels: ["#111111", "#222222"],
    });

    expect(palette.levels).toEqual(["#111111", "#222222"]);
  });

  it("falls back to the shipped custom levels when none are configured", () => {
    const palette = resolvePalette({ isLightTheme: true, preset: "custom" });

    expect(palette.levels).toEqual(DEFAULT_CUSTOM_LEVELS);
  });

  it("lets configured variable colors win over the theme's", () => {
    const palette = resolvePalette({
      isLightTheme: true,
      preset: "default",
      colorOverrides: { varDef: "#123456" },
    });

    expect(palette.colors.varDef).toBe("#123456");
    expect(palette.colors.varUse).toBe(lightDefault().colors.varUse);
  });

  it("ignores a blank colour override instead of painting nothing", () => {
    const palette = resolvePalette({
      isLightTheme: true,
      preset: "default",
      colorOverrides: { varDef: "   " },
    });

    expect(palette.colors.varDef).toBe(lightDefault().colors.varDef);
  });

  it("keeps light and dark palettes distinct", () => {
    expect(lightDefault().colors.varUse).not.toBe(darkDefault().colors.varUse);
  });

  it("never paints variable spotting fainter than the palest nesting band", () => {
    for (const palette of [lightDefault(), darkDefault()]) {
      const faintestBand = Math.min(...palette.levels.map(alphaOf));
      for (const role of VARIABLE_ROLES) {
        expect(
          alphaOf(palette.colors[role]),
          `${role} in ${palette.colors[role]}`,
        ).toBeGreaterThanOrEqual(faintestBand);
      }
    }
  });
});

describe("readHighlightSwitches", () => {
  function settings(configured: Record<string, boolean>): ConfigurationReader {
    return {
      get: <T>(key: string, fallback: T): T =>
        (configured[key] ?? fallback) as T,
    };
  }

  it("highlights everything when the user configured nothing", () => {
    expect(readHighlightSwitches(settings({}))).toEqual({
      enabled: true,
      variableHighlight: true,
      functionHighlight: true,
    });
  });

  it("honours the switches the user turned off", () => {
    expect(
      readHighlightSwitches(
        settings({ enabled: false, variableHighlight: false }),
      ),
    ).toEqual({
      enabled: false,
      variableHighlight: false,
      functionHighlight: true,
    });

    expect(
      readHighlightSwitches(settings({ functionHighlight: false })),
    ).toEqual({
      enabled: true,
      variableHighlight: true,
      functionHighlight: false,
    });
  });
});
