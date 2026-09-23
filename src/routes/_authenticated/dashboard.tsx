import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type PartnerSummary = { name: string; branch: string; is_managing_partner: boolean };

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Workspace | AOM CRM" },
      { name: "description", content: "AOM CRM's secure business development workspace." },
      { property: "og:title", content: "Workspace | AOM CRM" },
      { property: "og:description", content: "A O Mittal & Associates LLP's internal CRM workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [partner, setPartner] = useState<PartnerSummary | null>(null);

  useEffect(() => {
    void supabase.rpc("current_partner_id").then(async ({ data: partnerId }) => {
      if (!partnerId) return;
      const { data } = await supabase.from("partners").select("name, branch, is_managing_partner").eq("id", partnerId).single();
      if (data) setPartner(data);
    });
  }, []);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center bg-primary font-display text-xs font-semibold text-primary-foreground">AOM</div>
            <div><p className="font-display font-semibold text-primary">AOM CRM</p><p className="text-xs text-muted-foreground">A O Mittal &amp; Associates LLP</p></div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}><LogOut aria-hidden="true" /> Sign out</Button>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase text-accent">Secure workspace</p>
          <h1 className="font-display text-4xl font-semibold text-primary">Welcome{partner ? `, ${partner.name}` : ""}.</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">Authentication and access control are active. CRM screens will be added in the next phase.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="border border-border bg-background p-5"><Building2 className="mb-4 text-accent" aria-hidden="true" /><p className="font-medium text-foreground">{partner?.branch ?? "AOM branch"}</p><p className="mt-1 text-sm text-muted-foreground">Partner access is linked to your invited email.</p></div>
          <div className="border border-border bg-background p-5"><ShieldCheck className="mb-4 text-accent" aria-hidden="true" /><p className="font-medium text-foreground">Protected by role-based access</p><p className="mt-1 text-sm text-muted-foreground">Restricted pursuits and their related records remain private.</p></div>
        </div>
      </section>
    </main>
  );
}