/**
 * Token types produced by the Go template lexer.
 *
 * The order here intentionally groups related kinds.
 */
export enum TokenType {
  /** Plain text outside `{{`...`}}` actions. */
  Text = "Text",

  /** Opening delimiter: `{{` or `{{-`. */
  DelimOpen = "DelimOpen",

  /** Closing delimiter: `}}` or `-}}`. */
  DelimClose = "DelimClose",

  /** Control-flow keyword: `if`, `else`, `end`, `range`, `with`, `define`, `template`, `block`. */
  Keyword = "Keyword",

  /** Variable definition: `$x :=`. */
  VariableDef = "VariableDef",

  /** Variable assignment: `$x =`. */
  VariableAssign = "VariableAssign",

  /** Variable reference (use): `$x`. */
  VariableUse = "VariableUse",

  /** A function call identifier (e.g. `print`, `index`, `coll.Slice`). */
  Function = "Function",

  /** The pipe operator `|`. */
  Pipe = "Pipe",

  /** The context dot `.`. */
  Dot = "Dot",

  /** A double-quoted or backtick-quoted string literal. */
  String = "String",

  /** A numeric literal. */
  Number = "Number",

  /** Boolean literal: `true` or `false`. */
  Bool = "Bool",

  /** The `nil` literal. */
  Nil = "Nil",

  /** Operators: `:=`, `=`, `,`, `(`, `)`. */
  Operator = "Operator",

  /** A template comment. */
  Comment = "Comment",
}

/**
 * A single token produced by the lexer.
 */
export interface Token {
  /** Token classification. */
  type: TokenType;

  /** Zero-based byte-offset into the source string where the token starts. */
  start: number;

  /** Zero-based byte-offset into the source string where the token ends (exclusive). */
  end: number;

  /**
   * Nesting depth at this token's position.
   * 0 = top-level text, 1 = inside first `if`/`range`/`with`/`define`, etc.
   * `end` does not decrease the depth — the `end` token itself sits at the
   * depth of the block it closes.
   */
  nestingLevel: number;
}
