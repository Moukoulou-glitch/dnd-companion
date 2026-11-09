/**
 * Who is signed in: Cloudflare Access puts a signed token (JWT) on every request after the Google sign-in.
 * Its signature is checked against the Access team's public keys, its audience against this app's Access
 * application, and its expiry. Only then is its email trusted; an email sent by the browser never is.
 */

export interface AuthEnv {
  TEAM_DOMAIN: string;
  ACCESS_AUD: string;
}

type Jwk = JsonWebKey & { kid?: string };
type Fetcher = (url: string) => Promise<Response>;

let cache: { url: string; keys: Jwk[]; at: number } | undefined;
const KEYS_FOR_MS = 60 * 60 * 1000;

function b64urlBytes(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64urlJson(s: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s))) as Record<string, unknown>;
}

async function teamKeys(env: AuthEnv, fetcher: Fetcher, fresh = false): Promise<Jwk[]> {
  const url = `https://${env.TEAM_DOMAIN}/cdn-cgi/access/certs`;
  if (!fresh && cache && cache.url === url && Date.now() - cache.at < KEYS_FOR_MS) return cache.keys;
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`Access keys: HTTP ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  cache = { url, keys: body.keys ?? [], at: Date.now() };
  return cache.keys;
}

/** For tests: forget the cached keys. */
export function clearKeyCache(): void {
  cache = undefined;
}

/** The verified, lower-cased email of the signed-in Google account, or undefined. */
export async function verifiedEmail(req: Request, env: AuthEnv, fetcher: Fetcher = (u) => fetch(u), now = Date.now()): Promise<string | undefined> {
  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  const [h, p, sig] = parts as [string, string, string];
  let header: Record<string, unknown>, payload: Record<string, unknown>;
  try {
    header = b64urlJson(h);
    payload = b64urlJson(p);
  } catch {
    return undefined;
  }
  if (header.alg !== "RS256") return undefined;
  const findKey = async (fresh: boolean) => (await teamKeys(env, fetcher, fresh)).find((k) => k.kid === header.kid);
  // A key Cloudflare rotated in since the last fetch: fetch once more.
  const jwk = (await findKey(false)) ?? (await findKey(true));
  if (!jwk) return undefined;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return undefined;
  const aud = payload.aud;
  if (!(Array.isArray(aud) ? aud.includes(env.ACCESS_AUD) : aud === env.ACCESS_AUD)) return undefined;
  if (payload.iss !== `https://${env.TEAM_DOMAIN}`) return undefined;
  const sec = Math.floor(now / 1000);
  if (typeof payload.exp !== "number" || payload.exp < sec) return undefined;
  if (typeof payload.nbf === "number" && payload.nbf > sec + 60) return undefined;
  const email = payload.email;
  return typeof email === "string" && email.includes("@") ? email.trim().toLowerCase() : undefined;
}
