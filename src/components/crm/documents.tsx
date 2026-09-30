import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState, LoadingRows } from "@/components/crm/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { formatDate, useCurrentPartner } from "@/lib/crm";

type DocType = Database["public"]["Enums"]["document_type"];
export const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: "research_report", label: "Research Report" },
  { value: "proposal", label: "Proposal" },
  { value: "engagement_letter", label: "Engagement Letter" },
  { value: "nda", label: "NDA" },
  { value: "other", label: "Other" },
];
const ALLOWED = ["pdf", "docx", "xlsx", "pptx"];
const MAX = 20 * 1024 * 1024;
const selectCls = "h-9 w-full border border-input bg-background px-2 text-sm";

export function DocumentsPanel({ organisationId, opportunityId, fixedType, allowed = ALLOWED }: { organisationId: string; opportunityId?: string; fixedType?: DocType; allowed?: string[] }) {
  const qc = useQueryClient();
  const { data: me } = useCurrentPartner();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<DocType>(fixedType ?? (opportunityId ? "proposal" : "other"));
  const [notes, setNotes] = useState("");
  const key = ["documents", organisationId, opportunityId ?? "all"];

  const { data: docs = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase.from("documents").select("*, partners(name), opportunities(title)").eq("organisation_id", organisationId);
      if (opportunityId) q = q.eq("opportunity_id", opportunityId);
      if (fixedType) q = q.eq("doc_type", fixedType);
      const { data, error } = await q.order("doc_type").order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!allowed.includes(ext)) throw new Error(`Only ${allowed.map((a) => a.toUpperCase()).join(", ")} files`);
      if (file.size > MAX) throw new Error("File is larger than 20 MB");
      if (!me) throw new Error("Not signed in");
      const path = `${organisationId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("crm-documents").upload(path, file, file.type ? { contentType: file.type } : {});
      if (upErr) throw upErr;
      const { error } = await supabase.from("documents").insert({
        organisation_id: organisationId,
        opportunity_id: opportunityId ?? null,
        doc_type: docType,
        file_path: path,
        file_name: file.name,
        notes: notes.trim() || null,
        uploaded_by: me.partner.id,
      });
      if (error) {
        await supabase.storage.from("crm-documents").remove([path]);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["documents"] });
      void qc.invalidateQueries({ queryKey: ["opp-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => { if (fileRef.current) fileRef.current.value = ""; },
  });

  const remove = useMutation({
    mutationFn: async (d: { id: string; file_path: string }) => {
      const { error } = await supabase.from("documents").delete().eq("id", d.id);
      if (error) throw error;
      await supabase.storage.from("crm-documents").remove([d.file_path]);
    },
    onSuccess: () => { toast.success("Document deleted"); void qc.invalidateQueries({ queryKey: ["documents"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function download(path: string, name: string) {
    const { data, error } = await supabase.storage.from("crm-documents").createSignedUrl(path, 60, { download: name });
    if (error || !data) { toast.error(error?.message ?? "Could not download"); return; }
    window.open(data.signedUrl, "_blank");
  }

  const groups = DOC_TYPES.map((t) => ({ ...t, items: docs.filter((d) => d.doc_type === t.value) })).filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 border bg-background p-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="doc-type">Type</Label>
          <select id="doc-type" disabled={!!fixedType} className={selectCls} value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
            {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="doc-notes">Notes (optional)</Label>
          <Input id="doc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
          <Upload className="size-4" /> {upload.isPending ? "Uploading…" : "Upload"}
        </Button>
        <input ref={fileRef} type="file" hidden accept={allowed.map((a) => `.${a}`).join(",")}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); }} />
        <p className="text-xs text-muted-foreground sm:col-span-3">{allowed.map((a) => a.toUpperCase()).join(", ")}, up to 20 MB. Uploading the same type again saves a new version; older versions are kept.</p>
      </div>

      {isLoading ? <LoadingRows /> : groups.length === 0 ? (
        <EmptyState title="No documents yet" description="Upload a research report, proposal or engagement letter." />
      ) : groups.map((g) => (
        <section key={g.value} className="border bg-background">
          <h3 className="border-b px-3 py-2 font-display text-sm font-semibold text-primary">{g.label}</h3>
          {g.items.map((d, i) => (
            <div key={d.id} className="flex items-center gap-3 border-b px-3 py-2.5 text-sm last:border-b-0">
              <FileText className="size-4 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  v{d.version} · {d.file_name}{" "}
                  {i === 0 && <span className="ml-1 bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">Latest</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {d.partners?.name ?? "—"} · {formatDate(d.uploaded_at)}
                  {!opportunityId && d.opportunities?.title ? ` · ${d.opportunities.title}` : ""}
                  {d.notes ? ` · ${d.notes}` : ""}
                </p>
              </div>
              <Button size="icon" variant="ghost" aria-label="Download" onClick={() => download(d.file_path, d.file_name)}><Download className="size-4" /></Button>
              {(me?.isAdmin || d.uploaded_by === me?.partner.id) && (
                <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => confirm("Delete this version?") && remove.mutate(d)}><Trash2 className="size-4" /></Button>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
