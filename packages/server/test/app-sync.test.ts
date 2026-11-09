import { beforeEach, describe, expect, it } from "vitest";
import { handle, type Env } from "../src/index.js";
import { d1 } from "./d1.js";
import { AUD, certs, TEAM, token } from "./access.js";
import { Cloud, type CloudData } from "../../app/src/cloud.js";

const ADMIN = "micyemail@gmail.com";
// The browser's localStorage, for the last account seen.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() };
let env: Env;
/** The app's Cloud (packages/app/src/cloud.ts) talking to the real server code, signed in as `email`. */
const as = (email: string) =>
  new Cloud(async (path, init) => {
    const req = new Request(`https://app.example${path}`, { ...init, headers: { ...(init?.headers as Record<string, string>), "Cf-Access-Jwt-Assertion": token(email) } });
    return handle(req, env, certs);
  });
const op = (id: string, at: string) => ({ id, at, type: "rest", payload: {} }) as never;
const char = (id: string, ops: string[] = []): CloudData => ({ id, snapshot: { id, name: id } as never, ops: ops.map((o, i) => op(o, `0000${i}`)), rolls: [] });

beforeEach(async () => {
  env = { DB: d1(), ADMIN_EMAIL: ADMIN, TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
  await handle(new Request("https://app.example/api/admin/players/eleni@gmail.com", { method: "PUT", body: "{}", headers: { "Cf-Access-Jwt-Assertion": token(ADMIN) } }), env, certs);
});

describe("21b: the app and the account", () => {
  it("who's signed in; not on the server (GitHub Pages): local; offline", async () => {
    expect(await as("eleni@gmail.com").me()).toMatchObject({ kind: "cloud", me: { email: "eleni@gmail.com", limit: 6, count: 0, admin: false } });
    expect(await as("stranger@gmail.com").me()).toMatchObject({ kind: "no-access" });
    // Once on the account, a page that isn't the server means offline (not "back to the device only").
    expect(await new Cloud(async () => new Response("<html>", { status: 404, headers: { "content-type": "text/html" } })).me()).toEqual({ kind: "offline" });
    localStorage.clear();
    expect(await new Cloud(async () => new Response("<html>", { status: 404, headers: { "content-type": "text/html" } })).me()).toEqual({ kind: "local" });
    expect(await new Cloud(async () => { throw new TypeError("network"); }).me()).toEqual({ kind: "offline" });
    expect(await new Cloud(async () => new Response(null, { status: 302 })).me()).toEqual({ kind: "signed-out" });
  });
  it("saves; a 7th is refused with the limit; a copy saved on two devices is merged", async () => {
    const eleni = as("eleni@gmail.com");
    for (let i = 1; i <= 6; i++) expect((await eleni.save(char(`c${i}`), "Hero")).kind).toBe("saved");
    expect(await eleni.save(char("c7"), "Hero")).toMatchObject({ kind: "limit", limit: 6 });
    // Phone and tablet both changed c1 from version 1.
    await eleni.save(char("c1", ["a", "b"]), "Hero", 1);
    const r = await eleni.save(char("c1", ["a", "c"]), "Hero", 1);
    expect(r.kind).toBe("saved");
    expect(r.data!.ops.map((o) => o.id).sort()).toEqual(["a", "b", "c"]);
    const list = await eleni.list();
    expect(Array.isArray(list) && list.find((x) => x.id === "c1")?.version).toBe(3);
    expect(await eleni.remove("c2")).toBe("deleted");
  });
  it("someone else's character can't be saved over", async () => {
    await as(ADMIN).save(char("x"), "X");
    expect((await as("eleni@gmail.com").save(char("x"), "X")).kind).toBe("foreign");
  });
});

