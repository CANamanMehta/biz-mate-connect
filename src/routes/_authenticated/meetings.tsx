import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/crm/page-header";

export const Route = createFileRoute("/_authenticated/meetings")({
  head: () => ({
    meta: [
      { title: "Meetings | AOM CRM" },
      {
        name: "description",
        content: "Meeting notes, commitments and next steps for AOM clients.",
      },
      { property: "og:title", content: "Meetings | AOM CRM" },
      { property: "og:description", content: "Record discussions, decisions and follow-ups." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <PageHeader title="Meetings" description="Discussions, commitments and next steps." />
      <EmptyState
        title="Meeting logging coming next"
        description="Meetings recorded against an organisation will appear here."
      />
    </div>
  ),
});
