import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Copy, Printer } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, LoadingRows } from "@/components/crm/page-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, titleise, usePartners } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/opportunities/$opportunityId/handover")({
  head: () => ({
    meta: [
      { title: "Handover Summary | AOM CRM" },
      { name: "description", content: "Engagement handover summary for a won AOM deal." },
      { property: "og:title", content: "Handover Summary | AOM CRM" },
      { property: "og:description", content: "Client, services, fees, commitments and timeline for a won engagement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HandoverPage,
});

function useHandover(id: string) {
  return useQuery({
    queryKey: ["handover", id],
    queryFn: async () => {
      const { data: opp, error } = await supabase
        .from("opportunities")
        .select("*, organisations(*), opportunity_service_lines(service_lines(name)), opportunity_collaborators(partner_id)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      if (!opp) return null;
      const [contacts, allocs, meetings, docs, renewal] = await Promise.all([
        supabase.from("contacts").select("*").eq("organisation_id", opp.organisation_id).order("is_decision_maker", { ascending: false }).order("name"),
        supabase.from("revenue_allocations").select("*").eq("opportunity_id", id).order("created_at"),
        supabase.from("meetings").select("*").eq("opportunity_id", id).order("meeting_date"),
        supabase.from("documents").select("*").eq("opportunity_id", id).order("doc_type").order("version", { ascending: false }),
        supabase.from("opportunities").select("id, title, expected_close_date").eq("renewal_of_opportunity_id", id).maybeSingle(),
      ]);
      return { opp, contacts: contacts.data ?? [], allocs: allocs.data ?? [], meetings: meetings.data ?? [], docs: docs.data ?? [], renewal: renewal.data };
    },
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid space-y-2">
      <h2 className="border-b-2 border-highlight pb-1 font-display text-base font-semibold text-navy">{title}</h2>
      {children}
    </section>
  );
}

function HandoverPage() {
  const { opportunityId } = Route.useParams();
  const { data, isLoading } = useHandover(opportunityId);
  const { data: partners = [] } = usePartners();
  const pname = (id: string | null | undefined) => partners.find((p) => p.id === id)?.name ?? "—";

  if (isLoading) return <LoadingRows />;
  if (!data) return <EmptyState title="Opportunity not found" description="It may be restricted or removed." />;
  const { opp, contacts, allocs, meetings, docs, renewal } = data;
  const org = opp.organisations;
  const gross = Number(opp.estimated_gross_fee ?? 0);
  const exp = Number(opp.estimated_expenses ?? 0);
  const blocks = (k: "requirements_identified" | "commitments" | "objections") =>
    meetings.filter((m) => m[k]?.trim()).map((m) => ({ id: m.id, date: m.meeting_date, text: m[k] as string }));
  const scope = [...(opp.requirements ? [{ id: "opp", date: null as string | null, text: opp.requirements }] : []), ...blocks("requirements_identified")];
  const commitments = blocks("commitments");
  const objections = [...blocks("objections"), ...(opp.blockers ? [{ id: "blk", date: null as string | null, text: opp.blockers }] : [])];
  const firstMeeting = meetings.find((m) => m.type === "meeting");
  const list = (items: { id: string; date: string | null; text: string }[]) =>
    items.length === 0 ? <p className="text-sm text-muted-foreground">None recorded.</p> : (
      <ul className="space-y-1.5 text-sm">{items.map((i) => <li key={i.id} className="whitespace-pre-wrap">{i.date && <span className="text-muted-foreground">{formatDate(i.date)} — </span>}{i.text}</li>)}</ul>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-6 bg-background p-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to="/opportunities/$opportunityId" params={{ opportunityId }} className="inline-flex items-center gap-1 text-sm text-accent hover:underline"><ArrowLeft className="size-4" /> Back to opportunity</Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); }}><Copy /> Copy link</Button>
          <Button size="sm" onClick={() => window.print()}><Printer /> Print / Save as PDF</Button>
        </div>
      </div>

      <header className="space-y-1 border-b-4 border-highlight pb-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">A O Mittal &amp; Associates LLP · Handover Summary</p>
        <h1 className="font-display text-2xl font-semibold text-navy">{org?.name}</h1>
        <p className="text-sm">{opp.title}{opp.stage !== "converted" && <strong className="ml-2 text-accent">(not converted)</strong>}</p>
      </header>

      <Section title="Client">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {[["Group / parent", org?.group_parent], ["Industry", org?.industry], ["City", org?.city], ["Home branch", org?.home_branch], ["Phone", org?.phone], ["Email", org?.email], ["Website", org?.website],
            ["Relationship owner", pname(org?.relationship_owner_partner_id)], ["Deal owner", pname(opp.owner_partner_id)],
            ["Collaborators", opp.opportunity_collaborators.map((c) => pname(c.partner_id)).join(", ") || "—"], ["Execution mode", titleise(opp.execution_mode)]].map(([k, v]) => (
            <div key={k} className="flex gap-2"><dt className="w-36 shrink-0 text-muted-foreground">{k}</dt><dd>{v || "—"}</dd></div>
          ))}
        </dl>
      </Section>

      <Section title="Contacts">
        {contacts.length === 0 ? <p className="text-sm text-muted-foreground">No contacts.</p> : (
          <table className="w-full text-sm"><tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="py-1 font-medium">{c.name}{c.is_decision_maker && <span className="ml-2 text-xs text-accent">Decision-maker</span>}</td>
                <td className="py-1">{[c.designation, c.role && titleise(c.role)].filter(Boolean).join(" · ") || "—"}</td>
                <td className="py-1 text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </Section>

      <Section title="Engagement">
        <p className="text-sm"><span className="text-muted-foreground">Services won: </span>{opp.opportunity_service_lines.map((s) => s.service_lines?.name).filter(Boolean).join(", ") || "—"}</p>
        <div className="grid gap-2 text-sm sm:grid-cols-4">
          <div><p className="text-muted-foreground">Gross fee</p><p className="font-semibold">{formatCurrency(gross)}</p></div>
          <div><p className="text-muted-foreground">Expenses</p><p className="font-semibold">{formatCurrency(exp)}</p></div>
          <div><p className="text-muted-foreground">Net profit</p><p className="font-semibold">{formatCurrency(gross - exp)}</p></div>
          <div><p className="text-muted-foreground">Start date</p><p className="font-semibold">{formatDate(opp.engagement_start_date)}</p></div>
        </div>
        <p className="text-sm"><span className="text-muted-foreground">Recurring: </span>{opp.is_recurring_engagement ? "Yes" : "No"} · <span className="text-muted-foreground">Template: </span>{opp.sharing_template ?? "—"}</p>
        {allocs.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th>Beneficiary</th><th>Component</th><th>Base</th><th className="text-right">Share</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{allocs.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="py-1">{a.beneficiary_partner_id ? pname(a.beneficiary_partner_id) : a.beneficiary_branch ?? titleise(a.beneficiary_type)}</td>
                <td>{titleise(a.component)}</td><td>{titleise(a.base)}</td>
                <td className="text-right">{Number(a.share_pct)}%</td><td className="text-right">{formatCurrency(Number(a.computed_amount))}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>

      <Section title="Scope and requirements">{list(scope)}</Section>
      <Section title="Commitments made by AOM">{list(commitments)}</Section>
      <Section title="Objections and sensitivities">{list(objections)}</Section>

      <Section title="Key dates">
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          <li><span className="text-muted-foreground">Opportunity created: </span>{formatDate(opp.created_at)}</li>
          <li><span className="text-muted-foreground">First meeting: </span>{formatDate(firstMeeting?.meeting_date)}</li>
          <li><span className="text-muted-foreground">Won: </span>{formatDate(opp.converted_at)}</li>
          <li><span className="text-muted-foreground">Engagement start: </span>{formatDate(opp.engagement_start_date)}</li>
          <li><span className="text-muted-foreground">Conflict check: </span>{opp.conflict_check_confirmed ? `${pname(opp.conflict_check_by)}, ${formatDate(opp.conflict_check_at)}` : "—"}</li>
          {renewal && <li><span className="text-muted-foreground">Renewal expected: </span>{formatDate(renewal.expected_close_date)}</li>}
        </ul>
      </Section>

      <Section title="Interaction timeline">
        {meetings.length === 0 ? <p className="text-sm text-muted-foreground">No interactions logged.</p> : (
          <ol className="space-y-2 text-sm">{[...meetings].reverse().map((m) => (
            <li key={m.id} className="break-inside-avoid border-l-2 border-highlight pl-3">
              <p className="font-medium">{formatDate(m.meeting_date)} · {titleise(m.type)}{m.duration_minutes ? ` · ${m.duration_minutes} min` : ""}</p>
              {m.summary && <p className="whitespace-pre-wrap">{m.summary}</p>}
              {m.decisions && <p><span className="text-muted-foreground">Decisions: </span>{m.decisions}</p>}
              <p className="text-muted-foreground">Next: {m.next_step} ({formatDate(m.next_step_date)})</p>
            </li>
          ))}</ol>
        )}
      </Section>

      <Section title="Documents">
        {docs.length === 0 ? <p className="text-sm text-muted-foreground">No documents.</p> : (
          <ul className="space-y-1 text-sm">{docs.map((d) => <li key={d.id}>{titleise(d.doc_type)} v{d.version} · {d.file_name} <span className="text-muted-foreground">({formatDate(d.uploaded_at)})</span></li>)}</ul>
        )}
      </Section>
    </div>
  );
}
