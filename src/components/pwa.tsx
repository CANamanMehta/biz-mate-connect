import { Download, PlusSquare, Share, SquareCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { applyUpdate, isIos, promptInstall, usePwa } from "@/lib/pwa";
import { cn } from "@/lib/utils";

const HIDE_KEY = "aom-ios-install-hidden";

export function InstallAppButton({ className, compact }: { className?: string; compact?: boolean }) {
  const { installEvent, standalone } = usePwa();
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    setIos(isIos());
    setHidden(localStorage.getItem(HIDE_KEY) === "1");
  }, []);

  if (standalone) return null;
  const showIos = ios && !installEvent && !hidden;
  if (!installEvent && !showIos) return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        className={cn("bg-primary text-primary-foreground hover:bg-primary/90", className)}
        onClick={() => (installEvent ? void promptInstall() : setOpen(true))}
        aria-label="Install App"
      >
        <Download aria-hidden="true" />
        <span className={compact ? "hidden sm:inline" : undefined}>Install App</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Install AOM CRM</DialogTitle>
            <DialogDescription>Add the app to your Home Screen in three steps.</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3">
            {[
              { icon: Share, text: "Tap the Share icon in Safari" },
              { icon: PlusSquare, text: "Choose \u201cAdd to Home Screen\u201d" },
              { icon: SquareCheck, text: "Tap \u201cAdd\u201d" },
            ].map((s, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="flex size-9 shrink-0 items-center justify-center bg-primary/10 text-primary">
                  <s.icon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <strong>{i + 1}.</strong> {s.text}
                </span>
              </li>
            ))}
          </ol>
          <DialogFooter className="flex-row items-center justify-between gap-3 sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(v === true)} />
              Don't show again
            </label>
            <Button
              onClick={() => {
                if (dontShow) {
                  localStorage.setItem(HIDE_KEY, "1");
                  setHidden(true);
                }
                setOpen(false);
              }}
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function UpdateBanner() {
  const { updateReady } = usePwa();
  if (!updateReady) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 top-3 z-[100] mx-auto flex max-w-md items-center justify-between gap-3 border border-border bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg"
    >
      <span>A new version of AOM CRM is available</span>
      <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={applyUpdate}>
        Refresh
      </Button>
    </div>
  );
}
