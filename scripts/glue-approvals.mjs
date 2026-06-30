#!/usr/bin/env node
// Glue all approval .txt files into a single .html for visual inspection in a browser.
//
//   node scripts/glue-approvals.mjs approved   → approved.html
//   node scripts/glue-approvals.mjs received   → received.html
//   node scripts/glue-approvals.mjs all         → both

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE);
const SRC = join(REPO_ROOT, "packages", "core", "src");

const TITLE = { approved: "Approved Snapshots", received: "Received Snapshots" };

const TOP = (title, bg) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { background: ${bg}; color: ${bg === "#ffffff" ? "#1e1e2e" : "#cdd6f4"}; font: 14px/1.5 system-ui, sans-serif; margin: 24px; }
  h2 { color: ${bg === "#ffffff" ? "#8839ef" : "#f5c2e7"}; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid ${bg === "#ffffff" ? "#dce0e8" : "#45475a"}; }
  h3 { color: ${bg === "#ffffff" ? "#179299" : "#94e2d5"}; margin: 16px 0 4px; font-size: 13px; }
  hr { border: 0; height: 0; }
</style>
</head>
<body>
<h1>${title}</h1>
`;

const BOTTOM = `</body>\n</html>\n`;

function glue(mode) {
  const suffix = mode === "approved" ? ".approved.txt" : ".received.txt";
  const files = readdirSync(SRC)
    .filter((f) => f.endsWith(suffix))
    .sort();
  if (files.length === 0) {
    console.error(`No ${mode} files found in ${SRC}`);
    return "";
  }

  // Group by base name (strip -dark/-light suffix before .approved.txt)
  const groups = new Map();
  for (const f of files) {
    const raw = basename(f, suffix); // e.g. "no-nesting-dark" or "no-nesting-light"
    const theme = raw.endsWith("-dark") ? "dark" : raw.endsWith("-light") ? "light" : "dark";
    const base = raw.replace(/-(dark|light)$/, "");
    if (!groups.has(base)) groups.set(base, {});
    groups.get(base)[theme] = f;
  }

  // Generate a pair of pages: dark-bg page with all dark snapshots, light-bg page with all light
  const darkParts = [];
  const lightParts = [];
  for (const [base, pair] of groups) {
    if (pair.dark) {
      const content = readFileSync(join(SRC, pair.dark), "utf8");
      darkParts.push(`<h2>${esc(base)}</h2>\n${content}\n<hr>\n`);
    }
    if (pair.light) {
      const content = readFileSync(join(SRC, pair.light), "utf8");
      lightParts.push(`<h2>${esc(base)}</h2>\n${content}\n<hr>\n`);
    }
  }

  const outFiles = [];
  const write = (theme, parts) => {
    const bg = theme === "dark" ? "#1e1e2e" : "#ffffff";
    const html = TOP(TITLE[mode], bg) + parts.join("") + BOTTOM;
    const out = join(SRC, `${mode}-${theme}.html`);
    writeFileSync(out, html, "utf8");
    outFiles.push(out);
    const n = new Set(parts.map(() => 0)).size || groups.size; // count unique cases
    console.log(`Wrote ${out} (${(html.length / 1024).toFixed(1)} KB, ${groups.size} cases${parts.length === 0 ? ", empty" : ""})`);
  };
  write("dark", darkParts);
  write("light", lightParts);
  return outFiles;
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const mode = process.argv[2] || "all";

for (const m of ["approved", "received"]) {
  if (mode !== "all" && mode !== m) continue;
  const outFiles = glue(m);
  if (mode === "all" && outFiles.length > 0 && m === "approved") {
    console.log(`\nOpen: open ${outFiles[0]}`);
  }
}
