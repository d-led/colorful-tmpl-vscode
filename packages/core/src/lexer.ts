import { Token, TokenType } from "./types.js";

/**
 * Set of Go template keywords that introduce a new nesting level.
 */
const BLOCK_START = new Set(["if", "range", "with", "define", "block"]);

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

/** Mutable scanner state threaded through all lexer helpers. */
interface LexerState {
  readonly source: string;
  readonly tokens: Token[];
  pos: number;
  nestingLevel: number;
  lastKeyword: string | null;
}

function peek(s: LexerState, offset = 0): string {
  const i = s.pos + offset;
  return i < s.source.length ? s.source[i] : "";
}

function advance(s: LexerState): string {
  return s.source[s.pos++];
}

function push(s: LexerState, type: TokenType, start: number, end: number): void {
  s.tokens.push({ type, start, end, nestingLevel: s.nestingLevel });
}

function consumeWhile(s: LexerState, pred: (ch: string) => boolean): void {
  while (s.pos < s.source.length && pred(peek(s))) advance(s);
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

function skipSpaces(s: LexerState): void {
  while (s.pos < s.source.length && isSpace(peek(s))) advance(s);
}

function scanText(s: LexerState): void {
  const start = s.pos;
  while (s.pos < s.source.length) {
    if (peek(s) === "{" && peek(s, 1) === "{") break;
    advance(s);
  }
  if (s.pos > start) push(s, TokenType.Text, start, s.pos);
}

function scanComment(s: LexerState): void {
  const start = s.pos;
  advance(s); advance(s); // /*
  while (s.pos < s.source.length) {
    if (peek(s) === "*" && peek(s, 1) === "/") {
      advance(s); advance(s); // */
      break;
    }
    advance(s);
  }
  push(s, TokenType.Comment, start, s.pos);
}

function scanString(s: LexerState): void {
  const start = s.pos;
  const quote = advance(s);
  while (s.pos < s.source.length) {
    const ch = peek(s);
    if (ch === "\\") { advance(s); if (s.pos < s.source.length) advance(s); continue; }
    if (ch === quote) { advance(s); break; }
    advance(s);
  }
  push(s, TokenType.String, start, s.pos);
}

function scanVariable(s: LexerState): void {
  const start = s.pos;
  advance(s); // $
  consumeWhile(s, isIdentPart);
  const nameEnd = s.pos;
  skipSpaces(s);
  if (peek(s) === ":" && peek(s, 1) === "=") {
    push(s, TokenType.VariableDef, start, nameEnd);
    const opStart = s.pos; advance(s); advance(s); // :=
    push(s, TokenType.Operator, opStart, s.pos);
  } else if (peek(s) === "=" && peek(s, 1) !== "=") {
    push(s, TokenType.VariableAssign, start, nameEnd);
    const opStart = s.pos; advance(s); // =
    push(s, TokenType.Operator, opStart, s.pos);
  } else {
    push(s, TokenType.VariableUse, start, nameEnd);
  }
}

function scanField(s: LexerState): void {
  const start = s.pos;
  advance(s); // .
  consumeWhile(s, isIdentPart);
  push(s, TokenType.Field, start, s.pos);
}

function scanNumber(s: LexerState): void {
  const start = s.pos;
  consumeWhile(s, (ch) => /[0-9.]/.test(ch));
  push(s, TokenType.Number, start, s.pos);
}

function scanOperator(s: LexerState): void {
  const start = s.pos;
  const ch = advance(s);
  if (ch === ":" && peek(s) === "=") advance(s);
  push(s, TokenType.Operator, start, s.pos);
}

function scanIdentOrKeyword(s: LexerState): void {
  const start = s.pos;
  consumeWhile(s, isIdentPart);
  const word = s.source.slice(start, s.pos);
  if (!KEYWORDS.has(word)) {
    push(s, TokenType.Function, start, s.pos);
    return;
  }
  const opensBlock =
    BLOCK_START.has(word) && !(word === "if" && s.lastKeyword === "else");
  if (word === "end") {
    push(s, TokenType.Keyword, start, s.pos);
    s.nestingLevel = Math.max(0, s.nestingLevel - 1);
  } else if (opensBlock) {
    s.nestingLevel += 1;
    push(s, TokenType.Keyword, start, s.pos);
  } else {
    push(s, TokenType.Keyword, start, s.pos);
  }
  s.lastKeyword = word;
}

function atActionEnd(s: LexerState): boolean {
  return (
    s.pos >= s.source.length ||
    (peek(s) === "}" && peek(s, 1) === "}") ||
    (peek(s) === "-" && peek(s, 1) === "}" && peek(s, 2) === "}")
  );
}

// Dispatches one token inside a {{ }} action. Returns false when at the closing delimiter.
function scanActionToken(s: LexerState): boolean {
  skipSpaces(s);
  if (atActionEnd(s)) return false;
  const ch = peek(s);
  if (ch === '"' || ch === "`") { scanString(s); return true; }
  if (ch === "/" && peek(s, 1) === "*") { scanComment(s); return true; }
  if (ch === "|") { push(s, TokenType.Pipe, s.pos, s.pos + 1); advance(s); return true; }
  if (ch === ".") {
    if (isIdentStart(peek(s, 1))) scanField(s);
    else { push(s, TokenType.Dot, s.pos, s.pos + 1); advance(s); }
    return true;
  }
  if (ch === "$") { scanVariable(s); return true; }
  if (/[0-9]/.test(ch)) { scanNumber(s); return true; }
  if (isIdentStart(ch)) { scanIdentOrKeyword(s); return true; }
  if ("(),=:".includes(ch)) { scanOperator(s); return true; }
  push(s, TokenType.Text, s.pos, s.pos + 1);
  advance(s);
  return true;
}

function scanAction(s: LexerState): void {
  s.lastKeyword = null;
  if (peek(s) === "/" && peek(s, 1) === "*") { scanComment(s); return; }
  while (s.pos < s.source.length && scanActionToken(s)) { /* dispatch */ }
}

/**
 * Tokenize a Go template source string into a flat array of {@link Token}s
 * annotated with nesting depth.
 */
export function tokenize(source: string): Token[] {
  const s: LexerState = { source, tokens: [], pos: 0, nestingLevel: 0, lastKeyword: null };
  while (s.pos < source.length) {
    scanText(s);
    if (s.pos >= source.length) break;
    const delimStart = s.pos;
    const trimLeft = peek(s, 2) === "-";
    s.pos += trimLeft ? 3 : 2;
    push(s, TokenType.DelimOpen, delimStart, s.pos);
    scanAction(s);
    const closeStart = s.pos;
    if (peek(s) === "-" && peek(s, 1) === "}" && peek(s, 2) === "}") s.pos += 3;
    else if (peek(s) === "}" && peek(s, 1) === "}") s.pos += 2;
    if (s.pos > closeStart) push(s, TokenType.DelimClose, closeStart, s.pos);
  }
  return s.tokens;
}

