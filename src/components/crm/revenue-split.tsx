import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LoadingRows } from "@/components/crm/page-header";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { formatCurrency, titleise, useBranches, type Partner } from "@/lib/crm";
import { cn } from "@/lib/utils";

type Enums = Database["public"]["Enums"];
type Allocation = Database["public"]["Tables"]["revenue_allocations"]["Row"];
const BENEFICIARY: Enums["beneficiary_type"][] = ["firm_mp", "partner", "branch", "ho"];
const COMPONENTS: Enums["allocation_component"][] = ["firm_base", "referral_acquisition", "execution", "branch_profit_share", "custom"];
const selectCls = "h-9 w-full border border-input bg-background px-2 text-sm";

export type SplitOpp = {
  id: string; organisation_id: string; estimated_gross_fee: number | null; estimated_expenses: number | null;
  sharing_template: string | null; owner_partner_id: string; acquired_by_partner_id: string | null;
  organisations: { home_branch: string | null } | null; opportunity_collaborators: { partner_id: string }[];
};

export function InlineText({ value, onSave, className, multiline, type = "text", placeholder }: {
  value: string | null; onSave: (v: string | null) => void; className?: string; multiline?: boolean; type?: string; placeholder?: string;
}) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const commit = () => { if ((value ?? "") !== v) onSave(v.trim() === "" ? null : v); };
  return multiline ? (
    <Textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} rows={3} className={className} placeholder={placeholder} />
  ) : (
    <Input type={type} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className={className} placeholder={placeholder} />
  );
}

export function InlineNumber({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(value?.toString() ?? "");
  useEffect(() => setV(value?.toString() ?? ""), [value]);
  return (
    <Input type="number" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)}
      onBlur={() => { const n = v === "" ? null : Number(v); if (n !== value && (n === null || !Number.isNaN(n))) onSave(n); }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  );
}

type TemplateRowDef = { who: string; component: Enums["allocation_component"]; base: Enums["allocation_base"]; share_pct: number; note?: string };

