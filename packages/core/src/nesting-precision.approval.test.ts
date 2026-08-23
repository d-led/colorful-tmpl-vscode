import { describe, it } from "vitest";
import { renderColoredHtml } from "./render-html.js";
import type { Theme } from "./render-html.js";
import { verify } from "approvals";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Render one template in both dark and light themes and approve each. */
function verifyBoth(baseName: string, template: string) {
  for (const theme of ["dark", "light"] as Theme[]) {
    const html = renderColoredHtml(template, theme);
    verify(__dirname, `${baseName}-${theme}`, html);
  }
}

describe("renderColoredHtml: nested-construct precision", () => {
  it("nested if — three levels with text between", () => {
    verifyBoth(
      "nested-if",
      `{{ if .Level1 }}
Level1 {{ .Level1 }}
{{ if .Level2 }}
Level2 {{ .Level2 }}
{{ if .Level3 }}
Level3 {{ .Level3 }}
{{ end }}
{{ end }}
{{ end }}`,
    );
  });

  it("nested if — three levels packed on one line", () => {
    verifyBoth(
      "nested-if-packed",
      `{{ if .Level1 }}{{ if .Level2 }}{{ if .Level3 }}Level3{{ end }}{{ end }}{{ end }}`,
    );
  });

  it("range inside if inside range — packed, no text between", () => {
    verifyBoth(
      "packed-range-in-if",
      `{{ range .Level1 }}{{ if .Level2 }}{{ range .Level3 }}{{ .Level3 }}{{ end }}{{ end }}{{ end }}`,
    );
  });

  it("four levels packed — define > if > range > with", () => {
    verifyBoth(
      "four-level-packed",
      `{{ define "Tmpl" }}{{ if .Level1 }}{{ range .Level2 }}{{ with .Level3 }}Leaf{{ end }}{{ end }}{{ end }}{{ end }}`,
    );
  });

  it("else-if chain — if / else if / else", () => {
    verifyBoth(
      "else-if-chain",
      `{{ if .Case1 }}
Case1
{{ else if .Case2 }}
Case2
{{ else if .Case3 }}
Case3
{{ else }}
Other
{{ end }}`,
    );
  });

  it("trimmed nesting — range > if > range", () => {
    verifyBoth(
      "trimmed-nesting",
      `{{- range .Level1 }}
        Outer text {{ .Level1 }}
{{- if .Level2 }}
        Middle text {{ .Level2 }}
        {{- range .Level3 }}
        "{{ .Level3 }}"
        {{- end }}
{{- else }}
        Alt text
{{- end }}
{{- end }}
        Trailing text`,
    );
  });
});
