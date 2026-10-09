import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus, Video } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { isoDay, usePartners } from "@/lib/crm";
import { scheduleMeeting } from "@/lib/schedule.functions";
import { cn } from "@/lib/utils";

const DURATIONS = [30, 45, 60, 90] as const;

export function ScheduleMeetingButton({ organisationId, opportunityId }: { organisationId: string; opportunityId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CalendarPlus className="size-4" /> Schedule meeting
      </Button>
      {open && <ScheduleDialog organisationId={organisationId} opportunityId={opportunityId ?? null} onClose={() => setOpen(false)} />}
    </>
  );
}

function ScheduleDialog({ organisationId, opportunityId, onClose }: { organisationId: string; opportunityId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const run = useServerFn(scheduleMeeting);
  const { data: partners = [] } = usePartners();
  const status = useQuery({
    queryKey: ["google-status"],
    queryFn: async () => (await supabase.rpc("my_google_status")).data?.[0] ?? null,
  });
  const ctx = useQuery({
    queryKey: ["schedule-ctx", organisationId],
    queryFn: async () => {
      const [org, contacts] = await Promise.all([
        supabase.from("organisations").select("name").eq("id", organisationId).single(),
        supabase.from("contacts").select("id, name, email").eq("organisation_id", organisationId).not("email", "is", null).order("name"),
      ]);
      return { name: org.data?.name ?? "", contacts: (contacts.data ?? []).filter((c) => c.email) };
    },
  });

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(isoDay(1));
  const [time, setTime] = useState("11:00");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(60);
  const [location, setLocation] = useState("");
  const [addMeet, setAddMeet] = useState(true);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [partnerIds, setPartnerIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ctx.data?.name && !title) setTitle(`${ctx.data.name} - AOM discussion`);
  }, [ctx.data?.name, title]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await run({
        data: {
          organisationId,
          opportunityId,
          title,
          start: new Date(`${date}T${time}:00`).toISOString(),
          durationMinutes: duration,
          location: addMeet ? null : location || null,
          addMeet,
          contactIds,
          partnerIds,
          notes: notes || null,
        },
      });
      toast.success(res.meetLink ? "Meeting scheduled with Google Meet" : "Meeting scheduled");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["upcoming-meetings"] }),
        qc.invalidateQueries({ queryKey: ["interactions"] }),
        qc.invalidateQueries({ queryKey: ["dashboard", "meetings"] }),
      ]);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const notConnected = !status.isLoading && !status.data?.connected;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Schedule meeting</DialogTitle></DialogHeader>
        {notConnected ? (
          <div className="space-y-3 text-sm">
            <p>Connect Google Calendar first.</p>
            <Button asChild size="sm"><Link to="/settings" onClick={onClose}>Go to My settings</Link></Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} min={isoDay()} onChange={(e) => setDate(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Start time</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <Button key={d} type="button" size="sm" variant={duration === d ? "default" : "outline"} onClick={() => setDuration(d)}>{d} min</Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={addMeet} onCheckedChange={setAddMeet} id="meet" /><Label htmlFor="meet">Add Google Meet</Label></div>
            {!addMeet && <div className="space-y-1.5"><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Office address" /></div>}
            <div className="space-y-1.5">
              <Label>Client invitees</Label>
              {ctx.data?.contacts.length ? ctx.data.contacts.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={contactIds.includes(c.id)} onCheckedChange={() => toggle(contactIds, setContactIds, c.id)} />
                  {c.name} <span className="text-muted-foreground">({c.email})</span>
                </label>
              )) : <p className="text-xs text-muted-foreground">No contacts with an email.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>AOM partners</Label>
              <div className="grid grid-cols-2 gap-1">
                {partners.filter((p) => p.active).map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={partnerIds.includes(p.id)} onCheckedChange={() => toggle(partnerIds, setPartnerIds, p.id)} />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={busy || status.isLoading}>{busy ? "Scheduling…" : "Schedule"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Upcoming = { id: string; agenda: string | null; scheduled_start: string; meet_link: string | null; location_or_link: string | null; organisations: { name: string } | null };

export function UpcomingMeetings({ opportunityId, className }: { opportunityId?: string; className?: string }) {
  const { data = [] } = useQuery({
    queryKey: ["upcoming-meetings", opportunityId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("meetings")
        .select("id, agenda, scheduled_start, meet_link, location_or_link, organisations(name)")
        .eq("status", "scheduled")
        .gte("scheduled_start", new Date().toISOString())
        .order("scheduled_start")
        .limit(5);
      if (opportunityId) q = q.eq("opportunity_id", opportunityId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Upcoming[];
    },
  });
  return (
    <section className={cn("border border-border bg-background", className)}>
      <h2 className="border-b px-3 py-2 font-display text-sm font-semibold text-primary">Upcoming meetings</h2>
      {data.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">No meetings scheduled.</p>}
      {data.map((m) => (
        <div key={m.id} className="flex items-center gap-3 border-b px-3 py-2.5 text-sm last:border-b-0">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{m.agenda ?? m.organisations?.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {new Date(m.scheduled_start).toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}
              {!m.meet_link && m.location_or_link ? ` · ${m.location_or_link}` : ""}
            </p>
          </div>
          {m.meet_link && (
            <a href={m.meet_link} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline">
              <Video className="size-4" /> Meet
            </a>
          )}
        </div>
      ))}
    </section>
  );
}
