<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- PWA: vite-plugin-pwa (generateSW, prompt, outDir dist/client); registration only via src/lib/pwa.ts (prod, non-preview); navigations + backend are NetworkOnly with /offline.html fallback — client data must never be cached on devices.
- Cross-sell snoozing is persisted on each suggestion and changed through an authenticated access-checked RPC so hidden ideas return automatically.
