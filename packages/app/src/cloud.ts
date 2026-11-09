/**
 * Saving characters to the signed-in account (the Worker in packages/server), when the app is served
 * from there. On GitHub Pages (or in development) there is no /api: the app keeps working on the device
 * only, exactly as before.
 *
 * The device keeps its own copy of every character (offline at the table); changes go up when there's
 * a connection. Who is signed in is only ever decided by the server, from Cloudflare Access's sign-in.
 */
import type { Operation } from "@dnd/schema";
import type { StoredCharacter } from "./db";
import { MAX_ROLLS } from "./rolls";

export interface Me {
  email: string;
  admin: boolean;
  /** Characters this account may keep; null for the admin (no limit). */
  limit: number | null;
  /** Characters on the account now. */
  count: number;
}

export type MeResult = { kind: "cloud"; me: Me } | { kind: "local" } | { kind: "offline" } | { kind: "signed-out" } | { kind: "no-access"; message: string };

/** What a character is saved as on the server: the device's record without the device's own bookkeeping. */
export type CloudData = Pick<StoredCharacter, "id" | "snapshot" | "ops" | "rolls" | "fixtureHash">;

export interface ServerCharacter {
  id: string;
  name: string;
  version: number;
  updatedAt: number;
  data: CloudData;
}

export type PutResult =
  | { kind: "saved"; version: number }
  | { kind: "conflict"; current: ServerCharacter }
  | { kind: "limit"; message: string; limit: number }
  | { kind: "foreign" }
  | { kind: "offline" }
  | { kind: "signed-out" }
  | { kind: "error"; message: string };

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const ME_KEY = "cloud-me";

/** The last account this device saw (so the app knows it's on the account even offline). */
export function cachedMe(): Me | undefined {
  try {
    const t = localStorage.getItem(ME_KEY);
    return t ? (JSON.parse(t) as Me) : undefined;
  } catch {
    return undefined;
  }
}

function remember(me: Me | undefined) {
  try {
    if (me) localStorage.setItem(ME_KEY, JSON.stringify(me));
    else localStorage.removeItem(ME_KEY);
  } catch {
    /* only the offline start needs it */
  }
}

export const toCloud = (r: StoredCharacter): CloudData => ({
  id: r.id,
  snapshot: r.snapshot,
  ops: r.ops,
  ...(r.rolls ? { rolls: r.rolls } : {}),
  ...(r.fixtureHash ? { fixtureHash: r.fixtureHash } : {}),
});

/**
 * Two copies of one character changed on two devices: every change from both, in time order.
 * Different starting points (one was replaced from a file): the one sent last wins.
 */
export function mergeCopies(mine: CloudData, theirs: CloudData): CloudData {
  if (JSON.stringify(mine.snapshot) !== JSON.stringify(theirs.snapshot)) return mine;
  const seen = new Set(mine.ops.map((o) => o.id));
  const ops: Operation[] = [...mine.ops, ...theirs.ops.filter((o) => !seen.has(o.id))].sort((a, b) => a.at.localeCompare(b.at));
  const rolls = [...(mine.rolls ?? []), ...(theirs.rolls ?? []).filter((r) => !(mine.rolls ?? []).some((x) => x.id === r.id))].sort((a, b) => b.at - a.at).slice(0, MAX_ROLLS);
  return { ...mine, ops, ...(rolls.length ? { rolls } : {}) };
}

/** What to do with each character after reading the account: take the server's, send ours, or drop ours. */
export function reconcile(local: StoredCharacter[], server: ServerCharacter[]): { take: ServerCharacter[]; send: StoredCharacter[]; drop: StoredCharacter[]; merge: { local: StoredCharacter; server: ServerCharacter }[] } {
  const byId = new Map(server.map((s) => [s.id, s]));
  const take: ServerCharacter[] = [];
  const send: StoredCharacter[] = [];
  const drop: StoredCharacter[] = [];
  const merge: { local: StoredCharacter; server: ServerCharacter }[] = [];
  for (const l of local) {
    const s = byId.get(l.id);
    if (!s) {
      // Never sent (made offline): send it. Sent before and gone now: deleted on another device.
      if (l.serverVersion === undefined) send.push(l);
      else drop.push(l);
      continue;
    }
    if (!l.dirty) {
      if (s.version !== l.serverVersion) take.push(s);
    } else if (s.version === l.serverVersion) send.push(l);
    else merge.push({ local: l, server: s });
  }
  for (const s of server) if (!local.some((l) => l.id === s.id)) take.push(s);
  return { take, send, drop, merge };
}

