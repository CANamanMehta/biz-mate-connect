import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { isoDay, usePartners, useServiceLines } from "@/lib/crm";
import { cn } from "@/lib/utils";

const selectCls =
  "h-10 w-full border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function NewTargetDialog({ open, onOpenChange, currentPartnerId }: { open: boolean; onOpenChange: (o: boolean) => void; currentPartnerId: string | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: partners = [] } = usePartners();
  const { data: services = [] } = useServiceLines();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState(isoDay(7));
  const [rationale, setRationale] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [industry, setIndustry] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(""); setOwner(currentPartnerId ?? ""); setDue(isoDay(7)); setRationale(""); setServiceIds([]); setCity(""); setIndustry("");
  }, [open, currentPartnerId]);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_target", {
        _organisation_name: name.trim(),
        _owner_partner_id: owner,
        _service_line_ids: serviceIds,
        _research_due_date: due,
        ...(rationale.trim() ? { _target_rationale: rationale.trim() } : {}),
        ...(city.trim() ? { _city: city.trim() } : {}),
        ...(industry.trim() ? { _industry: industry.trim() } : {}),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      toast.success("Target created · research task added");
      void qc.invalidateQueries();
      onOpenChange(false);
      void navigate({ to: "/opportunities/$opportunityId", params: { opportunityId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !owner || !due) { toast.error("Add the organisation, owner and research due date"); return; }
    save.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-primary">New target</DialogTitle>
          <DialogDescription>A company you want to approach. Starts at Target with source "Outbound - partner research".</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Organisation</Label>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-owner">Owner</Label>
              <select id="t-owner" className={selectCls} value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">Choose…</option>
                {partners.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-due">Research due</Label>
              <Input id="t-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Services to pitch</Label>
            <div className="flex flex-wrap gap-1.5">
              {services.filter((s) => s.active).map((s) => {
                const on = serviceIds.includes(s.id);
                return (
                  <button key={s.id} type="button" aria-pressed={on}
                    onClick={() => setServiceIds(on ? serviceIds.filter((x) => x !== s.id) : [...serviceIds, s.id])}
                    className={cn("border px-2.5 py-1 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-why">Why this company?</Label>
            <Textarea id="t-why" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Why this company, which services" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="t-city">City</Label><Input id="t-city" value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="t-ind">Industry</Label><Input id="t-ind" value={industry} onChange={(e) => setIndustry(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={save.isPending}>{save.isPending ? "Saving…" : "Create target"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
