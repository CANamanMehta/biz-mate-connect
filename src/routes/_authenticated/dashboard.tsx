import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { CrossSellIdeas } from "@/components/crm/cross-sell";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { LogInteractionDialog, MEETING_SELECT, type MeetingRow, INTERACTION_TYPES } from "@/components/crm/interactions";
import { PageHeader } from "@/components/crm/page-header";
import { TaskItem, useCompleteTask, useTasks } from "@/components/crm/tasks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  daysSince,
  formatCurrency,
  formatDate,
  isoDay,
  staleLevelFor,
  stageLabel,
  weightedValue,
  useCurrentPartner,
  useOpenTaskOpportunityIds,
  useStaleThresholds,
} from "@/lib/crm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | AOM CRM" },
      { name: "description", content: "Your pipeline, follow-ups and stale opportunities at a glance." },
      { property: "og:title", content: "Dashboard | AOM CRM" },
      { property: "og:description", content: "A O Mittal & Associates LLP partner dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

const OPP_SELECT =
  "id, title, stage, probability, estimated_gross_fee, owner_partner_id, is_restricted, stage_changed_at, last_activity_date, next_action, next_action_date, created_at, organisation_id, organisations(id, name), partners!opportunities_owner_partner_id_fkey(id, name)";

async function fetchOpenOpps() {
  const { data, error } = await supabase.from("opportunities").select(OPP_SELECT).eq("status", "open");
  if (error) throw error;
  return data;
}
type Opp = Awaited<ReturnType<typeof fetchOpenOpps>>[number];

function DashboardPage() {
  const { data: me } = useCurrentPartner();
  const myId = me?.partner.id;
  const [firm, setFirm] = useState(false);
  const { data: opps = [] } = useQuery({ queryKey: ["dashboard", "opps"], queryFn: fetchOpenOpps });
  const { data: tasks = [] } = useTasks("open");
  const { data: thresholds } = useStaleThresholds();
  const { data: withTask } = useOpenTaskOpportunityIds();
  const { data: meetings = [] } = useQuery({
    queryKey: ["dashboard", "meetings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select(MEETING_SELECT)
        .gte("meeting_date", `${isoDay()}T00:00:00`)
        .lt("meeting_date", `${isoDay(7)}T00:00:00`)
        .order("meeting_date");
      if (error) throw error;
      return (data ?? []) as unknown as MeetingRow[];
    },
  });
  const { start, dialog } = useCompleteTask();
  const [logFor, setLogFor] = useState<Opp | null>(null);
  const [parkFor, setParkFor] = useState<Opp | null>(null);

  const today = isoDay();
  const v = useMemo(() => {
    const scope = firm ? opps : opps.filter((o) => o.owner_partner_id === myId);
    const scopeTasks = firm ? tasks : tasks.filter((t) => t.owner_partner_id === myId);
    const live = scope.filter((o) => o.stage !== "converted");
    const stale = thresholds ? live.filter((o) => staleLevelFor(o, thresholds) === "red") : [];
    const gross = live.reduce((s, o) => s + Number(o.estimated_gross_fee), 0);
    const weighted = live.reduce((s, o) => s + weightedValue(o), 0);
    const byPartner = new Map<string, { name: string; count: number; gross: number; weighted: number }>();
    for (const o of opps.filter((x) => x.stage !== "converted")) {
      const key = o.owner_partner_id;
      const row = byPartner.get(key) ?? { name: o.partners?.name ?? "—", count: 0, gross: 0, weighted: 0 };
      row.count += 1;
      row.gross += Number(o.estimated_gross_fee);
      row.weighted += weightedValue(o);
      byPartner.set(key, row);
    }
    return {
      gross,
      weighted,
      stale: stale.sort((a, b) => daysSince(b.last_activity_date ?? b.stage_changed_at) - daysSince(a.last_activity_date ?? a.stage_changed_at)),
      followUps: scopeTasks.filter((t) => t.due_date <= today),
      overdue: scopeTasks.filter((t) => t.due_date < today).length,
      hot: live.filter((o) => o.stage === "proposal" || o.stage === "negotiation").sort((a, b) => Number(b.estimated_gross_fee) - Number(a.estimated_gross_fee)),
      newEnquiries: scope
        .filter((o) => o.stage === "outreach" && daysSince(o.created_at) <= 7)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      noNext: withTask ? live.filter((o) => !withTask.has(o.id)) : [],
      meetings: firm ? meetings : meetings.filter((m) => m.created_by === myId || m.meeting_partners.some((p) => p.partner_id === myId)),
      byPartner: [...byPartner.values()].sort((a, b) => b.gross - a.gross),
    };
  }, [firm, opps, tasks, meetings, thresholds, withTask, myId, today]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={firm ? "Firm view" : `Hello${me ? `, ${me.partner.name.split(" ")[0]}` : ""}`}
        description={firm ? "All partners combined." : "Your day at a glance."}
        actions={
          <div className="flex items-center gap-2">
            <Switch id="firm" checked={firm} onCheckedChange={setFirm} />
            <Label htmlFor="firm">Firm view</Label>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={firm ? "Open pipeline" : "My open pipeline"} value={formatCurrency(v.gross)} />
        <Tile label={firm ? "Weighted pipeline" : "My weighted pipeline"} value={formatCurrency(Math.round(v.weighted))} />
        <Tile label="Overdue tasks" value={String(v.overdue)} danger={v.overdue > 0} />
        <Tile label="Stale opportunities" value={String(v.stale.length)} danger={v.stale.length > 0} />
      </div>

      {firm && (
        <section className="overflow-x-auto border bg-background">
          <h2 className="border-b px-3 py-2 font-display text-sm font-semibold text-primary">Pipeline by partner</h2>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Partner</th><th className="px-3 py-2 text-right">Open</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">Weighted</th></tr>
            </thead>
            <tbody>
              {v.byPartner.map((r) => (
                <tr key={r.name} className="border-t">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right">{r.count}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(r.gross)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(Math.round(r.weighted))}</td>
                </tr>
              ))}
              {v.byPartner.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-muted-foreground">No open opportunities.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Today's & overdue follow-ups" count={v.followUps.length} to="/tasks">
          {v.followUps.slice(0, 5).map((t) => <TaskItem key={t.id} task={t} onComplete={start} compact />)}
        </Section>

        <Section title="This week's meetings" count={v.meetings.length} to="/meetings">
          {v.meetings.slice(0, 5).map((m) => {
            const T = INTERACTION_TYPES.find((x) => x.value === m.type);
            return (
              <div key={m.id} className="flex items-center gap-3 border-b px-3 py-2.5 text-sm last:border-b-0">
                {T && <T.icon className="size-4 shrink-0 text-accent" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.organisations?.name ?? "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.agenda ?? m.summary ?? m.next_step}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(m.meeting_date).toLocaleString("en-IN", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
        </Section>

        <Section title="Stale opportunities" count={v.stale.length} to="/pipeline">
          {v.stale.slice(0, 5).map((o) => (
            <OppLine key={o.id} o={o} meta={`${daysSince(o.last_activity_date ?? o.stage_changed_at)}d no activity · ${stageLabel(o.stage)}`} danger>
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setLogFor(o)}>Log update</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setParkFor(o)}>Park</Button>
            </OppLine>
          ))}
        </Section>

        <Section title="Hot opportunities" count={v.hot.length} to="/pipeline">
          {v.hot.slice(0, 5).map((o) => (
            <OppLine key={o.id} o={o} meta={`${stageLabel(o.stage)} · ${o.probability}%`}>
              <span className="text-sm font-semibold">{formatCurrency(Number(o.estimated_gross_fee))}</span>
            </OppLine>
          ))}
        </Section>

        <Section title={firm ? "New enquiries (7 days)" : "New enquiries assigned to me"} count={v.newEnquiries.length} to="/enquiries">
          {v.newEnquiries.slice(0, 5).map((o) => (
            <OppLine key={o.id} o={o} meta={`Created ${formatDate(o.created_at)}${firm ? ` · ${o.partners?.name ?? ""}` : ""}`} />
          ))}
        </Section>

        <Section title="No next action" count={v.noNext.length} to="/pipeline">
          {v.noNext.slice(0, 5).map((o) => (
            <OppLine key={o.id} o={o} meta={`${stageLabel(o.stage)} · no open task`}>
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setLogFor(o)}>Log update</Button>
            </OppLine>
          ))}
        </Section>

        <CrossSellIdeas firm={firm} />
      </div>

      {dialog}
      {logFor && (
        <LogInteractionDialog open onOpenChange={(o) => !o && setLogFor(null)} organisationId={logFor.organisation_id} opportunityId={logFor.id} />
      )}
      <ParkDialog opp={parkFor} onClose={() => setParkFor(null)} />
    </div>
  );
}

function Tile({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={cn("border bg-background p-3", danger && "border-destructive")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 truncate font-display text-lg font-semibold text-primary sm:text-xl", danger && "text-destructive")}>{value}</p>
    </div>
  );
}

function Section({ title, count, to, children }: { title: string; count: number; to: "/tasks" | "/meetings" | "/pipeline" | "/enquiries"; children: ReactNode }) {
  return (
    <section className="border bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="font-display text-sm font-semibold text-primary">{title} <span className="text-muted-foreground">({count})</span></h2>
        <Link to={to} className="text-xs font-medium text-accent hover:underline">See all</Link>
      </div>
      {count === 0 ? <p className="px-3 py-3 text-sm text-muted-foreground">Nothing here.</p> : children}
    </section>
  );
}

function OppLine({ o, meta, danger, children }: { o: Opp; meta: string; danger?: boolean; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <Link to="/opportunities/$opportunityId" params={{ opportunityId: o.id }} className="flex items-center gap-1 truncate text-sm font-medium text-primary hover:underline">
          {o.is_restricted && <Lock className="size-3 shrink-0 text-accent" />}
          {o.organisations?.name ?? o.title}
        </Link>
        <p className={cn("truncate text-xs text-muted-foreground", danger && "text-destructive")}>{meta}</p>
      </div>
      {children && <div className="flex shrink-0 items-center gap-1">{children}</div>}
    </div>
  );
}

function ParkDialog({ opp, onClose }: { opp: Opp | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(isoDay(30));
  const park = useMutation({
    mutationFn: async () => {
      if (!opp) return;
      const { error } = await supabase.rpc("set_opportunity_status", { _opportunity_id: opp.id, _action: "hold", _revisit_date: date });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Put on hold");
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["pipeline"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={!!opp} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Park {opp?.organisations?.name}</DialogTitle>
          <DialogDescription>Puts the opportunity on hold until the revisit date.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="revisit">Revisit on</Label>
          <Input id="revisit" type="date" min={isoDay(1)} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <DialogFooter>
          <Button disabled={!date || park.isPending} onClick={() => park.mutate()}>Put on hold</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
