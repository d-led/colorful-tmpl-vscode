# Vendored test grammar

`java.tmLanguage.json` is a copy of Microsoft's built-in Java TextMate grammar
from the [VS Code repository](https://github.com/microsoft/vscode), licensed
under the MIT License. It is vendored here only as a test fixture, to verify that
the Colorful tmpl injection grammar layers `{{ }}` scopes on top of a real
host-language grammar without disturbing that host's own syntax.
