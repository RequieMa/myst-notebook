/**
 * Splits a math expression into top-level, reusable LaTeX elements.
 *
 * The goal is to feed the "recently used" palette with things worth
 * re-inserting — `\tilde{\mathbf{x}}`, `\begin{bmatrix}…\end{bmatrix}`,
 * `\frac{1}{2}` — while discarding bare atoms (`x`, `=`, `1`), row
 * separators (`\\`) and spacing macros (`\,`, `\;`).
 *
 * Rules:
 * - A letter-command (`\name`) is collected together with any brace groups
 *   that immediately follow it (`\frac{1}{2}`, `\tilde{\mathbf{x}}`). Nested
 *   braces are balanced, so inner commands are NOT emitted separately.
 * - `\begin{env}…\end{env}` is captured whole, with correct nesting.
 * - Non-letter commands (`\\`, `\,`, `\;`, `\!`, `\:`) are dropped.
 * - Everything else (letters, digits, operators, whitespace) is dropped.
 */
export function tokenizeMathElements(expr: string): string[] {
  const tokens: string[] = [];
  const n = expr.length;
  let i = 0;

  // Given expr[start] === '{', return the index just past the matching '}'.
  const readBraceGroup = (start: number): number => {
    let depth = 0;
    for (let j = start; j < n; j++) {
      if (expr[j] === '{') depth++;
      else if (expr[j] === '}') {
        depth--;
        if (depth === 0) return j + 1;
      }
    }
    return n; // unbalanced — consume to end
  };

  const isLetter = (c: string) => c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z';

  while (i < n) {
    if (expr[i] !== '\\') {
      i++;
      continue;
    }

    // At a backslash. Read the command name.
    let j = i + 1;
    if (j >= n || !isLetter(expr[j])) {
      // Non-letter command (\\, \, \; …) or trailing backslash — drop it.
      i = j + 1;
      continue;
    }

    const nameStart = j;
    while (j < n && isLetter(expr[j])) j++;
    const name = expr.slice(nameStart, j);

    if (name === 'begin') {
      // Capture the whole environment, honouring nested begin/end pairs.
      let depth = 0;
      let k = i;
      while (k < n) {
        if (expr[k] === '\\' && expr.slice(k + 1, k + 6) === 'begin') {
          depth++;
          k += 6;
        } else if (expr[k] === '\\' && expr.slice(k + 1, k + 4) === 'end') {
          depth--;
          k += 4;
          if (expr[k] === '{') k = readBraceGroup(k);
          if (depth === 0) break;
        } else {
          k++;
        }
      }
      tokens.push(expr.slice(i, k).trim());
      i = k;
      continue;
    }

    // Ordinary letter-command: absorb immediately-following brace groups.
    let k = j;
    while (k < n && expr[k] === '{') {
      k = readBraceGroup(k);
    }
    tokens.push(expr.slice(i, k));
    i = k;
  }

  return tokens;
}
