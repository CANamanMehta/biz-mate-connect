import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export const GOOGLE_SCOPES = "openid email https://www.googleapis.com/auth/calendar.events";

export function googleCreds() {
  const id = process.env["GOOGLE_CLIENT_ID"];
  const secret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!id || !secret) throw new Error("Google Calendar is not configured");
  return { id, secret };
}

export const redirectUri = (request: Request) => `${new URL(request.url).origin}/api/google/callback`;

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(data: string, key: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

export async function signState(partnerId: string, key: string) {
  const payload = b64url(enc.encode(JSON.stringify({ p: partnerId, e: Date.now() + 10 * 60_000, n: crypto.randomUUID() })));
  return `${payload}.${await hmac(payload, key)}`;
}

export async function verifyState(state: string, key: string): Promise<string | null> {
  const [payload, sig] = state.split(".");
  if (!payload || !sig || (await hmac(payload, key)) !== sig) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { p: string; e: number };
    return json.e > Date.now() ? json.p : null;
  } catch {
    return null;
  }
}

/** Resolves the signed-in partner id from a bearer token, or null. */
export async function partnerFromRequest(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const sb = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
  });
  const { data: user } = await sb.auth.getUser(token);
  if (!user.user) return null;
  const { data } = await sb.rpc("current_partner_id");
  return (data as string | null) ?? null;
}
