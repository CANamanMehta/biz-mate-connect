import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlarmClock, Bell, CalendarCheck, Check, Gift, Hand, Repeat, UserRound, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { formatDate, isoDay, useCurrentPartner, usePartners } from "@/lib/crm";
import { cn } from "@/lib/utils";

export const TASK_SELECT =
  "id, title, due_date, priority, status, source, is_recurring, recurrence_days, completed_at, owner_partner_id, opportunity_id, organisation_id, organisations(id, name), opportunities(id, title, organisations(name)), partners!tasks_owner_partner_id_fkey(name)";

export type TaskRow = {
  id: string;
  title: string;
  due_date: string;
  priority: Database["public"]["Enums"]["task_priority"];
  status: Database["public"]["Enums"]["task_status"];
  source: Database["public"]["Enums"]["task_source"];
  is_recurring: boolean;
  recurrence_days: number | null;
  completed_at: string | null;
  owner_partner_id: string;
  opportunity_id: string | null;
  organisation_id: string | null;
  organisations: { id: string; name: string } | null;
  opportunities: { id: string; title: string; organisations: { name: string } | null } | null;
  partners: { name: string } | null;
};

export function useTasks(status: "open" | "done") {
  return useQuery({
    queryKey: ["tasks", status],
    queryFn: async () => {
      let q = supabase.from("tasks").select(TASK_SELECT).eq("status", status);
      q = status === "open" ? q.order("due_date", { ascending: true }) : q.order("completed_at", { ascending: false }).limit(50);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TaskRow[];
    },
  });
}

const SOURCE_ICON: Record<TaskRow["source"], { icon: typeof Bell; label: string }> = {
  manual: { icon: Hand, label: "Manual" },
  from_meeting: { icon: Users, label: "From meeting" },
  stale_alert: { icon: AlarmClock, label: "Stale alert" },
  conversion: { icon: CalendarCheck, label: "Conversion" },
  cross_sell: { icon: Gift, label: "Cross-sell" },
};

const PRIORITY_CLS: Record<TaskRow["priority"], string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-accent/10 text-accent",
  low: "bg-muted text-muted-foreground",
};

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["tasks"] });
  void qc.invalidateQueries({ queryKey: ["pipeline"] });
  void qc.invalidateQueries({ queryKey: ["dashboard"] });
  void qc.invalidateQueries({ queryKey: ["opportunity"] });
}

