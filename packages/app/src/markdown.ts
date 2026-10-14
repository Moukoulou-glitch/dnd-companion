/**
 * A small Markdown reader for the Backstory, notes and your own items. It
 * turns text into a tree the app draws with ordinary elements: it never
 * writes HTML, so whatever is typed (even "<script>") shows as text.
 *
 * What it reads:
 * - `# Heading` to `###### Heading`
 * - `**bold**` or `__bold__`, `*italic*` or `_italic_`, `` `code` ``
 * - lists: `- item`, `* item`, `1. item`; indent by two spaces for a list inside a list
 * - `> quote`, and `---` for a line across
 * - links: `[text](https://…)` and bare `https://…` or `www.…` addresses;
 *   only http, https and mailto open, any other link stays plain text
 * - `\*` for a star that isn't formatting
 *
 * Plain text reads as before: one line break is a line break, a blank line
 * starts a new paragraph.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "a"; href: string; c: Inline[] }
  /** A link the app won't open (javascript:, data:, a file...): its text only. */
  | { t: "badlink"; c: Inline[]; url: string }
  | { t: "br" };

export interface ListItem {
  c: Inline[];
  sub?: Block;
}

export type Block =
  | { t: "h"; level: number; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: ListItem[] }
  | { t: "ol"; start: number; items: ListItem[] }
  | { t: "quote"; c: Block[] }
  | { t: "hr" };

/** The links that may open: http(s) web pages and email addresses. Anything else: undefined. */
export function safeHref(raw: string): string | undefined {
  const s = raw.trim();
  // Spaces or control characters anywhere: browsers drop some of them ("java\tscript:"), so never guess.
  if (!s || /[\u0000- \u007f-\u009f]/.test(s)) return undefined;
  const full = /^www\./i.test(s) ? `https://${s}` : s;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(full)?.[1]?.toLowerCase();
  if (scheme !== "http" && scheme !== "https" && scheme !== "mailto") return undefined;
  try {
    const u = new URL(full);
    if (u.protocol === "mailto:") return u.pathname.includes("@") ? full : undefined;
    if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname) return full;
  } catch {
    // Not a valid address.
  }
  return undefined;
}

