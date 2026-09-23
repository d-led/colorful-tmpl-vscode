# Vendored test grammar

`java.tmLanguage.json` is an **unmodified** copy of the Java TextMate grammar from
the [Red Hat vscode-java](https://github.com/redhat-developer/vscode-java)
repository, licensed under the **Eclipse Public License 2.0 (EPL-2.0)**:

- Source: `https://github.com/redhat-developer/vscode-java/blob/master/language-support/java/java.tmLanguage.json`
- Commit: `f09b712f5d6d6339e765f58c8dfab3f78a378183` (see the `version` field in the file)
- Copyright: Red Hat, Inc. and contributors

The full license text is in [`LICENSE-EPL-2.0.txt`](./LICENSE-EPL-2.0.txt).

It is vendored here **only as a test fixture**, so that the grammar injection test
(`packages/vscode/src/grammar-injection.test.ts`) can verify that the Colorful tmpl
injection grammar layers `{{ }}` scopes on top of a real host-language grammar
without disturbing that host's own syntax.

---

# Vendored test grammar

`go.tmLanguage.json` is an **unmodified** copy of the Go TextMate grammar vendored
by VS Code, originally from the
[worlpaker/go-syntax](https://github.com/worlpaker/go-syntax) repository, licensed
under the **MIT License**:

- Source: `https://github.com/worlpaker/go-syntax/blob/master/syntaxes/go.tmLanguage.json`
- Commit: `c74e22eb9ef32958e3edd130ea750ce78d8b8241` (see the `version` field in the file)
- Copyright: (c) 2023 Furkan Ozalp

The full license text is in [`LICENSE-MIT.txt`](./LICENSE-MIT.txt).

It is vendored here **only as a test fixture**, so the grammar injection tests can
verify that Go's nested composite literals (`[][]int{{1,2},{3,4}}`) are _not_
treated as template actions, while Go string literals (including raw backtick
strings) _are_.
