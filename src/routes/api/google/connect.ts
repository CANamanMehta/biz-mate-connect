import { createFileRoute } from "@tanstack/react-router";

import { GOOGLE_SCOPES, googleCreds, partnerFromRequest, redirectUri, signState } from "@/lib/google.server";

export const Route = createFileRoute("/api/google/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const partnerId = await partnerFromRequest(request);
        if (!partnerId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        let creds;
        try {
          creds = googleCreds();
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
        const params = new URLSearchParams({
          client_id: creds.id,
          redirect_uri: redirectUri(request),
          response_type: "code",
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          state: await signState(partnerId, creds.secret),
        });
        return Response.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
      },
    },
  },
});
