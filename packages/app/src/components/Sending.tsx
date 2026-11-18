import { useState } from "react";

/** Sending carries twenty-five words or fewer. */
export const SENDING_WORDS = 25;

/** Words in a message: runs of letters or digits, any alphabet (Greek too); punctuation alone isn't a word. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** The note a sent message becomes. */
export function sendingNote(to: string, text: string): { title: string; body: string } {
  const who = to.trim();
  const n = countWords(text);
  return {
    title: who ? `Sending to ${who}` : "Sending",
    body: `${text.trim()}\n\n_${n} word${n === 1 ? "" : "s"}${n > SENDING_WORDS ? `, over the ${SENDING_WORDS} the spell carries` : ""}._`,
  };
}

/** The note a Sending to you becomes: what you heard and, when you answered, your answer. */
export function receivedNote(from: string, text: string, reply: string): { title: string; body: string } {
  const who = from.trim();
  const words = (t: string) => {
    const n = countWords(t);
    return `_${n} word${n === 1 ? "" : "s"}${n > SENDING_WORDS ? `, over the ${SENDING_WORDS} the spell carries` : ""}._`;
  };
  const answer = reply.trim() ? `\n\n**Your answer:** ${reply.trim()}\n\n${words(reply)}` : "";
  return { title: who ? `Sending from ${who}` : "A Sending to you", body: `${text.trim()}\n\n${words(text)}${answer}` };
}

/**
 * Someone's Sending reached you: who it's from, the words you heard, and your answer if you give one
 * (at once, in the same way: 25 words or fewer, warned about, never stopped). Saved as a note.
 */
export function SendingReceivedPanel({ onSave, onSkip }: { onSave: (from: string, text: string, reply: string) => void; onSkip: () => void }) {
  const [from, setFrom] = useState("");
  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  const n = countWords(text);
  const r = countWords(reply);
  const count = (k: number) => (
    <p className={`word-count${k > SENDING_WORDS ? " danger-text" : k === SENDING_WORDS ? " full" : ""}`} aria-live="polite">
      {k} / {SENDING_WORDS} words{k > SENDING_WORDS ? `: ${k - SENDING_WORDS} more than the spell carries.` : ""}
    </p>
  );
  return (
    <>
      <p className="note">Someone's Sending reached you: you hear their voice in your mind, and you can answer at once, the same way.</p>
      <input className="search" placeholder="From (optional)" value={from} maxLength={120} onChange={(e) => setFrom(e.target.value)} aria-label="Who it's from" />
      <textarea className="story-text sending-text" rows={4} placeholder="The message you heard…" value={text} onChange={(e) => setText(e.target.value)} aria-label="The message" autoFocus />
      {count(n)}
      <textarea className="story-text sending-text" rows={4} placeholder="Your answer (optional)…" value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Your answer" />
      {count(r)}
      <div className="big-actions">
        <button className="big primary" disabled={n === 0} onClick={() => onSave(from, text, reply)}>
          {reply.trim() ? "Send the answer" : "Keep the message"}
          <span className="sub">saved in your notes</span>
        </button>
        <button className="big" onClick={onSkip}>
          Not now
          <span className="sub">nothing saved</span>
        </button>
      </div>
    </>
  );
}

/**
 * The message of a Sending, written after it's cast: who it's for, the words
 * with a live count against 25 (over 25 is warned about, never stopped), and
 * "Send the words", which saves it to Notes.
 */
export function SendingPanel({ onSend, onSkip }: { onSend: (to: string, text: string) => void; onSkip: () => void }) {
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const n = countWords(text);
  const over = n > SENDING_WORDS;
  return (
    <>
      <p className="note">A short message to a creature you know, anywhere on this plane. It hears it in your voice and can answer at once, in the same way.</p>
      <input className="search" placeholder="To (optional)" value={to} maxLength={120} onChange={(e) => setTo(e.target.value)} aria-label="Who it's for" />
      <textarea className="story-text sending-text" rows={5} placeholder="Your message…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Message" autoFocus />
      <p className={`word-count${over ? " danger-text" : n === SENDING_WORDS ? " full" : ""}`} aria-live="polite">
        {n} / {SENDING_WORDS} words{over ? `: ${n - SENDING_WORDS} more than the spell carries. The words past ${SENDING_WORDS} may not arrive.` : ""}
      </p>
      <div className="big-actions">
        <button className="big primary" disabled={n === 0} onClick={() => onSend(to, text)}>
          Send the words
          <span className="sub">saved in your notes</span>
        </button>
        <button className="big" onClick={onSkip}>
          Not now
          <span className="sub">the spell is cast; nothing saved</span>
        </button>
      </div>
    </>
  );
}
