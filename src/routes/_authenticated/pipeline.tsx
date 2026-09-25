import { LogInteractionDialog } from "@/components/crm/interactions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpDown, KanbanSquare, List, Lock, MoreHorizontal, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { EmptyState, LoadingRows, PageHeader } from "@/components/crm/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  ACQUISITION_SOURCES,
  formatCurrency,
  formatDate,
  titleise,
  useBranches,
  useCurrentPartner,
  useOpenTaskOpportunityIds,
  usePartners,
  useServiceLines,
  type OpportunityStage,
} from "@/lib/crm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline | AOM CRM" },
      { name: "description", content: "AOM opportunity pipeline across every stage." },
      { property: "og:title", content: "Pipeline | AOM CRM" },
      { property: "og:description", content: "Track AOM opportunities from enquiry through conversion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PipelinePage,
});

type LostReason = Database["public"]["Enums"]["lost_reason"];

const STAGES: { value: OpportunityStage; label: string; probability: number }[] = [
  { value: "enquiry", label: "Enquiry", probability: 10 },
  { value: "qualified_lead", label: "Qualified Lead", probability: 30 },
  { value: "meeting_discovery", label: "Meeting/Discovery", probability: 40 },
  { value: "proposal", label: "Proposal", probability: 50 },
  { value: "negotiation", label: "Negotiation", probability: 75 },
  { value: "converted", label: "Converted", probability: 100 },
];
const LOST_REASONS: LostReason[] = ["price", "competitor", "no_budget", "no_decision", "in_house", "timing", "other"];
const DAY = 86_400_000;

type Thresholds = { default_days: number; late_stage_days: number; warning_days: number };
const DEFAULT_THRESHOLDS: Thresholds = { default_days: 14, late_stage_days: 10, warning_days: 3 };

const SELECT =
  "id, title, stage, status, probability, estimated_gross_fee, owner_partner_id, acquisition_source, is_restricted, stage_changed_at, last_activity_date, next_action, next_action_date, on_hold_revisit_date, lost_reason, lost_note, updated_at, organisations(id, name), partners!opportunities_owner_partner_id_fkey(id, name, branch), opportunity_service_lines(service_line_id, service_lines(name))";

async function fetchOpps(statuses: Database["public"]["Enums"]["opportunity_status"][]) {
  const { data, error } = await supabase.from("opportunities").select(SELECT).in("status", statuses).order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}
type Opp = Awaited<ReturnType<typeof fetchOpps>>[number];

