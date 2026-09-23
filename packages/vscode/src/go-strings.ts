/**
 * A half-open `[start, end)` range into a source string.
 */
export type Span = { start: number; end: number };

/**
 * Scans Go source and returns the content ranges of its string literals
 * (`"…"` and `` `…` ``), excluding the delimiters themselves.
 *
 * Comments, rune literals, and escape sequences are skipped, so a quote inside
 * any of those is not mistaken for a string boundary. Raw backtick strings may
 * span multiple lines.
 */
export function goStringContents(source: string): Span[] {
  const ranges: Span[] = [];
  const n = source.length;
  let i = 0;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    // Line comment: `//` to end of line.
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < n && source[i] !== "\n") i++;
      continue;
    }

    // Block comment: `/*` … `*/`.
    if (ch === "/" && next === "*") {
      i += 2;
      while (i + 1 < n && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i = Math.min(n, i + 2);
      continue;
    }

    // Raw string: backtick to backtick, no escapes.
    if (ch === "`") {
      const start = i + 1;
      i++;
      while (i < n && source[i] !== "`") i++;
      ranges.push({ start, end: i });
      i++;
      continue;
    }

    // Interpreted string: double quotes, backslash escapes.
    if (ch === '"') {
      const start = i + 1;
      i++;
      while (i < n) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === '"') break;
        i++;
      }
      ranges.push({ start, end: Math.min(i, n) });
      if (i < n) i++;
      continue;
    }

    // Rune literal: single quotes, backslash escapes. Never a template host.
    if (ch === "'") {
      i++;
      while (i < n) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === "'") break;
        i++;
      }
      if (i < n) i++;
      continue;
    }

    i++;
  }
  return ranges;
}
