import { describe, it } from "vitest";
import { renderColoredHtml } from "./render-html.js";
import type { Theme } from "./render-html.js";
import { verify } from "approvals";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Run each template through both dark and light themes. */
function verifyBoth(baseName: string, template: string) {
  for (const theme of ["dark", "light"] as Theme[]) {
    const html = renderColoredHtml(template, theme);
    verify(__dirname, `${baseName}-${theme}`, html);
  }
}

describe("renderColoredHtml: nesting backgrounds", () => {
  it("no nesting — only {{ }} delimiters", () => {
    verifyBoth("no-nesting", 'Hello, {{ print "World" }}!');
  });

  it("single level — if/else/end with text between", () => {
    verifyBoth("single-level-if-else", `{{ if true }}
the truth
{{ else }}
not truth
{{ end }}`);
  });

  it("double nesting — range inside if", () => {
    verifyBoth("double-nesting", `{{ if .show }}
{{ range .items }}
  - {{ .name }}
{{ end }}
{{ end }}`);
  });

  it("triple nesting — with inside range inside if", () => {
    verifyBoth("triple-nesting", `{{ if .enabled }}
outer
{{ range .groups }}
  middle
  {{ with .item }}
    inner {{ .value }}
  {{ end }}
  {{ .name }}
{{ end }}
trailing
{{ end }}`);
  });

  it("text between actions gets colored at block level", () => {
    verifyBoth("text-in-else-block", `{{- if .inputMap }}
        pipe_in = { {{- range .inputMap }}"{{ .to }}": pipe_out.get("{{ .from }}"), {{- end}} }
{{- else }}
        pipe_in = pipe_out
{{- end }}`);
  });

  it("variables: definition, assignment, and use", () => {
    verifyBoth("variables", `{{ $w := "" }}
{{ if 1 }}
{{ $w = "world" }}
{{ else }}
{{ $w = "earth" }}
{{ end }}
Hello, {{ print $w }}!`);
  });

  it("adjacent actions with no text gap", () => {
    verifyBoth("adjacent-actions", "{{ a }}{{ b }}");
  });

  it("gomplate-style template with pipeline", () => {
    verifyBoth("gomplate-pipeline", `{{- range .items }}
  Task: {{ .name }}
  Status: {{ .status | upper }}
  Due: {{ .due | date "2006-01-02" }}
  {{ if .urgent }}⚠️ URGENT{{ end }}
  {{ .notes | default "—" }}
{{- end }}`);
  });

  it("four-level nesting — define > if > range > with", () => {
    verifyBoth("four-level-nesting", `{{ define "T1" }}
L1 top
{{ if .show }}
  L2 {{ $x := 1 }}
  {{ range .items }}
    L3 {{ .name }}
    {{ with .sub }}
      L4 {{ .deep }} {{ print $x }}
    {{ end }}
    L3 after with {{ .name }}
  {{ end }}
  L2 after range
{{ end }}
L1 bottom
{{ end }}`);
  });

  it("functions with pipes and dotted names", () => {
    verifyBoth("functions-and-pipes", `{{ coll.Slice "a" "b" | sort | join ", " }}
{{ index .map "key" }}
{{ print (len .items) }}
{{ and .a .b .c | not }}
{{ eq $x 42 | or (ne $y "") }}`);
  });

  it("whitespace trimming variants", () => {
    verifyBoth("whitespace-trimming", `{{- range .items -}}
  {{- .name }}
{{- end -}}
{{ if true -}}
  yes
{{- else }}
  no
{{ end }}`);
  });

  it("comments inside actions", () => {
    verifyBoth("comments", `{{/* this is a comment */}}
{{ if true }}{{/* another comment */}}hello{{ end }}
{{ range .items }}{{/* TODO: handle nil */}}{{ . }}{{ end }}`);
  });

  it("range with index, element variable", () => {
    verifyBoth("range-with-index-var", `{{ range $index, $element := .items }}
  #{{ $index }}: {{ $element.name }} ({{ $element.count }})
{{ end }}`);
  });

  it("indexing arrays and maps", () => {
    verifyBoth("indexing", `{{ index .array 0 }}
{{ index .map "foo-bar" }}
{{ index .nested "a" (print "b") "c" }}
{{ .map.foo }}
{{ $.rootKey }}`);
  });

  it("rich text between actions", () => {
    verifyBoth("rich-text-between", `# {{ .title }}

{{ .intro }}

## Features
{{ range .features }}
- **{{ .name }}**: {{ .description }}
  {{ if .experimental }}⚠️ {{ .note }}{{ end }}
{{ end }}

## Config
{{ with .config }}
host={{ .host }}  port={{ .port }}
{{ end }}`);
  });

  it("SQL with nested filters", () => {
    verifyBoth("sql-template", `SELECT
  {{ range $i, $c := .cols }}{{ if $i }}, {{ end }}"{{ $c }}"{{ end }}
FROM {{ .table }}
WHERE 1=1
{{ range .filters }}
  AND "{{ .col }}" {{ .op }} {{ if eq .op "IN" }}(
    {{ range $j, $v := .vals }}{{ if $j }}, {{ end }}{{ $v }}{{ end }}
  ){{ else }}{{ .val }}{{ end }}
{{ end }}
LIMIT {{ .limit }}`);
  });

  it("HTML with mixed nesting", () => {
    verifyBoth("html-template", `<html>
<body>
  {{ block "header" . }}<h1>{{ .site }}</h1>{{ end }}
  {{ if .posts }}
  <ul>
  {{ range .posts }}
    <li><h2>{{ .title }}</h2>
    {{ if .tags }}<span>{{ range .tags }}#{{ . }} {{ end }}</span>{{ end }}
    </li>
  {{ end }}
  </ul>
  {{ else }}<p>None.</p>{{ end }}
</body>
</html>`);
  });
});