const daysSince = (d: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : 0);
const initials = (name?: string | null) =>
  (name ?? "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

function staleLevel(o: Opp, t: Thresholds): "red" | "amber" | null {
  if (o.stage === "converted") return null;
  const limit = o.stage === "proposal" || o.stage === "negotiation" ? t.late_stage_days : t.default_days;
  const days = daysSince(o.last_activity_date ?? o.stage_changed_at);
  if (days > limit) return "red";
  if (days > limit - t.warning_days) return "amber";
  return null;
}

type Pending =
  | { kind: "move"; opp: Opp; stage: OpportunityStage; probability: number }
  | { kind: "convert"; opp: Opp }
  | { kind: "hold" | "lost" | "disqualify"; opp: Opp };

function PipelinePage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentPartner();
  const { data: partners = [] } = usePartners();
  const { data: branches = [] } = useBranches();
  const { data: serviceLines = [] } = useServiceLines();

  const { data: open = [], isLoading } = useQuery({ queryKey: ["pipeline", "open"], queryFn: () => fetchOpps(["open"]) });
  const { data: parked = [], isLoading: parkedLoading } = useQuery({
    queryKey: ["pipeline", "parked"],
    queryFn: () => fetchOpps(["on_hold", "lost", "disqualified"]),
  });
  const { data: thresholds = DEFAULT_THRESHOLDS } = useQuery({
    queryKey: ["app-settings", "pipeline_stale_thresholds"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "pipeline_stale_thresholds").maybeSingle();
      return { ...DEFAULT_THRESHOLDS, ...((data?.value as Partial<Thresholds>) ?? {}) };
    },
  });

  const [view, setView] = useState<"board" | "list">("board");
  const [owner, setOwner] = useState("all");
  const [branch, setBranch] = useState("all");
  const [service, setService] = useState("all");
  const [source, setSource] = useState("all");
  const [minFee, setMinFee] = useState("");
  const [maxFee, setMaxFee] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [mineInit, setMineInit] = useState(false);
  useEffect(() => {
    if (me && !mineInit) {
      setOnlyMine(!me.isAdmin);
      setMineInit(true);
    }
  }, [me, mineInit]);

  const [pending, setPending] = useState<Pending | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const filtered = useMemo(() => {
    const cutoff = Date.now() - 30 * DAY;
    return open.filter((o) => {
      if (o.stage === "converted" && new Date(o.stage_changed_at).getTime() < cutoff) return false;
      if (onlyMine && o.owner_partner_id !== me?.partner.id) return false;
      if (owner !== "all" && o.owner_partner_id !== owner) return false;
      if (branch !== "all" && o.partners?.branch !== branch) return false;
      if (service !== "all" && !o.opportunity_service_lines.some((s) => s.service_line_id === service)) return false;
      if (source !== "all" && o.acquisition_source !== source) return false;
      const fee = Number(o.estimated_gross_fee ?? 0);
      if (minFee && fee < Number(minFee)) return false;
      if (maxFee && fee > Number(maxFee)) return false;
      return true;
    });
  }, [open, onlyMine, me, owner, branch, service, source, minFee, maxFee]);

  const active = filtered.filter((o) => o.stage !== "converted");
  const summary = {
    count: active.length,
    gross: active.reduce((s, o) => s + Number(o.estimated_gross_fee ?? 0), 0),
    weighted: active.reduce((s, o) => s + (Number(o.estimated_gross_fee ?? 0) * o.probability) / 100, 0),
    stale: active.filter((o) => staleLevel(o, thresholds) === "red").length,
  };

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["pipeline"] });
    void qc.invalidateQueries({ queryKey: ["enquiries"] });
  };

  const move = useMutation({
    mutationFn: async (p: { id: string; stage: OpportunityStage; probability: number }) => {
      const { error } = await supabase.rpc("move_opportunity_stage", { _opportunity_id: p.id, _stage: p.stage, _probability: p.probability });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Stage updated"); setPending(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = useMutation({
    mutationFn: async (p: { id: string; action: string; revisit?: string; reason?: LostReason; note?: string }) => {
      const { error } = await supabase.rpc("set_opportunity_status", {
        _opportunity_id: p.id,
        _action: p.action,
        ...(p.revisit ? { _revisit_date: p.revisit } : {}),
        ...(p.reason ? { _lost_reason: p.reason } : {}),
        ...(p.note ? { _note: p.note } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(v.action === "reopen" ? "Opportunity reopened" : "Opportunity updated"); setPending(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  function requestStage(opp: Opp, stage: OpportunityStage) {
    if (opp.stage === stage) return;
    if (stage === "converted") return setPending({ kind: "convert", opp });
    setPending({ kind: "move", opp, stage, probability: STAGES.find((s) => s.value === stage)!.probability });
  }

  const [logOpp, setLogOpp] = useState<Opp | null>(null);
  const cardProps = { thresholds, onStage: requestStage, onAction: (kind: "hold" | "lost" | "disqualify" | "log", opp: Opp) => (kind === "log" ? setLogOpp(opp) : setPending({ kind, opp })) };
  const logDialog = <LogInteractionDialog open={!!logOpp} onOpenChange={(o) => !o && setLogOpp(null)} opportunityId={logOpp?.id} />;

  return (
    <div className="space-y-5">
      {logDialog}
      <PageHeader
        title="Pipeline"
        description="Stage-by-stage view of every live opportunity."
        actions={
          me?.isAdmin ? (
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 /> Stale limits
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="parked">Parked &amp; Lost ({parked.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border lg:grid-cols-4">
            {[
              ["Open opportunities", String(summary.count)],
              ["Gross pipeline", formatCurrency(summary.gross)],
              ["Weighted value", formatCurrency(summary.weighted)],
              ["Stale cards", String(summary.stale)],
            ].map(([label, value]) => (
              <div key={label} className="bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn("font-display text-xl font-semibold text-primary", label === "Stale cards" && summary.stale > 0 && "text-destructive")}>{value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-md border bg-card p-3">
            <FilterSelect label="Owner" value={owner} onChange={setOwner} options={partners.map((p) => ({ value: p.id, label: p.name }))} />
            <FilterSelect label="Branch" value={branch} onChange={setBranch} options={branches.map((b) => ({ value: b.name, label: b.name }))} />
            <FilterSelect label="Service" value={service} onChange={setService} options={serviceLines.map((s) => ({ value: s.id, label: s.name }))} />
            <FilterSelect label="Source" value={source} onChange={setSource} options={ACQUISITION_SOURCES} />
            <div className="space-y-1">
              <Label className="text-xs">Fee (₹)</Label>
              <div className="flex gap-1">
                <Input className="h-9 w-24" inputMode="numeric" placeholder="Min" value={minFee} onChange={(e) => setMinFee(e.target.value.replace(/\D/g, ""))} />
                <Input className="h-9 w-24" inputMode="numeric" placeholder="Max" value={maxFee} onChange={(e) => setMaxFee(e.target.value.replace(/\D/g, ""))} />
              </div>
            </div>
            <label className="flex h-9 items-center gap-2 text-sm">
              <Switch checked={onlyMine} onCheckedChange={setOnlyMine} /> Only mine
            </label>
            <div className="ml-auto flex rounded-md border">
              <Button size="sm" variant={view === "board" ? "secondary" : "ghost"} onClick={() => setView("board")} aria-label="Board view"><KanbanSquare /></Button>
              <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} onClick={() => setView("list")} aria-label="List view"><List /></Button>
            </div>
          </div>

          {isLoading ? (
            <LoadingRows />
          ) : view === "board" ? (
            <Board opps={filtered} {...cardProps} />
          ) : filtered.length ? (
            <ListView opps={filtered} {...cardProps} />
          ) : (
            <EmptyState title="No opportunities match" description="Adjust the filters or turn off Only mine." />
          )}
        </TabsContent>

        <TabsContent value="parked">
          {parkedLoading ? (
            <LoadingRows />
          ) : parked.length ? (
            <div className="overflow-x-auto rounded-md border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr><th className="p-3">Organisation</th><th className="p-3">Status</th><th className="p-3">Stage</th><th className="p-3">Detail</th><th className="p-3">Fee</th><th className="p-3">Owner</th><th className="p-3" /></tr>
                </thead>
                <tbody>
                  {parked.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="p-3 font-medium"><OrgLink opp={o} /></td>
                      <td className="p-3"><Badge variant={o.status === "on_hold" ? "secondary" : "outline"}>{titleise(o.status)}</Badge></td>
                      <td className="p-3">{titleise(o.stage)}</td>
                      <td className="max-w-xs p-3 text-muted-foreground">
                        {o.status === "on_hold" ? `Revisit ${formatDate(o.on_hold_revisit_date)}` : [o.lost_reason && titleise(o.lost_reason), o.lost_note].filter(Boolean).join(" — ") || "—"}
                      </td>
                      <td className="p-3">{formatCurrency(Number(o.estimated_gross_fee))}</td>
                      <td className="p-3">{o.partners?.name ?? "—"}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" disabled={status.isPending} onClick={() => status.mutate({ id: o.id, action: "reopen" })}>Reopen</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Nothing parked" description="On-hold, lost and disqualified opportunities appear here." />
          )}
        </TabsContent>
      </Tabs>

      <ActionDialog pending={pending} onClose={() => setPending(null)} busy={move.isPending || status.isPending}
        onMove={(p) => move.mutate(p)} onStatus={(p) => status.mutate(p)} />
      {me?.isAdmin && <ThresholdDialog open={settingsOpen} onOpenChange={setSettingsOpen} value={thresholds} />}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function OrgLink({ opp }: { opp: Opp }) {
  return (
    <Link to="/opportunities/$opportunityId" params={{ opportunityId: opp.id }} className="hover:underline">
      {opp.organisations?.name ?? opp.title}
    </Link>
  );
}

type CardProps = {
  thresholds: Thresholds;
  onStage: (opp: Opp, stage: OpportunityStage) => void;
  onAction: (kind: "hold" | "lost" | "disqualify" | "log", opp: Opp) => void;
};

function CardMenu({ opp, onStage, onAction }: { opp: Opp } & Omit<CardProps, "thresholds">) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Opportunity actions"><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onAction("log", opp)}>Log interaction</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Move to</DropdownMenuLabel>
        {STAGES.filter((s) => s.value !== opp.stage).map((s) => (
          <DropdownMenuItem key={s.value} onClick={() => onStage(opp, s.value)}>{s.label}</DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("hold", opp)}>Put on hold</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("lost", opp)}>Mark lost</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => onAction("disqualify", opp)}>Disqualify</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OppCard({ opp, thresholds, onStage, onAction }: { opp: Opp } & CardProps) {
  const stale = staleLevel(opp, thresholds);
  const { data: withTask } = useOpenTaskOpportunityIds();
  const noNext = opp.stage !== "converted" && withTask !== undefined && !withTask.has(opp.id);
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", opp.id)}
      className={cn(
        "cursor-grab space-y-2 rounded-md border-2 bg-card p-3 shadow-sm active:cursor-grabbing",
        stale === "red" ? "border-destructive" : stale === "amber" ? "border-warning" : "border-transparent",
      )}
    >
      {noNext && (
        <p className="-mx-3 -mt-3 rounded-t bg-destructive/10 px-3 py-1 text-[11px] font-semibold text-destructive">No next action</p>
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1 font-medium leading-tight text-primary">
          {opp.is_restricted && <Lock className="size-3.5 shrink-0 text-accent" aria-label="Restricted" />}
          <OrgLink opp={opp} />
        </p>
        <CardMenu opp={opp} onStage={onStage} onAction={onAction} />
      </div>
      {opp.opportunity_service_lines.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {opp.opportunity_service_lines.map((s) => (
            <span key={s.service_line_id} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{s.service_lines?.name}</span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">{formatCurrency(Number(opp.estimated_gross_fee))}</span>
        <span className="text-xs text-muted-foreground">{opp.probability}% · {daysSince(opp.stage_changed_at)}d in stage</span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs">
        <span className="truncate text-muted-foreground">
          {opp.next_action ? `${opp.next_action} · ${formatDate(opp.next_action_date)}` : "No next action"}
        </span>
        <span title={opp.partners?.name ?? ""} className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
          {initials(opp.partners?.name)}
        </span>
      </div>
    </div>
  );
}

function Board({ opps, ...props }: { opps: Opp[] } & CardProps) {
  const [over, setOver] = useState<string | null>(null);
  function drop(e: DragEvent, stage: OpportunityStage) {
    e.preventDefault();
    setOver(null);
    const opp = opps.find((o) => o.id === e.dataTransfer.getData("text/plain"));
    if (opp) props.onStage(opp, stage);
  }
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 lg:mx-0 lg:px-0">
      {STAGES.map((s) => {
        const items = opps.filter((o) => o.stage === s.value);
        const total = items.reduce((t, o) => t + Number(o.estimated_gross_fee ?? 0), 0);
        return (
          <section
            key={s.value}
            onDragOver={(e) => { e.preventDefault(); setOver(s.value); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => drop(e, s.value)}
            className={cn("flex w-[85vw] shrink-0 snap-center flex-col rounded-md bg-muted/50 sm:w-72", over === s.value && "ring-2 ring-accent")}
          >
            <header className="border-b px-3 py-2">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-primary">{s.label}</h2>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <p className="text-xs text-muted-foreground">{formatCurrency(total)}{s.value === "converted" && " · last 30 days"}</p>
            </header>
            <div className="flex min-h-40 flex-col gap-2 p-2">
              {items.map((o) => <OppCard key={o.id} opp={o} {...props} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

type SortKey = "org" | "stage" | "fee" | "probability" | "days" | "next" | "owner";

function ListView({ opps, thresholds, onStage, onAction }: { opps: Opp[] } & CardProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "fee", dir: -1 });
  const val = (o: Opp, k: SortKey): string | number => {
    switch (k) {
      case "org": return o.organisations?.name ?? "";
      case "stage": return STAGES.findIndex((s) => s.value === o.stage);
      case "fee": return Number(o.estimated_gross_fee ?? 0);
      case "probability": return o.probability;
      case "days": return daysSince(o.stage_changed_at);
      case "next": return o.next_action_date ?? "9999";
      case "owner": return o.partners?.name ?? "";
    }
  };
  const rows = [...opps].sort((a, b) => {
    const x = val(a, sort.key), y = val(b, sort.key);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });
  const Th = ({ k, children }: { k: SortKey; children: string }) => (
    <th className="p-3">
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {children}<ArrowUpDown className="size-3" />
      </button>
    </th>
  );
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <Th k="org">Organisation</Th><th className="p-3">Services</th>
            <Th k="stage">Stage</Th><Th k="fee">Fee</Th><Th k="probability">Prob.</Th>
            <Th k="days">Days in stage</Th><Th k="next">Next action</Th><Th k="owner">Owner</Th><th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const stale = staleLevel(o, thresholds);
            return (
              <tr key={o.id} className={cn("border-t border-l-4", stale === "red" ? "border-l-destructive" : stale === "amber" ? "border-l-warning" : "border-l-transparent")}>
                <td className="p-3 font-medium"><span className="flex items-center gap-1">{o.is_restricted && <Lock className="size-3.5 text-accent" />}<OrgLink opp={o} /></span></td>
                <td className="p-3 text-xs text-muted-foreground">{o.opportunity_service_lines.map((s) => s.service_lines?.name).join(", ") || "—"}</td>
                <td className="p-3">{STAGES.find((s) => s.value === o.stage)?.label}</td>
                <td className="p-3 whitespace-nowrap">{formatCurrency(Number(o.estimated_gross_fee))}</td>
                <td className="p-3">{o.probability}%</td>
                <td className="p-3">{daysSince(o.stage_changed_at)}</td>
                <td className="p-3 text-xs">{o.next_action ? `${o.next_action} · ${formatDate(o.next_action_date)}` : "—"}</td>
                <td className="p-3">{o.partners?.name ?? "—"}</td>
                <td className="p-3"><CardMenu opp={o} onStage={onStage} onAction={onAction} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActionDialog({ pending, onClose, busy, onMove, onStatus }: {
  pending: Pending | null;
  onClose: () => void;
  busy: boolean;
  onMove: (p: { id: string; stage: OpportunityStage; probability: number }) => void;
  onStatus: (p: { id: string; action: string; revisit?: string; reason?: LostReason; note?: string }) => void;
}) {
  const [probability, setProbability] = useState("");
  const [revisit, setRevisit] = useState("");
  const [reason, setReason] = useState<LostReason | "">("");
  const [note, setNote] = useState("");
  useEffect(() => {
    setProbability(pending?.kind === "move" ? String(pending.probability) : "");
    setRevisit(""); setReason(""); setNote("");
  }, [pending]);

  if (!pending) return null;
  const org = pending.opp.organisations?.name ?? pending.opp.title;
  const titles = {
    move: `Move to ${STAGES.find((s) => pending.kind === "move" && s.value === pending.stage)?.label}`,
    convert: "Convert opportunity",
    hold: "Put on hold",
    lost: "Mark as lost",
    disqualify: "Disqualify",
  };
  const prob = Number(probability);
  const valid =
    pending.kind === "move" ? probability !== "" && prob >= 0 && prob <= 100
    : pending.kind === "hold" ? Boolean(revisit)
    : pending.kind === "lost" ? Boolean(reason)
    : pending.kind === "disqualify" ? note.trim().length > 0 : true;

  function submit() {
    if (!pending) return;
    const id = pending.opp.id;
    if (pending.kind === "move") onMove({ id, stage: pending.stage, probability: prob });
    else if (pending.kind === "hold") onStatus({ id, action: "hold", revisit });
    else if (pending.kind === "lost") onStatus({ id, action: "lost", reason: reason as LostReason, note });
    else if (pending.kind === "disqualify") onStatus({ id, action: "disqualify", note });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[pending.kind]}</DialogTitle>
          <DialogDescription>{org}</DialogDescription>
        </DialogHeader>
        {pending.kind === "convert" && <p className="text-sm text-muted-foreground">Conversion flow coming soon.</p>}
        {pending.kind === "move" && (
          <div className="space-y-2">
            <Label htmlFor="prob">Probability (%)</Label>
            <Input id="prob" type="number" min={0} max={100} value={probability} onChange={(e) => setProbability(e.target.value)} />
          </div>
        )}
        {pending.kind === "hold" && (
          <div className="space-y-2">
            <Label htmlFor="revisit">Revisit date</Label>
            <Input id="revisit" type="date" value={revisit} onChange={(e) => setRevisit(e.target.value)} />
          </div>
        )}
        {pending.kind === "lost" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Lost reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as LostReason)}>
                <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
                <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{titleise(r)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}
        {pending.kind === "disqualify" && (
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Input id="reason" value={note} onChange={(e) => setNote(e.target.value)} placeholder="One-line reason" />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{pending.kind === "convert" ? "Close" : "Cancel"}</Button>
          {pending.kind !== "convert" && (
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={!valid || busy} onClick={submit}>
              {busy ? "Saving…" : "Confirm"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ThresholdDialog({ open, onOpenChange, value }: { open: boolean; onOpenChange: (o: boolean) => void; value: Thresholds }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(value);
  useEffect(() => setForm(value), [value, open]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("app_settings").upsert({ key: "pipeline_stale_thresholds", value: form }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Stale limits saved"); onOpenChange(false); void qc.invalidateQueries({ queryKey: ["app-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const fields: [keyof Thresholds, string][] = [
    ["default_days", "Red after (days without activity)"],
    ["late_stage_days", "Red after — Proposal & Negotiation"],
    ["warning_days", "Amber warning (days before limit)"],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Stale card limits</DialogTitle><DialogDescription>Applies to every partner's pipeline.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          {fields.map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={k}>{label}</Label>
              <Input id={k} type="number" min={1} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: Number(e.target.value) }))} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
