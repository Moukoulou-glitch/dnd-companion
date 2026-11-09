import { generateKeyPairSync, createSign } from "node:crypto";

/** A stand-in Cloudflare Access team for tests: its keys and signed sign-in tokens. */
export const TEAM = "table.cloudflareaccess.com";
export const AUD = "aud-123";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as JsonWebKey), kid: "k1", alg: "RS256" };
export const certs = async (url: string) => (url === `https://${TEAM}/cdn-cgi/access/certs` ? new Response(JSON.stringify({ keys: [jwk] })) : new Response("", { status: 404 }));
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function token(email: string): string {
  const h = b64({ alg: "RS256", kid: "k1", typ: "JWT" });
  const p = b64({ email, aud: [AUD], iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createSign("RSA-SHA256").update(`${h}.${p}`).sign(privateKey).toString("base64url")}`;
}
