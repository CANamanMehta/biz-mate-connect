// Single place that registers the service worker and tracks install / update state.
import { useSyncExternalStore } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

type State = { installEvent: BIPEvent | null; updateReady: boolean; standalone: boolean };
let state: State = { installEvent: null, updateReady: false, standalone: false };
let waitingWorker: ServiceWorker | null = null;
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
let installedHandler: ((device: string) => void) | null = null;
export function onAppInstalled(fn: (device: string) => void) {
  installedHandler = fn;
}

export function deviceType() {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "ipad";
  if (/iPhone|iPod/.test(ua)) return "iphone";
  if (/iPad/.test(ua)) return "ipad";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}
export function isIos() {
  const d = deviceType();
  return d === "iphone" || d === "ipad";
}

function refusedContext() {
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (/(^|\.)lovableproject(-dev)?\.com$/.test(h)) return true;
  if (/(^|\.)beta\.lovable\.dev$/.test(h)) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterAppSw() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs.filter((r) => (r.active ?? r.waiting ?? r.installing)?.scriptURL.endsWith("/sw.js")).map((r) => r.unregister()),
  );
}

let started = false;
export function initPwa() {
  if (started || typeof window === "undefined") return;
  started = true;

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  set({ standalone });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    set({ installEvent: e as BIPEvent });
  });
  window.addEventListener("appinstalled", () => {
    set({ installEvent: null, standalone: true });
    installedHandler?.(deviceType());
  });

  if (!("serviceWorker" in navigator)) return;
  if (refusedContext()) {
    void unregisterAppSw();
    return;
  }

  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
    const markWaiting = (w: ServiceWorker | null) => {
      if (w && navigator.serviceWorker.controller) {
        waitingWorker = w;
        set({ updateReady: true });
      }
    };
    markWaiting(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      nw?.addEventListener("statechange", () => {
        if (nw.state === "installed") markWaiting(nw);
      });
    });
    setInterval(() => void reg.update(), 60 * 60 * 1000);
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

export function applyUpdate() {
  if (waitingWorker) waitingWorker.postMessage({ type: "SKIP_WAITING" });
  else window.location.reload();
}

export async function promptInstall() {
  const e = state.installEvent;
  if (!e) return false;
  await e.prompt();
  const choice = await e.userChoice;
  set({ installEvent: null });
  return choice.outcome === "accepted";
}

const server: State = { installEvent: null, updateReady: false, standalone: false };
export function usePwa() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => server,
  );
}
