import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/crm/page-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/crm";
import { disconnectGoogle } from "@/lib/google.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "My settings | AOM CRM" },
      { name: "description", content: "Your AOM CRM settings and connected accounts." },
      { property: "og:title", content: "My settings | AOM CRM" },
      { property: "og:description", content: "Your AOM CRM settings and connected accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const disconnect = useServerFn(disconnectGoogle);
  const [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ["google-status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_google_status");
      if (error) throw error;
      return data?.[0] ?? { connected: false, google_email: null, connected_at: null };
    },
  });

  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("google");
    if (g === "connected") toast.success("Google Calendar connected");
    if (g === "error") toast.error("Could not connect Google Calendar");
    if (g) window.history.replaceState(null, "", "/settings");
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/google/connect", {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Could not start Google sign-in");
      window.location.href = body.url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setBusy(true);
    try {
      await disconnect();
      toast.success("Google Calendar disconnected");
      await qc.invalidateQueries({ queryKey: ["google-status"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const s = status.data;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="My settings" />
      <section className="border border-border bg-background p-5">
        <h2 className="font-display text-base font-semibold text-primary">Google Calendar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {status.isLoading
            ? "Checking…"
            : s?.connected
              ? `Connected as ${s.google_email ?? "Google account"} since ${formatDate(s.connected_at)}`
              : "Not connected"}
        </p>
        <div className="mt-4">
          {s?.connected ? (
            <Button variant="outline" onClick={onDisconnect} disabled={busy}>Disconnect</Button>
          ) : (
            <Button onClick={connect} disabled={busy || status.isLoading}>Connect Google Calendar</Button>
          )}
        </div>
      </section>
    </div>
  );
}