const ESCAPABLE = /[\\`*_[\]()#+\-.!>~|]/;

/** The next `ch` that closes an emphasis run (not one of a doubled pair). */
function closeSingle(s: string, ch: string, from: number): number {
  for (let j = from; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] !== ch) continue;
    if (s[j + 1] === ch) {
      // Skip a whole **bold** inside an *italic*.
      const end = s.indexOf(ch + ch, j + 2);
      if (end < 0) return -1;
      j = end + 1;
      continue;
    }
    return j;
  }
  return -1;
}

const AUTOLINK = /^(?:https?:\/\/|www\.)[^\s<>"]+/i;
const TRAILING = /[.,;:!?'"*_)\]]+$/;

/** Bold, italic, code and links inside a line or paragraph. */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  for (let i = 0; i < s.length; ) {
    const ch = s[i]!;
    if (ch === "\\" && i + 1 < s.length && ESCAPABLE.test(s[i + 1]!)) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === "\n") {
      flush();
      out.push({ t: "br" });
      i++;
      continue;
    }
    if (ch === "`") {
      const j = s.indexOf("`", i + 1);
      if (j > i + 1) {
        flush();
        out.push({ t: "code", v: s.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }
    if ((ch === "*" || ch === "_") && s[i + 1] === ch) {
      const j = s.indexOf(ch + ch, i + 2);
      if (j > i + 2 && s[i + 2] !== " " && s[j - 1] !== " ") {
        flush();
        out.push({ t: "b", c: parseInline(s.slice(i + 2, j)) });
        i = j + 2;
        continue;
      }
    }
    if (ch === "*" || ch === "_") {
      const j = closeSingle(s, ch, i + 1);
      const wordy = (x: string | undefined) => !!x && /[\p{L}\p{N}]/u.test(x);
      // "_" inside a word (snake_case) isn't italic.
      const fits = j > i + 1 && !/\s/.test(s[i + 1]!) && !/\s/.test(s[j - 1]!) && (ch === "*" || (!wordy(s[i - 1]) && !wordy(s[j + 1])));
      if (fits) {
        flush();
        out.push({ t: "i", c: parseInline(s.slice(i + 1, j)) });
        i = j + 1;
        continue;
      }
    }
    if (ch === "[") {
      // The address may hold one level of brackets (Wikipedia pages: "Ajax_(play)").
      const m = /^\[([^\]\n]+)\]\(\s*((?:[^()\s]|\([^()\s]*\))*)\s*\)/.exec(s.slice(i));
      if (m) {
        flush();
        const href = safeHref(m[2]!);
        const c = parseInline(m[1]!);
        out.push(href ? { t: "a", href, c } : { t: "badlink", c, url: m[2]! });
        i += m[0].length;
        continue;
      }
    }
    if ((ch === "h" || ch === "H" || ch === "w" || ch === "W") && !/[\p{L}\p{N}]/u.test(s[i - 1] ?? "")) {
      const m = AUTOLINK.exec(s.slice(i));
      if (m) {
        const url = m[0].replace(TRAILING, "");
        const href = safeHref(url);
        if (href) {
          flush();
          out.push({ t: "a", href, c: [{ t: "text", v: url }] });
          i += url.length;
          continue;
        }
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

const startsBlock = (l: string) => HEADING.test(l) || RULE.test(l) || QUOTE.test(l) || LIST.test(l);
const indentOf = (s: string) => s.replace(/\t/g, "  ").length;

function parseList(lines: string[], start: number): [Block, number] {
  const first = LIST.exec(lines[start]!)!;
  const indent = indentOf(first[1]!);
  const ordered = /\d/.test(first[2]!);
  const items: { text: string; sub?: Block }[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    const m = LIST.exec(line);
    if (m) {
      const ind = indentOf(m[1]!);
      if (ind < indent) break;
      if (ind >= indent + 2 && items.length) {
        const [sub, next] = parseList(lines, i);
        items[items.length - 1]!.sub = sub;
        i = next;
        continue;
      }
      // Another kind of list at the same depth starts a list of its own.
      if (/\d/.test(m[2]!) !== ordered) break;
      items.push({ text: m[3]! });
      i++;
      continue;
    }
    // An indented line goes on with the item above it.
    if (line.trim() && /^\s+/.test(line) && items.length && !items[items.length - 1]!.sub) {
      items[items.length - 1]!.text += `\n${line.trim()}`;
      i++;
      continue;
    }
    break;
  }
  const list = items.map((x): ListItem => (x.sub ? { c: parseInline(x.text), sub: x.sub } : { c: parseInline(x.text) }));
  return [ordered ? { t: "ol", start: Number(/\d+/.exec(first[2]!)![0]), items: list } : { t: "ul", items: list }, i];
}

function parseBlocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    if (!l.trim()) {
      i++;
      continue;
    }
    const h = HEADING.exec(l);
    if (h) {
      out.push({ t: "h", level: h[1]!.length, c: parseInline(h[2]!) });
      i++;
      continue;
    }
    if (RULE.test(l)) {
      out.push({ t: "hr" });
      i++;
      continue;
    }
    if (QUOTE.test(l)) {
      const q: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) q.push(lines[i++]!.replace(/^ {0,3}>\s?/, ""));
      out.push({ t: "quote", c: parseBlocks(q) });
      continue;
    }
    if (LIST.test(l)) {
      const [b, next] = parseList(lines, i);
      out.push(b);
      i = next;
      continue;
    }
    const p: string[] = [];
    while (i < lines.length && lines[i]!.trim() && (p.length === 0 || !startsBlock(lines[i]!))) p.push(lines[i++]!);
    out.push({ t: "p", c: parseInline(p.join("\n")) });
  }
  return out;
}

export function parseMarkdown(src: string): Block[] {
  return parseBlocks(src.replace(/\r\n?/g, "\n").split("\n"));
}

/** The words only (for word counts and short previews). */
export function plainText(src: string): string {
  const inl = (xs: Inline[]): string => xs.map((x) => (x.t === "text" || x.t === "code" ? x.v : x.t === "br" ? " " : "c" in x ? inl(x.c) : "")).join("");
  const blk = (b: Block): string =>
    b.t === "h" || b.t === "p" ? inl(b.c) : b.t === "ul" || b.t === "ol" ? b.items.map((it) => [inl(it.c), it.sub ? blk(it.sub) : ""].join(" ")).join(" ") : b.t === "quote" ? b.c.map(blk).join(" ") : "";
  return parseMarkdown(src).map(blk).join(" ").replace(/\s+/g, " ").trim();
}
