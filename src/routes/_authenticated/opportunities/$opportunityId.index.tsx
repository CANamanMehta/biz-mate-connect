import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileCheck2, Lock, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { InteractionTimeline, LogInteractionButton } from "@/components/crm/interactions";
import { EmptyState, LoadingRows } from "@/components/crm/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConversionWizard, UndoConversionButton, useStartConversion } from "@/components/crm/conversion";
import { InlineNumber, InlineText, RevenueSplit } from "@/components/crm/revenue-split";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  ACQUISITION_SOURCES,
  formatCurrency,
  formatDate,
  titleise,
  useBranches,
  useCurrentPartner,
  usePartners,
  useServiceLines,
  type OpportunityStage,
  type Partner,
  STAGES,
  stageLabel,
} from "@/lib/crm";
import { DocumentsPanel } from "@/components/crm/documents";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/opportunities/$opportunityId/")({
  head: () => ({
    meta: [
      { title: "Opportunity | AOM CRM" },
      { name: "description", content: "Opportunity details, revenue split, meetings and tasks." },
      { property: "og:title", content: "Opportunity | AOM CRM" },
      { property: "og:description", content: "Everything about one AOM opportunity in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OpportunityPage,
});

type Enums = Database["public"]["Enums"];
type OppUpdate = Database["public"]["Tables"]["opportunities"]["Update"];

const EXEC_MODES: Enums["execution_mode"][] = ["solo", "collaboration", "ho_executed", "branch_executed", "split_ho_branch"];
const selectCls = "h-9 w-full border border-input bg-background px-2 text-sm";

const SELECT =
  "*, organisations(id, name, home_branch, relationship_owner_type, relationship_owner_partner_id, relationship_owner_branch), opportunity_service_lines(id, service_line_id), opportunity_collaborators(id, partner_id)";

function useOpportunity(id: string) {
  return useQuery({
    queryKey: ["opportunity", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunities").select(SELECT).eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
type Opp = NonNullable<ReturnType<typeof useOpportunity>["data"]>;

function OpportunityPage() {
  const { opportunityId } = Route.useParams();
  const qc = useQueryClient();
  const { data: opp, isLoading } = useOpportunity(opportunityId);
  const { data: me } = useCurrentPartner();
  const { data: partners = [] } = usePartners();
  const [convertId, setConvertId] = useState<string | null>(null);
  const startConversion = useStartConversion(setConvertId);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["opportunity", opportunityId] });
    qc.invalidateQueries({ queryKey: ["opp-history", opportunityId] });
    qc.invalidateQueries({ queryKey: ["opp-allocations", opportunityId] });
  };

  const save = useMutation({
    mutationFn: async ({ patch, label }: { patch: OppUpdate; label: string }) => {
      if (!opp) return;
      const { probability, ...rest } = patch;
      if (probability !== undefined && probability !== null) {
        const { error } = await supabase.rpc("set_opportunity_probability", { _opportunity_id: opp.id, _probability: probability });
        if (error) throw error;
        if (Object.keys(rest).length === 0) return;
      }
      const { error } = await supabase.from("opportunities").update(rest).eq("id", opp.id);
      if (error) throw error;
      if (me) {
        await supabase.from("activity_log").insert({
          organisation_id: opp.organisation_id, opportunity_id: opp.id, actor_partner_id: me.partner.id,
          action: "opportunity_updated", detail: `Updated ${label}`,
        });
      }
    },
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const saveField = (patch: OppUpdate, label: string) => save.mutate({ patch, label });

  const moveStage = useMutation({
    mutationFn: async (stage: OpportunityStage) => {
      const p = STAGES.find((s) => s.value === stage)!.probability;
      const { error } = await supabase.rpc("move_opportunity_stage", { _opportunity_id: opportunityId, _stage: stage, _probability: p });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Stage updated"); refresh(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <LoadingRows />;
  if (!opp) return <EmptyState title="Opportunity not found" description="It may be restricted or removed." />;
  const owner = partners.find((p) => p.id === opp.owner_partner_id);

  return (
    <div className="space-y-5">
      <header className="space-y-3 border-b border-border pb-5">
        {opp.organisations && (
          <Link to="/organisations/$organisationId" params={{ organisationId: opp.organisations.id }} className="text-sm font-medium text-accent hover:underline">
            {opp.organisations.name}
          </Link>
        )}
        <div className="flex items-center gap-2">
          {opp.is_restricted && <Lock className="size-5 text-accent" aria-label="Restricted" />}
          <InlineText value={opp.title} onSave={(v) => v && saveField({ title: v }, "title")} className="font-display text-2xl font-semibold text-primary" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Stage">
            <select className={selectCls} value={opp.stage} onChange={(e) => {
              const s = e.target.value as OpportunityStage;
              if (s === "converted") startConversion(opp); else moveStage.mutate(s);
            }}>
              {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Status"><div className="pt-1.5"><Badge variant="outline">{titleise(opp.status)}</Badge></div></Field>
          <Field label="Owner">
            <select className={selectCls} value={opp.owner_partner_id} onChange={(e) => saveField({ owner_partner_id: e.target.value }, "owner")}>
              {partners.filter((p) => p.active || p.id === opp.owner_partner_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Probability %">
            <InlineNumber value={opp.probability} onSave={(v) => saveField({ probability: Math.max(0, Math.min(100, Math.round(v ?? 0))) }, "probability")} />
          </Field>
          <Field label="Restricted">
            <div className="flex items-center gap-2 pt-1.5">
              <Switch checked={opp.is_restricted} onCheckedChange={(v) => saveField({ is_restricted: v }, v ? "restricted on" : "restricted off")} />
              <span className="text-xs text-muted-foreground">{opp.is_restricted ? "Owner, collaborators & admins only" : "Visible to all partners"}</span>
            </div>
          </Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {opp.stage === "converted" ? (
            <UndoConversionButton opportunityId={opp.id} convertedAt={opp.converted_at} />
          ) : opp.status === "open" && (
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => startConversion(opp)}><Trophy /> Mark as won</Button>
          )}
          <LogInteractionButton opportunityId={opp.id} />
        </div>
        <Collaborators opp={opp} partners={partners} meId={me?.partner.id} onChange={refresh} ownerName={owner?.name} />
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          {["overview", "meetings", "tasks", "documents", "revenue", "costs", "history"].map((t) => (
            <TabsTrigger key={t} value={t}>{t === "revenue" ? "Revenue Split" : titleise(t)}</TabsTrigger>
          ))}
          {opp.stage === "converted" && (
            <Link to="/opportunities/$opportunityId/handover" params={{ opportunityId: opp.id }} className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium text-accent hover:underline">
              <FileCheck2 className="size-4" /> Handover
            </Link>
          )}
        </TabsList>
        <TabsContent value="overview" className="pt-5"><Overview opp={opp} partners={partners} saveField={saveField} onChange={refresh} /></TabsContent>
        <TabsContent value="meetings" className="pt-5"><InteractionTimeline opportunityId={opp.id} /></TabsContent>
        <TabsContent value="tasks" className="pt-5"><Tasks id={opp.id} partners={partners} /></TabsContent>
        <TabsContent value="documents" className="pt-5"><DocumentsPanel organisationId={opp.organisation_id} opportunityId={opp.id} /></TabsContent>
        <TabsContent value="revenue" className="pt-5"><RevenueSplit opp={opp} partners={partners} meId={me?.partner.id} onChange={refresh} /></TabsContent>
        <TabsContent value="costs" className="pt-5"><EmptyState title="Costs coming soon" description="Lead costs for this opportunity will appear here." /></TabsContent>
        <TabsContent value="history" className="pt-5"><History id={opp.id} partners={partners} /></TabsContent>
      </Tabs>

      <ConversionWizard opportunityId={convertId} onClose={() => setConvertId(null)} />
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}


function Collaborators({ opp, partners, meId, onChange, ownerName }: { opp: Opp; partners: Partner[]; meId: string | undefined; onChange: () => void; ownerName: string | undefined }) {
  const add = useMutation({
    mutationFn: async (partnerId: string) => {
      const { error } = await supabase.from("opportunity_collaborators").insert({ opportunity_id: opp.id, partner_id: partnerId, created_by: meId ?? null });
      if (error) throw error;
      const name = partners.find((p) => p.id === partnerId)?.name;
      if (meId) await supabase.from("activity_log").insert({ organisation_id: opp.organisation_id, opportunity_id: opp.id, actor_partner_id: meId, action: "collaborator_added", detail: `Added ${name}` });
    },
    onSuccess: onChange, onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (c: { id: string; partner_id: string }) => {
      const { error } = await supabase.from("opportunity_collaborators").delete().eq("id", c.id);
      if (error) throw error;
      const name = partners.find((p) => p.id === c.partner_id)?.name;
      if (meId) await supabase.from("activity_log").insert({ organisation_id: opp.organisation_id, opportunity_id: opp.id, actor_partner_id: meId, action: "collaborator_removed", detail: `Removed ${name}` });
    },
    onSuccess: onChange, onError: (e) => toast.error(e.message),
  });
  const taken = new Set([opp.owner_partner_id, ...opp.opportunity_collaborators.map((c) => c.partner_id)]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-xs text-muted-foreground">Owner: <strong className="text-foreground">{ownerName ?? "—"}</strong> · Collaborators:</span>
      {opp.opportunity_collaborators.map((c) => (
        <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs text-primary-foreground">
          {partners.find((p) => p.id === c.partner_id)?.name ?? "Partner"}
          <button aria-label="Remove collaborator" onClick={() => remove.mutate(c)}><X className="size-3" /></button>
        </span>
      ))}
      <select className="h-8 border border-input bg-background px-2 text-xs" value="" onChange={(e) => e.target.value && add.mutate(e.target.value)} aria-label="Add collaborator">
        <option value="">+ Add collaborator</option>
        {partners.filter((p) => p.active && !taken.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

function Overview({ opp, partners, saveField, onChange }: { opp: Opp; partners: Partner[]; saveField: (p: OppUpdate, l: string) => void; onChange: () => void }) {
  const { data: serviceLines = [] } = useServiceLines();
  const { data: contacts = [] } = useQuery({
    queryKey: ["org-contacts", opp.organisation_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, name, designation, phone, email, is_decision_maker").eq("organisation_id", opp.organisation_id).order("name");
      if (error) throw error;
      return data;
    },
  });
  const toggleService = useMutation({
    mutationFn: async (serviceLineId: string) => {
      const existing = opp.opportunity_service_lines.find((s) => s.service_line_id === serviceLineId);
      const { error } = existing
        ? await supabase.from("opportunity_service_lines").delete().eq("id", existing.id)
        : await supabase.from("opportunity_service_lines").insert({ opportunity_id: opp.id, service_line_id: serviceLineId });
      if (error) throw error;
    },
    onSuccess: onChange, onError: (e) => toast.error(e.message),
  });
  const selected = new Set(opp.opportunity_service_lines.map((s) => s.service_line_id));
  const net = Number(opp.estimated_gross_fee ?? 0) - Number(opp.estimated_expenses ?? 0);
  const decisionMakers = contacts.filter((c) => c.is_decision_maker);

  return (
    <div className="space-y-6">
      <Field label="Service lines">
        <div className="flex flex-wrap gap-1.5">
          {serviceLines.filter((s) => s.active || selected.has(s.id)).map((s) => (
            <button key={s.id} onClick={() => toggleService.mutate(s.id)}
              className={cn("rounded-full border px-3 py-1 text-xs", selected.has(s.id) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
              {s.name}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Estimated gross fee (₹)"><InlineNumber value={Number(opp.estimated_gross_fee)} onSave={(v) => saveField({ estimated_gross_fee: v ?? 0 }, "gross fee")} /></Field>
        <Field label="Estimated expenses (₹)"><InlineNumber value={Number(opp.estimated_expenses)} onSave={(v) => saveField({ estimated_expenses: v ?? 0 }, "expenses")} /></Field>
        <Field label="Estimated net profit"><p className="pt-1.5 text-lg font-semibold text-primary">{formatCurrency(net)}</p></Field>
        <Field label="Expected close date"><InlineText type="date" value={opp.expected_close_date} onSave={(v) => saveField({ expected_close_date: v }, "expected close date")} /></Field>
        <Field label="Acquisition source">
          <select className={selectCls} value={opp.acquisition_source ?? ""} onChange={(e) => saveField({ acquisition_source: (e.target.value || null) as Enums["acquisition_source"] | null }, "acquisition source")}>
            <option value="">—</option>
            {ACQUISITION_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Acquired by partner">
          <select className={selectCls} value={opp.acquired_by_partner_id ?? ""} onChange={(e) => saveField({ acquired_by_partner_id: e.target.value || null }, "acquired by")}>
            <option value="">—</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Referral contact">
          <select className={selectCls} value={opp.referral_contact_id ?? ""} onChange={(e) => saveField({ referral_contact_id: e.target.value || null }, "referral contact")}>
            <option value="">—</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Execution mode">
          <select className={selectCls} value={opp.execution_mode ?? ""} onChange={(e) => saveField({ execution_mode: (e.target.value || null) as Enums["execution_mode"] | null }, "execution mode")}>
            <option value="">—</option>
            {EXEC_MODES.map((m) => <option key={m} value={m}>{titleise(m)}</option>)}
          </select>
        </Field>
        <RelationshipOwner opp={opp} partners={partners} onChange={onChange} />
      </div>

      <div className="grid gap-4 border bg-muted/30 p-3 sm:grid-cols-3">
        <Field label="Research status">
          <select className={selectCls} value={opp.research_status} onChange={(e) => saveField({ research_status: e.target.value as Enums["research_status"] }, "research status")}>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
        </Field>
        <Field label="Research due">
          <Input type="date" className="h-9" defaultValue={opp.research_due_date ?? ""} key={opp.research_due_date ?? "none"} onBlur={(e) => e.target.value !== (opp.research_due_date ?? "") && saveField({ research_due_date: e.target.value || null }, "research due date")} />
        </Field>
        <Field label="Target rationale (why this company, which services)"><InlineText multiline value={opp.target_rationale} onSave={(v) => saveField({ target_rationale: v }, "target rationale")} /></Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Requirements"><InlineText multiline value={opp.requirements} onSave={(v) => saveField({ requirements: v }, "requirements")} /></Field>
        <Field label="Blockers"><InlineText multiline value={opp.blockers} onSave={(v) => saveField({ blockers: v }, "blockers")} /></Field>
        <Field label="Competitors"><InlineText multiline value={opp.competitors} onSave={(v) => saveField({ competitors: v }, "competitors")} /></Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Next action"><InlineText value={opp.next_action} onSave={(v) => saveField({ next_action: v }, "next action")} /></Field>
        <Field label="Next action date"><InlineText type="date" value={opp.next_action_date} onSave={(v) => saveField({ next_action_date: v }, "next action date")} /></Field>
      </div>

      <Field label="Decision-makers">
        {decisionMakers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No decision-makers marked on this organisation's contacts.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {decisionMakers.map((c) => (
              <div key={c.id} className="border border-border p-3 text-sm">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{[c.designation, c.phone, c.email].filter(Boolean).join(" · ") || "—"}</p>
              </div>
            ))}
          </div>
        )}
      </Field>
    </div>
  );
}

function RelationshipOwner({ opp, partners, onChange }: { opp: Opp; partners: Partner[]; onChange: () => void }) {
  const { data: branches = [] } = useBranches();
  const org = opp.organisations;
  const ownerBranch = partners.find((p) => p.id === opp.owner_partner_id)?.branch;
  const suggestion = useMemo(() => {
    switch (opp.execution_mode) {
      case "solo": return { type: "partner" as const, partner: opp.owner_partner_id, branch: null, label: partners.find((p) => p.id === opp.owner_partner_id)?.name ?? "Owner" };
      case "collaboration":
      case "branch_executed": { const b = org?.home_branch ?? ownerBranch ?? null; return { type: "branch" as const, partner: null, branch: b, label: b ?? "Branch" }; }
      case "ho_executed": return { type: "ho" as const, partner: null, branch: null, label: "HO" };
      default: return null;
    }
  }, [opp.execution_mode, opp.owner_partner_id, org?.home_branch, ownerBranch, partners]);

  const set = useMutation({
    mutationFn: async (v: { type: Enums["relationship_owner_type"]; partner: string | null; branch: string | null }) => {
      const { error } = await supabase.rpc("set_relationship_owner_from_opportunity", {
        _opportunity_id: opp.id, _type: v.type,
        ...(v.partner ? { _partner_id: v.partner } : {}),
        ...(v.branch ? { _branch: v.branch } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Relationship owner saved"); onChange(); },
    onError: (e) => toast.error(e.message),
  });

  const current = org?.relationship_owner_type === "partner"
    ? `p:${org.relationship_owner_partner_id ?? ""}`
    : org?.relationship_owner_type === "branch" ? `b:${org.relationship_owner_branch ?? ""}` : org?.relationship_owner_type === "ho" ? "ho" : "";
  const matches = suggestion && current === (suggestion.type === "partner" ? `p:${suggestion.partner}` : suggestion.type === "branch" ? `b:${suggestion.branch}` : "ho");

  return (
    <Field label="Relationship owner (organisation)" className="sm:col-span-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select className={cn(selectCls, "sm:max-w-xs")} value={current} onChange={(e) => {
          const v = e.target.value;
          if (v === "ho") set.mutate({ type: "ho", partner: null, branch: null });
          else if (v.startsWith("p:")) set.mutate({ type: "partner", partner: v.slice(2), branch: null });
          else if (v.startsWith("b:")) set.mutate({ type: "branch", partner: null, branch: v.slice(2) });
        }}>
          <option value="">Not set</option>
          <option value="ho">HO</option>
          <optgroup label="Branches">{branches.map((b) => <option key={b.id} value={`b:${b.name}`}>{b.name}</option>)}</optgroup>
          <optgroup label="Partners">{partners.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}</optgroup>
        </select>
        {suggestion && !matches && (
          <Button size="sm" variant="outline" onClick={() => set.mutate(suggestion)}>Use suggestion: {suggestion.label}</Button>
        )}
      </div>
    </Field>
  );
}


function Tasks({ id, partners }: { id: string; partners: Partner[] }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["opp-tasks", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("id, title, due_date, status, priority, owner_partner_id").eq("opportunity_id", id).order("due_date");
      if (error) throw error;
      return data;
    },
  });
  if (isLoading) return <LoadingRows rows={2} />;
  if (data.length === 0) return <EmptyState title="No tasks yet" />;
  return (
    <div className="space-y-2">
      {data.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-3 border border-border p-3 text-sm">
          <div><p className="font-medium">{t.title}</p><p className="text-xs text-muted-foreground">{partners.find((p) => p.id === t.owner_partner_id)?.name} · due {formatDate(t.due_date)}</p></div>
          <div className="flex gap-1"><Badge variant="outline">{titleise(t.priority)}</Badge><Badge variant={t.status === "open" ? "default" : "secondary"}>{titleise(t.status)}</Badge></div>
        </div>
      ))}
    </div>
  );
}

function History({ id, partners }: { id: string; partners: Partner[] }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["opp-history", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("activity_log").select("id, action, detail, actor_partner_id, created_at").eq("opportunity_id", id).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  if (isLoading) return <LoadingRows rows={3} />;
  if (data.length === 0) return <EmptyState title="No history yet" />;
  return (
    <ol className="space-y-2">
      {data.map((a) => (
        <li key={a.id} className="border-l-2 border-highlight pl-3 text-sm">
          <p className="font-medium">{a.detail ?? titleise(a.action)}</p>
          <p className="text-xs text-muted-foreground">{partners.find((p) => p.id === a.actor_partner_id)?.name ?? "System"} · {new Date(a.created_at).toLocaleString("en-IN")}</p>
        </li>
      ))}
    </ol>
  );
}
