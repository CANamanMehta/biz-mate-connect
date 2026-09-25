import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { LoadingRows, PageHeader } from "@/components/crm/page-header";
import { QuickAddTaskDialog, TaskGroup, TaskItem, useCompleteTask, useTasks, type TaskRow } from "@/components/crm/tasks";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { isoDay, useCurrentPartner } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks | AOM CRM" },
      { name: "description", content: "Follow-ups and commitments owned by AOM partners." },
      { property: "og:title", content: "Tasks | AOM CRM" },
      { property: "og:description", content: "Track due follow-ups across the AOM team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const { data: me } = useCurrentPartner();
  const [allPartners, setAllPartners] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { data: open = [], isLoading } = useTasks("open");
  const { data: done = [] } = useTasks("done");
  const { start, dialog } = useCompleteTask();

  const mine = (t: TaskRow) => allPartners || t.owner_partner_id === me?.partner.id;
  const groups = useMemo(() => {
    const today = isoDay();
    const weekEnd = isoDay(7);
    const list = open.filter(mine);
    return {
      overdue: list.filter((t) => t.due_date < today),
      today: list.filter((t) => t.due_date === today),
      week: list.filter((t) => t.due_date > today && t.due_date <= weekEnd),
      later: list.filter((t) => t.due_date > weekEnd),
      done: done.filter(mine),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, done, allPartners, me?.partner.id]);

  const render = (list: TaskRow[]) => list.map((t) => <TaskItem key={t.id} task={t} onComplete={start} compact={!allPartners} />);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        description="Follow-ups owned across the team."
        action={<Button onClick={() => setAddOpen(true)}><Plus /> Add task</Button>}
      />
      <div className="flex items-center gap-2">
        <Switch id="all-partners" checked={allPartners} onCheckedChange={setAllPartners} />
        <Label htmlFor="all-partners">{allPartners ? "All partners" : "My tasks"}</Label>
      </div>
      {isLoading ? (
        <LoadingRows />
      ) : (
        <div className="space-y-4">
          <TaskGroup title="Overdue" tone="red" count={groups.overdue.length}>{render(groups.overdue)}</TaskGroup>
          <TaskGroup title="Today" count={groups.today.length}>{render(groups.today)}</TaskGroup>
          <TaskGroup title="This week" count={groups.week.length}>{render(groups.week)}</TaskGroup>
          <TaskGroup title="Later" count={groups.later.length}>{render(groups.later)}</TaskGroup>
          <TaskGroup title="Done" count={groups.done.length} defaultOpen={false}>{render(groups.done)}</TaskGroup>
        </div>
      )}
      {dialog}
      <QuickAddTaskDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
