#!/usr/bin/env node
// Set the top-level "version" field on every packages/*/package.json to the
// given semver. Skips packages with no version field. Idempotent when already
// aligned.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE);

const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$/;

function usage() {
  process.stderr.write("usage: node scripts/set-workspace-versions.mjs x.y.z[-rc.N]\n");
}

const target = process.argv[2];
if (!target || !SEMVER.test(target)) {
  usage();
  process.exit(2);
}

const packagesDir = join(REPO_ROOT, "packages");
const updated = [];

for (const ent of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue;
  const pjPath = join(packagesDir, ent.name, "package.json");
  if (!existsSync(pjPath)) continue;
  const raw = readFileSync(pjPath, "utf8");
  const json = JSON.parse(raw);
  if (typeof json.version !== "string") continue;
  if (json.version === target) continue;
  json.version = target;
  writeFileSync(pjPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  updated.push(`packages/${ent.name}/package.json`);
}

if (updated.length > 0) {
  process.stdout.write(`Set workspace version to ${target} in:\n`);
  for (const p of updated) process.stdout.write(`  ${p}\n`);
}
