import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ContactBadges } from "@/routes/_authenticated/contacts";
import { EmptyState, LoadingRows, PageHeader } from "@/components/crm/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { CONTACT_ROLES, formatCurrency, formatDate, titleise, useServiceLines } from "@/lib/crm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/organisations/$organisationId")({
  head: () => ({
    meta: [
      { title: "Organisation | AOM CRM" },
      { name: "description", content: "Full relationship history for an AOM organisation." },
      { property: "og:title", content: "Organisation | AOM CRM" },
      {
        property: "og:description",
        content: "Contacts, opportunities, meetings, tasks and history in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrganisationDetailPage,
});

type ContactDraft = {
  id?: string;
  name: string;
  designation: string;
  role: string;
  phone: string;
  email: string;
  is_decision_maker: boolean;
  is_referrer: boolean;
};

const emptyContact: ContactDraft = {
  name: "",
  designation: "",
  role: "",
  phone: "",
  email: "",
  is_decision_maker: false,
  is_referrer: false,
};

function OrganisationDetailPage() {
  const { organisationId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: serviceLines = [] } = useServiceLines();
  const [draft, setDraft] = useState<ContactDraft | null>(null);

  const { data: organisation, isLoading } = useQuery({
    queryKey: ["organisation", organisationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organisations")
        .select(
          "*, partners!organisations_relationship_owner_partner_id_fkey(name), organisation_services(service_line_id, status)",
        )
        .eq("id", organisationId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["organisation-contact-list", organisationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("organisation_id", organisationId)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: opportunities = [] } = useQuery({
    queryKey: ["organisation-opportunities", organisationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select(
          "id, title, stage, status, probability, estimated_gross_fee, partners!opportunities_owner_partner_id_fkey(name)",
        )
        .eq("organisation_id", organisationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: meetings = [] } = useQuery({
    queryKey: ["organisation-meetings", organisationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, type, meeting_date, next_step, next_step_date")
        .eq("organisation_id", organisationId)
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["organisation-tasks", organisationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, status, priority, partners!tasks_owner_partner_id_fkey(name)")
        .eq("organisation_id", organisationId)
        .order("due_date");
      if (error) throw error;
      return data;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["organisation-history", organisationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("id, action, detail, created_at, partners(name)")
        .eq("organisation_id", organisationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveContact = useMutation({
    mutationFn: async (values: ContactDraft) => {
      const payload = {
        organisation_id: organisationId,
        name: values.name.trim(),
        designation: values.designation.trim() || null,
        role: (values.role || null) as never,
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        is_decision_maker: values.is_decision_maker,
        is_referrer: values.is_referrer,
      };
      if (values.id) {
        const { error } = await supabase.from("contacts").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { data: partnerId } = await supabase.rpc("current_partner_id");
        const { error } = await supabase
          .from("contacts")
          .insert({ ...payload, created_by: partnerId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Contact saved");
      setDraft(null);
      void queryClient.invalidateQueries({
        queryKey: ["organisation-contact-list", organisationId],
      });
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not save this contact."),
  });

  if (isLoading) return <LoadingRows rows={6} />;
  if (!organisation) return <EmptyState title="Organisation not found" />;

  const serviceStatus = new Map(
    (organisation.organisation_services ?? []).map((row) => [row.service_line_id, row.status]),
  );

  function handleContactSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft) saveContact.mutate(draft);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={organisation.name}
        description={`${titleise(organisation.status)} · ${organisation.city ?? "No city"} · Owner ${
          organisation.partners?.name ??
          titleise(organisation.relationship_owner_type) ??
          "Unassigned"
        }`}
      />

      <Tabs defaultValue="overview">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-5">
          <section className="border border-border bg-background p-5">
            <h2 className="font-display text-sm font-semibold uppercase text-muted-foreground">
              Services
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {serviceLines
                .filter((line) => line.active)
                .map((line) => {
                  const status = serviceStatus.get(line.id);
                  return (
                    <span
                      key={line.id}
                      className={cn(
                        "border px-3 py-1.5 text-xs font-medium",
                        status === "engaged" && "border-primary bg-primary text-primary-foreground",
                        status === "pitched" && "border-accent text-accent",
                        status !== "engaged" &&
                          status !== "pitched" &&
                          "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {line.name}
                    </span>
                  );
                })}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            {[
              ["Industry", organisation.industry],
              ["Home branch", organisation.home_branch],
              ["Size band", organisation.size_band],
              ["Phone", organisation.phone],
              ["Email", organisation.email],
              ["Website", organisation.website],
            ].map(([label, value]) => (
              <div key={label as string} className="border border-border bg-background p-4">
                <p className="text-xs uppercase text-muted-foreground">{label}</p>
                <p className="mt-1 break-words text-sm text-foreground">
                  {(value as string) || "—"}
                </p>
              </div>
            ))}
          </section>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4 pt-5">
          <Button size="sm" onClick={() => setDraft({ ...emptyContact })}>
            Add contact
          </Button>

          {draft && (
            <form
              onSubmit={handleContactSubmit}
              className="space-y-4 border border-border bg-background p-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contact-name">Name</Label>
                  <Input
                    id="contact-name"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-designation">Designation</Label>
                  <Input
                    id="contact-designation"
                    value={draft.designation}
                    onChange={(event) => setDraft({ ...draft, designation: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-role">Role</Label>
                  <select
                    id="contact-role"
                    value={draft.role}
                    onChange={(event) => setDraft({ ...draft, role: event.target.value })}
                    className="h-9 w-full border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Not set</option>
                    {CONTACT_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {titleise(role)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-phone">Phone</Label>
                  <Input
                    id="contact-phone"
                    value={draft.phone}
                    onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={draft.email}
                    onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.is_decision_maker}
                    onChange={(event) =>
                      setDraft({ ...draft, is_decision_maker: event.target.checked })
                    }
                  />
                  Decision maker
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.is_referrer}
                    onChange={(event) => setDraft({ ...draft, is_referrer: event.target.checked })}
                  />
                  Referrer
                </label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={saveContact.isPending}>
                  Save contact
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {contacts.length === 0 && <EmptyState title="No contacts yet" />}
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border border-border bg-background p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{contact.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {contact.designation || titleise(contact.role)} ·{" "}
                  {[contact.phone, contact.email].filter(Boolean).join(" · ") || "No details"}
                </p>
                <ContactBadges
                  isDecisionMaker={contact.is_decision_maker}
                  isReferrer={contact.is_referrer}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft({
                    id: contact.id,
                    name: contact.name,
                    designation: contact.designation ?? "",
                    role: contact.role ?? "",
                    phone: contact.phone ?? "",
                    email: contact.email ?? "",
                    is_decision_maker: contact.is_decision_maker,
                    is_referrer: contact.is_referrer,
                  })
                }
              >
                Edit
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="opportunities" className="space-y-3 pt-5">
          {opportunities.length === 0 && <EmptyState title="No opportunities yet" />}
          {opportunities.map((opportunity) => (
            <div key={opportunity.id} className="border border-border bg-background p-4">
              <p className="font-medium text-foreground">{opportunity.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {titleise(opportunity.stage)} · {titleise(opportunity.status)} ·{" "}
                {opportunity.probability}% · {formatCurrency(opportunity.estimated_gross_fee)} ·{" "}
                {opportunity.partners?.name ?? "—"}
              </p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="meetings" className="space-y-3 pt-5">
          {meetings.length === 0 && <EmptyState title="No meetings recorded" />}
          {meetings.map((meeting) => (
            <div key={meeting.id} className="border border-border bg-background p-4">
              <p className="font-medium text-foreground">
                {titleise(meeting.type)} · {formatDate(meeting.meeting_date)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Next: {meeting.next_step} by {formatDate(meeting.next_step_date)}
              </p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="tasks" className="space-y-3 pt-5">
          {tasks.length === 0 && <EmptyState title="No tasks yet" />}
          {tasks.map((task) => (
            <div key={task.id} className="border border-border bg-background p-4">
              <p className="font-medium text-foreground">{task.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Due {formatDate(task.due_date)} · {titleise(task.priority)} ·{" "}
                {titleise(task.status)} · {task.partners?.name ?? "—"}
              </p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="history" className="space-y-3 pt-5">
          {history.length === 0 && <EmptyState title="No history yet" />}
          {history.map((entry) => (
            <div key={entry.id} className="border-l-2 border-accent bg-background px-4 py-3">
              <p className="text-sm font-medium text-foreground">{titleise(entry.action)}</p>
              {entry.detail && <p className="text-sm text-muted-foreground">{entry.detail}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {entry.partners?.name ?? "System"} · {formatDate(entry.created_at)}
              </p>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
