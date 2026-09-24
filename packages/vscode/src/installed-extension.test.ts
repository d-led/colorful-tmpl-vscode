import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyInstalledExtension } from "../../../scripts/verify-installed-extension.mjs";

const EXTENSION_ID = "d-led.colorful-tmpl";
const BUILD = "the bundle we just packaged";
const PREVIOUS_BUILD = "the bundle the editor has been running since yesterday";

/**
 * What the install script asks after running `code --install-extension`: the
 * CLI reports success even when it refused the file (a stale, non-newer version
 * is only installed with `--force`), and then the editor keeps running the
 * previous build while everything "looks installed".
 */
describe("verifyInstalledExtension", () => {
  let work: string;
  let builtBundle: string;
  let extensionsDir: string;

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), "colorful-install-check-"));
    builtBundle = join(work, "packages", "vscode", "dist", "extension.js");
    extensionsDir = join(work, "extensions");
    mkdirSync(join(work, "packages", "vscode", "dist"), { recursive: true });
    mkdirSync(extensionsDir, { recursive: true });
    writeFileSync(builtBundle, BUILD);
  });

  afterEach(() => rmSync(work, { recursive: true, force: true }));

  /** Puts a version of the extension into the editor's extensions directory. */
  function installForEditor(version: string, bundle: string) {
    const dir = join(extensionsDir, `${EXTENSION_ID}-${version}`, "dist");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "extension.js"), bundle);
  }

  function verify(version = "0.1.3") {
    return verifyInstalledExtension({
      extensionsDir,
      extensionId: EXTENSION_ID,
      version,
      builtBundle,
    });
  }

  it("accepts the build that was just packaged", () => {
    installForEditor("0.1.3", BUILD);

    expect(verify()).toMatchObject({ ok: true, built: expect.any(String) });
    expect(verify().installed).toBe(verify().built);
  });

  it("reports the previous build when the editor never got the new one", () => {
    installForEditor("0.1.3", PREVIOUS_BUILD);

    const result = verify();

    expect(result.ok).toBe(false);
    expect(result.reason).toContain(result.built);
    expect(result.reason).toContain(result.installed);
  });

  it("reports a missing install when the editor has an older version instead", () => {
    installForEditor("0.1.2", PREVIOUS_BUILD);

    const result = verify();

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("0.1.3");
  });

  it("names the directory it inspected so the failure points somewhere", () => {
    const result = verify();

    expect(result.installedDir).toBe(
      join(extensionsDir, `${EXTENSION_ID}-0.1.3`),
    );
  });
});
