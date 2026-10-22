import { describe, expect, it } from "vitest";
import { pickBlocks } from "../src/components/Builder";

describe("race list: each race with its own subraces", () => {
  it("a race without subraces after a family stands on its own, not under the family", () => {
    const races = [
      { name: "Forest Gnome", group: "Gnome" },
      { name: "Rock Gnome", group: "Gnome" },
      { name: "Goblin" },
      { name: "Goliath" },
      { name: "Lightfoot Halfling", group: "Halfling" },
    ];
    const blocks = pickBlocks(races, (r) => r.group);
    expect(blocks.map((b) => [b.name ?? "-", b.items.map((r) => r.name)])).toEqual([
      ["Gnome", ["Forest Gnome", "Rock Gnome"]],
      ["-", ["Goblin"]],
      ["-", ["Goliath"]],
      ["Halfling", ["Lightfoot Halfling"]],
    ]);
  });
});
