import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/crm/page-header";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports | AOM CRM" },
      { name: "description", content: "Conversion, revenue and activity reporting for AOM." },
      { property: "og:title", content: "Reports | AOM CRM" },
      { property: "og:description", content: "Firm-wide business development reporting." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Conversion, revenue and activity insight." />
      <EmptyState
        title="Reporting coming next"
        description="Reports will build on the pipeline and revenue data."
      />
    </div>
  ),
});
