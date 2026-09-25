import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, LoadingRows, PageHeader } from "@/components/crm/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, titleise } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/enquiries")({
  head: () => ({
    meta: [
      { title: "Enquiries | AOM CRM" },
      { name: "description", content: "Newly captured AOM enquiries awaiting qualification." },
      { property: "og:title", content: "Enquiries | AOM CRM" },
      { property: "og:description", content: "Qualify or disqualify incoming client enquiries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EnquiriesPage,
});

function EnquiriesPage() {
  const queryClient = useQueryClient();
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data: enquiries = [], isLoading } = useQuery({
    queryKey: ["enquiries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select(
          "id, title, urgency, status, estimated_gross_fee, created_at, last_activity_date, organisations(id, name, city), partners!opportunities_owner_partner_id_fkey(name)",
        )
        .eq("stage", "outreach")
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const act = useMutation({
    mutationFn: async ({
      id,
      action,
      note,
    }: {
      id: string;
      action: "qualify" | "disqualify";
      note?: string;
    }) => {
      const { error } = await supabase.rpc("update_enquiry_stage", {
        _opportunity_id: id,
        _action: action,
        ...(note ? { _reason: note } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enquiry updated");
      setReasonFor(null);
      setReason("");
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message || "Could not update this enquiry."),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Enquiries" description="Newest first. Qualify or disqualify in one tap." />

      {isLoading && <LoadingRows />}
      {!isLoading && enquiries.length === 0 && (
        <EmptyState
          title="No open enquiries"
          description="New enquiries appear here as soon as they are captured."
        />
      )}

      <div className="space-y-3">
        {enquiries.map((enquiry) => (
          <article key={enquiry.id} className="border border-border bg-background p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link
                  to="/organisations/$organisationId"
                  params={{ organisationId: enquiry.organisations?.id ?? "" }}
                  className="block truncate font-display text-base font-semibold text-primary hover:underline"
                >
                  {enquiry.organisations?.name ?? "Organisation"}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  Owner {enquiry.partners?.name ?? "—"} · {titleise(enquiry.urgency)} urgency ·{" "}
                  {formatCurrency(enquiry.estimated_gross_fee)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Captured {formatDate(enquiry.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => act.mutate({ id: enquiry.id, action: "qualify" })}
                  disabled={act.isPending}
                >
                  Qualify
                </Button>
                <Button size="sm" variant="outline" onClick={() => setReasonFor(enquiry.id)}>
                  Disqualify
                </Button>
              </div>
            </div>

            {reasonFor === enquiry.id && (
              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
                <Input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Reason for disqualifying"
                  aria-label="Reason for disqualifying"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!reason.trim() || act.isPending}
                    onClick={() =>
                      act.mutate({ id: enquiry.id, action: "disqualify", note: reason })
                    }
                  >
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setReasonFor(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
