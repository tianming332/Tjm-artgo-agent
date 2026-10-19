# Pipeline: region edit

Use for: "only change this part", which covers recolouring, cutting out, removing an object, blurring the background, or replacing an object. Skill: `region-edit`. Every result goes on new layers; the original stays untouched.

1. `artgo new <project> --image photo.jpg`, then `artgo start "<request>"` → brief / inventory → `skill_load region-edit`.
2. **Scope** — `doc_read`: if `selection` is set, the user already chose the area. Otherwise use `region_select`:
   - the main subject: `subject`
   - a specific object: `object` with an estimated `rect`
   - the background: `subject`, then `inverse`
   - soft edges: `region_refine` (feather 1–4, smooth 10–30)
3. **Non-generative edits**:
   - colour or tone: `adjust_apply` (the selection becomes the mask)
   - cut-out: `region_apply cutout`
   - removal: `region_apply remove`
   - blur, sharpen or denoise: `filter_apply`
4. **Generative replacement** (paid; announce it first):
   1. `doc_preview` with a region about 30% larger than the selection → `report_region` (subject, pose, light, perspective, contact shadows, what to replace it with, what to keep).
   2. `region_capture {"pad":0.3}` → `image_generate {"referenceAssetIds":[capture], "aspectRatio": <returned>}`. In the prompt, say to replace only the centre and keep the outer ring identical.
   3. `asset_import {"rect": <capture rect>, "fit":"cover", "role":"subject"}` → `region_refine {"shiftEdge": 3–8}` → `region_mask {"feather": 2–5% of the short side}`. Correct small colour shifts with `adjust_apply`.
   4. Check the seams with a region `doc_preview`. Allow at most two generations.
5. Full `doc_preview`, then finish and name the new layers.
