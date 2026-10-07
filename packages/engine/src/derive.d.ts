import { type Ability, type Character, type Skill } from "@dnd/schema";
import { type Breakdown, type Part, type RollBreakdown } from "./breakdown.js";
import type { ContentRegistry } from "./registry.js";
export interface AbilityResult {
    score: Breakdown;
    modifier: number;
}
export interface SaveResult extends RollBreakdown {
    proficient: boolean;
}
export interface SkillResult extends RollBreakdown {
    ability: Ability;
    /** 0 none, 1 proficient, 2 expertise. */
    proficiency: 0 | 1 | 2;
}
export interface WeaponAttack {
    /** Item definition id or feature attack id; selectors "attack.<id>" target it. */
    attackId: string;
    /** Inventory instance, when the attack comes from an item. */
    itemInstanceId?: string;
    name: string;
    /** "thrown" is a melee weapon thrown at range. */
    mode: "melee" | "ranged" | "thrown";
    action: "attack" | "bonus";
    ability: Ability;
    proficient: boolean;
    attack: RollBreakdown;
    damage: {
        dice: string;
        versatileDice?: string;
        type: string;
        bonus: RollBreakdown;
        /** Flat damage only on a critical hit / natural 20, e.g. Vicious +7. */
        onCrit: Part[];
        /** Extra weapon dice rolled on a critical hit, e.g. Brutal Critical. */
        critExtraDice: Part[];
    };
    properties: string[];
    range?: [number, number];
}
export interface SpellcastingResult {
    id: string;
    label: string;
    ability: Ability;
    saveDc: Breakdown;
    attack: Breakdown;
}
export interface ResourceResult {
    id: string;
    name: string;
    max: number;
    used: number;
    remaining: number;
    reset: string;
    die?: string;
    source: string;
}
export interface DerivedSheet {
    level: number;
    proficiencyBonus: number;
    abilities: Record<Ability, AbilityResult>;
    saves: Record<Ability, SaveResult>;
    skills: Record<Skill, SkillResult>;
    passives: {
        perception: Breakdown;
        investigation: Breakdown;
        insight: Breakdown;
    };
    ac: Breakdown;
    initiative: RollBreakdown;
    speed: Breakdown;
    hpMax: Breakdown;
    hitDice: {
        die: string;
        total: number;
        used: number;
    }[];
    attacks: WeaponAttack[];
    spellcasting: SpellcastingResult[];
    spellSlots: {
        level: number;
        total: number;
    }[];
    pactSlots?: {
        count: number;
        level: number;
    };
    resources: ResourceResult[];
    proficiencies: {
        armor: string[];
        weapons: string[];
        tools: string[];
        languages: string[];
    };
    defenses: {
        resist: string[];
        immune: string[];
        vulnerable: string[];
    };
    senses: Record<string, number>;
    /** On/off states some active feature reads (Rage, Mage Armor, a lit Flame Tongue), for the UI to offer as switches. */
    toggles: {
        name: string;
        label: string;
        on: boolean;
    }[];
    /** Data problems found while deriving (missing choices, too many attuned items). */
    warnings: string[];
}
/** "roll.attack.*" matches "roll.attack.weapon.ranged"; an exact selector matches only itself. */
export declare function selectorMatches(selector: string, key: string): boolean;
/**
 * Computes the full derived sheet. Pure: the same character and content
 * always give the same result, and nothing is stored back on the character.
 */
export declare function derive(c: Character, reg: ContentRegistry): DerivedSheet;
