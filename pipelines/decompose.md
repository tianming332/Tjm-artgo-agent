# Pipeline: decompose

Use for: turning a flat poster or a generated image into an editable layered file. Skills: `poster-layer-split` (posters, fidelity first: split only what separates cleanly) or `illustration-layer-split` (paintings and illustrations: one completed background board + complete movable "stickers"); `layer-decompose` is the general fallback.

1. `artgo new <project> --image flat.png`, then `artgo start "拆成可编辑图层"` → brief / inventory → `skill_load poster-layer-split` (or `illustration-layer-split`, or `layer-decompose`).
2. **Plan** — `doc_preview` (zoom into regions as needed and convert with `scale`), then `report_layers`: one item per element. Each item has a type and an outer `rect` in document pixels:
   - `text`: plain text, rebuilt as editable text
   - `art-text`: stylised lettering, kept as an image layer
   - `subject`, `decoration`, `background`
   - `effect`: shadows, glows
   - `grade`: overall colour treatment
   
   Give each item a `z` value, counting up from 0 for the background.
3. **AI decompose** (needs a Doubao key; announce it): `region_select all` → `region_capture {"pad":0}` → `image_decompose {"assetId", "rect", "targets"}`. Then run `asset_import` for each returned layer in z order. If it returns `NOT_CONFIGURED`, go to step 4.
4. **Selection decompose**:
   - text: `region_select rect` (about 6 px larger) → `region_apply remove` → `text_create` with the same copy, size and colour
   - art-text, subjects and decorations: `region_select object` → `region_refine` → `region_apply cutout`, then `region_apply remove` on the same selection to fill in the background
5. **Effects and grade**: rebuild shadows and glows with `text_fx_apply`, and the overall tone with `adjust_apply` layers named "调色-…".
6. **Tidy up**: `layer_group` into 文字 / 艺术字 / 主体 / 装饰 / 特效 / 背景. Keep the original layer with `visible=false`.
7. `doc_preview` against the original: the text matches, the positions line up, and there are no ghosts. Report anything that could not be separated.
