// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "prompt",
        injectRegister: null,
        manifest: false, // served from public/manifest.webmanifest
        devOptions: { enabled: false },
        filename: "sw.js",
        outDir: "dist/client",
        includeAssets: ["offline.html", "favicon.png", "apple-touch-icon.png", "icon-*.png"],
        workbox: {
          globPatterns: ["**/*.{js,css,woff,woff2,png,svg,ico,webmanifest}", "offline.html"],
          navigateFallback: null,
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // Pages always come from the network; offline shows the branded offline screen.
              urlPattern: ({ request, url }) =>
                request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
              handler: "NetworkOnly",
              options: {
                plugins: [
                  {
                    handlerDidError: async () =>
                      (await caches.match("/offline.html", { ignoreSearch: true })) ??
                      Response.error(),
                  },
                ],
              },
            },
            {
              // Backend, auth, storage, server functions: never cached.
              urlPattern: ({ url }) =>
                url.origin !== self.location.origin ||
                url.pathname.startsWith("/_serverFn") ||
                url.pathname.startsWith("/api/"),
              handler: "NetworkOnly",
            },
          ],
        },
      }),
    ],
  },
});
