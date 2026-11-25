import { RichText, TextBlocks } from "./Conditions";
import { useState } from "react";
import type { BookReport } from "@dnd/engine";
import { bookBundle, bookReport } from "../content";
import { db } from "../db";

/** A definition's full text when it's loaded, otherwise its short summary and where to read it. */
export function BookText({ text, summary, source }: { text?: string[] | undefined; summary?: string | undefined; source?: string | undefined }) {
  if (text?.length) {
    return (
      <div className="spell-text">
        <TextBlocks text={text} />
      </div>
    );
  }
  return (
    <>
      {summary && (
        <p>
          <RichText text={summary} />
        </p>
      )}
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

/** A file's text: Blob.text where there is one, a FileReader on older iPhones. */
function readText(f: File): Promise<string> {
  if (typeof f.text === "function") return f.text();
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result ?? ""));
    r.onerror = () => fail(r.error ?? new Error("the file couldn't be read"));
    r.readAsText(f);
  });
}

const KIND_NAMES: Record<string, string> = { spell: "spells", feat: "feats", background: "backgrounds", item: "items" };

/** Load, see and remove the book files kept on this device. */
export function BooksPanel({ report }: { report: BookReport | undefined }) {
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (list: File[]) => {
    if (!list.length) return;
    setBusy("Reading the files…");
    try {
      const files = list;
      // Any file can be picked (an iPhone greys out .md files when the picker is limited to them); only text files are kept.
      const ok = files.filter((f) => /\.(md|markdown|txt)$/i.test(f.name) || /^text\//.test(f.type));
      const skipped = files.filter((f) => !ok.includes(f)).map((f) => f.name);
      let loaded = 0;
      for (const f of ok) {
        const text = await readText(f);
        if (!text.trim()) {
          skipped.push(`${f.name} (empty)`);
          continue;
        }
        await db.putBook({ name: f.name, text });
        loaded++;
      }
      if (!loaded) return setBusy(`Nothing loaded: book files are .md or .txt files${skipped.length ? ` (skipped: ${skipped.join(", ")})` : ""}.`);
      setBusy(`Loaded ${loaded} file${loaded === 1 ? "" : "s"}${skipped.length ? ` (skipped: ${skipped.join(", ")})` : ""}. Restarting…`);
      setTimeout(() => location.reload(), skipped.length ? 2500 : 300);
    } catch (e) {
      setBusy(`Couldn't load: ${(e as Error).message || String(e)}`);
    }
  };

  const clear = async () => {
    await db.clearBooks();
    location.reload();
  };

  /** All the loaded files as one: saved to the device, and it can take their place here. */
  const [bundle, setBundle] = useState<{ text: string; kept: string[]; dropped: { name: string; why: string }[] } | null>(null);
  const BUNDLE_NAME = "D&D book files.md";
  const combine = async () => {
    const b = bookBundle(await db.books());
    setBundle(b);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([b.text], { type: "text/markdown" }));
    a.download = BUNDLE_NAME;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const useBundle = async () => {
    if (!bundle) return;
    await db.clearBooks();
    await db.putBook({ name: BUNDLE_NAME, text: bundle.text });
    location.reload();
  };

  return (
    <>
      <p className="note">
        Load the book files you have: spells, feats, backgrounds, races, items and the actions list (.md), and class pages (.txt). They stay on this device only and are never uploaded. To give a friend the same text, send them the files and they load them here.
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
          {report.leftOut && report.leftOut.length > 0 && (
            <div className="row">
              <div className="row-main">
                <div className="row-title">Subclasses your table doesn't use</div>
                <div className="row-sub">{report.leftOut.join(", ")} (Sword Coast Adventurer's Guide, the DMG, Explorer's Guide to Wildemount)</div>
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
        <input type="file" multiple onChange={(e) => {
            const picked = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            void load(picked);
          }} />
      </label>
      {busy && <p className="note">{busy}</p>}
      {report && report.files.length > 1 && (
        <button className="big wide" style={{ marginTop: 10 }} onClick={() => void combine()}>
          Combine into one file
        </button>
      )}
      {bundle && (
        <div className="pick-inline">
          <p className="note">
            Saved as “{BUNDLE_NAME}”: {bundle.kept.length} files in one. Load it on another device (or send it to a friend) instead of the separate files.
          </p>
          {bundle.dropped.length > 0 && (
            <p className="note">
              Left out: {bundle.dropped.map((d) => `${d.name} (${d.why})`).join("; ")}.
            </p>
          )}
          <button className="big primary wide" onClick={() => void useBundle()}>
            Keep only the combined file here
          </button>
        </div>
      )}
      {report && (
        <button className="big damage wide" style={{ marginTop: 10 }} onClick={() => void clear()}>
          Remove all book text from this device
        </button>
      )}
    </>
  );
}
