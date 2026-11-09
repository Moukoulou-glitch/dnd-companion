import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, createSign } from "node:crypto";
import { handle, type Env } from "../src/index.js";
import { d1 } from "./d1.js";
import { clearKeyCache } from "../src/auth.js";

const TEAM = "table.cloudflareaccess.com";
const AUD = "aud-123";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as JsonWebKey), kid: "k1", alg: "RS256" };
const certs = async (url: string) => (url === `https://${TEAM}/cdn-cgi/access/certs` ? new Response(JSON.stringify({ keys: [jwk] })) : new Response("", { status: 404 }));

const b64 = (o: unknown) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function token(email: string, opts: { aud?: string; exp?: number; key?: typeof privateKey; iss?: string } = {}) {
  const h = b64({ alg: "RS256", kid: "k1", typ: "JWT" });
  const p = b64({ email, aud: [opts.aud ?? AUD], iss: opts.iss ?? `https://${TEAM}`, exp: opts.exp ?? Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) });
  const s = createSign("RSA-SHA256").update(`${h}.${p}`).sign(opts.key ?? privateKey).toString("base64url");
  return `${h}.${p}.${s}`;
}

let env: Env;
const ADMIN = "micyemail@gmail.com";
const call = async (method: string, path: string, as?: string | null, body?: unknown, headers: Record<string, string> = {}) => {
  const h: Record<string, string> = { ...headers };
  if (as) h["Cf-Access-Jwt-Assertion"] = token(as);
  const res = await handle(new Request(`https://app.example${path}`, { method, headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env, certs);
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data };
};
const char = (id: string, name = "Hero") => ({ id, snapshot: { id, name }, ops: [] });
const save = (as: string, id: string, baseVersion?: number) => call("PUT", `/api/characters/${id}`, as, { data: char(id), name: "Hero", ...(baseVersion !== undefined ? { baseVersion } : {}) });

beforeAll(() => clearKeyCache());
beforeEach(() => {
  env = { DB: d1(), ADMIN_EMAIL: ADMIN, TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, DEFAULT_LIMIT: "6", ASSETS: { fetch: async () => new Response("<app>") } as unknown as Fetcher };
});

describe("21a: who is signed in", () => {
  it("only a token signed by the Access team's key, for this app, not expired, counts", async () => {
    expect((await call("GET", "/api/me", null)).status).toBe(401);
    // An email header from the browser is never trusted.
    expect((await call("GET", "/api/me", null, undefined, { "Cf-Access-Authenticated-User-Email": ADMIN })).status).toBe(401);
    const bad = async (t: string) => (await handle(new Request("https://app.example/api/me", { headers: { "Cf-Access-Jwt-Assertion": t } }), env, certs)).status;
    expect(await bad(token(ADMIN, { key: other.privateKey }))).toBe(401);
    expect(await bad(token(ADMIN, { aud: "someone-else" }))).toBe(401);
    expect(await bad(token(ADMIN, { exp: Math.floor(Date.now() / 1000) - 10 }))).toBe(401);
    expect(await bad(token(ADMIN, { iss: "https://evil.cloudflareaccess.com" }))).toBe(401);
    expect(await bad("not.a.token")).toBe(401);
    expect((await call("GET", "/api/me", "MicyEmail@Gmail.com")).data).toMatchObject({ email: ADMIN, admin: true, limit: null });
  });
  it("an account not on the list: no app, no API", async () => {
    const page = await call("GET", "/", "stranger@gmail.com");
    expect(page.status).toBe(403);
    expect(String(page.data)).toMatch(/isn't on the list/);
    expect((await call("GET", "/api/characters", "stranger@gmail.com")).status).toBe(403);
    expect((await call("GET", "/", ADMIN)).data).toBe("<app>");
  });
});

describe("21a: the admin's list", () => {
  it("adds a player (6 by default), changes the limit, removes them; players can't", async () => {
    expect((await call("PUT", "/api/admin/players/Nikos@Gmail.com", ADMIN, {})).data).toMatchObject({ email: "nikos@gmail.com", limit: 6 });
    expect((await call("GET", "/api/me", "nikos@gmail.com")).data).toMatchObject({ admin: false, limit: 6, count: 0 });
    expect((await call("PUT", "/api/admin/players/nikos@gmail.com", ADMIN, { limit: 8 })).data.limit).toBe(8);
    expect((await call("PUT", "/api/admin/players/nikos@gmail.com", ADMIN, { limit: -1 })).status).toBe(400);
    expect((await call("PUT", "/api/admin/players/not-an-email", ADMIN, {})).status).toBe(400);
    expect((await call("PUT", `/api/admin/players/${ADMIN}`, ADMIN, {})).status).toBe(400);
    expect((await call("GET", "/api/admin/players", "nikos@gmail.com")).status).toBe(403);
    expect((await call("PUT", "/api/admin/players/friend@gmail.com", "nikos@gmail.com", {})).status).toBe(403);
    const list = (await call("GET", "/api/admin/players", ADMIN)).data;
    expect(list.players).toEqual([expect.objectContaining({ email: "nikos@gmail.com", limit: 8, count: 0 })]);
    await call("DELETE", "/api/admin/players/nikos@gmail.com", ADMIN);
    expect((await call("GET", "/api/me", "nikos@gmail.com")).status).toBe(403);
  });
});

describe("21a: characters and the limit", () => {
  beforeEach(async () => {
    await call("PUT", "/api/admin/players/eleni@gmail.com", ADMIN, {});
    await call("PUT", "/api/admin/players/kostas@gmail.com", ADMIN, {});
  });
  it("six are kept; the seventh is blocked; deleting one makes room", async () => {
    for (let i = 1; i <= 6; i++) expect((await save("eleni@gmail.com", `c${i}`)).status).toBe(201);
    const seventh = await save("eleni@gmail.com", "c7");
    expect(seventh.status).toBe(403);
    expect(seventh.data).toMatchObject({ code: "limit", limit: 6, count: 6 });
    // Saving one she already has still works.
    expect((await save("eleni@gmail.com", "c1", 1)).status).toBe(200);
    expect((await call("DELETE", "/api/characters/c3", "eleni@gmail.com")).data.deleted).toBe(true);
    expect((await save("eleni@gmail.com", "c7")).status).toBe(201);
    expect((await call("GET", "/api/characters", "eleni@gmail.com")).data.characters).toHaveLength(6);
  });
  it("the admin has no limit", async () => {
    for (let i = 1; i <= 8; i++) expect((await save(ADMIN, `a${i}`)).status).toBe(201);
  });
  it("a lower limit keeps what they have but blocks new ones", async () => {
    for (let i = 1; i <= 3; i++) await save("eleni@gmail.com", `c${i}`);
    expect((await call("PUT", "/api/admin/players/eleni@gmail.com", ADMIN, { limit: 2 })).data.note).toMatch(/already have 3/);
    expect((await save("eleni@gmail.com", "c4")).status).toBe(403);
    expect((await call("GET", "/api/characters", "eleni@gmail.com")).data.characters).toHaveLength(3);
  });
  it("someone else's character: can't be read, overwritten or deleted", async () => {
    await save("eleni@gmail.com", "mine");
    expect((await call("GET", "/api/characters/mine", "kostas@gmail.com")).status).toBe(403);
    expect((await save("kostas@gmail.com", "mine", 1)).status).toBe(403);
    expect((await call("DELETE", "/api/characters/mine", "kostas@gmail.com")).status).toBe(403);
    expect((await call("GET", "/api/characters", "kostas@gmail.com")).data.characters).toEqual([]);
    // The admin sees everyone's.
    expect((await call("GET", "/api/admin/characters", ADMIN)).data.characters).toEqual([expect.objectContaining({ id: "mine", owner: "eleni@gmail.com" })]);
    expect((await call("GET", "/api/admin/characters/mine", ADMIN)).data.data).toMatchObject({ id: "mine" });
  });
  it("a save from an older copy is refused with the newer one", async () => {
    await save("eleni@gmail.com", "c1");
    expect((await save("eleni@gmail.com", "c1", 1)).data.version).toBe(2);
    const stale = await save("eleni@gmail.com", "c1", 1);
    expect(stale.status).toBe(409);
    expect(stale.data.current).toMatchObject({ id: "c1", version: 2 });
    expect((await save("eleni@gmail.com", "c1")).status).toBe(409);
  });
  it("checks: id must match, size capped", async () => {
    expect((await call("PUT", "/api/characters/x1", "eleni@gmail.com", { data: char("x2") })).status).toBe(400);
    const big = { data: { ...char("x3"), pad: "a".repeat(1_600_000) } };
    expect((await call("PUT", "/api/characters/x3", "eleni@gmail.com", big)).status).toBe(413);
  });
  it("taken off the list: they can't get in; their characters stay for the admin", async () => {
    await save("kostas@gmail.com", "k1");
    expect((await call("DELETE", "/api/admin/players/kostas@gmail.com", ADMIN)).data).toMatchObject({ removed: true, characters: 1 });
    expect((await call("GET", "/api/characters", "kostas@gmail.com")).status).toBe(403);
    expect((await call("GET", "/api/admin/players", ADMIN)).data.removed).toEqual([{ email: "kostas@gmail.com", count: 1 }]);
  });
});
