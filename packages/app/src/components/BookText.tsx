import { useState } from "react";
import type { BookReport } from "@dnd/engine";
import { bookReport } from "../content";
import { db } from "../db";

/** A definition's full text when it's loaded, otherwise its short summary and where to read it. */
export function BookText({ text, summary, source }: { text?: string[] | undefined; summary?: string | undefined; source?: string | undefined }) {
  if (text?.length) {
    return (
      <div className="spell-text">
        {text.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    );
  }
  return (
    <>
      {summary && <p>{summary}</p>}
      {source && !/homebrew|ruling|campaign|srd/i.test(source) && (
        <p className="note">
          {bookReport
            ? `Full text: ${source}. It isn't in the book files on this device. Class and subclass features come from the class pages: load those as .txt files too (Characters → Book text).`
            : `Full text: ${source}. Load your book files (Characters → Book text) to read it here.`}
        </p>
      )}
    </>
  );
}

const KIND_NAMES: Record<string, string> = { spell: "spells", feat: "feats", background: "backgrounds", item: "items" };

/** Load, see and remove the book files kept on this device. */
export function BooksPanel({ report }: { report: BookReport | undefined }) {
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy("Reading the files…");
    try {
      for (const f of Array.from(list)) await db.putBook({ name: f.name, text: await f.text() });
      setBusy("Loaded. Restarting…");
      location.reload();
    } catch (e) {
      setBusy(`Couldn't load: ${(e as Error).message}`);
    }
  };

  const clear = async () => {
    await db.clearBooks();
    location.reload();
  };

  return (
    <>
      <p className="note">
        Load the book files you have: spells, feats, backgrounds, races and items (.md), and class pages (.txt). They stay on this device only and are never uploaded. To give a friend the same text, send them the files and they load them here.
      </p>
      <p className="note">The table's own versions always win: house rules, rulings and the remastered feats are never changed by a book.</p>

      {report && (
        <div className="group">
          {report.files.map((f) => (
            <div className="row" key={f.name}>
              <div className="row-main">
                <div className="row-title">{f.name}</div>
                <div className="row-sub">{f.kind === "unknown" ? "Not recognized, skipped" : `${f.kind}, ${f.entries} entries`}</div>
              </div>
            </div>
          ))}
          <div className="row">
            <div className="row-main">
              <div className="row-title">Added</div>
              <div className="row-sub">
                {Object.entries(report.added)
                  .map(([k, n]) => `${n} ${KIND_NAMES[k] ?? k}`)
                  .join(", ") || "nothing new"}
                ; text for {report.textAdded} existing entries
              </div>
            </div>
          </div>
          {report.excluded > 0 && (
            <div className="row">
              <div className="row-main">
                <div className="row-title">Left out</div>
                <div className="row-sub">{report.excluded} third-party entries (Grim Hollow and other publishers)</div>
              </div>
            </div>
          )}
          {report.kept.length > 0 && (
            <div className="row">
              <div className="row-main">
                <div className="row-title">Kept as the table's version</div>
                <div className="row-sub">{report.kept.join(", ")}</div>
              </div>
            </div>
          )}
        </div>
      )}

      <label className="big primary wide file-button">
        {report ? "Load more files" : "Load book files"}
        <input type="file" multiple accept=".md,.txt,text/plain,text/markdown" onChange={(e) => void load(e.target.files)} />
      </label>
      {busy && <p className="note">{busy}</p>}
      {report && (
        <button className="big damage wide" style={{ marginTop: 10 }} onClick={() => void clear()}>
          Remove all book text from this device
        </button>
      )}
    </>
  );
}
