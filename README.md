# Colorful Go Template — Syntax Highlighter

[![VS Marketplace](https://vsmarketplacebadges.dev/version/d-led.colorful-tmpl.svg)](https://marketplace.visualstudio.com/items?itemName=d-led.colorful-tmpl)

> Go template background colors, variable spotting, and `{{ }}` injection into any host language.

## What it does

![colorful go template syntax highlighting screenshot](./docs/img/screenshot.png)

- **Background colors** — each nesting level (`if`/`range`/`with`/`define`) gets a distinct background color, rotating through 6 levels.
- **Variable spotting** — `$x :=` definitions glow green, `$x =` assignments glow orange, `$x` uses glow blue.
- **Diff & peek views** — the same highlighting shows up there too.
- **Theme-friendly** — your theme styles definitions, assignments, and uses differently.
- **Works in any file** — `{{ }}` actions are highlighted inside any host language without losing that language's own syntax coloring.

## Which language mode to choose

| File type                                     | Language mode to set                                   | Why                                                                                 |
| --------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Pure Go template (`.gotmpl`, `.gohtml`, etc.) | **Colorful Go Template**                               | The file IS the template; no base syntax to preserve.                               |
| Template wrapping CMake, SQL, YAML, …         | **Keep the base language** (`cmake`, `sql`, `yaml`, …) | The injection grammar adds `{{ }}` scopes on top; the decorator runs automatically. |

For the second case, add specific patterns to `files.associations` so VS Code picks the right language. More specific globs win over less specific ones:

```jsonc
// .vscode/settings.json or user settings
"files.associations": {
  // pure templates → colorful-tmpl
  "*.gotmpl":            "colorful-tmpl",
  "*.gohtml":            "colorful-tmpl",
  // mixed templates → base language (more specific patterns take priority)
  "CMakeLists.*.tmpl":   "cmake",
  "*.cmake.tmpl":        "cmake",
  "*.yaml.tmpl":         "yaml",
  "*.sql.tmpl":          "sql",
  "*.sh.tmpl":           "shellscript",
  "*.py.tmpl":           "python",
  "*.java.tmpl":         "java",
  // fallback for any remaining .tmpl
  "*.tmpl":              "colorful-tmpl"
}
```

## Automatic injection

The extension injects `{{ }}` syntax scopes automatically inside **any** host language, in two situations:

- **Template as container** — a `.tmpl` file kept in its base language (`.java.tmpl`, `.py.tmpl`, …): `{{ }}` actions sit at the top level between host-language lines.
- **Template in a string** — a program that builds a template stores it in a string literal. Actions inside `"…"`, verbatim/multiline strings (`"""…"""` text blocks, backtick raw strings), and JS template literals all light up too.

Comments are never injected. Go source files have one exception: Go's own syntax can contain `{{`/`}}` in nested composite literals (e.g. `[][]int{{1,2},{3,4}}`), which is indistinguishable from a template action, so those are excluded from the top-level injection — while Go *strings* (including raw backtick strings) still light up.

Keep the host file in its base language (via `files.associations`, above) and nothing else is required.

## Palettes in 30 seconds

1. Open any template — a `.gotmpl`/`.gohtml` file, or a `.tmpl` file kept in its base language (see above).
2. Command Palette (`⇧⌘P` on macOS, `Ctrl+Shift+P` elsewhere) → **Colorful tmpl: Switch Palette**.
3. Choose one:
   - **Default** — soft pastels (theme-aware light/dark).
   - **High Contrast** — bolder, more opaque backgrounds.
   - **Custom** — your own colors.

Nested blocks re-decorate immediately.

Prefer Settings? Search _Colorful tmpl_ → **Palette: Preset** dropdown. Note that VS Code Settings can't render color swatches — values appear as `rgba()`/hex text there; the actual colors show in the editor on nested template blocks. For a custom palette, set the preset to `custom` and list the colors (they rotate through nesting levels):

```jsonc
"colorful-tmpl.palette.preset": "custom",
"colorful-tmpl.palette.custom": [
  "rgba(178, 218, 232, 0.18)", // level 1
  "rgba(160, 235, 178, 0.18)", // level 2
  "rgba(255, 222, 192, 0.20)", // level 3
  "rgba(236, 190, 238, 0.18)", // level 4
  "rgba(255, 252, 180, 0.18)", // level 5
  "rgba(255, 198, 208, 0.18)"  // level 6 — then wraps back to level 1
]
```

Any `rgba()` or hex works.

## Settings

| Key                                         | Default       | Description                                                                                 |
| ------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `colorful-tmpl.palette.enabled`             | `true`        | Master switch: every background this extension paints — nesting bands **and** variable/function/pipe/comment highlights. |
| `colorful-tmpl.palette.variableHighlight`   | `true`        | Variable definitions, assignments and uses (`$x :=`, `$x =`, `$x`, `.Field`). Off keeps bands, functions and pipes. |
| `colorful-tmpl.palette.functionHighlight`   | `true`        | Function calls (`print`, `index`, `coll.Slice`, …). Off keeps bands, variables and pipes.    |
| `colorful-tmpl.palette.preset`              | `default`     | Named palette: `default`, `highContrast`, or `custom` (rendered as a dropdown in Settings). |
| `colorful-tmpl.palette.custom`              | 6 rgba colors | Custom nesting-level colors, used when `preset` is `custom`.                                |
| `colorful-tmpl.palette.variableDefColor`    | theme green   | Background color for `$x :=` definitions.                                                   |
| `colorful-tmpl.palette.variableAssignColor` | theme orange  | Background color for `$x =` assignments.                                                    |
| `colorful-tmpl.palette.variableUseColor`    | theme blue    | Background color for `$x` uses.                                                             |

Switch palettes without opening Settings via the **Colorful tmpl: Switch Palette** command in the Command Palette. The `default` and `highContrast` palettes are theme-aware (light vs. dark); `highContrast` uses stronger, more opaque backgrounds and also boosts the variable/function/pipe/comment highlights.

## Packages

| Package                         | Description                                             |
| ------------------------------- | ------------------------------------------------------- |
| `@colorful-tmpl/highlight-core` | Editor-agnostic Go template lexer with nesting tracking |
| `colorful-tmpl` (VS Code)       | Grammars + background decorator extension                |

## Installation

Install from the VS Code Marketplace (`ext install d-led.colorful-tmpl`), or from source:

```bash
git clone https://github.com/d-led/colorful-tmpl-vscode.git
cd colorful-tmpl-vscode
npm install
scripts/install-here.sh
```

`install-here.sh` builds the core and extension, packages a `.vsix`, force-installs it into whichever VS Code window ran the command, and then checks that the installed bundle really is the one it just built. Reload the window (`Developer: Reload Window`) to activate — an update only takes effect after the reload.

Installing by hand (`code --install-extension *.vsix`) is what this script exists to avoid: VS Code refuses a version that is not newer than the installed one unless it is forced, and the glob also hands it the older `.vsix` files that pile up in `packages/vscode`, so the install stops on an old file and the previous build keeps running. If highlighting looks unchanged, ask what is actually installed:

```bash
bash scripts/install-here.sh --check   # or: npm run vscode:check
```

To uninstall: `scripts/install-here.sh --uninstall`

## Development

```bash
npm install                     # install workspace dependencies
npm test                        # unit + approval tests (vitest; builds the core package first)
npm run test:all                # all suites: unit/approval + VS Code integration tests
npm run test:watch              # run unit tests in watch mode
npm run test:vscode             # run VS Code integration tests (Extension Development Host)
npm run typecheck               # type-check all packages (tsc -b)
npm run build                   # build core + extension
npm run format                  # format sources with prettier
npm run format:check            # check formatting
scripts/install-here.sh         # build, package and install into current editor
scripts/analyze.ts.sh           # run refactoring metrics lint
```

`npm run test:vscode` downloads a VS Code build by default. Point `VSCODE_TEST_PATH` at an installed copy to skip the download (e.g. `VSCODE_TEST_PATH="/Applications/Visual Studio Code.app"`), or set `VSCODE_TEST_VERSION` to a release like `stable`, `insiders`, or `1.95.0`.

### Continuous integration

Two GitHub Actions workflows run on every push to `main` and every pull request:

| Workflow                  | What it runs                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `ci.yml`                  | `format:check`, `typecheck` and `npm test` on Node 20.19 and 22                              |
| `ci-vscode-extension.yml` | `scripts/test-vscode-extension.sh` under `xvfb-run` against VS Code `stable` and `1.95.0`    |

`npm run test:all` reproduces both locally; set `COLORFUL_TMPL_SKIP_VSCODE=1` to skip the extension tests.

### Approval tests

The HTML renderer is pinned by approval tests that snapshot both light and dark output. When a change intentionally alters the rendered HTML, review and accept the new snapshots:

```bash
npm run approvals:test          # run approval tests and glue snapshots into HTML
npm run approvals:view          # open the glued HTML for visual review
npm run approvals:approve:all   # accept all pending snapshots
npm run approvals:reject:all    # discard all pending snapshots
```

## License

MPL-2.0
