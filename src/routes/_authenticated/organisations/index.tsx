import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { EmptyState, LoadingRows, PageHeader } from "@/components/crm/page-header";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, titleise, useBranches } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/organisations/")({
  head: () => ({
    meta: [
      { title: "Organisations | AOM CRM" },
      { name: "description", content: "All AOM client and prospect organisations with owners and activity." },
      { property: "og:title", content: "Organisations | AOM CRM" },
      { property: "og:description", content: "Browse and filter AOM organisations by status, branch and industry." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrganisationsPage,
});

function OrganisationsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [branch, setBranch] = useState("");
  const [industry, setIndustry] = useState("");
  const { data: branches = [] } = useBranches();

  const { data: organisations = [], isLoading } = useQuery({
    queryKey: ["organisations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organisations")
        .select(
          "id, name, city, status, industry, home_branch, relationship_owner_type, relationship_owner_branch, partners!organisations_relationship_owner_partner_id_fkey(name), opportunities(id, status, last_activity_date)",
        )
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: notices = [] } = useQuery({
    queryKey: ["restricted-notices"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("restricted_pursuit_notices");
      if (error) throw error;
      return data ?? [];
    },
  });

  const industries = useMemo(
    () => Array.from(new Set(organisations.map((org) => org.industry).filter(Boolean) as string[])).sort(),
    [organisations],
  );

  const filtered = organisations.filter((org) => {
    const matchesSearch = !search || org.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !status || org.status === status;
    const matchesBranch = !branch || org.home_branch === branch || org.relationship_owner_branch === branch;
    const matchesIndustry = !industry || org.industry === industry;
    return matchesSearch && matchesStatus && matchesBranch && matchesIndustry;
  });

  function ownerLabel(org: (typeof organisations)[number]) {
    if (org.partners?.name) return org.partners.name;
    if (org.relationship_owner_type === "branch") return org.relationship_owner_branch ?? "Branch";
    if (org.relationship_owner_type === "ho") return "Head office";
    return "Unassigned";
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Organisations" description="Every client and prospect relationship across AOM." />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" aria-label="Search organisations" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" className="h-9 border border-input bg-background px-3 text-sm">
          <option value="">All statuses</option>
          {["prospect", "client", "dormant"].map((value) => (
            <option key={value} value={value}>{titleise(value)}</option>
          ))}
        </select>
        <select value={branch} onChange={(event) => setBranch(event.target.value)} aria-label="Filter by branch" className="h-9 border border-input bg-background px-3 text-sm">
          <option value="">All branches</option>
          {branches.map((item) => (
            <option key={item.id} value={item.name}>{item.name}</option>
          ))}
        </select>
        <select value={industry} onChange={(event) => setIndustry(event.target.value)} aria-label="Filter by industry" className="h-9 border border-input bg-background px-3 text-sm">
          <option value="">All industries</option>
          {industries.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingRows />}
      {!isLoading && filtered.length === 0 && (
        <EmptyState title="No organisations match" description="Adjust the filters or capture a new enquiry." />
      )}

      {filtered.length > 0 && (
        <>
          <div className="hidden overflow-x-auto border border-border bg-background lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Relationship owner</th>
                  <th className="px-4 py-3 font-medium">Open opportunities</th>
                  <th className="px-4 py-3 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((org) => {
                  const open = org.opportunities?.filter((item) => item.status === "open") ?? [];
                  const last = open.map((item) => item.last_activity_date).filter(Boolean).sort().at(-1);
                  const notice = notices.find((item) => item.organisation_id === org.id);
                  return (
                    <tr key={org.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <Link to="/organisations/$organisationId" params={{ organisationId: org.id }} className="font-medium text-primary hover:underline">
                          {org.name}
                        </Link>
                        {notice && <p className="text-xs text-accent">{notice.notice}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{org.city ?? "—"}</td>
                      <td className="px-4 py-3">{titleise(org.status)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{ownerLabel(org)}</td>
                      <td className="px-4 py-3">{open.length}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(last ?? null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 lg:hidden">
            {filtered.map((org) => {
              const open = org.opportunities?.filter((item) => item.status === "open") ?? [];
              const last = open.map((item) => item.last_activity_date).filter(Boolean).sort().at(-1);
              const notice = notices.find((item) => item.organisation_id === org.id);
              return (
                <Link
                  key={org.id}
                  to="/organisations/$organisationId"
                  params={{ organisationId: org.id }}
                  className="block border border-border bg-background p-4"
                >
                  <p className="truncate font-display font-semibold text-primary">{org.name}</p>
                  {notice && <p className="text-xs text-accent">{notice.notice}</p>}
                  <p className="mt-1 text-sm text-muted-foreground">
                    {titleise(org.status)} · {org.city ?? "No city"} · {ownerLabel(org)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {open.length} open · last activity {formatDate(last ?? null)}
                  </p>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
