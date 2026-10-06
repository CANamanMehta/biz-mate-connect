import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { usePartners } from "@/lib/crm";

type Cfg = {
  stale_tasks: boolean;
  escalation: boolean;
  onhold_revisit: boolean;
  escalation_days: number;
  escalation_partner_id: string | null;
};
const DEFAULTS: Cfg = { stale_tasks: true, escalation: true, onhold_revisit: true, escalation_days: 3, escalation_partner_id: null };

export function AutomationsAdmin() {
  const qc = useQueryClient();
  const partners = (usePartners().data ?? []).filter((p) => p.active);
  const { data, isLoading } = useQuery({
    queryKey: ["app-settings", "automations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("value").eq("key", "automations").maybeSingle();
      if (error) throw error;
      return { ...DEFAULTS, ...((data?.value as Partial<Cfg>) ?? {}) } as Cfg;
    },
  });
  const [cfg, setCfg] = useState<Cfg>(DEFAULTS);
  const [days, setDays] = useState("3");
  useEffect(() => {
    if (data) {
      setCfg(data);
      setDays(String(data.escalation_days));
    }
  }, [data]);

  const managing = partners.find((p) => p.is_managing_partner);
  const recipient = cfg.escalation_partner_id ?? managing?.id ?? "";

  const save = useMutation({
    mutationFn: async () => {
      const n = Number(days);
      if (!Number.isInteger(n) || n < 1 || n > 30) throw new Error("Escalation days must be a whole number from 1 to 30.");
      const value = { ...cfg, escalation_days: n, escalation_partner_id: recipient || null };
      const { data: rows, error } = await supabase.from("app_settings").update({ value }).eq("key", "automations").select("id");
      if (error) throw error;
      if (!rows?.length) throw new Error("Could not save settings.");
    },
    onSuccess: () => {
      toast.success("Automation settings saved");
      qc.invalidateQueries({ queryKey: ["app-settings", "automations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("run_daily_automations_now");
      if (error) throw error;
      return data as { stale_tasks?: number; escalated?: number; revisit_tasks?: number };
    },
    onSuccess: (r) => {
      const stale = r.stale_tasks ?? 0, esc = r.escalated ?? 0, rev = r.revisit_tasks ?? 0;
      toast.success(`Created ${stale + rev} task${stale + rev === 1 ? "" : "s"} and ${esc + rev} notification${esc + rev === 1 ? "" : "s"}`, {
        description: `Stale tasks: ${stale} · Escalations: ${esc} · Revisit tasks: ${rev}`,
      });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows: { key: "stale_tasks" | "escalation" | "onhold_revisit"; label: string }[] = [
    { key: "stale_tasks", label: "Stale deal tasks" },
    { key: "escalation", label: "Overdue task escalation" },
    { key: "onhold_revisit", label: "On-hold revisit tasks" },
  ];

  return (
    <div className="max-w-xl space-y-5 rounded-lg border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">Automations</h2>
        <p className="text-sm text-muted-foreground">Runs daily at 8:00 AM IST.</p>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between">
              <Label htmlFor={`auto-${r.key}`}>{r.label}</Label>
              <Switch id={`auto-${r.key}`} checked={cfg[r.key]} onCheckedChange={(v) => setCfg({ ...cfg, [r.key]: v })} />
            </div>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="auto-days">Escalate after (days, 1-30)</Label>
              <Input id="auto-days" type="number" min={1} max={30} step={1} value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auto-recipient">Escalation recipient</Label>
              <select
                id="auto-recipient"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={recipient}
                onChange={(e) => setCfg({ ...cfg, escalation_partner_id: e.target.value })}
              >
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.is_managing_partner ? " (managing partner)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
            <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? "Running…" : "Run now"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Run now uses the saved settings.</p>
        </>
      )}
    </div>
  );
}
