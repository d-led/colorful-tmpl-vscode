import { TokenType, type Token } from "@colorful-tmpl/highlight-core";

/**
 * Token types the provider's legend declares, in legend order. Standard types
 * (`keyword`, `variable`) are understood by every theme; a custom one must also
 * be contributed under `semanticTokenTypes` in `package.json`, or VS Code
 * silently drops those tokens.
 */
export const TOKEN_TYPES = ["keyword", "variable", "colorfulTmplVariable"];

/** Token modifiers the legend declares; custom ones need a contribution too. */
export const TOKEN_MODIFIERS = [
  "colorfulTmplDefinition",
  "colorfulTmplAssignment",
  "readonly",
];

/** Token type shared by every `$var` and `.field` the extension highlights. */
export const VARIABLE_TOKEN_TYPE = "colorfulTmplVariable";

/**
 * Semantic token type + modifiers for a lexer token, or `null` when the token
 * should not receive semantic styling.
 */
export type SemanticClass = {
  type: string;
  modifiers: string[];
} | null;

/**
 * Maps a lexer token to a semantic token type and modifiers.
 *
 * Field access (`.Name`) and the bare dot (`.`) are classified as variables so
 * they share the same highlight as `$name` uses, matching the background
 * spotting in the decorator and core renderer.
 */
export function classifyToken(tok: Token): SemanticClass {
  switch (tok.type) {
    case TokenType.Keyword:
      return { type: "keyword", modifiers: [] };
    case TokenType.VariableDef:
      return {
        type: VARIABLE_TOKEN_TYPE,
        modifiers: ["colorfulTmplDefinition"],
      };
    case TokenType.VariableAssign:
      return {
        type: VARIABLE_TOKEN_TYPE,
        modifiers: ["colorfulTmplAssignment"],
      };
    case TokenType.VariableUse:
    case TokenType.Field:
    case TokenType.Dot:
      return { type: VARIABLE_TOKEN_TYPE, modifiers: ["readonly"] };
    default:
      return null;
  }
}
