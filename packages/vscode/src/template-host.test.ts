import { describe, expect, it } from "vitest";
import { templateScope } from "./template-host.js";

describe("templateScope", () => {
  it("treats colorful-tmpl as a whole-document template even without delimiters", () => {
    expect(templateScope("colorful-tmpl", "")).toBe("whole-document");
  });

  it("treats other languages with {{ }} as whole-document templates", () => {
    expect(templateScope("python", "{{ .Name }}")).toBe("whole-document");
  });

  it("treats files without {{ }} as none", () => {
    expect(templateScope("python", "plain text")).toBe("none");
    expect(templateScope("go", "plain text")).toBe("none");
  });

  it("treats Go with {{ }} as strings-only, never whole-document", () => {
    expect(templateScope("go", "x := [][]int{{1, 2}, {3, 4}}")).toBe(
      "strings-only",
    );
    expect(templateScope("go", "tmpl := `{{ .Name }}`")).toBe("strings-only");
  });
});
