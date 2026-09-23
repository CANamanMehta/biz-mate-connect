import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type SearchRow = {
  result_type: string;
  result_id: string;
  title: string;
  subtitle: string | null;
  organisation_id: string | null;
};

export function GlobalSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(term.trim()), 220);
    return () => clearTimeout(timeout);
  }, [term]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["crm-search", debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_crm", { _query: debounced });
      if (error) throw error;
      return (data ?? []) as SearchRow[];
    },
  });

  function goTo(row: SearchRow) {
    setOpen(false);
    setTerm("");
    if (row.result_type === "contact") {
      void navigate({ to: "/contacts" });
      return;
    }
    if (row.organisation_id) {
      void navigate({
        to: "/organisations/$organisationId",
        params: { organisationId: row.organisation_id },
      });
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search organisations, contacts, opportunities…"
        aria-label="Search records"
        className="h-10 pl-9"
      />
      {open && debounced.length >= 2 && (
        <div className="absolute inset-x-0 top-12 z-50 max-h-80 overflow-y-auto border border-border bg-popover shadow-lg">
          {isFetching && <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>}
          {!isFetching && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">No matching records.</p>
          )}
          {results.map((row) => (
            <button
              key={`${row.result_type}-${row.result_id}`}
              type="button"
              onClick={() => goTo(row)}
              className="flex w-full flex-col items-start gap-0.5 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted"
            >
              <span className="text-sm font-medium text-foreground">{row.title}</span>
              <span className="text-xs text-muted-foreground">
                {row.result_type} {row.subtitle ? `· ${row.subtitle}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
