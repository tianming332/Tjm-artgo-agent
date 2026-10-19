# Pipeline: poster

Use for: a new poster or banner from copy, from user assets, or from a generated background.
Skills: `poster-from-assets` (the user supplied product or logo images) or `generate-background` (there is no usable background). Stack `purpose-*` for a channel (e-commerce main image, 9:16 feed) and `style-*` for a look (`brand-tjm`, `style-swiss-minimal`, your own). For layout and colour, stack `layout-grammar` and `color-themes`; for the review stage, `design-critique` is a capability skill you can load in a follow-up task ("make it look better").

## Stages

1. **Brief** — `report_analysis`: the exact copy (title / subtitle / info lines), size and channel, what the user supplied, what is missing.
2. **Inventory** — `assets_list`, `doc_read`. Map each user asset to a role: background / subject / decoration (logo).
3. **Skill** — `skill_list {"query": "<key words>"}` → `skill_load` one workflow skill, plus a style/purpose skill if one matches.
4. **Plan the layout (write it down before editing)**: relative boxes for the title area, subject area, info area and margins (≥ 5% safe margin; check the purpose skill for platform safe zones).
5. **Background** — the user's image: `asset_import {"assetId", "role":"background", "fit":"cover"}`. None available: announce, then `image_generate` (no text or logos in the prompt; aspect ratio matching the canvas), then `asset_import` as background. Plain colour: `fill_solid`, then `layer_arrange sendToBack`.
6. **Subject / logo** — `asset_import` with `role` and a target `rect`. Never leave assets at their native size.
7. **Type** — `font_list {"script":"zh"}` → `text_create` for each line (copy verbatim) → `layout_apply` with the planned boxes. Use `text_fx_apply` only if the style calls for it.
8. **Order check** — `doc_read`: the background is the bottom layer and text is above the images. Fix with `layer_arrange`.
9. **Review** — `doc_lint` (fix every error, and warnings such as LOW_CONTRAST) + `doc_preview`. Open the preview image. Check readability, subject size, overlaps and missing copy. At most two fix rounds.
10. **Finish** — `artgo finish "<what was made; anything the user still has to supply>"`.

## Done when

- All copy is present and editable. The background covers the canvas (`coveredCanvas: true`).
- `doc_lint` has no errors. The final full preview was taken after the last edit.
