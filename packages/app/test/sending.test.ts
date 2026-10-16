import { describe, expect, it } from "vitest";
import { countWords, sendingNote, SENDING_WORDS } from "../src/components/Sending";
import { specOf } from "../src/fx/FxLayer";

describe("Sending: the message, its word count, the note it becomes", () => {
  it("counts words, in any alphabet; punctuation alone isn't a word", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("Meet me at the old mill — at dawn!")).toBe(8); // the dash alone is not a word
    expect(countWords("Έρχομαι στη Θεσσαλονίκη αύριο.")).toBe(4);
    expect(countWords("Twenty-five words, no more.")).toBe(4);
  });

  it("the note: who it's for, the words, the count; over 25 is said, not stopped", () => {
    expect(sendingNote("Elara", "Meet me at dawn")).toEqual({ title: "Sending to Elara", body: "Meet me at dawn\n\n_4 words._" });
    expect(sendingNote("  ", "Go").title).toBe("Sending");
    const long = Array.from({ length: SENDING_WORDS + 2 }, (_, i) => `w${i}`).join(" ");
    expect(sendingNote("", long).body).toMatch(/27 words, over the 25 the spell carries/);
  });

  it("the animation carries the words and lasts longer for a longer message", () => {
    const short = specOf({ kind: "sending", words: ["Meet", "me"] });
    const long = specOf({ kind: "sending", words: Array.from({ length: 25 }, () => "w") });
    expect(short).toMatchObject({ at: "center", look: "fx-sending", words: ["Meet", "me"] });
    expect(long.ms).toBeGreaterThan(short.ms);
  });
});
