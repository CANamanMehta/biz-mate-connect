import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Partner = Database["public"]["Tables"]["partners"]["Row"];
export type ServiceLine = Database["public"]["Tables"]["service_lines"]["Row"];
export type Branch = Database["public"]["Tables"]["branches"]["Row"];
export type OpportunityStage = Database["public"]["Enums"]["opportunity_stage"];
export type AcquisitionSource = Database["public"]["Enums"]["acquisition_source"];

export const ACQUISITION_SOURCES: { value: AcquisitionSource; label: string }[] = [
  { value: "managing_partner", label: "Managing partner" },
  { value: "partner_self", label: "Partner (self)" },
  { value: "branch", label: "Branch" },
  { value: "external_referral", label: "External referral" },
  { value: "existing_client", label: "Existing client" },
  { value: "website", label: "Website" },
  { value: "event", label: "Event" },
  { value: "walk_in", label: "Walk-in" },
  { value: "cold_outreach", label: "Cold outreach" },
  { value: "social", label: "Social" },
];

export const CONTACT_ROLES = [
  "promoter",
  "director",
  "CFO",
  "CS",
  "finance_head",
  "influencer",
  "gatekeeper",
  "other",
] as const;

export function titleise(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/^\w/, (character) => character.toUpperCase());
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function useCurrentPartner() {
  return useQuery({
    queryKey: ["current-partner"],
    queryFn: async () => {
      const [{ data: partnerId }, { data: isAdmin }] = await Promise.all([
        supabase.rpc("current_partner_id"),
        supabase.rpc("is_admin"),
      ]);
      if (!partnerId) return null;
      const { data } = await supabase.from("partners").select("*").eq("id", partnerId).single();
      return data ? { partner: data as Partner, isAdmin: Boolean(isAdmin) } : null;
    },
    staleTime: 60_000,
  });
}

export function usePartners() {
  return useQuery({
    queryKey: ["partners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("*").order("name");
      if (error) throw error;
      return data as Partner[];
    },
    staleTime: 60_000,
  });
}

export function useServiceLines() {
  return useQuery({
    queryKey: ["service-lines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_lines").select("*").order("name");
      if (error) throw error;
      return data as ServiceLine[];
    },
    staleTime: 60_000,
  });
}

export function useBranches() {
  return useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("name");
      if (error) throw error;
      return data as Branch[];
    },
    staleTime: 60_000,
  });
}

export type StaleThresholds = { default_days: number; late_stage_days: number; warning_days: number };
export const DEFAULT_STALE_THRESHOLDS: StaleThresholds = { default_days: 14, late_stage_days: 10, warning_days: 3 };
const DAY_MS = 86_400_000;
export const daysSince = (d: string | null | undefined) =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY_MS) : 0;

export function useStaleThresholds() {
  return useQuery({
    queryKey: ["app-settings", "pipeline_stale_thresholds"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "pipeline_stale_thresholds").maybeSingle();
      return { ...DEFAULT_STALE_THRESHOLDS, ...((data?.value as Partial<StaleThresholds>) ?? {}) };
    },
  });
}

export function staleLevelFor(
  o: { stage: OpportunityStage; last_activity_date: string | null; stage_changed_at: string },
  t: StaleThresholds,
): "red" | "amber" | null {
  if (o.stage === "converted") return null;
  const limit = o.stage === "proposal" || o.stage === "negotiation" ? t.late_stage_days : t.default_days;
  const days = daysSince(o.last_activity_date ?? o.stage_changed_at);
  if (days > limit) return "red";
  if (days > limit - t.warning_days) return "amber";
  return null;
}

/** Local YYYY-MM-DD, offset by days. */
export function isoDay(offset = 0, from?: string) {
  const d = from ? new Date(`${from}T00:00:00`) : new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Set of opportunity ids that have at least one open task. */
export function useOpenTaskOpportunityIds() {
  return useQuery({
    queryKey: ["tasks", "open-opp-ids"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("opportunity_id").eq("status", "open").not("opportunity_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.opportunity_id as string));
    },
  });
}
