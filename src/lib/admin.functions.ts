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

export const setPartnerPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        partnerId: z.string().uuid(),
        password: z
          .string()
          .min(8, "Password must be at least 8 characters")
          .max(72, "Password must be 72 characters or fewer"),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin");
    if (roleError || !isAdmin) {
      throw new Response("Forbidden", { status: 403 });
    }

    const { data: partner, error: partnerError } = await context.supabase
      .from("partners")
      .select("id, email, active")
      .eq("id", data.partnerId)
      .maybeSingle();

    if (partnerError || !partner) throw new Error("Partner record not found.");
    if (!partner.active) throw new Error("Activate this partner before setting a password.");

    const email = partner.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find an existing auth account for this email.
    let userId: string | null = null;
    for (let page = 1; page <= 20 && !userId; page += 1) {
      const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (listError) throw listError;
      const match = list.users.find((user) => (user.email ?? "").toLowerCase() === email);
      if (match) userId = match.id;
      if (list.users.length < 200) break;
    }

    if (userId) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: data.password,
        email_confirm: true,
      });
      if (updateError) throw updateError;
    } else {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
      });
      if (createError) throw createError;
      userId = created.user?.id ?? null;
    }

    if (!userId) throw new Error("Could not create the login for this partner.");

    // Point the partner record and its role at the real login account.
    const { error: linkError } = await supabaseAdmin
      .from("partners")
      .update({ user_id: userId })
      .eq("id", partner.id);
    if (linkError) throw linkError;

    const { error: roleLinkError } = await supabaseAdmin
      .from("user_roles")
      .update({ user_id: userId })
      .eq("partner_id", partner.id);
    if (roleLinkError) throw roleLinkError;

    return { ok: true, email };
  });