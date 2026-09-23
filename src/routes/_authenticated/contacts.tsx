import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { EmptyState, LoadingRows, PageHeader } from "@/components/crm/page-header";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { titleise } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Contacts | AOM CRM" },
      { name: "description", content: "People AOM works with across every client and prospect." },
      { property: "og:title", content: "Contacts | AOM CRM" },
      {
        property: "og:description",
        content: "Decision makers and referrers across AOM relationships.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContactsPage,
});

export function ContactBadges({
  isDecisionMaker,
  isReferrer,
}: {
  isDecisionMaker: boolean;
  isReferrer: boolean;
}) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {isDecisionMaker && (
        <span className="bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
          Decision maker
        </span>
      )}
      {isReferrer && (
        <span className="border border-accent px-2 py-0.5 text-[11px] font-medium text-accent">
          Referrer
        </span>
      )}
    </span>
  );
}

function ContactsPage() {
  const [search, setSearch] = useState("");

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select(
          "id, name, designation, role, phone, email, is_decision_maker, is_referrer, organisations(id, name)",
        )
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = contacts.filter((contact) => {
    const term = search.toLowerCase();
    return (
      !term ||
      contact.name.toLowerCase().includes(term) ||
      (contact.phone ?? "").toLowerCase().includes(term) ||
      (contact.email ?? "").toLowerCase().includes(term) ||
      (contact.organisations?.name ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Add and edit contacts from each organisation page."
      />
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search contacts"
        aria-label="Search contacts"
        className="sm:max-w-sm"
      />

      {isLoading && <LoadingRows />}
      {!isLoading && filtered.length === 0 && (
        <EmptyState
          title="No contacts yet"
          description="Contacts are created with each new enquiry."
        />
      )}

      <div className="space-y-3">
        {filtered.map((contact) => (
          <article key={contact.id} className="border border-border bg-background p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{contact.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {contact.designation || titleise(contact.role)} ·{" "}
                  {contact.organisations?.id ? (
                    <Link
                      to="/organisations/$organisationId"
                      params={{ organisationId: contact.organisations.id }}
                      className="text-primary hover:underline"
                    >
                      {contact.organisations.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[contact.phone, contact.email].filter(Boolean).join(" · ") ||
                    "No contact details"}
                </p>
              </div>
              <ContactBadges
                isDecisionMaker={contact.is_decision_maker}
                isReferrer={contact.is_referrer}
              />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
