# Colorful tmpl — rainbow highlighting for Go templates

Rainbow nesting backgrounds, variable spotting, and `{{ }}` injection into any
host language.

![Colorful Go template syntax highlighting](https://raw.githubusercontent.com/d-led/colorful-tmpl-vscode/main/docs/img/screenshot.png)

## What it does

- **Rainbow backgrounds** — each nesting level (`if` / `range` / `with` / `define`) gets a distinct background color, rotating through 6 levels.
- **Variable spotting** — `$x :=` definitions glow green, `$x =` assignments glow orange, `$x` uses glow blue.
- **TextMate grammar** — foreground scope coloring in diff/peek views.
- **Semantic tokens** — variable definitions vs. uses are classified so themes can style them.
- **Injection grammar** — `{{ }}` actions are highlighted and rainbow-decorated inside any host language without losing that language's own syntax coloring.

## How it works

```mermaid
flowchart LR
  src["Go template source"] --> lexer["@colorful-tmpl/highlight-core lexer"]
  lexer -->|"nesting levels"| deco["rainbow decorator (VS Code)"]
  grammar["gotmpl.tmLanguage.json"] --> deco
  sem["semantic token provider"] --> deco
  deco --> editor["editor"]
```

## Choosing a language mode

| File type | Language mode to set | Why |
|---|---|---|
| Pure Go template (`.gotmpl`, `.gohtml`, …) | **Colorful Go Template** | The file IS the template; no base syntax to preserve. |
| Template wrapping CMake, SQL, YAML, … | **Keep the base language** (`cmake`, `sql`, `yaml`, …) | The injection grammar adds `{{ }}` scopes on top; the decorator runs automatically. |

For mixed templates, add patterns to `files.associations` — more specific globs win:

```jsonc
// .vscode/settings.json or user settings
"files.associations": {
  // pure templates → colorful-tmpl
  "*.gotmpl": "colorful-tmpl",
  "*.gohtml": "colorful-tmpl",
  // mixed templates → base language (more specific patterns take priority)
  "CMakeLists.*.tmpl": "cmake",
  "*.cmake.tmpl": "cmake",
  "*.yaml.tmpl": "yaml",
  "*.sql.tmpl": "sql",
  "*.sh.tmpl": "shellscript",
  "*.py.tmpl": "python",
  "*.java.tmpl": "java",
  // fallback for any remaining .tmpl
  "*.tmpl": "colorful-tmpl"
}
```

## Palettes in 30 seconds

1. Open any template — a `.gotmpl`/`.gohtml` file, or a `.tmpl` file kept in its base language (see above).
2. Command Palette (`⇧⌘P` on macOS, `Ctrl+Shift+P` elsewhere) → **Colorful tmpl: Switch Palette**.
3. Choose one:
   - **Default** — soft pastels (theme-aware light/dark).
   - **High Contrast** — bolder, more opaque backgrounds.
   - **Custom** — your own colors.

Nested blocks re-decorate immediately.

Prefer Settings? Search *Colorful tmpl* → **Palette: Preset** dropdown. Note that VS Code Settings can't render color swatches — values appear as `rgba()`/hex text there; the actual colors show in the editor on nested template blocks. For a custom palette, set the preset to `custom` and list the colors (they rotate through nesting levels):

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

| Key | Default | Description |
|---|---|---|
| `colorful-tmpl.palette.enabled` | `true` | Enable/disable background highlighting for nested template actions. |
| `colorful-tmpl.palette.preset` | `default` | Named palette: `default`, `highContrast`, or `custom` (rendered as a dropdown in Settings). |
| `colorful-tmpl.palette.custom` | 6 rgba colors | Custom nesting-level colors, used when `preset` is `custom`. |
| `colorful-tmpl.palette.variableHighlight` | `true` | Enable/disable the variable spotting highlights. |
| `colorful-tmpl.palette.variableDefColor` | theme green | Background color for `$x :=` definitions. |
| `colorful-tmpl.palette.variableAssignColor` | theme orange | Background color for `$x =` assignments. |
| `colorful-tmpl.palette.variableUseColor` | theme blue | Background color for `$x` uses. |

Switch palettes without opening Settings via the **Colorful tmpl: Switch Palette** command in the Command Palette. The `default` and `highContrast` palettes are theme-aware (light vs. dark); `highContrast` uses stronger, more opaque backgrounds and also boosts the variable/function/pipe/comment highlights.

## Installation

Install from the VS Code Marketplace: `ext install d-led.colorful-tmpl`.

## License

[MPL-2.0](LICENSE)