export class Cloud {
  constructor(private readonly fetchFn: FetchFn = (i, init) => fetch(i, init)) {}

  private async call(path: string, init: RequestInit = {}): Promise<Response | "offline" | "signed-out" | "not-cloud"> {
    let res: Response;
    try {
      // A sign-in that ran out sends a redirect to Google: not followed here, it means "sign in again".
      res = await this.fetchFn(path, { credentials: "same-origin", redirect: "manual", cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
    } catch {
      return "offline";
    }
    if (res.type === "opaqueredirect" || res.status === 401 || (res.status >= 300 && res.status < 400)) return "signed-out";
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) return "not-cloud";
    return res;
  }

  /** Who's signed in; "local" when the app isn't served from the account's server. */
  async me(): Promise<MeResult> {
    const res = await this.call("/api/me");
    if (res === "offline") return { kind: "offline" };
    if (res === "signed-out") return { kind: "signed-out" };
    if (res === "not-cloud") return cachedMe() ? { kind: "offline" } : { kind: "local" };
    const body = (await res.json()) as Me & { error?: string };
    if (res.status === 403) return { kind: "no-access", message: body.error ?? "This account isn't on the list." };
    if (!res.ok) return cachedMe() ? { kind: "offline" } : { kind: "local" };
    const me: Me = { email: body.email, admin: body.admin, limit: body.limit, count: body.count };
    remember(me);
    return { kind: "cloud", me };
  }

  async list(): Promise<ServerCharacter[] | "offline" | "signed-out"> {
    const res = await this.call("/api/characters");
    if (res === "offline" || res === "signed-out") return res;
    if (res === "not-cloud" || !res.ok) return "offline";
    return ((await res.json()) as { characters: ServerCharacter[] }).characters;
  }

  async put(data: CloudData, name: string, baseVersion?: number): Promise<PutResult> {
    const res = await this.call(`/api/characters/${encodeURIComponent(data.id)}`, { method: "PUT", body: JSON.stringify({ data, name, ...(baseVersion !== undefined ? { baseVersion } : {}) }) });
    if (res === "offline" || res === "not-cloud") return { kind: "offline" };
    if (res === "signed-out") return { kind: "signed-out" };
    const body = (await res.json()) as { version?: number; error?: string; code?: string; limit?: number; current?: ServerCharacter };
    if (res.ok) return { kind: "saved", version: body.version! };
    if (res.status === 409 && body.current) return { kind: "conflict", current: body.current };
    if (res.status === 403 && body.code === "limit") return { kind: "limit", message: body.error ?? "Character limit reached.", limit: body.limit ?? 0 };
    if (res.status === 403) return { kind: "foreign" };
    return { kind: "error", message: body.error ?? `HTTP ${res.status}` };
  }

  async remove(id: string): Promise<"deleted" | "offline" | "signed-out" | { error: string }> {
    const res = await this.call(`/api/characters/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res === "offline" || res === "not-cloud") return "offline";
    if (res === "signed-out") return res;
    if (res.ok) return "deleted";
    return { error: ((await res.json()) as { error?: string }).error ?? `HTTP ${res.status}` };
  }

  /**
   * Saves one character: a new one is created (or found already there from another device and merged);
   * a stale copy is merged with the newer one and sent again. Returns the result and the copy that was saved.
   */
  async save(data: CloudData, name: string, baseVersion?: number): Promise<PutResult & { data?: CloudData }> {
    let current = data;
    let base = baseVersion;
    for (let tries = 0; tries < 3; tries++) {
      const r = await this.put(current, name, base);
      if (r.kind !== "conflict") return { ...r, data: current };
      current = mergeCopies(current, r.current.data);
      base = r.current.version;
    }
    return { kind: "error", message: "It kept changing on another device; try again." };
  }
}

/** Signing out of the account (Cloudflare Access's own address). */
export const SIGN_OUT_URL = "/cdn-cgi/access/logout";

/** For tests. */
export const _remember = remember;
