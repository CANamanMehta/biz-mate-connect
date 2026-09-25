import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { INTERACTION_TYPES, InteractionCard, LogInteractionButton, MEETING_SELECT, type MeetingRow } from "@/components/crm/interactions";
import { EmptyState, LoadingRows, PageHeader } from "@/components/crm/page-header";
import { supabase } from "@/integrations/supabase/client";
import { usePartners } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/meetings")({
  head: () => ({
    meta: [
      { title: "Meetings | AOM CRM" },
      { name: "description", content: "Every meeting, call, email and note logged across AOM clients." },
      { property: "og:title", content: "Meetings | AOM CRM" },
      { property: "og:description", content: "Interactions, commitments and next steps in one timeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeetingsPage,
});

const selectCls = "h-10 border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function MeetingsPage() {
  const { data: partners = [] } = usePartners();
  const [partner, setPartner] = useState("");
  const [type, setType] = useState("");
  const [org, setOrg] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["interactions", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("meetings").select(MEETING_SELECT).order("meeting_date", { ascending: false }).limit(500);
      if (error) throw error;
      return data as unknown as MeetingRow[];
    },
  });

  const orgs = useMemo(() => {
    const map = new Map<string, string>();
    data.forEach((m) => m.organisations && map.set(m.organisations.id, m.organisations.name));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const filtered = data.filter(
    (m) =>
      (!type || m.type === type) &&
      (!org || m.organisation_id === org) &&
      (!partner || m.created_by === partner || m.meeting_partners.some((p) => p.partner_id === partner)),
  );
  const now = Date.now();
  const upcoming = filtered.filter((m) => new Date(m.meeting_date).getTime() > now).reverse();
  const past = filtered.filter((m) => new Date(m.meeting_date).getTime() <= now);

  return (
    <div className="space-y-6">
      <PageHeader title="Meetings" description="All interactions, newest first." actions={<LogInteractionButton />} />
      <div className="flex flex-wrap gap-2">
        <select className={selectCls} value={partner} onChange={(e) => setPartner(e.target.value)} aria-label="Filter by partner">
          <option value="">All partners</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {INTERACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className={selectCls} value={org} onChange={(e) => setOrg(e.target.value)} aria-label="Filter by organisation">
          <option value="">All organisations</option>
          {orgs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      {isLoading && <LoadingRows />}

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase text-accent">Upcoming</h2>
          {upcoming.map((m) => <InteractionCard key={m.id} m={m} showContext />)}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase text-muted-foreground">Recent</h2>
        {!isLoading && past.length === 0 && <EmptyState title="No interactions logged" description="Use Log interaction to record a meeting, call or note." />}
        {past.map((m) => <InteractionCard key={m.id} m={m} showContext />)}
      </section>
    </div>
  );
}
