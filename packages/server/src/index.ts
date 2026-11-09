/**
 * The companion's Worker. Every request comes through here first:
 * - who's signed in comes from Cloudflare Access's signed token (auth.ts), never from the browser;
 * - only the admin (ADMIN_EMAIL) and the players on the admin's list get the app or the API;
 * - each player's characters are kept here, at most their limit (6 unless the admin changes it);
 *   the admin has no limit;
 * - /api/admin/* is for the admin only: the list of players, their limits, everyone's characters.
 */
import { verifiedEmail, type AuthEnv } from "./auth";

export interface Env extends AuthEnv {
  DB: D1Database;
  ASSETS?: Fetcher;
  ADMIN_EMAIL: string;
  DEFAULT_LIMIT?: string;
}

/** A saved character is at most this big (D1 keeps up to 2 MB in one value). */
export const MAX_BYTES = 1_500_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Who = { email: string; admin: boolean };
type Row = { id: string; owner: string; name: string; data: string; version: number; updated_at: number };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const fail = (status: number, error: string, more: Record<string, unknown> = {}) => json({ error, ...more }, status);

const defaultLimit = (env: Env) => Math.max(0, Number(env.DEFAULT_LIMIT ?? 6) || 6);
const isAdmin = (env: Env, email: string) => email === env.ADMIN_EMAIL.trim().toLowerCase();

/** Signed in and allowed: the admin, or a player on the list. */
async function who(req: Request, env: Env, fetcher?: (u: string) => Promise<Response>): Promise<Who | Response> {
  const email = await verifiedEmail(req, env, fetcher);
  if (!email) return fail(401, "Not signed in.");
  if (isAdmin(env, email)) return { email, admin: true };
  const p = await env.DB.prepare("SELECT email FROM players WHERE email = ?").bind(email).first();
  if (!p) return fail(403, "This Google account isn't on the list. Ask your DM to add it.", { email });
  return { email, admin: false };
}

async function limitOf(env: Env, u: Who): Promise<number | null> {
  if (u.admin) return null;
  const p = await env.DB.prepare("SELECT char_limit FROM players WHERE email = ?").bind(u.email).first<{ char_limit: number }>();
  return p?.char_limit ?? defaultLimit(env);
}

async function countOf(env: Env, email: string): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM characters WHERE owner = ?").bind(email).first<{ n: number }>();
  return r?.n ?? 0;
}

async function readBody(req: Request): Promise<{ ok: true; value: Record<string, unknown>; bytes: number } | { ok: false; res: Response }> {
  const text = await req.text();
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_BYTES) return { ok: false, res: fail(413, `Too big to save (${Math.round(bytes / 1000)} KB; at most ${MAX_BYTES / 1000} KB).`) };
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return { ok: true, value: value as Record<string, unknown>, bytes };
  } catch {
    return { ok: false, res: fail(400, "Not valid JSON.") };
  }
}

const summary = (r: Omit<Row, "data">) => ({ id: r.id, owner: r.owner, name: r.name, version: r.version, updatedAt: r.updated_at });

