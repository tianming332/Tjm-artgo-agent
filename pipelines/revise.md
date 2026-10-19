# Pipeline: revise

Use for: feedback on an existing design ("make the title bigger", "change the colour", "swap the date"). Skill: `scoped-revision`.

1. `artgo open <project>` (or `artgo new <project> --image file.psd`), then `artgo start "<feedback verbatim>"`.
2. `report_analysis`: list **what changes** and **what must not change**.
3. `assets_list`, `doc_read`, `skill_list` → `skill_load scoped-revision`.
4. Find the target layer ids in `doc_read`. If the target is ambiguous (two titles, no match), stop: `artgo finish` with the question for the user. Do not guess.
5. Touch only the target layers: `text_edit` / `text_style` / `layer_move` / `layer_props` / `text_fit`. Do not create or delete other layers.
6. `doc_lint` + `doc_preview`, then finish with a list of the changed layers and fields.
