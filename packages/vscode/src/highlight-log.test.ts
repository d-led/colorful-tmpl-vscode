import { describe, expect, it } from "vitest";

import {
  activationLogLine,
  decoratedDocumentLine,
  highlightReport,
} from "./highlight-log.js";

/**
 * An extension update only takes effect after the window is reloaded, so the
 * usual cause of "I installed it and nothing changed" is a window still running
 * the previous build. The log lines have to name the build, the switches, and
 * what was painted, otherwise none of the three is checkable.
 */
describe("activationLogLine", () => {
  it("names the running build and its resolved switches", () => {
    const line = activationLogLine({
      version: "0.1.3",
      preset: "custom",
      enabled: true,
      variableHighlight: false,
    });

    expect(line).toBe(
      "[colorful-tmpl] v0.1.3 activated — palette=custom, " +
        "backgrounds=on, variableSpotting=off",
    );
  });

  it("stays a single log line", () => {
    const line = activationLogLine({
      version: "0.1.3",
      preset: "default",
      enabled: true,
      variableHighlight: true,
    });

    expect(line).not.toContain("\n");
    expect(line).toContain("variableSpotting=on");
  });
});

describe("decoratedDocumentLine", () => {
  const painted = {
    fileName: "screenshot.tmpl",
    languageId: "colorful-tmpl",
    variableHighlight: true,
    colors: {
      definitions: "rgba(46,160,67,0.32)",
      uses: "rgba(33,102,172,0.32)",
      functions: "rgba(124,77,255,0.28)",
    },
    definitions: 2,
    assignments: 0,
    uses: 19,
    functions: 6,
    bands: 18,
  };

  it("says what was painted, so an empty pass is visible", () => {
    const line = decoratedDocumentLine(painted);

    expect(line).toContain(
      "[colorful-tmpl] screenshot.tmpl (colorful-tmpl): 2 definitions, " +
        "0 assignments, 19 uses, 6 functions, 18 bands",
    );
  });

  it("names the switch and the colours the editor received", () => {
    const line = decoratedDocumentLine(painted);

    expect(line).toContain("variableSpotting=on");
    expect(line).toContain("def rgba(46,160,67,0.32)");
    expect(line).toContain("use rgba(33,102,172,0.32)");
    expect(line).toContain("func rgba(124,77,255,0.28)");
  });

  it("reports a document whose variables were skipped", () => {
    const line = decoratedDocumentLine({
      ...painted,
      variableHighlight: false,
    });

    expect(line).toContain("variableSpotting=off");
  });
});

describe("highlightReport", () => {
  it("puts the build, the switches, the colours, and the counts in one report", () => {
    const report = highlightReport({
      version: "0.1.3",
      preset: "default",
      enabled: true,
      variableHighlight: true,
      fileName: "screenshot.tmpl",
      languageId: "colorful-tmpl",
      colors: {
        definitions: "rgba(46,160,67,0.32)",
        uses: "rgba(33,102,172,0.32)",
        functions: "rgba(124,77,255,0.28)",
      },
      definitions: 2,
      assignments: 0,
      uses: 19,
      functions: 6,
      bands: 18,
    });

    expect(report.split("\n")).toEqual([
      "Colorful tmpl v0.1.3",
      "palette=default · backgrounds=on · variableSpotting=on",
      "screenshot.tmpl (colorful-tmpl): 2 definitions, 0 assignments, " +
        "19 uses, 6 functions, 18 bands",
      "colours: def rgba(46,160,67,0.32) use rgba(33,102,172,0.32) " +
        "func rgba(124,77,255,0.28)",
    ]);
  });
});
