export type BlockKind = 'prose' | 'code';

export interface Block {
  kind: BlockKind;
  /** Source text of the block, with no leading/trailing blank lines. */
  text: string;
  /** Code-cell metadata (language). Undefined for prose blocks. */
  meta?: Record<string, unknown>;
}

/**
 * A line that begins a `:::`-style MyST directive fence line (opener or closer).
 * In MyST, an opener is `:::{name}` (has a brace); a bare `:::` is a closer.
 * NOTE: input is assumed to use LF (`\n`) line endings — CRLF is out of scope for v1,
 * because normalizing it here would break the serializer's byte-for-byte round-trip.
 */
function isColonFence(line: string): boolean {
  return /^:{3,}/.test(line.trimEnd());
}

const CODE_CELL_RE = /^(`{3,})\s*\{code-cell\}\s*(\S+)?\s*$/;

/** Classify a backtick line. `len` = number of leading backticks; `bare` = fence with no info string (a valid closer). */
function backtickFence(line: string): { fence: boolean; codeCell: boolean; lang?: string; len: number; bare: boolean } {
  const t = line.trimEnd();
  const m = /^(`{3,})/.exec(t);
  if (!m) return { fence: false, codeCell: false, len: 0, bare: false };
  const len = m[1].length;
  const cc = CODE_CELL_RE.exec(t);
  const bare = /^`{3,}\s*$/.test(t);
  return { fence: true, codeCell: !!cc, lang: cc?.[2], len, bare };
}

/** A line that is exactly a `$$` display-math fence marker (its own line). */
function isMathFence(line: string): boolean {
  return line.trim() === '$$';
}

/**
 * Split MyST text into blocks on blank lines, never splitting inside a `:::`
 * directive fence, a ``` backtick fence, or a `$$` display-math block. A
 * ```{code-cell} fence becomes a `code` block (with meta.language); any other
 * fenced or prose run is `prose`.
 */
export function splitBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let current: string[] = [];
  let colonDepth = 0;
  let inBacktick = false;
  let pendingCode: { lang?: string } | null = null;
  let openLen = 0;
  let inMath = false;

  const flushProse = () => {
    if (current.length > 0) {
      blocks.push({ kind: 'prose', text: current.join('\n') });
      current = [];
    }
  };
  const flushCode = (lang?: string) => {
    blocks.push({ kind: 'code', text: current.join('\n'), meta: { language: lang ?? '' } });
    current = [];
  };

  for (const line of lines) {
    const bt = backtickFence(line);

    if (inBacktick) {
      current.push(line);
      if (bt.fence && bt.bare && bt.len >= openLen) {
        // closing backtick fence (must be a bare fence at least as long as the opener)
        inBacktick = false;
        openLen = 0;
        if (colonDepth > 0) {
          // Inside a ::: directive — code fence is part of the prose block.
          pendingCode = null;
        } else if (pendingCode) {
          flushCode(pendingCode.lang);
          pendingCode = null;
        } else {
          flushProse();
        }
      }
      continue;
    }

    // Display-math `$$` block: a `$$`-only line toggles math mode; blank lines
    // inside it must not split the block.
    if (isMathFence(line)) {
      current.push(line);
      inMath = !inMath;
      continue;
    }
    if (inMath) {
      current.push(line);
      continue;
    }

    if (bt.fence) {
      // opening a backtick fence — only flush preceding content as a separate
      // block when we are NOT already inside a `:::` directive.
      if (colonDepth === 0) flushProse();
      inBacktick = true;
      openLen = bt.len;
      pendingCode = bt.codeCell ? { lang: bt.lang } : null;
      current.push(line);
      continue;
    }

    if (isColonFence(line)) {
      const opens = /^:{3,}\s*\{/.test(line.trimEnd());
      current.push(line);
      if (opens) colonDepth++;
      else if (colonDepth > 0) colonDepth--;
      continue;
    }

    const isBlank = line.trim() === '';
    if (isBlank && colonDepth === 0) flushProse();
    else current.push(line);
  }

  // EOF: a code cell takes precedence if one is open
  if (pendingCode) flushCode(pendingCode.lang);
  else flushProse();
  return blocks;
}

/**
 * Is the cursor currently inside an unclosed MyST construct, given all the text
 * from the start of the cell up to the cursor? Used by the type-time Enter handler
 * to decide whether Enter should split the cell (false) or just insert a newline so
 * the user can keep typing a multi-line construct (true).
 *
 * Returns true when, scanning `textBeforeCursor` line by line, we end inside:
 *  - an unclosed ``` backtick fence (code or otherwise),
 *  - an unclosed `:::` directive (colonDepth > 0), or
 *  - an unclosed `$$` display-math block.
 */
export function hasOpenConstruct(textBeforeCursor: string): boolean {
  const lines = textBeforeCursor.split('\n');
  let colonDepth = 0;
  let inBacktick = false;
  let openLen = 0;
  let inMath = false;

  for (const line of lines) {
    const bt = backtickFence(line);
    if (inBacktick) {
      if (bt.fence && bt.bare && bt.len >= openLen) {
        inBacktick = false;
        openLen = 0;
      }
      continue;
    }
    if (isMathFence(line)) {
      inMath = !inMath;
      continue;
    }
    if (inMath) continue;
    if (bt.fence) {
      inBacktick = true;
      openLen = bt.len;
      continue;
    }
    if (isColonFence(line)) {
      const opens = /^:{3,}\s*\{/.test(line.trimEnd());
      if (opens) colonDepth++;
      else if (colonDepth > 0) colonDepth--;
    }
  }
  return inBacktick || inMath || colonDepth > 0;
}
