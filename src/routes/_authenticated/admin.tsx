import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, LoadingRows, PageHeader } from "@/components/crm/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { invitePartner } from "@/lib/admin.functions";
import { useBranches, useCurrentPartner, usePartners, useServiceLines } from "@/lib/crm";

const BRANCH_OPTIONS = ["Jaipur-HO", "Indore", "Ahmedabad", "other"];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin | AOM CRM" },
      { name: "description", content: "Manage AOM partners, service lines and branches." },
      { property: "og:title", content: "Admin | AOM CRM" },
      { property: "og:description", content: "Administrator settings for the AOM CRM workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me, isLoading: loadingMe } = useCurrentPartner();
  const { data: partners = [], isLoading } = usePartners();
  const { data: serviceLines = [] } = useServiceLines();
  const { data: branches = [] } = useBranches();
  const sendInvite = useServerFn(invitePartner);

  const [newServiceLine, setNewServiceLine] = useState("");
  const [newBranch, setNewBranch] = useState("");

  const { data: roles = [] } = useQuery({
    queryKey: ["user-roles"],
    enabled: me?.isAdmin ?? false,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("partner_id, role");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!loadingMe && me && !me.isAdmin) void navigate({ to: "/dashboard", replace: true });
  }, [loadingMe, me, navigate]);

  const updatePartner = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from("partners").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Partner updated");
      void queryClient.invalidateQueries({ queryKey: ["partners"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateRole = useMutation({
    mutationFn: async ({ partnerId, role }: { partnerId: string; role: "partner" | "admin" }) => {
      const partner = partners.find((item) => item.id === partnerId);
      if (!partner) throw new Error("Partner not found");
      const { error: deleteError } = await supabase.from("user_roles").delete().eq("partner_id", partnerId);
      if (deleteError) throw deleteError;
      const { error } = await supabase.from("user_roles").insert({ partner_id: partnerId, user_id: partner.user_id, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      void queryClient.invalidateQueries({ queryKey: ["user-roles"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const invite = useMutation({
    mutationFn: async (email: string) =>
      sendInvite({ data: { email, redirectTo: `${window.location.origin}/reset-password` } }),
    onSuccess: () => toast.success("Invitation sent"),
    onError: (error: Error) => toast.error(error.message || "Could not send this invitation."),
  });

  const addServiceLine = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("service_lines").insert({ name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewServiceLine("");
      toast.success("Service line added");
      void queryClient.invalidateQueries({ queryKey: ["service-lines"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleServiceLine = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("service_lines").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["service-lines"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const addBranch = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("branches").insert({ name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewBranch("");
      toast.success("Branch added");
      void queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleBranch = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("branches").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["branches"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  if (loadingMe || isLoading) return <LoadingRows rows={6} />;
  if (!me?.isAdmin) return <EmptyState title="Administrators only" description="Ask an AOM administrator for access." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Admin" description="Manage the team, service lines and branches." />

      <Tabs defaultValue="partners">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="services">Service lines</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
        </TabsList>

        <TabsContent value="partners" className="space-y-3 pt-5">
          {partners.map((partner) => {
            const role = roles.find((item) => item.partner_id === partner.id)?.role ?? "partner";
            return (
              <div key={partner.id} className="space-y-3 border border-border bg-background p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{partner.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{partner.email}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor={`branch-${partner.id}`} className="text-xs">Branch</Label>
                    <select
                      id={`branch-${partner.id}`}
                      value={partner.branch}
                      onChange={(event) => updatePartner.mutate({ id: partner.id, values: { branch: event.target.value } })}
                      className="h-9 w-full border border-input bg-background px-3 text-sm"
                    >
                      {BRANCH_OPTIONS.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`role-${partner.id}`} className="text-xs">Role</Label>
                    <select
                      id={`role-${partner.id}`}
                      value={role}
                      onChange={(event) => updateRole.mutate({ partnerId: partner.id, role: event.target.value as "partner" | "admin" })}
                      className="h-9 w-full border border-input bg-background px-3 text-sm"
                    >
                      <option value="partner">Partner</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`active-${partner.id}`} className="text-xs">Status</Label>
                    <select
                      id={`active-${partner.id}`}
                      value={partner.active ? "active" : "inactive"}
                      onChange={(event) => updatePartner.mutate({ id: partner.id, values: { active: event.target.value === "active" } })}
                      className="h-9 w-full border border-input bg-background px-3 text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled={!partner.active || invite.isPending} onClick={() => invite.mutate(partner.email)}>
                  Send invitation
                </Button>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="services" className="space-y-3 pt-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={newServiceLine} onChange={(event) => setNewServiceLine(event.target.value)} placeholder="New service line" aria-label="New service line" />
            <Button disabled={!newServiceLine.trim()} onClick={() => addServiceLine.mutate(newServiceLine)}>Add</Button>
          </div>
          {serviceLines.map((line) => (
            <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border border-border bg-background p-3">
              <p className="truncate text-sm text-foreground">{line.name}</p>
              <Button size="sm" variant="outline" onClick={() => toggleServiceLine.mutate({ id: line.id, active: !line.active })}>
                {line.active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="branches" className="space-y-3 pt-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={newBranch} onChange={(event) => setNewBranch(event.target.value)} placeholder="New branch" aria-label="New branch" />
            <Button disabled={!newBranch.trim()} onClick={() => addBranch.mutate(newBranch)}>Add</Button>
          </div>
          {branches.map((branch) => (
            <div key={branch.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border border-border bg-background p-3">
              <p className="truncate text-sm text-foreground">{branch.name}</p>
              <Button size="sm" variant="outline" onClick={() => toggleBranch.mutate({ id: branch.id, active: !branch.active })}>
                {branch.active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
