#!/usr/bin/env node
/**
 * Checks that the build VS Code has installed is the build we just produced.
 *
 * Installing an extension whose version is not *newer* than the installed one is
 * a no-op for the VS Code CLI unless `--force` is passed: it prints a notice
 * ("A newer version … is already installed") and exits, so the editor keeps
 * running the previous build while the command looks like it worked. Reading
 * back the installed bundle turns that silent no-op into a failing check.
 *
 * Used by `scripts/install-here.sh` and specified by
 * `packages/vscode/src/installed-extension.test.ts`.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { argv } from "node:process";
import { pathToFileURL } from "node:url";

/** Where VS Code keeps a given id and version of an extension. */
export function installedExtensionDir(extensionsDir, extensionId, version) {
  return join(extensionsDir, `${extensionId}-${version}`);
}

/** Short digest of a file's bytes, for readable before/after comparisons. */
export function fileDigest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 12);
}

/**
 * @param {object} input
 * @param {string} input.extensionsDir  e.g. `~/.vscode/extensions`
 * @param {string} input.extensionId    e.g. `d-led.colorful-tmpl`
 * @param {string} input.version        version of the build that was packaged
 * @param {string} input.builtBundle    path to the `dist/extension.js` we built
 * @returns {{ok: boolean, installedDir: string, reason?: string, built?: string, installed?: string}}
 */
export function verifyInstalledExtension({
  extensionsDir,
  extensionId,
  version,
  builtBundle,
}) {
  const installedDir = installedExtensionDir(extensionsDir, extensionId, version);
  const installedBundle = join(installedDir, "dist", "extension.js");

  if (!existsSync(installedBundle)) {
    return {
      ok: false,
      installedDir,
      reason:
        `no ${version} build installed at ${installedBundle} — the editor is ` +
        `running whatever it had before`,
    };
  }

  const built = fileDigest(builtBundle);
  const installed = fileDigest(installedBundle);
  if (built !== installed) {
    return {
      ok: false,
      installedDir,
      built,
      installed,
      reason: `installed bundle ${installed} is not the build ${built}`,
    };
  }

  return { ok: true, installedDir, built, installed };
}

function parseArgs(args) {
  const options = {};
  const names = {
    "--extensions-dir": "extensionsDir",
    "--id": "extensionId",
    "--version": "version",
    "--built": "builtBundle",
  };
  for (let i = 0; i < args.length; i += 2) {
    const key = names[args[i]];
    if (!key) throw new Error(`unknown argument ${args[i]}`);
    options[key] = args[i + 1];
  }
  return options;
}

async function main() {
  const result = verifyInstalledExtension(parseArgs(argv.slice(2)));
  if (result.ok) {
    console.log(`verified ${result.installedDir} (bundle ${result.built})`);
    return;
  }
  console.error(result.reason);
  process.exitCode = 1;
}

// Only run as a CLI; importing this module must stay side-effect free.
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  await main();
}
