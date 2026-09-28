import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  ACQUISITION_SOURCES,
  titleise,
  usePartners,
  useServiceLines,
  type AcquisitionSource,
  stageLabel,
} from "@/lib/crm";
import { cn } from "@/lib/utils";

type DuplicateRow = {
  organisation_id: string;
  organisation_name: string;
  owner_name: string;
  stage: string | null;
  has_other_owner_open_pursuit: boolean;
};

const URGENCIES = ["low", "medium", "high"] as const;

export function NewEnquiryDialog({
  open,
  onOpenChange,
  currentPartnerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPartnerId: string | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: partners = [] } = usePartners();
  const { data: serviceLines = [] } = useServiceLines();

  const [organisationName, setOrganisationName] = useState("");
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState<AcquisitionSource | "">("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [owner, setOwner] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [fee, setFee] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [urgency, setUrgency] = useState<(typeof URGENCIES)[number]>("medium");
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("");
  const [referralContactId, setReferralContactId] = useState("");
  const [acquiredBy, setAcquiredBy] = useState("");
  const [notes, setNotes] = useState("");
  const [dismissedDuplicates, setDismissedDuplicates] = useState(false);
  const [debouncedKey, setDebouncedKey] = useState("");

  const activePartners = useMemo(() => partners.filter((partner) => partner.active), [partners]);
  const managingPartner = activePartners.find((partner) => partner.is_managing_partner);

  useEffect(() => {
    if (open && currentPartnerId) setOwner((value) => value || currentPartnerId);
  }, [open, currentPartnerId]);

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedKey(`${organisationName.trim()}|${phone.trim()}|${email.trim()}`),
      320,
    );
    return () => clearTimeout(timeout);
  }, [organisationName, phone, email]);

  useEffect(() => {
    if (source === "managing_partner" && managingPartner) setAcquiredBy(managingPartner.id);
    else if (source === "partner_self" && owner) setAcquiredBy(owner);
  }, [source, owner, managingPartner]);

  const { data: duplicates = [] } = useQuery({
    queryKey: ["enquiry-duplicates", debouncedKey],
    enabled: open && !organisationId && debouncedKey.replace(/\|/g, "").length >= 3,
    queryFn: async () => {
      const [name, phoneValue, emailValue] = debouncedKey.split("|");
      const { data, error } = await supabase.rpc("find_enquiry_duplicates", {
        _name: name ?? "",
        ...(phoneValue ? { _phone: phoneValue } : {}),
        ...(emailValue ? { _email: emailValue } : {}),
      });
      if (error) throw error;
      return (data ?? []) as DuplicateRow[];
    },
  });

  const { data: referralContacts = [] } = useQuery({
    queryKey: ["organisation-contacts", organisationId],
    enabled: Boolean(organisationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name")
        .eq("organisation_id", organisationId!);
      if (error) throw error;
      return data;
    },
  });

  function reset() {
    setOrganisationName("");
    setOrganisationId(null);
    setContactName("");
    setPhone("");
    setEmail("");
    setSource("");
    setSelectedServices([]);
    setShowMore(false);
    setFee("");
    setCloseDate("");
    setUrgency("medium");
    setIndustry("");
    setCity("");
    setReferralContactId("");
    setAcquiredBy("");
    setNotes("");
    setDismissedDuplicates(false);
  }

  const createEnquiry = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_enquiry", {
        _organisation_name: organisationName.trim(),
        _contact_name: contactName.trim(),
        _acquisition_source: source as AcquisitionSource,
        _service_line_ids: selectedServices,
        _owner_partner_id: owner,
        _estimated_gross_fee: fee ? Number(fee) : 0,
        _urgency: urgency,
        ...(organisationId ? { _organisation_id: organisationId } : {}),
        ...(phone.trim() ? { _phone: phone.trim() } : {}),
        ...(email.trim() ? { _email: email.trim() } : {}),
        ...(closeDate ? { _expected_close_date: closeDate } : {}),
        ...(industry.trim() ? { _industry: industry.trim() } : {}),
        ...(city.trim() ? { _city: city.trim() } : {}),
        ...(referralContactId ? { _referral_contact_id: referralContactId } : {}),
        ...(acquiredBy ? { _acquired_by_partner_id: acquiredBy } : {}),
        ...(notes.trim() ? { _notes: notes.trim() } : {}),
      });
      if (error) throw error;
      return (data ?? [])[0] as { organisation_id: string } | undefined;
    },
    onSuccess: (result) => {
      toast.success("Enquiry created");
      void queryClient.invalidateQueries();
      onOpenChange(false);
      reset();
      if (result?.organisation_id) {
        void navigate({
          to: "/organisations/$organisationId",
          params: { organisationId: result.organisation_id },
        });
      }
    },
    onError: (error: Error) => toast.error(error.message || "Could not save this enquiry."),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source) {
      toast.error("Choose how this enquiry came in.");
      return;
    }
    if (selectedServices.length === 0) {
      toast.error("Choose at least one service line.");
      return;
    }
    if (!owner) {
      toast.error("Choose an owner.");
      return;
    }
    createEnquiry.mutate();
  }

  const showDuplicates = duplicates.length > 0 && !dismissedDuplicates && !organisationId;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-primary">New enquiry</DialogTitle>
          <DialogDescription>
            Capture the essentials now — details can follow later.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="enquiry-organisation">Organisation</Label>
            <Input
              id="enquiry-organisation"
              value={organisationName}
              onChange={(event) => {
                setOrganisationName(event.target.value);
                setOrganisationId(null);
                setDismissedDuplicates(false);
              }}
              placeholder="Organisation name"
              required
            />
            {organisationId && (
              <p className="text-xs text-accent">Linked to the existing organisation record.</p>
            )}
          </div>

          {showDuplicates && (
            <div className="space-y-3 border-l-2 border-highlight bg-highlight/5 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <TriangleAlert className="size-4 text-accent" aria-hidden="true" /> Possible matches
                found
              </p>
              {duplicates.map((row) => (
                <div
                  key={row.organisation_id}
                  className="space-y-2 border-t border-border/60 pt-2 first:border-t-0 first:pt-0"
                >
                  <p className="text-sm text-foreground">
                    Possible match: {row.organisation_name} — owner {row.owner_name}, stage{" "}
                    {row.stage ? stageLabel(row.stage) : "—"}
                  </p>
                  {row.has_other_owner_open_pursuit && (
                    <p className="text-sm font-medium text-destructive">
                      {row.owner_name} is already pursuing this — coordinate before creating.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setOrganisationId(row.organisation_id);
                        setOrganisationName(row.organisation_name);
                      }}
                    >
                      Use this organisation
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDismissedDuplicates(true)}
                    >
                      Create new anyway
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="enquiry-contact">Contact name</Label>
              <Input
                id="enquiry-contact"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="enquiry-phone">Phone</Label>
              <Input
                id="enquiry-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="enquiry-source">How it came in</Label>
              <select
                id="enquiry-source"
                value={source}
                onChange={(event) => setSource(event.target.value as AcquisitionSource)}
                className="h-9 w-full border border-input bg-background px-3 text-sm"
                required
              >
                <option value="">Select a source</option>
                {ACQUISITION_SOURCES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="enquiry-owner">Owner</Label>
              <select
                id="enquiry-owner"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                className="h-9 w-full border border-input bg-background px-3 text-sm"
                required
              >
                {activePartners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Service lines</Label>
            <div className="flex flex-wrap gap-2">
              {serviceLines
                .filter((line) => line.active)
                .map((line) => {
                  const selected = selectedServices.includes(line.id);
                  return (
                    <button
                      key={line.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setSelectedServices((values) =>
                          selected
                            ? values.filter((value) => value !== line.id)
                            : [...values, line.id],
                        )
                      }
                      className={cn(
                        "border px-3 py-1.5 text-xs font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-highlight hover:text-foreground",
                      )}
                    >
                      {line.name}
                    </button>
                  );
                })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowMore((value) => !value)}
            className="flex items-center gap-1.5 text-sm font-medium text-accent"
          >
            <ChevronDown
              className={cn("size-4 transition-transform", showMore && "rotate-180")}
              aria-hidden="true"
            />
            More details
          </button>

          {showMore && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="enquiry-email">Email</Label>
                  <Input
                    id="enquiry-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="enquiry-fee">Estimated gross fee (INR)</Label>
                  <Input
                    id="enquiry-fee"
                    type="number"
                    min="0"
                    value={fee}
                    onChange={(event) => setFee(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="enquiry-close">Expected close date</Label>
                  <Input
                    id="enquiry-close"
                    type="date"
                    value={closeDate}
                    onChange={(event) => setCloseDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="enquiry-urgency">Urgency</Label>
                  <select
                    id="enquiry-urgency"
                    value={urgency}
                    onChange={(event) =>
                      setUrgency(event.target.value as (typeof URGENCIES)[number])
                    }
                    className="h-9 w-full border border-input bg-background px-3 text-sm"
                  >
                    {URGENCIES.map((value) => (
                      <option key={value} value={value}>
                        {titleise(value)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="enquiry-industry">Industry</Label>
                  <Input
                    id="enquiry-industry"
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="enquiry-city">City</Label>
                  <Input
                    id="enquiry-city"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                  />
                </div>
                {organisationId && referralContacts.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="enquiry-referral">Referral contact</Label>
                    <select
                      id="enquiry-referral"
                      value={referralContactId}
                      onChange={(event) => setReferralContactId(event.target.value)}
                      className="h-9 w-full border border-input bg-background px-3 text-sm"
                    >
                      <option value="">None</option>
                      {referralContacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="enquiry-acquired">Acquired by</Label>
                  <select
                    id="enquiry-acquired"
                    value={acquiredBy}
                    onChange={(event) => setAcquiredBy(event.target.value)}
                    className="h-9 w-full border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Not recorded</option>
                    {activePartners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="enquiry-notes">Notes</Label>
                <Textarea
                  id="enquiry-notes"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={createEnquiry.isPending}
            >
              {createEnquiry.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Save enquiry
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
