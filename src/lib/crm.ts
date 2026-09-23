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
