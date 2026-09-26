import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, LoadingRows, PageHeader } from "@/components/crm/page-header";
import { SharingTemplatesAdmin } from "@/components/crm/sharing-templates-admin";
import { CrossSellRulesAdmin } from "@/components/crm/cross-sell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { invitePartner, setPartnerPassword } from "@/lib/admin.functions";
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
  const setPassword = useServerFn(setPartnerPassword);

  const [newServiceLine, setNewServiceLine] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [newPartner, setNewPartner] = useState({
    name: "",
    email: "",
    branch: "Jaipur-HO",
    role: "partner" as "partner" | "admin",
    password: "",
  });
  const [editingPartner, setEditingPartner] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ name: "", email: "" });
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState("");

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
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: { branch?: string; active?: boolean; name?: string; email?: string };
    }) => {
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
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("partner_id", partnerId);
      if (deleteError) throw deleteError;
      const { error } = await supabase
        .from("user_roles")
        .insert({ partner_id: partnerId, user_id: partner.user_id, role });
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

  const assignPassword = useMutation({
    mutationFn: async ({ partnerId, password }: { partnerId: string; password: string }) =>
      setPassword({ data: { partnerId, password } }),
    onSuccess: () => {
      setPasswordFor(null);
      setPasswordValue("");
      toast.success("Password set — the partner can sign in straight away");
      void queryClient.invalidateQueries({ queryKey: ["partners"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not set this password."),
  });

  const addPartner = useMutation({
    mutationFn: async (values: {
      name: string;
      email: string;
      branch: string;
      role: "partner" | "admin";
      password: string;
    }) => {
      const email = values.email.trim().toLowerCase();
      const { data: existing } = await supabase
        .from("partners")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (existing) throw new Error("A partner with this email already exists.");

      // Placeholder auth id — replaced with the real login when the partner accepts the invite.
      const { data: created, error } = await supabase
        .from("partners")
        .insert({
          name: values.name.trim(),
          email,
          branch: values.branch,
          user_id: crypto.randomUUID(),
        })
        .select("id, user_id")
        .single();
      if (error) throw error;

      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ partner_id: created.id, user_id: created.user_id, role: values.role });
      if (roleError) throw roleError;

      if (values.password.trim()) {
        await setPassword({ data: { partnerId: created.id, password: values.password.trim() } });
        return "password" as const;
      }

      await sendInvite({ data: { email, redirectTo: `${window.location.origin}/reset-password` } });
      return "invite" as const;
    },
    onSuccess: (mode) => {
      setNewPartner({ name: "", email: "", branch: "Jaipur-HO", role: "partner", password: "" });
      toast.success(
        mode === "password"
          ? "Partner added with a password — they can sign in now"
          : "Partner added and invitation sent",
      );
      void queryClient.invalidateQueries({ queryKey: ["partners"] });
      void queryClient.invalidateQueries({ queryKey: ["user-roles"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not add this partner."),
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
  if (!me?.isAdmin)
    return (
      <EmptyState title="Administrators only" description="Ask an AOM administrator for access." />
    );

  return (
    <div className="space-y-6">
      <PageHeader title="Admin" description="Manage the team, service lines and branches." />

      <Tabs defaultValue="partners">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="services">Service lines</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="templates">Sharing templates</TabsTrigger>
          <TabsTrigger value="cross-sell">Cross-sell rules</TabsTrigger>
        </TabsList>

        <TabsContent value="partners" className="space-y-3 pt-5">
          <div className="space-y-3 border border-border bg-muted/40 p-4">
            <p className="font-medium text-foreground">Add a partner</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                value={newPartner.name}
                onChange={(event) => setNewPartner({ ...newPartner, name: event.target.value })}
                placeholder="Full name"
                aria-label="Partner name"
              />
              <Input
                value={newPartner.email}
                onChange={(event) => setNewPartner({ ...newPartner, email: event.target.value })}
                placeholder="Email address"
                type="email"
                aria-label="Partner email"
              />
              <select
                value={newPartner.branch}
                onChange={(event) => setNewPartner({ ...newPartner, branch: event.target.value })}
                className="h-9 w-full border border-input bg-background px-3 text-sm"
                aria-label="Branch"
              >
                {BRANCH_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                value={newPartner.role}
                onChange={(event) =>
                  setNewPartner({ ...newPartner, role: event.target.value as "partner" | "admin" })
                }
                className="h-9 w-full border border-input bg-background px-3 text-sm"
                aria-label="Role"
              >
                <option value="partner">Partner</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button
              disabled={
                !newPartner.name.trim() || !newPartner.email.trim() || addPartner.isPending
              }
              onClick={() => addPartner.mutate(newPartner)}
            >
              Add partner &amp; send invitation
            </Button>
          </div>

          {partners.map((partner) => {
            const role = roles.find((item) => item.partner_id === partner.id)?.role ?? "partner";
            const isEditing = editingPartner === partner.id;
            return (
              <div key={partner.id} className="space-y-3 border border-border bg-background p-4">
                {isEditing ? (
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
                    <Input
                      value={editValues.name}
                      onChange={(event) =>
                        setEditValues({ ...editValues, name: event.target.value })
                      }
                      aria-label="Edit name"
                    />
                    <Input
                      value={editValues.email}
                      onChange={(event) =>
                        setEditValues({ ...editValues, email: event.target.value })
                      }
                      type="email"
                      aria-label="Edit email"
                    />
                    <Button
                      size="sm"
                      disabled={!editValues.name.trim() || !editValues.email.trim()}
                      onClick={() => {
                        updatePartner.mutate({
                          id: partner.id,
                          values: {
                            name: editValues.name.trim(),
                            email: editValues.email.trim().toLowerCase(),
                          },
                        });
                        setEditingPartner(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingPartner(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{partner.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{partner.email}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingPartner(partner.id);
                        setEditValues({ name: partner.name, email: partner.email });
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor={`branch-${partner.id}`} className="text-xs">
                      Branch
                    </Label>
                    <select
                      id={`branch-${partner.id}`}
                      value={partner.branch}
                      onChange={(event) =>
                        updatePartner.mutate({
                          id: partner.id,
                          values: { branch: event.target.value },
                        })
                      }
                      className="h-9 w-full border border-input bg-background px-3 text-sm"
                    >
                      {BRANCH_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`role-${partner.id}`} className="text-xs">
                      Role
                    </Label>
                    <select
                      id={`role-${partner.id}`}
                      value={role}
                      onChange={(event) =>
                        updateRole.mutate({
                          partnerId: partner.id,
                          role: event.target.value as "partner" | "admin",
                        })
                      }
                      className="h-9 w-full border border-input bg-background px-3 text-sm"
                    >
                      <option value="partner">Partner</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`active-${partner.id}`} className="text-xs">
                      Status
                    </Label>
                    <select
                      id={`active-${partner.id}`}
                      value={partner.active ? "active" : "inactive"}
                      onChange={(event) =>
                        updatePartner.mutate({
                          id: partner.id,
                          values: { active: event.target.value === "active" },
                        })
                      }
                      className="h-9 w-full border border-input bg-background px-3 text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!partner.active || invite.isPending}
                  onClick={() => invite.mutate(partner.email)}
                >
                  Send invitation
                </Button>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="services" className="space-y-3 pt-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newServiceLine}
              onChange={(event) => setNewServiceLine(event.target.value)}
              placeholder="New service line"
              aria-label="New service line"
            />
            <Button
              disabled={!newServiceLine.trim()}
              onClick={() => addServiceLine.mutate(newServiceLine)}
            >
              Add
            </Button>
          </div>
          {serviceLines.map((line) => (
            <div
              key={line.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border border-border bg-background p-3"
            >
              <p className="truncate text-sm text-foreground">{line.name}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toggleServiceLine.mutate({ id: line.id, active: !line.active })}
              >
                {line.active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="branches" className="space-y-3 pt-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newBranch}
              onChange={(event) => setNewBranch(event.target.value)}
              placeholder="New branch"
              aria-label="New branch"
            />
            <Button disabled={!newBranch.trim()} onClick={() => addBranch.mutate(newBranch)}>
              Add
            </Button>
          </div>
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border border-border bg-background p-3"
            >
              <p className="truncate text-sm text-foreground">{branch.name}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toggleBranch.mutate({ id: branch.id, active: !branch.active })}
              >
                {branch.active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="templates" className="space-y-3 pt-5">
          <SharingTemplatesAdmin />
        </TabsContent>

        <TabsContent value="cross-sell" className="space-y-3 pt-5">
          <CrossSellRulesAdmin />
        </TabsContent>
      </Tabs>
    </div>
  );
}
