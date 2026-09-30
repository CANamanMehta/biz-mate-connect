import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DocumentsPanel } from "@/components/crm/documents";
import { LoadingRows } from "@/components/crm/page-header";
import { RevenueSplit } from "@/components/crm/revenue-split";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, isoDay, useBranches, useCurrentPartner, usePartners, useServiceLines } from "@/lib/crm";
import { cn } from "@/lib/utils";

export const WON_STAGE_MESSAGE = "Move the deal to Proposal or Negotiation before marking it won.";
const selectCls = "h-9 w-full border border-input bg-background px-2 text-sm";
const STEPS = ["Confirm the deal", "Conflict check", "Revenue split", "Relationship owner"];

/** Returns a function that either opens the wizard or explains why it can't. */
export function useStartConversion(open: (id: string) => void) {
  const { data: me } = useCurrentPartner();
  return (opp: { id: string; stage: string }) => {
    if (opp.stage === "proposal" || opp.stage === "negotiation" || me?.isAdmin) open(opp.id);
    else toast.error(WON_STAGE_MESSAGE);
  };
}

function useConversionOpp(id: string | null) {
  return useQuery({
    queryKey: ["opportunity", id, "conversion"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("*, organisations(id, name, city, home_branch), opportunity_service_lines(id, service_line_id), opportunity_collaborators(id, partner_id)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function ConversionWizard({ opportunityId, onClose }: { opportunityId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: opp, isLoading } = useConversionOpp(opportunityId);
  const { data: me } = useCurrentPartner();
  const { data: partners = [] } = usePartners();
  const { data: services = [] } = useServiceLines();
  const { data: branches = [] } = useBranches();

  const [step, setStep] = useState(0);
  const [fee, setFee] = useState("");
  const [expenses, setExpenses] = useState("");
  const [start, setStart] = useState(isoDay());
  const [won, setWon] = useState<string[]>([]);
  const [recurring, setRecurring] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [conflictNote, setConflictNote] = useState("");
  const [owner, setOwner] = useState("");
  const [override, setOverride] = useState("");

  const { data: splitCount = 0 } = useQuery({
    queryKey: ["opp-allocations", opportunityId],
    enabled: !!opportunityId,
    queryFn: async () => {
      const { data, error } = await supabase.from("revenue_allocations").select("*").eq("opportunity_id", opportunityId!).order("created_at");
      if (error) throw error;
      return data;
    },
    select: (d) => d.length,
  });

  const suggestedOwner = useMemo(() => {
    if (!opp) return "";
    const team = [opp.owner_partner_id, ...opp.opportunity_collaborators.map((c) => c.partner_id)];
    if (opp.execution_mode === "collaboration" || opp.execution_mode === "branch_executed" || opp.execution_mode === "split_ho_branch") {
      const branchPartner = team.find((id) => { const b = partners.find((p) => p.id === id)?.branch; return b && b !== "Jaipur-HO"; });
      if (branchPartner) return branchPartner;
    }
    return opp.owner_partner_id;
  }, [opp, partners]);

  const suggestedCode = useMemo(() => {
    if (!opp) return null;
    const city = opp.organisations?.city?.trim().toLowerCase();
    const branchCity = !!city && branches.some((b) => b.name !== "Jaipur-HO" && b.name.toLowerCase().startsWith(city));
    if (opp.execution_mode === "branch_executed") return "T1";
    if (opp.execution_mode === "ho_executed") {
      if (opp.acquisition_source === "managing_partner") return "T2";
      if (opp.acquisition_source === "partner_self") return "T3";
      if (branchCity) return "T4";
    }
    return "T6";
  }, [opp, branches]);

  useEffect(() => {
    if (!opp) return;
    setStep(0);
    setFee(Number(opp.estimated_gross_fee) > 0 ? String(opp.estimated_gross_fee) : "");
    setExpenses(String(opp.estimated_expenses ?? 0));
    setStart(isoDay());
    setWon(opp.opportunity_service_lines.map((s) => s.service_line_id));
    setRecurring(false); setConflict(false); setConflictNote(""); setOverride("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opp?.id]);
  useEffect(() => { if (suggestedOwner) setOwner(suggestedOwner); }, [suggestedOwner]);

  const feeN = Number(fee);
  const expN = Number(expenses || 0);
  const needsOverride = !!opp && opp.stage !== "proposal" && opp.stage !== "negotiation";
  const pitched = new Set(opp?.opportunity_service_lines.map((s) => s.service_line_id));
  const serviceOptions = services.filter((s) => (pitched.size ? pitched.has(s.id) : s.active));

  const stepOk = [
    feeN > 0 && expN >= 0 && !!start && won.length > 0 && (!needsOverride || override.trim().length > 0),
    conflict,
    splitCount > 0,
    !!owner,
  ];

  const convert = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("convert_opportunity", {
        _opportunity_id: opportunityId!, _final_fee: feeN, _final_expenses: expN, _start_date: start,
        _service_line_ids: won, _recurring: recurring, _conflict_confirmed: conflict, _conflict_note: conflictNote,
        _relationship_owner_partner_id: owner, ...(needsOverride ? { _override_reason: override } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deal won — converted");
      void qc.invalidateQueries();
      const id = opportunityId!;
      onClose();
      void navigate({ to: "/opportunities/$opportunityId/handover", params: { opportunityId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const splitOpp = opp ? { ...opp, estimated_gross_fee: feeN || Number(opp.estimated_gross_fee), estimated_expenses: expN } : null;

  return (
    <Dialog open={!!opportunityId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Mark as won{opp ? ` — ${opp.organisations?.name ?? opp.title}` : ""}</DialogTitle>
          <DialogDescription>Step {step + 1} of 4 · {STEPS[step]}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1">{STEPS.map((s, i) => <div key={s} className={cn("h-1 flex-1", i <= step ? "bg-highlight" : "bg-muted")} />)}</div>

        {isLoading || !opp ? <LoadingRows rows={3} /> : (
          <div className="space-y-4">
            {step === 0 && (
              <>
                {needsOverride && (
                  <div className="space-y-1 border border-warning bg-warning/10 p-3">
                    <p className="text-sm">{WON_STAGE_MESSAGE} As an admin you can override with a reason.</p>
                    <Textarea value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Override reason (required)" rows={2} />
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1"><Label>Final gross fee (₹) *</Label><Input type="number" inputMode="decimal" min={0} value={fee} onChange={(e) => setFee(e.target.value)} /></div>
                  <div className="space-y-1"><Label>Final expenses (₹)</Label><Input type="number" inputMode="decimal" min={0} value={expenses} onChange={(e) => setExpenses(e.target.value)} /></div>
                  <div className="space-y-1"><Label>Net profit</Label><p className="pt-1.5 text-lg font-semibold text-primary">{formatCurrency((feeN || 0) - expN)}</p></div>
                  <div className="space-y-1"><Label>Engagement start date *</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Recurring engagement?</Label>
                    <div className="flex gap-2">
                      {[true, false].map((v) => (
                        <Button key={String(v)} type="button" size="sm" variant={recurring === v ? "default" : "outline"} onClick={() => setRecurring(v)}>{v ? "Yes" : "No"}</Button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Service lines won * (at least one)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {serviceOptions.map((s) => {
                      const on = won.includes(s.id);
                      return (
                        <button key={s.id} type="button" onClick={() => setWon(on ? won.filter((x) => x !== s.id) : [...won, s.id])}
                          className={cn("rounded-full border px-3 py-1 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Engagement letter (optional)</Label>
                  <DocumentsPanel organisationId={opp.organisation_id} opportunityId={opp.id} fixedType="engagement_letter" allowed={["pdf", "docx"]} />
                </div>
              </>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <label className="flex items-start gap-3 border p-3 text-sm">
                  <Checkbox checked={conflict} onCheckedChange={(v) => setConflict(v === true)} className="mt-0.5" />
                  <span>I confirm there is no known conflict of interest or independence issue in accepting this engagement, including with existing audit clients.</span>
                </label>
                <div className="space-y-1"><Label>Note (optional)</Label><Textarea value={conflictNote} onChange={(e) => setConflictNote(e.target.value)} rows={2} /></div>
              </div>
            )}

            {step === 2 && splitOpp && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Amounts use the final fee of {formatCurrency(feeN)}. At least one row is required.</p>
                <RevenueSplit opp={splitOpp} partners={partners} meId={me?.partner.id} suggestedCode={suggestedCode}
                  onChange={() => qc.invalidateQueries({ queryKey: ["opportunity", opportunityId] })} />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-2">
                <Label>Relationship owner for {opp.organisations?.name}</Label>
                <select className={cn(selectCls, "sm:max-w-sm")} value={owner} onChange={(e) => setOwner(e.target.value)}>
                  {partners.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.branch}{p.id === suggestedOwner ? " (suggested)" : ""}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">
                  On finish: deal moves to Converted (100%), the organisation becomes a Client, won services are marked engaged
                  {recurring ? ", and a renewal opportunity is created" : ""}.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
          {step < 3 ? (
            <Button disabled={!stepOk[step]} onClick={() => setStep(step + 1)}>Next</Button>
          ) : (
            <Button disabled={!stepOk.every(Boolean) || convert.isPending} onClick={() => convert.mutate()}>{convert.isPending ? "Saving…" : "Mark as won"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UndoConversionButton({ opportunityId, convertedAt }: { opportunityId: string; convertedAt: string | null }) {
  const qc = useQueryClient();
  const { data: me } = useCurrentPartner();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const undo = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("undo_conversion", { _opportunity_id: opportunityId, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Conversion undone"); setOpen(false); void qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!me?.isAdmin || !convertedAt || Date.now() - new Date(convertedAt).getTime() > 7 * 86_400_000) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Undo2 /> Undo conversion</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo conversion</DialogTitle>
            <DialogDescription>Returns the deal to Negotiation. The organisation goes back to Prospect if it has no other won deal, and an untouched renewal is removed.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!reason.trim() || undo.isPending} onClick={() => undo.mutate()}>Undo conversion</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
