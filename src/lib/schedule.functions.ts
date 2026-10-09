import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  organisationId: z.string().uuid(),
  opportunityId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(200),
  start: z.string().datetime({ offset: true }),
  durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]),
  location: z.string().max(300).nullable(),
  addMeet: z.boolean(),
  contactIds: z.array(z.string().uuid()).max(50),
  partnerIds: z.array(z.string().uuid()).max(50),
  notes: z.string().max(4000).nullable(),
});

export const scheduleMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: partnerId } = await sb.rpc("current_partner_id");
    if (!partnerId) throw new Error("No partner linked to this account");
    if (data.opportunityId) {
      const { data: ok } = await sb.rpc("can_access_opportunity", { _opportunity_id: data.opportunityId });
      if (!ok) throw new Error("You don't have access to this opportunity");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn } = await supabaseAdmin
      .from("google_connections")
      .select("access_token, refresh_token, expires_at")
      .eq("partner_id", partnerId as string)
      .maybeSingle();
    if (!conn) throw new Error("Connect Google Calendar first");

    let accessToken = conn.access_token;
    if (!accessToken || !conn.expires_at || new Date(conn.expires_at).getTime() < Date.now() + 60_000) {
      if (!conn.refresh_token) throw new Error("Google connection expired — reconnect Google Calendar");
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env["GOOGLE_CLIENT_ID"] ?? "",
          client_secret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
          refresh_token: conn.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`Google token refresh failed [${res.status}]: ${body}`);
        throw new Error("Google connection expired — reconnect Google Calendar");
      }
      const tok = (await res.json()) as { access_token: string; expires_in: number };
      accessToken = tok.access_token;
      await supabaseAdmin
        .from("google_connections")
        .update({ access_token: tok.access_token, expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString() })
        .eq("partner_id", partnerId as string);
    }

    const [contacts, partners] = await Promise.all([
      data.contactIds.length
        ? sb.from("contacts").select("id, email").in("id", data.contactIds).eq("organisation_id", data.organisationId)
        : Promise.resolve({ data: [] as { id: string; email: string | null }[] }),
      data.partnerIds.length
        ? sb.from("partners").select("id, email").in("id", data.partnerIds)
        : Promise.resolve({ data: [] as { id: string; email: string }[] }),
    ]);
    const emails = [...new Set([...(contacts.data ?? []), ...(partners.data ?? [])].map((r) => r.email).filter((e): e is string => !!e))];

    const start = new Date(data.start);
    const end = new Date(start.getTime() + data.durationMinutes * 60_000);
    const event: Record<string, unknown> = {
      summary: data.title,
      description: data.notes ?? undefined,
      location: data.addMeet ? undefined : data.location ?? undefined,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: emails.map((email) => ({ email })),
    };
    if (data.addMeet) {
      event["conferenceData"] = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
    }
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1",
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(`Google Calendar create failed [${res.status}]: ${body}`);
      throw new Error(`Google Calendar error [${res.status}]: ${body.slice(0, 300)}`);
    }
    const created = (await res.json()) as { id: string; hangoutLink?: string };

    const { data: meeting, error } = await sb
      .from("meetings")
      .insert({
        organisation_id: data.organisationId,
        opportunity_id: data.opportunityId,
        type: "meeting",
        meeting_date: start.toISOString(),
        duration_minutes: data.durationMinutes,
        location_or_link: created.hangoutLink ?? data.location,
        agenda: data.title,
        summary: data.notes,
        next_step: `Attend: ${data.title}`,
        next_step_date: start.toISOString().slice(0, 10),
        created_by: partnerId as string,
        status: "scheduled",
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        calendar_event_id: created.id,
        meet_link: created.hangoutLink ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Event created in Google Calendar, but saving in CRM failed: ${error.message}`);

    if (data.partnerIds.length)
      await sb.from("meeting_partners").insert(data.partnerIds.map((partner_id) => ({ meeting_id: meeting.id, partner_id })));
    if (data.contactIds.length)
      await sb.from("meeting_contacts").insert(data.contactIds.map((contact_id) => ({ meeting_id: meeting.id, contact_id })));

    return { id: meeting.id, meetLink: created.hangoutLink ?? null };
  });
