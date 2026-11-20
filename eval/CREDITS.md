# Photo credits and licensing

**Status: not cleared for public use.** The 17 evaluation photos in `eval/photos/` were collected from a web image
search. Their original sources and licences were **not recorded**. Some look like commercial stock images (numeric
IDs in the filenames), one carries a visible watermark, and one has an "AI" mark in a corner.

They are used here only for internal testing. They are gitignored (`eval/photos/*`, `frontend/public/samples/*`), so
they are never committed and never shipped with `gcloud run deploy --source .` (which honours `.gitignore`).

Before any public demo, pitch deck or deployment, replace them with one of:
- photos from a real site you have permission to use (best, and the strongest story for judges);
- openly licensed photos (Pexels, Unsplash, Wikimedia Commons), with the photographer and link added below;
- otherwise, say plainly in the pitch: "tested on public web photos; licences not cleared".

| File | What it shows | Source | Licence | Notes |
|---|---|---|---|---|
| Roof-Slab-Cutting.webp | cast floor slab being cut | web search, not recorded | unknown | used as demo B |
| Suspended-slab-formwork.jpg | formwork deck with starter bars | web search, not recorded | unknown | used as demo A; source of the 3 synthetic photos |
| blurred-background-…-410801102.webp | defocused site (stock-style) | web search, not recorded | unknown, likely stock | numeric stock ID in name |
| blurred-background-…-410801197.webp | defocused site (stock-style) | web search, not recorded | unknown, likely stock | numeric stock ID in name |
| constuction-site.avif | workers on a level with starter bars | web search, not recorded | unknown | |
| images (1).jpg | cleared/dug site | web search, not recorded | unknown | "AI" mark in a corner |
| images (2).jpg | slab rebar with filler blocks | web search, not recorded | unknown | |
| images (3).jpg | concrete pour on a slab | web search, not recorded | unknown | |
| images (4).jpg | multi-storey frame with props | web search, not recorded | unknown | |
| images (5).jpg | cast columns with shuttering above | web search, not recorded | unknown | **visible watermark** |
| images (6).jpg | finished A-frame house | web search, not recorded | unknown | |
| images.jpg | footing formwork boxes | web search, not recorded | unknown | |
| images_1.jpg | rebar anchoring at a column | web search, not recorded | unknown | |
| images_2.jpg | slab rebar mesh being tied | web search, not recorded | unknown | used as demo C |
| images_3.jpg | plinth formwork at a wall base | web search, not recorded | unknown | |
| images_4.jpg | steel column formwork | web search, not recorded | unknown | used as demo D |
| images_5.jpg | column rebar with red formwork | web search, not recorded | unknown | |
| synthetic_*.jpg | darkened / defocused / shaken copies of Suspended-slab-formwork.jpg | generated locally | same as source | retake-detection tests |
