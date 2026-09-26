import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckSquare,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Plus,
  Crosshair,
  Settings,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { GlobalSearch } from "@/components/crm/global-search";
import { NewEnquiryDialog } from "@/components/crm/new-enquiry-dialog";
import { NewTargetDialog } from "@/components/crm/new-target-dialog";
import { QuickAddTaskDialog } from "@/components/crm/tasks";
import { InstallAppButton } from "@/components/pwa";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPartner } from "@/lib/crm";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, primary: true },
  { to: "/enquiries", label: "Enquiries", icon: Inbox, primary: true },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare, primary: true },
  { to: "/organisations", label: "Organisations", icon: Building2, primary: true },
  { to: "/contacts", label: "Contacts", icon: Users, primary: false },
  { to: "/meetings", label: "Meetings", icon: CalendarDays, primary: false },
  { to: "/tasks", label: "Tasks", icon: CheckSquare, primary: false },
  { to: "/reports", label: "Reports", icon: BarChart3, primary: false },
  { to: "/admin", label: "Admin", icon: Settings, primary: false, adminOnly: true },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useCurrentPartner();
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const isAdmin = data?.isAdmin ?? false;
  const items = NAV_ITEMS.filter((item) => !("adminOnly" in item && item.adminOnly) || isAdmin);
  const primaryItems = items.filter((item) => item.primary);
  const overflowItems = items.filter((item) => !item.primary);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-background lg:flex">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex size-9 shrink-0 items-center justify-center bg-primary font-display text-xs font-semibold text-primary-foreground">
            AOM
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-primary">AOM CRM</p>
            <p className="truncate text-xs text-muted-foreground">
              A O Mittal &amp; Associates LLP
            </p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              activeProps={{ className: "bg-primary/5 text-primary border-l-2 border-accent" }}
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <p className="truncate px-3 text-sm font-medium text-foreground">
            {data?.partner.name ?? "Partner"}
          </p>
          <p className="truncate px-3 text-xs text-muted-foreground">{data?.partner.branch}</p>
          <InstallAppButton className="mt-2 w-full justify-start" />
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start"
            onClick={handleSignOut}
          >
            <LogOut aria-hidden="true" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
            <div className="flex size-9 shrink-0 items-center justify-center bg-primary font-display text-xs font-semibold text-primary-foreground lg:hidden">
              AOM
            </div>
            <div className="min-w-0 flex-1 lg:max-w-xl">
              <GlobalSearch />
            </div>
            <div className="hidden flex-1 lg:block" />
            <InstallAppButton compact />
            <Button variant="outline" size="sm" onClick={() => setTargetOpen(true)} aria-label="New target">
              <Crosshair aria-hidden="true" /> <span className="hidden sm:inline">New Target</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)} aria-label="Quick add task">
              <CheckSquare aria-hidden="true" /> <span className="hidden sm:inline">Add task</span>
            </Button>
          </div>
        </header>

        <main className="px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-16">{children}</main>
      </div>

      <Button
        onClick={() => setEnquiryOpen(true)}
        className="fixed bottom-20 right-4 z-30 h-12 bg-accent px-5 text-accent-foreground shadow-lg hover:bg-accent/90 lg:bottom-8 lg:right-8"
      >
        <Plus aria-hidden="true" /> New Enquiry
      </Button>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="grid grid-cols-5">
          {primaryItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium text-muted-foreground"
              activeProps={{ className: "text-accent" }}
            >
              <item.icon className="size-5" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen((value) => !value)}
            className={cn(
              "flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium text-muted-foreground",
              moreOpen && "text-accent",
            )}
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
            More
          </button>
        </div>
        {moreOpen && (
          <div className="border-t border-border bg-background">
            {overflowItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 border-b border-border px-5 py-3 text-sm text-foreground"
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 px-5 py-3 text-sm text-foreground"
            >
              <LogOut className="size-4" aria-hidden="true" /> Sign out
            </button>
          </div>
        )}
      </nav>

      <NewEnquiryDialog
        open={enquiryOpen}
        onOpenChange={setEnquiryOpen}
        currentPartnerId={data?.partner.id ?? null}
      />
      <QuickAddTaskDialog open={taskOpen} onOpenChange={setTaskOpen} />
      <NewTargetDialog open={targetOpen} onOpenChange={setTargetOpen} currentPartnerId={data?.partner.id ?? null} />
    </div>
  );
}
