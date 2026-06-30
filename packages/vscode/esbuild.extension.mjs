import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(fileURLToPath(import.meta.url));
const distDir = join(pkgRoot, "dist");
mkdirSync(distDir, { recursive: true });

await esbuild.build({
  entryPoints: [join(pkgRoot, "src", "extension.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: ["node20"],
  external: ["vscode"],
  outfile: join(distDir, "extension.js"),
  minify: true,
  keepNames: true,
  legalComments: "none",
  logLevel: "info",
});

console.error(`wrote ${join(distDir, "extension.js")}`);
