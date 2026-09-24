# Changelog

## 0.1.4

- Fixing variable and function highlighting.
- Settings to switch variable and function highlighting off.
- The three switches moved to `colorful-tmpl.highlight.*` so they group together in Settings; the old `colorful-tmpl.palette.*` keys still work.

## 0.1.3

Initial Marketplace release: nesting backgrounds, variable spotting, and
`{{ }}` highlighting inside any host language.

<!-- When cutting a release: add the new version at the top, then bump every
     package with `bash scripts/bump-version.sh patch|minor|major` and tag with
     `bash scripts/tag-version.sh`. vsce packages this file, so the Marketplace
     "Changelog" tab and VS Code's extension panel both read it from the VSIX. -->
