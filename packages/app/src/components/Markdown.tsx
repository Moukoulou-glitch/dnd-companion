import { Fragment, useMemo, type ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "../markdown";

/** `text` with `q` marked (search results). */
function marked(text: string, q: string | undefined, key: string): ReactNode {
  if (!q) return text;
  const parts: ReactNode[] = [];
  const low = text.toLowerCase();
  let at = 0;
  for (let i = low.indexOf(q); i >= 0; i = low.indexOf(q, at)) {
    parts.push(text.slice(at, i), <mark key={`${key}-${i}`}>{text.slice(i, i + q.length)}</mark>);
    at = i + q.length;
  }
  parts.push(text.slice(at));
  return parts;
}

function inlines(xs: Inline[], q: string | undefined, key: string): ReactNode[] {
  return xs.map((x, i) => {
    const k = `${key}.${i}`;
    switch (x.t) {
      case "text":
        return <Fragment key={k}>{marked(x.v, q, k)}</Fragment>;
      case "br":
        return <br key={k} />;
      case "code":
        return <code key={k}>{marked(x.v, q, k)}</code>;
      case "b":
        return <strong key={k}>{inlines(x.c, q, k)}</strong>;
      case "i":
        return <em key={k}>{inlines(x.c, q, k)}</em>;
      case "a":
        return (
          // A tap on a link opens it, and doesn't also open what the text sits in (a note to edit).
          <a key={k} href={x.href} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
            {inlines(x.c, q, k)}
          </a>
        );
      case "badlink":
        return (
          <span key={k} className="md-badlink" title={`Not opened: only web (http, https) and email links open. ${x.url}`}>
            {inlines(x.c, q, k)}
          </span>
        );
    }
  });
}

function block(b: Block, q: string | undefined, key: string): ReactNode {
  switch (b.t) {
    case "h": {
      // Headings sit inside a page that already has its own: h3 and smaller.
      const H = b.level <= 1 ? "h3" : b.level === 2 ? "h4" : "h5";
      return (
        <H key={key} className={`md-h md-h${Math.min(b.level, 3)}`}>
          {inlines(b.c, q, key)}
        </H>
      );
    }
    case "p":
      return <p key={key}>{inlines(b.c, q, key)}</p>;
    case "hr":
      return <hr key={key} />;
    case "quote":
      return <blockquote key={key}>{b.c.map((x, i) => block(x, q, `${key}.${i}`))}</blockquote>;
    case "ul":
    case "ol": {
      const items = b.items.map((it, i) => (
        <li key={i}>
          {inlines(it.c, q, `${key}.${i}`)}
          {it.sub && block(it.sub, q, `${key}.${i}.s`)}
        </li>
      ));
      return b.t === "ol" ? (
        <ol key={key} start={b.start === 1 ? undefined : b.start}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
  }
}

/** Text written with a little Markdown, shown formatted. `highlight`: a search term to mark (lower case). */
export function Markdown({ text, highlight, className }: { text: string; highlight?: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className={`md${className ? ` ${className}` : ""}`}>{blocks.map((b, i) => block(b, highlight || undefined, String(i)))}</div>;
}

/** What can be typed, folded away under a text box. */
export function MarkdownHelp() {
  return (
    <details className="md-help">
      <summary>Formatting</summary>
      <table>
        <tbody>
          <tr>
            <td><code># Heading</code></td>
            <td>a heading (## and ### smaller)</td>
          </tr>
          <tr>
            <td><code>**bold**</code></td>
            <td><strong>bold</strong></td>
          </tr>
          <tr>
            <td><code>*italic*</code></td>
            <td><em>italic</em></td>
          </tr>
          <tr>
            <td><code>- item</code> or <code>1. item</code></td>
            <td>a list (two spaces in front for a list inside it)</td>
          </tr>
          <tr>
            <td><code>[text](https://…)</code></td>
            <td>a link; web addresses also work on their own</td>
          </tr>
          <tr>
            <td><code>&gt; quote</code>, <code>---</code></td>
            <td>a quote, a line across</td>
          </tr>
        </tbody>
      </table>
      <p className="note">Only web (http, https) and email (mailto) links open; any other link shows as plain text.</p>
    </details>
  );
}
