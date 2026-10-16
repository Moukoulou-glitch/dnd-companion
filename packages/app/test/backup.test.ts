import { describe, expect, it } from "vitest";
import { backupDue, BACKUP_DAYS, FIRST_BACKUP_DAYS, SNOOZE_DAYS } from "../src/backup";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 17);

describe("Backup reminder: a nudge, only when there's something to lose", () => {
  it("nothing changed since the last backup (or ever): no reminder, however old", () => {
    expect(backupDue({ now })).toBe(false);
    expect(backupDue({ now, lastBackup: now - 400 * DAY })).toBe(false);
  });

  it("changes since an old backup: due after 30 days, not before", () => {
    expect(backupDue({ now, lastBackup: now - (BACKUP_DAYS - 1) * DAY, oldestUnsaved: now - DAY })).toBe(false);
    expect(backupDue({ now, lastBackup: now - BACKUP_DAYS * DAY, oldestUnsaved: now - DAY })).toBe(true);
  });

  it("never backed up: not on a new player's first tap, but once the first change is a week old", () => {
    expect(backupDue({ now, oldestUnsaved: now - 60_000 })).toBe(false);
    expect(backupDue({ now, oldestUnsaved: now - (FIRST_BACKUP_DAYS - 1) * DAY })).toBe(false);
    expect(backupDue({ now, oldestUnsaved: now - FIRST_BACKUP_DAYS * DAY })).toBe(true);
  });

  it("'Later' puts it away for a week, then it comes back", () => {
    const old = { lastBackup: now - 40 * DAY, oldestUnsaved: now - 10 * DAY };
    expect(backupDue({ now, ...old, snoozedUntil: now + SNOOZE_DAYS * DAY })).toBe(false);
    expect(backupDue({ now: now + SNOOZE_DAYS * DAY, ...old, snoozedUntil: now + SNOOZE_DAYS * DAY })).toBe(true);
  });
});
