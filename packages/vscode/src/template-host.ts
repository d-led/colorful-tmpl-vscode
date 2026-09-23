export const TEMPLATE_LANGUAGE_ID = "colorful-tmpl";
export const GO_LANGUAGE_ID = "go";

export type TemplateScope = "whole-document" | "strings-only" | "none";

/**
 * Classifies how a document should be tokenized for template highlighting.
 *
 * - `whole-document`: the whole file is a template (`colorful-tmpl`) or a mixed
 *   host where `{{ }}` actions sit at the top level between host-language lines.
 * - `strings-only`: template actions live inside the host's string literals
 *   (Go, whose composite literals can contain `{{`/`}}` outside of strings).
 * - `none`: the file contains no `{{` delimiter, so there is nothing to paint.
 */
export function templateScope(
  languageId: string,
  source: string,
): TemplateScope {
  if (languageId === TEMPLATE_LANGUAGE_ID) return "whole-document";
  if (!source.includes("{{")) return "none";
  return languageId === GO_LANGUAGE_ID ? "strings-only" : "whole-document";
}
