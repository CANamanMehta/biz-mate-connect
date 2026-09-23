import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const invitePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ email: z.string().email(), redirectTo: z.string().url() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin");
    if (roleError || !isAdmin) {
      throw new Response("Forbidden", { status: 403 });
    }

    const normalizedEmail = data.email.trim().toLowerCase();
    const { data: partner, error: partnerError } = await context.supabase
      .from("partners")
      .select("id, active")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (partnerError || !partner?.active) {
      throw new Error("Create an active partner record with this email before sending an invite.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: data.redirectTo,
    });

    if (error) throw error;
    return { ok: true };
  });