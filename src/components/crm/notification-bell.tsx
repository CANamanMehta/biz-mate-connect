import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPartner } from "@/lib/crm";
import { cn } from "@/lib/utils";

type NotificationRow = {
  id: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

function timeAgo(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN");
}

export function NotificationBell() {
  const { data: me } = useCurrentPartner();
  const partnerId = me?.partner.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const countQuery = useQuery({
    queryKey: ["notifications", "unread-count", partnerId],
    enabled: !!partnerId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId!)
        .eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const listQuery = useQuery({
    queryKey: ["notifications", "list", partnerId],
    enabled: !!partnerId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, message, link, is_read, created_at")
        .eq("partner_id", partnerId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as NotificationRow[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = useMutation({
    mutationFn: async (ids: string[] | "all") => {
      let q = supabase.from("notifications").update({ is_read: true }).eq("partner_id", partnerId!);
      q = ids === "all" ? q.eq("is_read", false) : q.in("id", ids);
      const { error } = await q;
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const unread = countQuery.data ?? 0;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void refresh();
  }

  function handleClick(n: NotificationRow) {
    if (!n.is_read) markRead.mutate([n.id]);
    if (n.link) {
      setOpen(false);
      if (/^https?:\/\//.test(n.link)) window.location.href = n.link;
      else void navigate({ to: n.link });
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={unread === 0 || markRead.isPending}
            onClick={() => markRead.mutate("all")}
          >
            Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {listQuery.isLoading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !listQuery.data?.length ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            listQuery.data.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                className="flex w-full items-start gap-2 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-muted"
              >
                <span
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-highlight")}
                  aria-label={n.is_read ? undefined : "Unread"}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", n.is_read ? "text-muted-foreground" : "font-medium text-foreground")}>
                    {n.message}
                  </span>
                  <span className="block text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
