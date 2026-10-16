/**
 * The backup reminder. Characters live in this browser only (tied to the site's
 * address), so a full backup file kept somewhere else is the safety net. The
 * reminder only nudges: it never blocks, and "Later" puts it away for a week.
 */

const DAY = 86_400_000;
/** A backup older than this, with changes since, is due. */
export const BACKUP_DAYS = 30;
/** With no backup ever: due once the first change is this old (not on a new player's first tap). */
export const FIRST_BACKUP_DAYS = 7;
/** "Later" hides the reminder this long. */
export const SNOOZE_DAYS = 7;

export interface BackupState {
  now: number;
  /** When this device last made a full backup. */
  lastBackup?: number;
  /** When the reminder was put away until. */
  snoozedUntil?: number;
  /** The oldest change not in a backup yet (undefined: nothing to back up). */
  oldestUnsaved?: number;
}

export function backupDue(s: BackupState): boolean {
  if (s.oldestUnsaved === undefined) return false;
  if (s.snoozedUntil !== undefined && s.now < s.snoozedUntil) return false;
  if (s.lastBackup === undefined) return s.now - s.oldestUnsaved >= FIRST_BACKUP_DAYS * DAY;
  return s.now - s.lastBackup >= BACKUP_DAYS * DAY;
}

/** Days since a time, rounded down. */
export function daysSince(at: number, now = Date.now()): number {
  return Math.floor((now - at) / DAY);
}

function readNumber(key: string): number | undefined {
  try {
    const v = Number(localStorage.getItem(key));
    return v > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}
function writeNumber(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* private window: no reminder, nothing lost */
  }
}

/** When this device last made a full backup (a reminder only: it lives in this browser). */
export function lastBackup(): number | undefined {
  return readNumber("dnd-last-backup");
}
export function markBackup(now = Date.now()): void {
  writeNumber("dnd-last-backup", now);
}
export function snoozedUntil(): number | undefined {
  return readNumber("dnd-backup-snooze");
}
export function snoozeBackup(now = Date.now()): void {
  writeNumber("dnd-backup-snooze", now + SNOOZE_DAYS * DAY);
}
