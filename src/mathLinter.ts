import { tokenizeMathElements } from './mathTokenizer';

export interface LintRule {
  name: string;
  apply: (mathExpr: string) => string;
}

export function runLinter(expr: string, rules: LintRule[]): string {
  return rules.reduce((s, rule) => rule.apply(s), expr);
}

/** Matches display `$$…$$` (non-greedy) or inline `$…$` (single line) math. */
const MATH_BLOCK_RE = /\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/g;

export function lintCellText(text: string, rules: LintRule[]): string {
  return text.replace(
    new RegExp(MATH_BLOCK_RE.source, 'g'),
    (match) => {
      const isBlock = match.startsWith('$$');
      const delim = isBlock ? '$$' : '$';
      const inner = isBlock
        ? match.slice(2, -2)
        : match.slice(1, -1);
      const linted = runLinter(inner, rules);
      return `${delim}${linted}${delim}`;
    }
  );
}

/**
 * Returns the inner (delimiter-stripped, trimmed) content of every `$…$` and
 * `$$…$$` math block in document order. Empty/whitespace-only blocks are omitted.
 * Shares MATH_BLOCK_RE with lintCellText so the two never drift apart.
 */
export function extractMathBlocks(text: string): string[] {
  const blocks: string[] = [];
  for (const m of text.matchAll(new RegExp(MATH_BLOCK_RE.source, 'g'))) {
    const raw = m[0];
    const inner = raw.startsWith('$$')
      ? raw.slice(2, -2).trim()
      : raw.slice(1, -1).trim();
    if (inner) blocks.push(inner);
  }
  return blocks;
}

const braceSingleArgMacro: LintRule = {
  name: 'braceSingleArgMacro',
  apply: (s) =>
    s
      .replace(
        /(\\(?:mathbf|mathit|mathbb|mathcal|mathsf|mathtt|boldsymbol|hat|bar|vec|tilde|dot|ddot|check|breve|acute|grave|underline|overline))\s+([A-Za-z0-9](?![A-Za-z0-9]|\{))/g,
        '$1{$2}'
      )
      .replace(/\\text\s+(\w+)/g, '\\text{$1}'),
};

const spaceBinaryOp: LintRule = {
  name: 'spaceBinaryOp',
  apply: (s) =>
    s.replace(
      /\s*(\\(?:times|cdot|div|pm|mp|oplus|otimes|cup|cap))(?![a-zA-Z])\s*/g,
      ' $1 '
    ),
};

const braceFrac: LintRule = {
  name: 'braceFrac',
  apply: (s) =>
    s.replace(/\\frac(?!\{)(\d)(\d)/g, '\\frac{$1}{$2}'),
};

export const DEFAULT_RULES: LintRule[] = [
  braceSingleArgMacro,
  spaceBinaryOp,
  braceFrac,
];

/**
 * Extracts math blocks from prose text, lints each block, then tokenizes the
 * result into palette-ready LaTeX elements. The lint-first ordering ensures
 * that commands like `\mathbf R` are corrected to `\mathbf{R}` BEFORE being
 * stored in the recently-used palette (Bug 4 fix).
 */
export function collectMathPaletteItems(text: string): string[] {
  const tokens: string[] = [];
  for (const inner of extractMathBlocks(text)) {
    const linted = runLinter(inner, DEFAULT_RULES);
    for (const element of tokenizeMathElements(linted)) {
      tokens.push(element);
    }
  }
  return tokens;
}
