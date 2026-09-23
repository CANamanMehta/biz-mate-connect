import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "AOM CRM | A O Mittal & Associates LLP" },
      { name: "description", content: "Secure business development and client opportunity management for A O Mittal & Associates LLP." },
      { property: "og:title", content: "AOM CRM" },
      { property: "og:description", content: "Secure business development and client opportunity management for A O Mittal & Associates LLP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => null,
});
