import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/crm/page-header";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks | AOM CRM" },
      { name: "description", content: "Follow-ups and commitments owned by AOM partners." },
      { property: "og:title", content: "Tasks | AOM CRM" },
      { property: "og:description", content: "Track due follow-ups across the AOM team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <PageHeader title="Tasks" description="Follow-ups owned across the team." />
      <EmptyState
        title="Task management coming next"
        description="Follow-ups raised from meetings will appear here."
      />
    </div>
  ),
});