export async function handle(req: Request, env: Env, fetcher?: (u: string) => Promise<Response>, now = Date.now()): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const u = await who(req, env, fetcher);

  // The app itself (static files): only for allowed accounts.
  if (!path.startsWith("/api/")) {
    if (u instanceof Response) {
      if (u.status === 401) return u;
      return new Response(
        `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>No access</title><body style="font-family:system-ui;padding:24px;max-width:520px;margin:auto;background:#111;color:#eee"><h1>No access yet</h1><p>You're signed in, but this Google account isn't on the list. Ask your DM to add it, then reload this page.</p>`,
        { status: 403, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
      );
    }
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Not found", { status: 404 });
  }
  if (u instanceof Response) return u;

  // Who am I, and how many characters can I keep?
  if (path === "/api/me" && req.method === "GET") {
    return json({ email: u.email, admin: u.admin, limit: await limitOf(env, u), count: await countOf(env, u.email) });
  }

  // My characters (the admin's own too).
  if (path === "/api/characters" && req.method === "GET") {
    const rows = await env.DB.prepare("SELECT id, owner, name, data, version, updated_at FROM characters WHERE owner = ? ORDER BY updated_at DESC").bind(u.email).all<Row>();
    return json({ characters: (rows.results ?? []).map((r) => ({ ...summary(r), data: JSON.parse(r.data) as unknown })) });
  }

  const one = /^\/api\/characters\/([A-Za-z0-9_-]{1,100})$/.exec(path);
  if (one) {
    const id = one[1]!;
    const row = await env.DB.prepare("SELECT id, owner, name, version, updated_at FROM characters WHERE id = ?").bind(id).first<Omit<Row, "data">>();
    // Someone else's character: not yours to read, change or delete (the admin reads through /api/admin).
    if (row && row.owner !== u.email) return fail(403, "That character belongs to another account.");

    if (req.method === "GET") {
      if (!row) return fail(404, "No such character.");
      const full = await env.DB.prepare("SELECT data FROM characters WHERE id = ?").bind(id).first<{ data: string }>();
      return json({ ...summary(row), data: JSON.parse(full!.data) as unknown });
    }

    if (req.method === "PUT") {
      const body = await readBody(req);
      if (!body.ok) return body.res;
      const { data, name, baseVersion } = body.value as { data?: unknown; name?: unknown; baseVersion?: unknown };
      if (!data || typeof data !== "object") return fail(400, "Missing the character's data.");
      if ((data as { id?: unknown }).id !== id) return fail(400, "The character's id doesn't match the address.");
      const label = typeof name === "string" ? name.slice(0, 120) : "";
      const text = JSON.stringify(data);
      if (!row) {
        // A new character (created or imported): blocked past the limit; the admin has none.
        const limit = await limitOf(env, u);
        const atLimit = async () => {
          const count = await countOf(env, u.email);
          return fail(403, `You've reached your limit of ${limit} characters. Ask your DM for more.`, { limit, count, code: "limit" });
        };
        if (limit !== null && (await countOf(env, u.email)) >= limit) return atLimit();
        // The count is checked again in the same statement, so two devices saving at once can't pass it together.
        const res =
          limit === null
            ? await env.DB.prepare("INSERT INTO characters (id, owner, name, data, version, updated_at) VALUES (?, ?, ?, ?, 1, ?)").bind(id, u.email, label, text, now).run()
            : await env.DB.prepare("INSERT INTO characters (id, owner, name, data, version, updated_at) SELECT ?, ?, ?, ?, 1, ? WHERE (SELECT COUNT(*) FROM characters WHERE owner = ?) < ?")
                .bind(id, u.email, label, text, now, u.email, limit)
                .run();
        if (!res.meta.changes) return atLimit();
        return json({ id, version: 1, updatedAt: now }, 201);
      }
      // Saved from an older copy than the one here (another device saved in between): the newer one is sent back.
      if (typeof baseVersion !== "number" || baseVersion !== row.version) {
        const full = await env.DB.prepare("SELECT data FROM characters WHERE id = ?").bind(id).first<{ data: string }>();
        return fail(409, "Changed on another device since.", { current: { ...summary(row), data: JSON.parse(full!.data) as unknown } });
      }
      const res = await env.DB.prepare("UPDATE characters SET name = ?, data = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?").bind(label, text, now, id, row.version).run();
      if (!res.meta.changes) return fail(409, "Changed on another device since.");
      return json({ id, version: row.version + 1, updatedAt: now });
    }

    if (req.method === "DELETE") {
      // Deleted for good (the app downloads its file first).
      if (!row) return json({ id, deleted: false });
      await env.DB.prepare("DELETE FROM characters WHERE id = ?").bind(id).run();
      return json({ id, deleted: true });
    }
    return fail(405, "Not allowed.");
  }

  // The admin's page.
  if (path.startsWith("/api/admin/")) {
    if (!u.admin) return fail(403, "Only the admin can do that.");

    if (path === "/api/admin/players" && req.method === "GET") {
      const players = await env.DB.prepare("SELECT email, char_limit, added_at FROM players ORDER BY email").all<{ email: string; char_limit: number; added_at: number }>();
      const counts = await env.DB.prepare("SELECT owner, COUNT(*) AS n FROM characters GROUP BY owner").all<{ owner: string; n: number }>();
      const n = new Map((counts.results ?? []).map((c) => [c.owner, c.n]));
      return json({
        defaultLimit: defaultLimit(env),
        admin: { email: u.email, count: n.get(u.email) ?? 0 },
        players: (players.results ?? []).map((p) => ({ email: p.email, limit: p.char_limit, addedAt: p.added_at, count: n.get(p.email) ?? 0 })),
        // Characters whose owner was taken off the list: kept, only the admin sees them.
        removed: [...n.entries()].filter(([e]) => e !== u.email && !(players.results ?? []).some((p) => p.email === e)).map(([email, count]) => ({ email, count })),
      });
    }

    const p = /^\/api\/admin\/players\/([^/]+)$/.exec(path);
    if (p) {
      const email = decodeURIComponent(p[1]!).trim().toLowerCase();
      if (!EMAIL.test(email)) return fail(400, "That isn't an email address.");
      if (isAdmin(env, email)) return fail(400, "That's the admin's account: always allowed, no limit.");
      if (req.method === "PUT") {
        const body = await readBody(req);
        if (!body.ok) return body.res;
        const raw = body.value.limit;
        const limit = raw === undefined ? defaultLimit(env) : Number(raw);
        if (!Number.isInteger(limit) || limit < 0 || limit > 100) return fail(400, "The limit is a whole number from 0 to 100.");
        await env.DB.prepare("INSERT INTO players (email, char_limit, added_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET char_limit = excluded.char_limit").bind(email, limit, now).run();
        const count = await countOf(env, email);
        return json({ email, limit, count, ...(count > limit ? { note: `They already have ${count}: nothing is removed, but they can't add more.` } : {}) });
      }
      if (req.method === "DELETE") {
        // Off the list: they can't get in; their characters stay, for the admin to keep or delete.
        await env.DB.prepare("DELETE FROM players WHERE email = ?").bind(email).run();
        return json({ email, removed: true, characters: await countOf(env, email) });
      }
      return fail(405, "Not allowed.");
    }

    if (path === "/api/admin/characters" && req.method === "GET") {
      const rows = await env.DB.prepare("SELECT id, owner, name, version, updated_at FROM characters ORDER BY owner, updated_at DESC").all<Omit<Row, "data">>();
      return json({ characters: (rows.results ?? []).map(summary) });
    }

    const c = /^\/api\/admin\/characters\/([A-Za-z0-9_-]{1,100})$/.exec(path);
    if (c) {
      const row = await env.DB.prepare("SELECT id, owner, name, data, version, updated_at FROM characters WHERE id = ?").bind(c[1]!).first<Row>();
      if (!row) return fail(404, "No such character.");
      if (req.method === "GET") return json({ ...summary(row), data: JSON.parse(row.data) as unknown });
      if (req.method === "DELETE") {
        await env.DB.prepare("DELETE FROM characters WHERE id = ?").bind(row.id).run();
        return json({ id: row.id, deleted: true });
      }
      return fail(405, "Not allowed.");
    }
  }

  return fail(404, "Unknown address.");
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
} satisfies ExportedHandler<Env>;
