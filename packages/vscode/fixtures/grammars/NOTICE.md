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
