import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Lightbulb } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPartner, useServiceLines } from "@/lib/crm";

function useCreateCrossSell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (v: { organisationId: string; serviceLineId: string; suggestionId?: string }) => {
      const { data, error } = await supabase.rpc("create_cross_sell_opportunity", {
        _organisation_id: v.organisationId,
        _service_line_id: v.serviceLineId,
        ...(v.suggestionId ? { _suggestion_id: v.suggestionId } : {}),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      toast.success("Opportunity created at Qualified Lead", {
        action: { label: "Open", onClick: () => void navigate({ to: "/opportunities/$opportunityId", params: { opportunityId: id } }) },
      });
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

type ServiceChipStatus = "engaged" | "pitched" | "not_relevant" | "not_offered";

const CHIP_STYLE: Record<ServiceChipStatus, string> = {
  engaged: "border-primary bg-primary text-primary-foreground",
  pitched: "border-[var(--orange-deep)] bg-[var(--orange-deep)] text-primary-foreground",
  not_relevant: "border-border bg-muted text-muted-foreground line-through opacity-80",
  not_offered: "border-border bg-muted text-muted-foreground",
};

export function ServiceChip({ organisationId, serviceLineId, name, status }: { organisationId: string; serviceLineId: string; name: string; status: ServiceChipStatus }) {
  const qc = useQueryClient();
  const create = useCreateCrossSell();
  const setStatus = useMutation({
    mutationFn: async (next: ServiceChipStatus) => {
      const { error } = await supabase.rpc("set_organisation_service_status", { _organisation_id: organisationId, _service_line_id: serviceLineId, _status: next });
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => { toast.success(`${name}: ${next.replace("_", " ")}`); void qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" disabled={setStatus.isPending} className={`border px-3 py-1.5 text-xs font-medium hover:border-accent ${CHIP_STYLE[status]}`}>
          {name}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem disabled={status === "engaged"} onClick={() => setStatus.mutate("engaged")}>Mark engaged</DropdownMenuItem>
        <DropdownMenuItem disabled={status === "pitched"} onClick={() => setStatus.mutate("pitched")}>Mark pitched</DropdownMenuItem>
        <DropdownMenuItem disabled={status === "not_relevant"} onClick={() => setStatus.mutate("not_relevant")}>Mark not relevant</DropdownMenuItem>
        <DropdownMenuItem disabled={status === "not_offered"} onClick={() => setStatus.mutate("not_offered")}>Reset to not offered</DropdownMenuItem>
        <DropdownMenuItem onClick={() => create.mutate({ organisationId, serviceLineId })}>Create opportunity</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NotOfferedChip(props: { organisationId: string; serviceLineId: string; name: string }) {
  return <ServiceChip {...props} status="not_offered" />;
}

export function CrossSellIdeas({ firm }: { firm: boolean }) {
  const { data: me } = useCurrentPartner();
  const create = useCreateCrossSell();
  const qc = useQueryClient();
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data = [] } = useQuery({
    queryKey: ["cross-sell-ideas", me?.partner.id, firm],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cross_sell_suggestions")
        .select("id, organisation_id, service_line_id, reason, created_at, organisations(name, relationship_owner_partner_id), service_lines(name)")
        .eq("status", "suggested")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      if (firm) return data;
      const { data: opps } = await supabase.from("opportunities").select("organisation_id").eq("owner_partner_id", me!.partner.id);
      const mine = new Set((opps ?? []).map((o) => o.organisation_id));
      return data.filter((s) => s.organisations?.relationship_owner_partner_id === me!.partner.id || mine.has(s.organisation_id));
    },
  });

  const dismiss = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("dismiss_cross_sell", { _suggestion_id: dismissing!, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Suggestion dismissed"); setDismissing(null); setReason(""); void qc.invalidateQueries({ queryKey: ["cross-sell-ideas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="border border-border bg-background p-4 lg:col-span-2">
      <p className="flex items-center gap-2 font-display text-sm font-semibold text-primary">
        <Lightbulb className="size-4 text-accent" /> Cross-sell ideas <span className="text-muted-foreground">({data.length})</span>
      </p>
      {data.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No open suggestions right now.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {data.slice(0, 5).map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  <Link to="/organisations/$organisationId" params={{ organisationId: s.organisation_id }} className="hover:underline">
                    {s.organisations?.name}
                  </Link>{" "}
                  · <span className="text-accent">{s.service_lines?.name}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">{s.reason}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" className="h-7 px-2" disabled={create.isPending}
                  onClick={() => create.mutate({ organisationId: s.organisation_id, serviceLineId: s.service_line_id, suggestionId: s.id }, { onSuccess: () => void qc.invalidateQueries({ queryKey: ["cross-sell-ideas"] }) })}>
                  Create opportunity
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setDismissing(s.id)}>Dismiss</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!dismissing} onOpenChange={(o) => !o && setDismissing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Why dismiss this idea?</DialogTitle></DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="One-line reason" autoFocus />
          <DialogFooter>
            <Button disabled={!reason.trim() || dismiss.isPending} onClick={() => dismiss.mutate()}>Dismiss</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function CrossSellRulesAdmin() {
  const qc = useQueryClient();
  const { data: lines = [] } = useServiceLines();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const { data: rules = [] } = useQuery({
    queryKey: ["cross-sell-rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cross_sell_rules").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const nameOf = (id: string) => lines.find((l) => l.id === id)?.name ?? "—";
  const refresh = () => void qc.invalidateQueries({ queryKey: ["cross-sell-rules"] });
  const run = useMutation({
    mutationFn: async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await fn();
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const selectCls = "h-9 w-full border border-input bg-background px-3 text-sm";
  return (
    <div className="space-y-3">
      <div className="grid gap-2 border border-border bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <select className={selectCls} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From service">
          <option value="">Engaged service…</option>
          {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className={selectCls} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Suggest service">
          <option value="">Suggest…</option>
          {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" />
        <Button disabled={!from || !to || from === to}
          onClick={() => run.mutate(() => supabase.from("cross_sell_rules").insert({ from_service_line_id: from, to_service_line_id: to, reason: reason || null }), { onSuccess: () => { setFrom(""); setTo(""); setReason(""); } })}>
          Add rule
        </Button>
      </div>
      {rules.map((r) => (
        <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border border-border bg-background p-3">
          <div className="min-w-0">
            <p className={`truncate text-sm ${r.active ? "" : "text-muted-foreground line-through"}`}>{nameOf(r.from_service_line_id)} → {nameOf(r.to_service_line_id)}</p>
            <Input defaultValue={r.reason ?? ""} placeholder="Reason" className="mt-1 h-8 text-xs"
              onBlur={(e) => e.target.value !== (r.reason ?? "") && run.mutate(() => supabase.from("cross_sell_rules").update({ reason: e.target.value || null }).eq("id", r.id))} />
          </div>
          <Button size="sm" variant="outline" onClick={() => run.mutate(() => supabase.from("cross_sell_rules").update({ active: !r.active }).eq("id", r.id))}>
            {r.active ? "Deactivate" : "Activate"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => run.mutate(() => supabase.from("cross_sell_rules").delete().eq("id", r.id))}>Delete</Button>
        </div>
      ))}
    </div>
  );
}

export function CrossSellReport() {
  const { data = [] } = useQuery({
    queryKey: ["cross-sell-report"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cross_sell_report");
      if (error) throw error;
      return data;
    },
  });
  return (
    <section className="border border-border bg-background p-4">
      <h2 className="font-display text-sm font-semibold text-primary">Cross-sell by partner</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2">Partner</th><th>Created</th><th>Pursued</th><th>Converted</th></tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.partner_id} className="border-t border-border">
                <td className="py-2">{r.partner_name}</td><td>{r.created}</td><td>{r.pursued}</td><td>{r.converted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Created = ideas for organisations the partner is relationship owner of.</p>
    </section>
  );
}
