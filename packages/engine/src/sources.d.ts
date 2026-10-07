import type { Character, ChoiceValues, Grant, Scaling } from "@dnd/schema";
import type { ContentRegistry } from "./registry.js";
/** Something active on the character that grants things: a race, a class feature, an item, a manual entry. */
export interface Source {
    /** Definition id, or "manual:<n>" for hand-entered grants. */
    id: string;
    label: string;
    grant: Grant;
    /** The player's choices for this definition. */
    choices: ChoiceValues;
    /** Level tables for "scale.<name>" values in this source's grant. */
    scaling?: Record<string, Scaling>;
    /** Set when the source is an item, so item-scoped modifiers stay on that item. */
    itemInstanceId?: string;
}
/** Walks the character and returns every active source, in sheet order. */
export declare function collectSources(c: Character, reg: ContentRegistry): Source[];
