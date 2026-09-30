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
- Opportunity stage/status/probability change only via SECURITY DEFINER RPCs that set `aom.approved_change` (trigger `opportunities_guard`); why: rules hold even for direct API updates.
- Orange: `accent` = #BA5E22 for fills/text with white; `highlight` = #E8762B for lines, rings, dots only; why: contrast.
- Deal conversion only via SECURITY DEFINER `convert_opportunity` / `undo_conversion` (flag 'conversion'); why: one transaction for stage, client status, services, renewal and notifications.
