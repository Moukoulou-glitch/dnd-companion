export function sum(parts) {
    return { total: parts.reduce((t, p) => t + p.value, 0), parts };
}
export function signed(n) {
    return n >= 0 ? `+${n}` : `${n}`;
}
/** "+7" or "+7 +1d4": the bonus as a player would read it. */
export function formatBonus(r) {
    return [signed(r.total), ...r.dice.map((d) => `+${d.dice}`)].join(" ");
}
/** Multi-line, human-readable breakdown used in tests and debugging. */
export function explain(b) {
    const lines = b.parts.map((p) => `${signed(p.value).padStart(4)}  ${p.label}`);
    if ("dice" in b) {
        for (const d of b.dice)
            lines.push(`+${d.dice}  ${d.label}`);
        for (const a of b.advantage)
            lines.push(` adv  ${a}`);
        for (const a of b.disadvantage)
            lines.push(` dis  ${a}`);
        for (const s of b.suggestions)
            lines.push(`  ?   ${s.label} (${s.effect})`);
    }
    lines.push(`= ${b.total}`);
    return lines.join("\n");
}
