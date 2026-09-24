import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

type Template = Database["public"]["Tables"]["sharing_templates"]["Row"];

export function SharingTemplatesAdmin() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["sharing-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sharing_templates").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Row "who" values: firm_mp, branch, ho, acquiring_partner, executing_partners. Components: firm_base, referral_acquisition, execution, branch_profit_share, custom. Base: gross or net.
      </p>
      {data.map((t) => <TemplateRow key={t.id} t={t} onSaved={() => qc.invalidateQueries({ queryKey: ["sharing-templates"] })} />)}
    </div>
  );
}

function TemplateRow({ t, onSaved }: { t: Template; onSaved: () => void }) {
  const [name, setName] = useState(t.name);
  const [description, setDescription] = useState(t.description ?? "");
  const [rows, setRows] = useState(JSON.stringify(t.rows, null, 2));
  const save = useMutation({
    mutationFn: async () => {
      let parsed: Json;
      try { parsed = JSON.parse(rows) as Json; } catch { throw new Error("Rows must be valid JSON"); }
      const { error } = await supabase.from("sharing_templates").update({ name, description, rows: parsed }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Template saved"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="space-y-2 border border-border bg-background p-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Template name" />
      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" aria-label="Description" />
      <Textarea value={rows} onChange={(e) => setRows(e.target.value)} className="font-mono text-xs" rows={5} aria-label="Rows" />
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
    </div>
  );
}
