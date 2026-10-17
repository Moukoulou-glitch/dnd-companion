/**
 * Large rolls (Meteor Swarm's 40d6) aren't thrown all at once: at most `cap`
 * dice are in the air together, and the rest follow in later throws. Order is
 * kept (the faces come back in the order asked), and a group (one damage type)
 * isn't split if it fits in a throw of its own.
 */
export const MAX_IN_AIR = 12;

export function batches<T>(items: T[], groupOf: (t: T) => string | undefined, cap = MAX_IN_AIR): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let i = 0;
  while (i < items.length) {
    // The run of dice of the same group starting here.
    const g = groupOf(items[i]!);
    let j = i;
    while (j < items.length && groupOf(items[j]!) === g) j++;
    const run = items.slice(i, j);
    // A group that fits in one throw but not in what's left of this one starts the next throw.
    if (run.length <= cap && cur.length + run.length > cap && cur.length) {
      out.push(cur);
      cur = [];
    }
    for (const it of run) {
      if (cur.length === cap) {
        out.push(cur);
        cur = [];
      }
      cur.push(it);
    }
    i = j;
  }
  if (cur.length) out.push(cur);
  return out;
}
