import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: partnerId } = await context.supabase.rpc("current_partner_id");
    if (!partnerId) throw new Error("No partner linked to this account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("google_connections")
      .select("refresh_token, access_token")
      .eq("partner_id", partnerId as string)
      .maybeSingle();
    const token = row?.refresh_token ?? row?.access_token;
    if (token) {
      const res = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
      if (!res.ok) console.error(`Google revoke failed [${res.status}]: ${await res.text()}`);
    }
    const { error } = await supabaseAdmin.from("google_connections").delete().eq("partner_id", partnerId as string);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
