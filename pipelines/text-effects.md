# Pipeline: text effects

Use for: headline treatments such as outline, neon, gold, sticker, arc or wave text, and 3D extrusion. Skill: `text-effects` (capability; combine it with the poster pipeline when the request is a whole poster).

1. Brief and inventory as usual, then `skill_load text-effects`.
2. Find the title layer with `doc_read`. If there is none, create it with `text_create` and fit it with `text_fit` (for example 84% wide × 20% high, centred).
3. `text_fx_apply {"layer", "preset", "color", "accent", "warp"}`. Pick the preset by mood:
   - promotion: `double-outline` or `sticker`
   - festive / premium: `gold` or `metal`
   - night / street: `neon`
   - cute: `candy`
   - retro: `long-shadow`
4. For 3D, run `text_extrude {"layer", "depth", "angle", "sideColor"}` with a darker shade of the face colour and an angle that matches the light. If the face has an outline, pass its width as `outline`. Run it again after any change to the text.
5. `doc_preview`: the text is readable, the depth does not cover other elements, and nothing crosses the canvas edge. At most two rounds.

Never fake an outline, shadow or depth by duplicating text layers.
