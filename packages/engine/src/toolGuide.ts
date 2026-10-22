/**
 * What a tool or instrument is good for, in our own words: the skills it can
 * help with (your DM may give advantage or let you add it), and a few things
 * to do with it and their usual DCs. The DM sets the actual DC.
 */
export interface ToolGuide {
  /** The kind of tool, when it's one of a family ("Musical instrument", "Gaming set"). */
  kind?: string;
  helps: string[];
  activities: { what: string; dc: number | "varies" }[];
  /** Something else it lets you do. */
  also?: string;
}

const INSTRUMENTS = ["bagpipes", "drum", "dulcimer", "flute", "lute", "lyre", "horn", "pan flute", "shawm", "viol", "musical instrument"];
const GAMING = ["dice set", "dragonchess set", "playing card set", "three-dragon ante set", "gaming set"];

const GUIDES: Record<string, ToolGuide> = {
  "alchemist's supplies": { helps: ["Arcana", "Investigation"], activities: [{ what: "Make a puff of smoke", dc: 10 }, { what: "Tell what a poison is", dc: 10 }, { what: "Tell what a substance is", dc: 15 }, { what: "Start a fire", dc: 15 }, { what: "Neutralize an acid", dc: 20 }] },
  "brewer's supplies": { helps: ["History", "Medicine", "Persuasion"], activities: [{ what: "Spot poison or impurities in a drink", dc: 10 }, { what: "Tell what alcohol it is", dc: 15 }, { what: "Shrug off the effects of alcohol", dc: 20 }] },
  "calligrapher's supplies": { helps: ["Arcana", "History"], activities: [{ what: "Tell who wrote a nonmagical text", dc: 10 }, { what: "Read the writer's state of mind", dc: 15 }, { what: "Spot a forged text", dc: 15 }, { what: "Forge a signature", dc: 20 }] },
  "carpenter's tools": { helps: ["History", "Investigation", "Perception", "Stealth"], activities: [{ what: "Build a simple wooden structure", dc: 10 }, { what: "Design a complex wooden structure", dc: 15 }, { what: "Find a weak point in a wooden wall", dc: 15 }, { what: "Pry a door apart", dc: 20 }] },
  "cartographer's tools": { helps: ["Arcana", "History", "Religion", "Nature", "Survival"], activities: [{ what: "Tell a map's age and origin", dc: 10 }, { what: "Judge the direction and distance to a landmark", dc: 15 }, { what: "Tell that a map is fake", dc: 15 }, { what: "Fill in a missing part of a map", dc: 20 }] },
  "cobbler's tools": { helps: ["Arcana", "History", "Investigation"], activities: [{ what: "Tell a shoe's age and origin", dc: 10 }, { what: "Find a hidden compartment in a boot heel", dc: 15 }], also: "Mend your party's footwear so you travel longer without tiring." },
  "cook's utensils": { helps: ["History", "Medicine", "Survival"], activities: [{ what: "Make an ordinary meal", dc: 10 }, { what: "Copy a meal you've eaten", dc: 10 }, { what: "Spot poison or impurities in food", dc: 15 }, { what: "Make a fine meal", dc: 15 }], also: "A meal during a short rest: each creature eating regains 1 more hit point per Hit Die spent." },
  "glassblower's tools": { helps: ["Arcana", "History", "Investigation"], activities: [{ what: "Tell where glass comes from", dc: 10 }, { what: "Tell what a glass object once held", dc: 20 }] },
  "jeweler's tools": { helps: ["Arcana", "Investigation"], activities: [{ what: "Change how a gem looks", dc: 15 }, { what: "Tell a gem's history", dc: 20 }] },
  "leatherworker's tools": { helps: ["Arcana", "Investigation"], activities: [{ what: "Change how a leather item looks", dc: 10 }, { what: "Tell a leather item's history", dc: 20 }] },
  "mason's tools": { helps: ["History", "Investigation", "Perception"], activities: [{ what: "Carve a symbol or a hole in stone", dc: 10 }, { what: "Find a weak point in a stone wall", dc: 15 }] },
  "painter's supplies": { helps: ["Arcana", "History", "Religion", "Investigation", "Perception"], activities: [{ what: "Paint a true likeness", dc: 10 }, { what: "Hide a message in a painting", dc: 20 }] },
  "potter's tools": { helps: ["History", "Investigation", "Perception"], activities: [{ what: "Tell what a vessel once held", dc: 10 }, { what: "Make a usable pot", dc: 15 }, { what: "Find a weak point in a ceramic object", dc: 15 }] },
  "smith's tools": { helps: ["Arcana", "History", "Investigation"], activities: [{ what: "Sharpen a dull blade", dc: 10 }, { what: "Repair a suit of armor", dc: 15 }, { what: "Break a nonmagical metal object", dc: 15 }], also: "With a hot enough fire, restore 10 hit points to a damaged metal object for each hour of work." },
  "tinker's tools": { helps: ["History", "Investigation"], activities: [{ what: "Patch up a broken device for a while", dc: 10 }, { what: "Repair an item in half the time", dc: 15 }, { what: "Make a makeshift item from scraps", dc: 20 }] },
  "weaver's tools": { helps: ["Arcana", "History", "Investigation"], activities: [{ what: "Repurpose cloth", dc: 10 }, { what: "Mend a hole in cloth", dc: 10 }, { what: "Tailor an outfit", dc: 15 }] },
  "woodcarver's tools": { helps: ["Arcana", "History", "Nature", "Investigation", "Perception"], activities: [{ what: "Carve a small wooden figure", dc: 10 }, { what: "Carve an intricate pattern in wood", dc: 15 }] },
  "disguise kit": { helps: ["Deception", "Intimidation", "Performance", "Persuasion"], activities: [{ what: "Cover wounds or distinguishing marks", dc: 10 }, { what: "Spot someone else's disguise", dc: 15 }, { what: "Copy a humanoid's appearance", dc: 20 }] },
  "forgery kit": { helps: ["Arcana", "History", "Investigation", "Deception"], activities: [{ what: "Copy someone's handwriting", dc: 15 }, { what: "Copy a wax seal", dc: 20 }] },
  "gaming set": { kind: "Gaming set", helps: ["History", "Insight", "Sleight of Hand"], activities: [{ what: "Catch a player cheating", dc: 15 }, { what: "Read an opponent's personality", dc: 15 }] },
  "herbalism kit": { helps: ["Arcana", "Investigation", "Medicine", "Nature", "Survival"], activities: [{ what: "Find useful plants", dc: 15 }, { what: "Tell what a poison is", dc: 20 }], also: "Needed to make antitoxin and potions of healing." },
  "musical instrument": { kind: "Musical instrument", helps: ["History", "Performance"], activities: [{ what: "Recognize a tune", dc: 10 }, { what: "Make up a tune on the spot", dc: 20 }], also: "During a long rest you can write a new tune and lyrics for your instrument." },
  "navigator's tools": { helps: ["Survival"], activities: [{ what: "Plot a course", dc: 10 }, { what: "Find your position on a nautical chart", dc: 15 }] },
  "poisoner's kit": { helps: ["History", "Investigation", "Medicine", "Nature", "Perception"], activities: [{ what: "Spot a poisoned object", dc: 10 }, { what: "Tell what a poison does", dc: 20 }] },
  "thieves' tools": { helps: ["History", "Investigation", "Perception"], activities: [{ what: "Pick a lock", dc: "varies" }, { what: "Disarm a trap", dc: "varies" }] },
  "vehicles (land)": { kind: "Vehicles", helps: ["Animal Handling", "Perception", "Survival"], activities: [] },
  "vehicles (water)": { kind: "Vehicles", helps: ["History", "Perception", "Survival"], activities: [] },
};

/** Every tool the guide knows, for picking one you aren't proficient with. */
export const TOOL_NAMES: string[] = Object.keys(GUIDES).map((k) => k.replace(/^./, (c) => c.toUpperCase()));

const norm = (s: string) => s.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();

/** The guide for a tool by its name ("Smith's tools", "Lute", "Playing card set"); undefined when the app has none. */
export function toolGuide(name: string): ToolGuide | undefined {
  const n = norm(name);
  if (GUIDES[n]) return GUIDES[n];
  if (INSTRUMENTS.some((i) => n === i || n.startsWith(`${i} `))) return GUIDES["musical instrument"];
  if (GAMING.some((g) => n === g || n.includes(g.replace(" set", "")))) return GUIDES["gaming set"];
  if (/vehicles?.*water/.test(n)) return GUIDES["vehicles (water)"];
  if (/vehicles?/.test(n)) return GUIDES["vehicles (land)"];
  return Object.entries(GUIDES).find(([k]) => n.startsWith(k.replace(/'s .*$/, "")))?.[1];
}
