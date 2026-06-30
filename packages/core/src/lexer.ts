import { Token, TokenType } from "./types.js";

/**
 * Set of Go template keywords that introduce a new nesting level.
 */
const BLOCK_START = new Set([
  "if",
  "range",
  "with",
  "define",
  "block",
]);

/**
 * Set of Go template keywords that *do not* introduce a new nesting level.
 */
const NON_NESTING_KEYWORDS = new Set(["else"]);

/**
 * All keywords recognized by the lexer.
 * `template` is a keyword but does NOT introduce nesting — it invokes
 * an already-defined template.
 */
const KEYWORDS = new Set([
  ...BLOCK_START,
  ...NON_NESTING_KEYWORDS,
  "end",
  "template",
]);

/**
 * Tokenize a Go template source string into a flat array of {@link Token}s
 * annotated with nesting depth.
 *
 * The lexer is a hand-written recursive-descent scanner that tracks:
 * - Action boundaries (`{{` / `}}`)
 * - Nesting level (incremented on `if`, `range`, `with`, `define`, `block`;
 *   decremented on `end`)
 * - Variable definitions (`$x :=`) vs uses (`$x`)
 * - Strings, numbers, comments, pipes, and the context dot
 *
 * @param source - The raw Go template text.
 * @returns Ordered array of tokens covering the entire source.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const len = source.length;
  let pos = 0;
  let nestingLevel = 0;

  function push(type: TokenType, start: number, end: number): void {
    tokens.push({ type, start, end, nestingLevel });
  }

  function peek(offset = 0): string {
    return pos + offset < len ? source[pos + offset] : "";
  }

  function advance(): string {
    return source[pos++];
  }

  function consumeWhile(pred: (ch: string) => boolean): number {
    const start = pos;
    while (pos < len && pred(peek())) {
      advance();
    }
    return pos - start;
  }

  // ---- helpers for specific token kinds ----

  function scanText(): void {
    const start = pos;
    // Consume until we hit `{{` or end of input.
    while (pos < len) {
      if (peek() === "{" && peek(1) === "{") {
        break;
      }
      advance();
    }
    if (pos > start) {
      push(TokenType.Text, start, pos);
    }
  }

  function isIdentStart(ch: string): boolean {
    return /[a-zA-Z_]/.test(ch);
  }

  function isIdentPart(ch: string): boolean {
    return /[a-zA-Z0-9_.]/.test(ch);
  }

  function isSpace(ch: string): boolean {
    return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
  }

  function skipSpaces(): void {
    while (pos < len && isSpace(peek())) {
      advance();
    }
  }

  /**
   * Scan the contents *between* `{{` and `}}`.
   * `pos` is just past the opening delimiter.
   */
  function scanAction(_endDelim: string): void {
    // Check for comment first
    if (peek() === "/" && peek(1) === "*") {
      scanComment();
      return;
    }

    while (pos < len) {
      skipSpaces();
      if (pos >= len) break;

      // Re-check for closing delimiter after skipping spaces
      if (peek() === "}" && peek(1) === "}") {
        break;
      }
      if (peek() === "-" && peek(1) === "}" && peek(2) === "}") {
        break;
      }

      const ch = peek();

      // String literals
      if (ch === '"' || ch === "`") {
        scanString();
        continue;
      }

      // Comment
      if (ch === "/" && peek(1) === "*") {
        scanComment();
        continue;
      }

      // Pipe
      if (ch === "|") {
        push(TokenType.Pipe, pos, pos + 1);
        advance();
        continue;
      }

      // Dot (context) — must not be followed by an ident char
      if (ch === "." && !isIdentPart(peek(1))) {
        push(TokenType.Dot, pos, pos + 1);
        advance();
        continue;
      }

      // Variable: $name
      if (ch === "$") {
        scanVariable();
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch)) {
        scanNumber();
        continue;
      }

      // Identifiers / keywords / functions
      if (isIdentStart(ch)) {
        scanIdentOrKeyword();
        continue;
      }

      // Operators and punctuation
      if (ch === "(" || ch === ")" || ch === "," || ch === "=" || ch === ":") {
        scanOperator();
        continue;
      }

      // Fallback: consume single char as text to avoid infinite loop
      push(TokenType.Text, pos, pos + 1);
      advance();
    }
  }

  function scanComment(): void {
    const start = pos;
    // `/*` already matched
    advance(); // /
    advance(); // *
    while (pos < len) {
      if (peek() === "*" && peek(1) === "/") {
        advance(); // *
        advance(); // /
        break;
      }
      advance();
    }
    push(TokenType.Comment, start, pos);
  }

  function scanString(): void {
    const start = pos;
    const quote = advance(); // " or `
    while (pos < len) {
      const ch = peek();
      if (ch === "\\") {
        advance(); // backslash
        if (pos < len) advance(); // escaped char
        continue;
      }
      if (ch === quote) {
        advance(); // closing quote
        break;
      }
      advance();
    }
    push(TokenType.String, start, pos);
  }

  function scanVariable(): void {
    const start = pos;
    advance(); // $

    // Consume variable name (may include dots for map access: $x.y.z)
    consumeWhile(isIdentPart);

    const nameEnd = pos;

    // Look ahead (skipping spaces) for `:=` or `=`
    skipSpaces();
    if (peek() === ":" && peek(1) === "=") {
      // `$x :=` — definition
      push(TokenType.VariableDef, start, nameEnd);
      const opStart = pos;
      advance(); // :
      advance(); // =
      push(TokenType.Operator, opStart, pos);
    } else if (peek() === "=" && peek(1) !== "=") {
      // `$x =` — assignment
      push(TokenType.VariableAssign, start, nameEnd);
      const opStart = pos;
      advance(); // =
      push(TokenType.Operator, opStart, pos);
    } else {
      push(TokenType.VariableUse, start, nameEnd);
    }
  }

  function scanNumber(): void {
    const start = pos;
    consumeWhile((ch) => /[0-9.]/.test(ch));
    push(TokenType.Number, start, pos);
  }

  function scanOperator(): void {
    const start = pos;
    const ch = advance();
    if (ch === ":" && peek() === "=") {
      advance(); // =
      push(TokenType.Operator, start, pos);
    } else if (ch === "=") {
      push(TokenType.Operator, start, pos);
    } else {
      push(TokenType.Operator, start, pos);
    }
  }

  function scanIdentOrKeyword(): void {
    const start = pos;
    consumeWhile(isIdentPart);
    const word = source.slice(start, pos);

    if (KEYWORDS.has(word)) {
      if (word === "end") {
        push(TokenType.Keyword, start, pos);
        nestingLevel = Math.max(0, nestingLevel - 1);
      } else if (BLOCK_START.has(word)) {
        // Increment nesting *before* pushing so if/else/end share the same level
        nestingLevel += 1;
        push(TokenType.Keyword, start, pos);
      } else {
        // `else`, `template` — no nesting change
        push(TokenType.Keyword, start, pos);
      }
    } else {
      // It's a function call
      push(TokenType.Function, start, pos);
    }
  }

  // ---- main scanner loop ----

  while (pos < len) {
    // Scan plain text until `{{`
    scanText();

    if (pos >= len) break;

    // Now we're at `{{`
    const delimStart = pos;
    const isTrimLeft = peek(2) === "-";
    const openBraceLen = isTrimLeft ? 3 : 2;
    pos += openBraceLen;
    push(TokenType.DelimOpen, delimStart, pos);

    // Scan action content until `}}` or `-}}`
    scanAction("}}");

    // Now we should be at `}}` or `-}}`
    const closeStart = pos;
    if (peek() === "-" && peek(1) === "}" && peek(2) === "}") {
      pos += 3;
    } else if (peek() === "}" && peek(1) === "}") {
      pos += 2;
    }
    if (pos > closeStart) {
      push(TokenType.DelimClose, closeStart, pos);
    }
  }

  return tokens;
}
