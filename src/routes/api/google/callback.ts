import { createFileRoute } from "@tanstack/react-router";

import { googleCreds, redirectUri, verifyState } from "@/lib/google.server";

const back = (request: Request, status: string) =>
  Response.redirect(`${new URL(request.url).origin}/settings?google=${status}`, 302);

export const Route = createFileRoute("/api/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return back(request, "error");
        const creds = googleCreds();
        const partnerId = await verifyState(state, creds.secret);
        if (!partnerId) return back(request, "error");

        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: creds.id,
            client_secret: creds.secret,
            redirect_uri: redirectUri(request),
            grant_type: "authorization_code",
          }),
        });
        if (!res.ok) {
          console.error(`Google token exchange failed [${res.status}]: ${await res.text()}`);
          return back(request, "error");
        }
        const tok = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };
        let email: string | null = null;
        if (tok.id_token) {
          try {
            const part = tok.id_token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
            email = (JSON.parse(atob(part)) as { email?: string }).email ?? null;
          } catch { /* ignore */ }
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("google_connections").upsert(
          {
            partner_id: partnerId,
            google_email: email,
            access_token: tok.access_token,
            ...(tok.refresh_token ? { refresh_token: tok.refresh_token } : {}),
            expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
            connected_at: new Date().toISOString(),
          },
          { onConflict: "partner_id" },
        );
        if (error) {
          console.error(error);
          return back(request, "error");
        }
        return back(request, "connected");
      },
    },
  },
});