export function useTaskActions() {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: async (v: { id: string; due?: string; owner?: string }) => {
      const { error } = await supabase.rpc("update_task", {
        _task_id: v.id,
        ...(v.due ? { _due_date: v.due } : {}),
        ...(v.owner ? { _owner_partner_id: v.owner } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.owner ? "Task reassigned" : "Task snoozed");
      invalidateAll(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return { update };
}

/** Wraps a completion flow; renders the "What's next?" dialog for opportunity-linked tasks. */
export function useCompleteTask() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<TaskRow | null>(null);
  const complete = useMutation({
    mutationFn: async (v: { task: TaskRow; nextTitle?: string; nextDue?: string }) => {
      const { error } = await supabase.rpc("complete_task", {
        _task_id: v.task.id,
        ...(v.nextTitle?.trim() ? { _next_title: v.nextTitle.trim(), _next_due: v.nextDue || isoDay(3) } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.task.is_recurring ? "Done — next occurrence scheduled" : "Task done");
      setPending(null);
      invalidateAll(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const start = (task: TaskRow) => (task.opportunity_id ? setPending(task) : complete.mutate({ task }));
  const dialog = (
    <WhatsNextDialog
      task={pending}
      busy={complete.isPending}
      onClose={() => setPending(null)}
      onSubmit={(nextTitle, nextDue) => pending && complete.mutate({ task: pending, nextTitle, nextDue })}
    />
  );
  return { start, dialog, busy: complete.isPending };
}

function WhatsNextDialog({ task, busy, onClose, onSubmit }: { task: TaskRow | null; busy: boolean; onClose: () => void; onSubmit: (title: string, due: string) => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(isoDay(3));
  return (
    <Dialog open={!!task} onOpenChange={(o) => { if (!o) { onClose(); setTitle(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>What's next?</DialogTitle>
          <DialogDescription>
            Completing "{task?.title}". Add the next step for {task?.opportunities?.organisations?.name ?? "this opportunity"}, or skip.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="next-title">Next step (optional)</Label>
            <Input id="next-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="e.g. Send proposal draft" autoFocus />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="next-due">Due</Label>
              <Input id="next-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-40" />
            </div>
            {[1, 3, 7].map((d) => (
              <Button key={d} type="button" variant="outline" size="sm" onClick={() => setDue(isoDay(d))}>+{d === 7 ? "1w" : `${d}d`}</Button>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => { onSubmit("", ""); setTitle(""); }}>Skip</Button>
          <Button disabled={busy || !title.trim()} onClick={() => { onSubmit(title, due); setTitle(""); }}>Save next step</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaskItem({ task, onComplete, compact }: { task: TaskRow; onComplete: (t: TaskRow) => void; compact?: boolean }) {
  const { update } = useTaskActions();
  const { data: partners = [] } = usePartners();
  const today = isoDay();
  const overdue = task.status === "open" && task.due_date < today;
  const Src = SOURCE_ICON[task.source];
  const done = task.status === "done";
  return (
    <div className={cn("flex items-start gap-3 border-b px-3 py-2.5 last:border-b-0", overdue && "bg-destructive/5")}>
      <Checkbox
        className="mt-0.5"
        checked={done}
        disabled={done}
        onCheckedChange={() => onComplete(task)}
        aria-label={`Complete ${task.title}`}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>
          {task.title}
          {task.is_recurring && <Repeat className="ml-1 inline size-3 text-muted-foreground" aria-label="Recurring" />}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {task.opportunities ? (
            <Link to="/opportunities/$opportunityId" params={{ opportunityId: task.opportunities.id }} className="truncate hover:underline">
              {task.opportunities.organisations?.name ?? task.opportunities.title}
            </Link>
          ) : task.organisations ? (
            <Link to="/organisations/$organisationId" params={{ organisationId: task.organisations.id }} className="truncate hover:underline">
              {task.organisations.name}
            </Link>
          ) : null}
          <span className={cn(overdue && "font-semibold text-destructive")}>{formatDate(task.due_date)}</span>
          {!compact && <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase", PRIORITY_CLS[task.priority])}>{task.priority}</span>}
          <Src.icon className="size-3" aria-label={Src.label} />
          {!compact && task.partners && <span className="flex items-center gap-0.5"><UserRound className="size-3" />{task.partners.name}</span>}
        </div>
      </div>
      {!done && (
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onComplete(task)} aria-label="Done">
            <Check className="size-4" /><span className="hidden sm:inline">Done</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="Snooze"><AlarmClock className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Snooze</DropdownMenuLabel>
              {[{ d: 1, l: "+1 day" }, { d: 3, l: "+3 days" }, { d: 7, l: "+1 week" }].map(({ d, l }) => (
                <DropdownMenuItem key={d} onClick={() => update.mutate({ id: task.id, due: isoDay(d, task.due_date < today ? today : task.due_date) })}>{l}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="Reassign"><UserRound className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              <DropdownMenuLabel className="text-xs">Reassign to</DropdownMenuLabel>
              {partners.filter((p) => p.active && p.id !== task.owner_partner_id).map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => update.mutate({ id: task.id, owner: p.id })}>{p.name}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

export function QuickAddTaskDialog({ open, onOpenChange, opportunityId }: { open: boolean; onOpenChange: (o: boolean) => void; opportunityId?: string }) {
  const qc = useQueryClient();
  const { data: me } = useCurrentPartner();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(isoDay(1));
  const [opp, setOpp] = useState(opportunityId ?? "");
  const { data: opps = [] } = useQuery({
    queryKey: ["tasks", "opp-options"],
    enabled: open && !opportunityId,
    queryFn: async () => {
      const { data } = await supabase.from("opportunities").select("id, title, organisations(name)").eq("status", "open").order("updated_at", { ascending: false }).limit(200);
      return data ?? [];
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("add_task", {
        _title: title.trim(),
        _due_date: due,
        ...(opp ? { _opportunity_id: opp } : {}),
        ...(me?.partner.id ? { _owner_partner_id: me.partner.id } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task added");
      setTitle("");
      if (!opportunityId) setOpp("");
      onOpenChange(false);
      invalidateAll(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick add task</DialogTitle>
          <DialogDescription>Assigned to you. You can reassign it later.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (title.trim() && due) save.mutate(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="qt-title">Title</Label>
            <Input id="qt-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required autoFocus />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="qt-due">Due date</Label>
              <Input id="qt-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} required className="w-40" />
            </div>
            {[{ d: 0, l: "Today" }, { d: 1, l: "Tomorrow" }, { d: 7, l: "+1w" }].map(({ d, l }) => (
              <Button key={d} type="button" variant="outline" size="sm" onClick={() => setDue(isoDay(d))}>{l}</Button>
            ))}
          </div>
          {!opportunityId && (
            <div className="space-y-1.5">
              <Label htmlFor="qt-opp">Linked opportunity (optional)</Label>
              <select id="qt-opp" value={opp} onChange={(e) => setOpp(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">None</option>
                {opps.map((o) => (
                  <option key={o.id} value={o.id}>{o.organisations?.name ?? ""} — {o.title}</option>
                ))}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending || !title.trim()}>Add task</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TaskGroup({ title, tone, count, children, defaultOpen = true }: { title: string; tone?: "red"; count: number; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border bg-background">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between border-b px-3 py-2 text-left">
        <span className={cn("font-display text-sm font-semibold text-primary", tone === "red" && "text-destructive")}>{title}</span>
        <span className={cn("rounded-full bg-muted px-2 text-xs", tone === "red" && count > 0 && "bg-destructive text-destructive-foreground")}>{count}</span>
      </button>
      {open && (count === 0 ? <p className="px-3 py-3 text-sm text-muted-foreground">Nothing here.</p> : children)}
    </section>
  );
}
