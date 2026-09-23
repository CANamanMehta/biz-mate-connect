import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border pb-5 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate font-display text-2xl font-semibold text-primary sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border border-dashed border-border bg-muted/20 px-6 py-14 text-center">
      <p className="font-display text-base font-semibold text-foreground">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-14 animate-pulse bg-muted/60" />
      ))}
    </div>
  );
}
