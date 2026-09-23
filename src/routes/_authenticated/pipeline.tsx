import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/crm/page-header";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline | AOM CRM" },
      { name: "description", content: "AOM opportunity pipeline across every stage." },
      { property: "og:title", content: "Pipeline | AOM CRM" },
      { property: "og:description", content: "Track AOM opportunities from enquiry through conversion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <PageHeader title="Pipeline" description="Stage-by-stage view of every live opportunity." />
      <EmptyState title="Pipeline board coming next" description="Enquiries you qualify today will appear here." />
    </div>
  ),
});