export function RevenueSplit({ opp, partners, meId, onChange, suggestedCode }: { suggestedCode?: string | null; opp: SplitOpp; partners: Partner[]; meId: string | undefined; onChange: () => void }) {
  const qc = useQueryClient();
  const { data: branches = [] } = useBranches();
  const [pending, setPending] = useState<{ name: string; rows: TemplateRowDef[] } | null>(null);
  const key = ["opp-allocations", opp.id];
  const { data: rows = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("revenue_allocations").select("*").eq("opportunity_id", opp.id).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const { data: templates = [] } = useQuery({
    queryKey: ["sharing-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sharing_templates").select("*").eq("active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const log = (detail: string) => meId && supabase.from("activity_log").insert({ organisation_id: opp.organisation_id, opportunity_id: opp.id, actor_partner_id: meId, action: "revenue_split_changed", detail });
  const done = () => { qc.invalidateQueries({ queryKey: key }); onChange(); };

  const mp = partners.find((p) => p.is_managing_partner);
  const ownerBranch = partners.find((p) => p.id === opp.owner_partner_id)?.branch;
  const branch = opp.organisations?.home_branch ?? ownerBranch ?? null;

  const expand = (defs: TemplateRowDef[]) => defs.flatMap((d) => {
    const base = { component: d.component, base: d.base, note: d.note ?? "" };
    switch (d.who) {
      case "firm_mp": return [{ ...base, beneficiary_type: "firm_mp", beneficiary_partner_id: mp?.id ?? "", beneficiary_branch: "", share_pct: d.share_pct }];
      case "branch": return [{ ...base, beneficiary_type: "branch", beneficiary_partner_id: "", beneficiary_branch: branch ?? "", share_pct: d.share_pct }];
      case "ho": return [{ ...base, beneficiary_type: "ho", beneficiary_partner_id: "", beneficiary_branch: "Jaipur-HO", share_pct: d.share_pct }];
      case "acquiring_partner": return [{ ...base, beneficiary_type: "partner", beneficiary_partner_id: opp.acquired_by_partner_id ?? opp.owner_partner_id, beneficiary_branch: "", share_pct: d.share_pct }];
      case "executing_partners": {
        const ids = [opp.owner_partner_id, ...opp.opportunity_collaborators.map((c) => c.partner_id)];
        const each = Math.round((d.share_pct / ids.length) * 100) / 100;
        return ids.map((id) => ({ ...base, beneficiary_type: "partner", beneficiary_partner_id: id, beneficiary_branch: "", share_pct: each }));
      }
      default: return [{ ...base, beneficiary_type: "partner", beneficiary_partner_id: "", beneficiary_branch: "", share_pct: d.share_pct }];
    }
  });

  const apply = useMutation({
    mutationFn: async (t: { name: string; rows: TemplateRowDef[] }) => {
      const { error } = await supabase.rpc("apply_sharing_template", { _opportunity_id: opp.id, _template_name: t.name, _rows: expand(t.rows) });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Template applied"); setPending(null); done(); },
    onError: (e) => toast.error(e.message),
  });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("revenue_allocations").insert({
        opportunity_id: opp.id, beneficiary_type: "partner", beneficiary_partner_id: opp.owner_partner_id,
        component: "custom", base: "net", share_pct: 0, created_by: meId ?? null,
      });
      if (error) throw error;
      await log("Added a split row");
    },
    onSuccess: done, onError: (e) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Database["public"]["Tables"]["revenue_allocations"]["Update"] }) => {
      const { error } = await supabase.from("revenue_allocations").update(patch).eq("id", id);
      if (error) throw error;
      await log(`Edited split row (${Object.keys(patch).join(", ")})`);
    },
    onSuccess: done, onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("revenue_allocations").delete().eq("id", id);
      if (error) throw error;
      await log("Deleted a split row");
    },
    onSuccess: done, onError: (e) => toast.error(e.message),
  });

  const suggested = suggestedCode ? templates.find((t) => t.code === suggestedCode) : undefined;
  const gross = Number(opp.estimated_gross_fee ?? 0);
  const net = gross - Number(opp.estimated_expenses ?? 0);
  const totals = { gross: 0, net: 0 };
  rows.forEach((r) => { totals[r.base] += Number(r.share_pct); });
  const hasGross = rows.some((r) => r.base === "gross");
  const hasNet = rows.some((r) => r.base === "net");
  const off = (hasGross && Math.abs(totals.gross - 100) > 0.01) || (hasNet && Math.abs(totals.net - 100) > 0.01);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <select className={cn(selectCls, "sm:w-80")} value="" onChange={(e) => {
            const t = templates.find((x) => x.id === e.target.value);
            if (t) setPending({ name: t.name, rows: (t.rows as unknown as TemplateRowDef[]) ?? [] });
          }} aria-label="Apply template">
            <option value="">Apply template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">Current template: <strong className="text-foreground">{opp.sharing_template ?? "None"}</strong></p>
      </div>

      {suggested && rows.length === 0 && !isLoading && (
        <div className="flex flex-col gap-2 border border-highlight bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>Suggested template: <strong>{suggested.name}</strong></span>
          <Button size="sm" onClick={() => apply.mutate({ name: suggested.name, rows: (suggested.rows as unknown as TemplateRowDef[]) ?? [] })} disabled={apply.isPending}>Apply suggestion</Button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <span className={cn("rounded border px-3 py-1", hasGross && Math.abs(totals.gross - 100) > 0.01 && "border-warning text-warning")}>Gross rows: {totals.gross.toFixed(2)}%</span>
        <span className={cn("rounded border px-3 py-1", hasNet && Math.abs(totals.net - 100) > 0.01 && "border-warning text-warning")}>Net rows: {totals.net.toFixed(2)}%</span>
      </div>
      {off && (
        <div className="flex items-center gap-2 border border-warning bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="size-4" /> Split totals should be 100% for each base. You can still save.
        </div>
      )}

      {isLoading ? <LoadingRows rows={2} /> : (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Beneficiary</th><th className="p-2">Component</th><th className="p-2">Base</th><th className="p-2 w-24">Share %</th><th className="p-2 text-right">Amount</th><th className="p-2">Note</th><th className="p-2" /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <AllocationRow key={r.id} r={r} partners={partners} branches={branches.map((b) => b.name)}
                  amount={(r.base === "gross" ? gross : net) * Number(r.share_pct) / 100}
                  onUpdate={(patch) => update.mutate({ id: r.id, patch })} onDelete={() => del.mutate(r.id)} />
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No split rows yet. Apply a template or add a row.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Button variant="outline" size="sm" onClick={() => add.mutate()}><Plus className="mr-1 size-4" />Add row</Button>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply {pending?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {rows.length > 0 ? `This replaces the ${rows.length} existing row(s).` : "This adds the template rows."}{" "}
              {templates.find((t) => t.name === pending?.name)?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && apply.mutate(pending)}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AllocationRow({ r, partners, branches, amount, onUpdate, onDelete }: {
  r: Allocation; partners: Partner[]; branches: string[]; amount: number;
  onUpdate: (p: Database["public"]["Tables"]["revenue_allocations"]["Update"]) => void; onDelete: () => void;
}) {
  const needsPartner = r.beneficiary_type === "partner" || r.beneficiary_type === "firm_mp";
  return (
    <tr className="border-t align-top">
      <td className="space-y-1 p-2">
        <select className={selectCls} value={r.beneficiary_type} onChange={(e) => onUpdate({ beneficiary_type: e.target.value as Enums["beneficiary_type"] })}>
          {BENEFICIARY.map((b) => <option key={b} value={b}>{b === "firm_mp" ? "Firm/MP" : b === "ho" ? "HO" : titleise(b)}</option>)}
        </select>
        {needsPartner ? (
          <select className={selectCls} value={r.beneficiary_partner_id ?? ""} onChange={(e) => onUpdate({ beneficiary_partner_id: e.target.value || null })}>
            <option value="">— partner —</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <select className={selectCls} value={r.beneficiary_branch ?? ""} onChange={(e) => onUpdate({ beneficiary_branch: e.target.value || null })}>
            <option value="">— branch —</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
      </td>
      <td className="p-2">
        <select className={selectCls} value={r.component} onChange={(e) => onUpdate({ component: e.target.value as Enums["allocation_component"] })}>
          {COMPONENTS.map((c) => <option key={c} value={c}>{titleise(c)}</option>)}
        </select>
      </td>
      <td className="p-2">
        <select className={selectCls} value={r.base} onChange={(e) => onUpdate({ base: e.target.value as Enums["allocation_base"] })}>
          <option value="gross">Gross</option><option value="net">Net</option>
        </select>
      </td>
      <td className="p-2"><InlineNumber value={Number(r.share_pct)} onSave={(v) => onUpdate({ share_pct: v ?? 0 })} /></td>
      <td className="whitespace-nowrap p-2 pt-4 text-right font-medium">{formatCurrency(amount)}</td>
      <td className="p-2"><InlineText value={r.note} onSave={(v) => onUpdate({ note: v })} placeholder="Note" /></td>
      <td className="p-2"><Button size="icon" variant="ghost" aria-label="Delete row" onClick={onDelete}><Trash2 className="size-4" /></Button></td>
    </tr>
  );
}
