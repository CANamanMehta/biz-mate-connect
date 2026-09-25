import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Calendar, Mail, MessageCircle, NotebookPen, Phone, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState, LoadingRows } from "@/components/crm/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { formatDate, titleise, useCurrentPartner, usePartners } from "@/lib/crm";
import { cn } from "@/lib/utils";

export type InteractionType = Database["public"]["Enums"]["interaction_type"];

export const INTERACTION_TYPES: { value: InteractionType; label: string; icon: typeof Phone }[] = [
  { value: "meeting", label: "Meeting", icon: Users },
  { value: "call", label: "Call", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "note", label: "Note", icon: NotebookPen },
];

const DURATIONS = [15, 30, 60, 90, 120];
const OUTCOMES = [
  { value: "proposal_now", label: "Lead - proposal now", dateLabel: "Send proposal by" },
  { value: "meet_again", label: "Lead - meet again", dateLabel: "Next meeting date" },
  { value: "later", label: "Lead - later", dateLabel: "Revisit on" },
  { value: "not_lead", label: "Not a lead", dateLabel: "" },
] as const;
const NEXT_PICKS = [
  { label: "Tomorrow", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
];

const selectCls =
  "h-10 w-full border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function dateInDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export function LogInteractionDialog({
  open,
  onOpenChange,
  organisationId,
  opportunityId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId?: string | undefined;
  opportunityId?: string | undefined;
}) {
  const qc = useQueryClient();
  const { data: me } = useCurrentPartner();
  const { data: partners = [] } = usePartners();

  const [orgId, setOrgId] = useState(organisationId ?? "");
  const [oppId, setOppId] = useState(opportunityId ?? "");
  const [type, setType] = useState<InteractionType>("meeting");
  const [when, setWhen] = useState(localNow());
  const [duration, setDuration] = useState<number | "">(30);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [partnerIds, setPartnerIds] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [full, setFull] = useState(false);
  const [detail, setDetail] = useState({ agenda: "", requirements: "", commitments: "", objections: "", decisions: "" });
  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"" | "proposal_now" | "meet_again" | "later" | "not_lead">("");
  const [outcomeDate, setOutcomeDate] = useState("");
  const [outcomeReason, setOutcomeReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setOrgId(organisationId ?? "");
    setOppId(opportunityId ?? "");
    setType("meeting");
    setWhen(localNow());
    setDuration(30);
    setContactIds([]);
    setPartnerIds(me ? [me.partner.id] : []);
    setSummary("");
    setNextStep("");
    setNextDate("");
    setFull(false);
    setDetail({ agenda: "", requirements: "", commitments: "", objections: "", decisions: "" });
    setOutcome(""); setOutcomeDate(""); setOutcomeReason("");
  }, [open, organisationId, opportunityId, me]);

  // Opportunity fixed → resolve its organisation
  const { data: fixedOpp } = useQuery({
    queryKey: ["log-opp", opportunityId],
    enabled: open && !!opportunityId,
    queryFn: async () => {
      const { data } = await supabase.from("opportunities").select("id, organisation_id, title, stage").eq("id", opportunityId!).single();
      return data;
    },
  });
  const effectiveOrg = orgId || fixedOpp?.organisation_id || "";

  const { data: organisations = [] } = useQuery({
    queryKey: ["log-orgs"],
    enabled: open && !organisationId && !opportunityId,
    queryFn: async () => {
      const { data, error } = await supabase.from("organisations").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: orgOpps = [] } = useQuery({
    queryKey: ["log-org-opps", effectiveOrg],
    enabled: open && !!effectiveOrg && !opportunityId,
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunities").select("id, title, stage").eq("organisation_id", effectiveOrg).eq("status", "open").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["log-contacts", effectiveOrg],
    enabled: open && !!effectiveOrg,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, name, designation").eq("organisation_id", effectiveOrg).order("name");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const opp = opportunityId || oppId || undefined;
      const { data, error } = await supabase.rpc("log_interaction", {
        _organisation_id: effectiveOrg,
        _type: type,
        _meeting_date: new Date(when).toISOString(),
        _next_step: nextStep.trim(),
        _next_step_date: nextDate,
        _contact_ids: contactIds,
        _partner_ids: partnerIds,
        ...(opp ? { _opportunity_id: opp } : {}),
        ...(duration !== "" ? { _duration_minutes: Number(duration) } : {}),
        ...(summary.trim() ? { _summary: summary.trim() } : {}),
        ...(full && detail.agenda.trim() ? { _agenda: detail.agenda } : {}),
        ...(full && detail.requirements.trim() ? { _requirements: detail.requirements } : {}),
        ...(full && detail.commitments.trim() ? { _commitments: detail.commitments } : {}),
        ...(full && detail.objections.trim() ? { _objections: detail.objections } : {}),
        ...(full && detail.decisions.trim() ? { _decisions: detail.decisions } : {}),
        ...(needsOutcome && outcome ? { _outcome: outcome } : {}),
        ...(needsOutcome && outcomeDate && outcome !== "not_lead" ? { _outcome_date: outcomeDate } : {}),
        ...(needsOutcome && outcome === "not_lead" ? { _outcome_reason: outcomeReason.trim() } : {}),
      });
      if (error) throw error;
      return { row: data?.[0], opp };
    },
    onSuccess: ({ row, opp }) => {
      toast.success("Interaction logged · follow-up task created");
      void qc.invalidateQueries();
      onOpenChange(false);
      if (row?.suggest_discovery && opp) setSuggestFor(opp);
    },
    onError: (e: Error) => toast.error(e.message || "Could not log this interaction."),
  });

  const moveStage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("move_opportunity_stage", { _opportunity_id: id, _stage: "first_meeting", _probability: 25 });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Moved to First Meeting");
      setSuggestFor(null);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedStage = opportunityId ? fixedOpp?.stage : orgOpps.find((o) => o.id === oppId)?.stage;
  const needsOutcome = type === "meeting" && selectedStage === "first_meeting";
  const outcomeOk = !needsOutcome || (outcome !== "" && (outcome === "not_lead" ? outcomeReason.trim().length > 0 : !!outcomeDate));
  const canSave = !!effectiveOrg && nextStep.trim().length > 0 && !!nextDate && !!when && outcomeOk;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) {
      toast.error(!effectiveOrg ? "Choose an organisation" : !outcomeOk ? "Complete the first meeting outcome" : "Add a next step and its date");
      return;
    }
    save.mutate();
  }

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Log interaction</DialogTitle>
            <DialogDescription>{fixedOpp?.title ?? "Record what happened and the next step."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid grid-cols-5 gap-1.5">
              {INTERACTION_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={type === t.value}
                  onClick={() => setType(t.value)}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 border text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    type === t.value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                  )}
                >
                  <t.icon className="size-5" />
                  {t.label}
                </button>
              ))}
            </div>

            {!organisationId && !opportunityId && (
              <div className="space-y-1.5">
                <Label htmlFor="li-org">Organisation</Label>
                <select id="li-org" className={selectCls} value={orgId} onChange={(e) => { setOrgId(e.target.value); setOppId(""); setContactIds([]); }}>
                  <option value="">Choose organisation…</option>
                  {organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
            {!opportunityId && effectiveOrg && (
              <div className="space-y-1.5">
                <Label htmlFor="li-opp">Opportunity (optional)</Label>
                <select id="li-opp" className={selectCls} value={oppId} onChange={(e) => setOppId(e.target.value)}>
                  <option value="">None — organisation only</option>
                  {orgOpps.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="li-when">Date & time</Label>
                <Input id="li-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="li-dur">Duration (minutes)</Label>
                <Input id="li-dur" type="number" min={0} max={1440} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => <Chip key={d} active={duration === d} onClick={() => setDuration(d)}>{d} min</Chip>)}
            </div>

            {effectiveOrg && (
              <div className="space-y-1.5">
                <Label>Contacts present</Label>
                {contacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No contacts for this organisation yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {contacts.map((c) => <Chip key={c.id} active={contactIds.includes(c.id)} onClick={() => setContactIds(toggle(contactIds, c.id))}>{c.name}</Chip>)}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>AOM partners present</Label>
              <div className="flex flex-wrap gap-1.5">
                {partners.filter((p) => p.active).map((p) => <Chip key={p.id} active={partnerIds.includes(p.id)} onClick={() => setPartnerIds(toggle(partnerIds, p.id))}>{p.name}</Chip>)}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="li-summary">Summary</Label>
              <Textarea id="li-summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} autoCapitalize="sentences" autoCorrect="on" spellCheck enterKeyHint="next" maxLength={4000} placeholder="What was discussed?" />
              <p className="text-xs text-muted-foreground sm:hidden">Tip: tap the microphone on your keyboard to dictate.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="li-next">Next step *</Label>
              <Input id="li-next" value={nextStep} onChange={(e) => setNextStep(e.target.value)} required maxLength={300} autoCapitalize="sentences" placeholder="e.g. Send proposal draft" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="li-nextdate">Next step date *</Label>
              <div className="flex flex-wrap gap-1.5">
                {NEXT_PICKS.map((p) => <Chip key={p.days} active={nextDate === dateInDays(p.days)} onClick={() => setNextDate(dateInDays(p.days))}>{p.label}</Chip>)}
              </div>
              <Input id="li-nextdate" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} required />
            </div>

            <button type="button" onClick={() => setFull(!full)} className="text-sm font-medium text-accent hover:underline">
              {full ? "− Hide detail" : "+ Add detail"}
            </button>
            {full && (
              <div className="space-y-3">
                {([
                  ["agenda", "Agenda"],
                  ["requirements", "Requirements identified"],
                  ["commitments", "Commitments made by AOM"],
                  ["objections", "Objections raised"],
                  ["decisions", "Decisions"],
                ] as const).map(([k, label]) => (
                  <div key={k} className="space-y-1.5">
                    <Label htmlFor={`li-${k}`}>{label}</Label>
                    <Textarea id={`li-${k}`} rows={2} value={detail[k]} maxLength={4000} autoCapitalize="sentences" onChange={(e) => setDetail({ ...detail, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
            )}

            {needsOutcome && (
              <div className="space-y-3 border border-accent bg-accent/5 p-3">
                <Label>First meeting outcome (required)</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {OUTCOMES.map((o) => (
                    <Chip key={o.value} active={outcome === o.value} onClick={() => setOutcome(o.value)}>{o.label}</Chip>
                  ))}
                </div>
                {outcome && outcome !== "not_lead" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="li-odate">{OUTCOMES.find((o) => o.value === outcome)?.dateLabel}</Label>
                    <Input id="li-odate" type="date" value={outcomeDate} onChange={(e) => setOutcomeDate(e.target.value)} />
                  </div>
                )}
                {outcome === "not_lead" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="li-oreason">Reason</Label>
                    <Input id="li-oreason" value={outcomeReason} onChange={(e) => setOutcomeReason(e.target.value)} placeholder="One-line reason" />
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={!canSave || save.isPending}>{save.isPending ? "Saving…" : "Save interaction"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!suggestFor} onOpenChange={(o) => !o && setSuggestFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to First Meeting?</DialogTitle>
            <DialogDescription>You logged a meeting. Move this opportunity to First Meeting at 25% probability?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestFor(null)}>Not now</Button>
            <Button onClick={() => suggestFor && moveStage.mutate(suggestFor)} disabled={moveStage.isPending}>Move stage</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LogInteractionButton(props: { organisationId?: string | undefined; opportunityId?: string | undefined; size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={props.size ?? "sm"} onClick={() => setOpen(true)}>
        <Calendar className="size-4" /> Log interaction
      </Button>
      <LogInteractionDialog open={open} onOpenChange={setOpen} organisationId={props.organisationId} opportunityId={props.opportunityId} />
    </>
  );
}

export const MEETING_SELECT =
  "id, type, meeting_date, duration_minutes, summary, agenda, requirements_identified, commitments, objections, decisions, next_step, next_step_date, created_by, organisation_id, opportunity_id, organisations(id, name), opportunities(id, title), meeting_partners(partner_id, partners(name)), meeting_contacts(contacts(name))";

export type MeetingRow = {
  id: string;
  type: InteractionType;
  meeting_date: string;
  duration_minutes: number | null;
  summary: string | null;
  agenda: string | null;
  requirements_identified: string | null;
  commitments: string | null;
  objections: string | null;
  decisions: string | null;
  next_step: string;
  next_step_date: string;
  created_by: string | null;
  organisation_id: string;
  opportunity_id: string | null;
  organisations: { id: string; name: string } | null;
  opportunities: { id: string; title: string } | null;
  meeting_partners: { partner_id: string; partners: { name: string } | null }[];
  meeting_contacts: { contacts: { name: string } | null }[];
};

function Block({ label, text, tone }: { label: string; text: string | null; tone: "accent" | "primary" | "destructive" | "muted" }) {
  if (!text) return null;
  const cls = {
    accent: "border-l-accent bg-accent/10",
    primary: "border-l-primary bg-primary/5",
    destructive: "border-l-destructive bg-destructive/5",
    muted: "border-l-border bg-muted/40",
  }[tone];
  return (
    <div className={cn("border-l-4 px-3 py-2", cls)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-foreground">{text}</p>
    </div>
  );
}

export function InteractionCard({ m, showContext }: { m: MeetingRow; showContext?: boolean }) {
  const Icon = INTERACTION_TYPES.find((t) => t.value === m.type)?.icon ?? NotebookPen;
  const time = new Date(m.meeting_date).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const people = [
    ...m.meeting_partners.map((p) => p.partners?.name).filter(Boolean),
    ...m.meeting_contacts.map((c) => c.contacts?.name).filter(Boolean),
  ];
  return (
    <article className="relative border border-border bg-background p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center bg-primary text-primary-foreground"><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-medium text-foreground">
              {titleise(m.type)} · <span className="text-muted-foreground">{time}{m.duration_minutes ? ` · ${m.duration_minutes} min` : ""}</span>
            </p>
            {showContext && (
              <p className="truncate text-sm">
                {m.organisations && (
                  <Link to="/organisations/$organisationId" params={{ organisationId: m.organisations.id }} className="text-primary hover:underline">{m.organisations.name}</Link>
                )}
                {m.opportunities && (
                  <> · <Link to="/opportunities/$opportunityId" params={{ opportunityId: m.opportunities.id }} className="text-accent hover:underline">{m.opportunities.title}</Link></>
                )}
              </p>
            )}
            {people.length > 0 && <p className="text-xs text-muted-foreground">With {people.join(", ")}</p>}
          </div>
          {m.summary && <p className="whitespace-pre-wrap text-sm text-foreground">{m.summary}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Block label="Requirements" text={m.requirements_identified} tone="primary" />
            <Block label="Commitments by AOM" text={m.commitments} tone="accent" />
            <Block label="Objections" text={m.objections} tone="destructive" />
            <Block label="Decisions" text={m.decisions} tone="muted" />
          </div>
          {m.agenda && <p className="text-xs text-muted-foreground"><span className="font-semibold">Agenda:</span> {m.agenda}</p>}
          <p className="text-sm"><span className="font-semibold text-primary">Next:</span> {m.next_step} · {formatDate(m.next_step_date)}</p>
        </div>
      </div>
    </article>
  );
}

export function InteractionTimeline({ organisationId, opportunityId }: { organisationId?: string | undefined; opportunityId?: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["interactions", organisationId ?? null, opportunityId ?? null],
    queryFn: async () => {
      let q = supabase.from("meetings").select(MEETING_SELECT).order("meeting_date", { ascending: false });
      if (opportunityId) q = q.eq("opportunity_id", opportunityId);
      else if (organisationId) q = q.eq("organisation_id", organisationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as MeetingRow[];
    },
  });
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><LogInteractionButton organisationId={organisationId} opportunityId={opportunityId} /></div>
      {isLoading && <LoadingRows rows={2} />}
      {!isLoading && data.length === 0 && <EmptyState title="No interactions yet" description="Log a meeting, call or note to start the timeline." />}
      <ol className="space-y-3 border-l-2 border-border pl-4">
        {data.map((m) => (
          <li key={m.id} className="relative">
            <span className="absolute -left-[23px] top-5 size-3 rounded-full bg-accent" aria-hidden />
            <InteractionCard m={m} showContext={!opportunityId} />
          </li>
        ))}
      </ol>
    </div>
  );
}
