#!/usr/bin/env node
// Keep intra-monorepo dependency pins in lockstep with the current
// colorful-tmpl version (read from packages/core/package.json).
//
// Rewrites `@colorful-tmpl/*` dependency entries across all workspace
// packages to the canonical version.
//
// Idempotent. No-op when everything is already aligned.
//
// Usage:
//   bash scripts/sync-workspace-deps.sh
//   bash scripts/sync-workspace-deps.sh --check
//   (or: node scripts/sync-workspace-deps.mjs [--check])

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE);

const WORKSPACE_NAMES = new Set([
  "@colorful-tmpl/highlight-core",
]);

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, obj) {
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

const checkOnly = process.argv.includes("--check");
const corePj = join(REPO_ROOT, "packages", "core", "package.json");
const targetVersion = readJson(corePj).version;

// Walk workspace packages + monorepo root
const files = [join(REPO_ROOT, "package.json")];
const pkgDir = join(REPO_ROOT, "packages");
for (const ent of readdirSync(pkgDir, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue;
  const pj = join(pkgDir, ent.name, "package.json");
  if (existsSync(pj)) files.push(pj);
}

function rewritePackage(file) {
  const json = readJson(file);
  let changed = false;
  for (const field of DEP_FIELDS) {
    const deps = json[field];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (!WORKSPACE_NAMES.has(name)) continue;
      if (deps[name] !== targetVersion) {
        changed = true;
        if (checkOnly) return true;
        deps[name] = targetVersion;
      }
    }
  }
  if (!checkOnly && changed) writeJson(file, json);
  return changed;
}

let anyChange = false;
for (const f of files) {
  if (rewritePackage(f)) anyChange = true;
}

if (checkOnly) {
  if (anyChange) {
    process.stderr.write("sync-workspace-deps: workspace pins are out of date. Run bash scripts/sync-workspace-deps.sh to fix.\n");
    process.exit(1);
  }
} else {
  if (anyChange) {
    process.stdout.write(`Synced @colorful-tmpl/* pins to ${targetVersion}.\n`);
  }
}
