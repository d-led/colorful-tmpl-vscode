# 🌳 Colorful Trees Forest — Go Template Rainbow Highlighter

> Because Go templates deserve syntax highlighting that doesn't suck.

## What it does

- **Rainbow backgrounds** — each nesting level (inside `if`/`range`/`with`/`define`) gets a distinct background color. The palette rotates every 6 levels, so deeply nested templates stay readable.
- **Variable spotting** — `$x :=` definitions glow green, `$x =` assignments glow orange, `$x` uses glow blue. No more squinting at `$` signs.
- **TextMate grammar** — basic foreground coloring via standard scopes works even in diff/peek views.
- **Semantic tokens** — variable definitions vs uses are classified so themes can style them differently.
- **Full Go template syntax** — pipes, dotted function names (`coll.Slice`), whitespace trimming (`{{-`, `-}}`), and comments (`{{/* ... */}}`).

## Packages

| Package                  | npm                 | Description                                             |
| ------------------------ | ------------------- | ------------------------------------------------------- |
| `@gotmpl/highlight-core` | [npm]               | Editor-agnostic Go template lexer with nesting tracking |
| `gotmpl-vscode`          | VS Code Marketplace | VS Code extension: grammars + rainbow decorations       |

## Development

```bash
npm install
npm test                    # Run all tests
npm run build               # Build core + extension
npm run vscode:package      # Create .vsix
```

## Configuration

```jsonc
{
  "gotmpl.rainbow.enabled": true,
  "gotmpl.rainbow.palette": [
    "rgba(173, 216, 230, 0.20)", // light blue
    "rgba(144, 238, 144, 0.20)", // light green
    "rgba(255, 218, 185, 0.20)", // peach
    "rgba(221, 160, 221, 0.20)", // plum
    "rgba(255, 255, 150, 0.20)", // light yellow
    "rgba(255, 182, 193, 0.20)", // light pink
  ],
  "gotmpl.rainbow.variableHighlight": true,
}
```

## Supported file extensions

- `.gotmpl` — generic Go template
- `.tpl` — template files
- `.gtpl` — Go template
- `.gohtml` — Go HTML templates

The injection grammar also fires inside `.html`, `.yaml`, `.json`, `.xml`, and `.md` files — any `{{ ... }}` action gets highlighted.

## License

MPLv2
