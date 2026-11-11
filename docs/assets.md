# Original artwork

Production artwork lives in `web/assets/`, except the inline hero orbit accent in `web/index.html`. No images from the Instagram reel or private career package are shipped.

- `about-flow.svg`: original deterministic vector flow field, authored for this site on November 8, 2026. Streamlines curve around several vortices; pale contour rings and seed points create a monochrome illustrated sky. Inspired by the reference's swirling contrast and density, without copying its painting or silhouette.
- `icarus-560.webp`, `icarus-960.webp`: Icarus falling, cut out of Cesar's own pen-and-ink drawing (he supplied it on November 10, 2026, and asked for the same silhouette and detail; it replaced three generated drawings from that day). 960 x 1130 and 560 x 659, transparent background, about 150 KB and 70 KB. The paper was removed with a mask from the ink, the drips under the body were trimmed, and the tone was darkened toward the bottom left so the light reads from the shaft's bright end. The cutout script lives outside the repo; the source drawing is not shipped.
  - Shown once, by `<img class="beam-figure">` inside `#introduction .cinematic-art > .beam-fall` (`web/index.html`). Decorative: `alt=""`, the art is `aria-hidden` and `pointer-events: none`. The CSS filter on `.beam-figure` only adds a thin bright edge and a soft bloom; the drawing carries its own light and shadow.
  - Placement: `.cinematic-art` is the figure's own box, `--fig-w` wide and `--fig-ratio` (height / width, 1.177) tall. The image point `--body-ax` / `--body-ay` (.5 / .5) sits `--fig-x` across the stage, and the box's bottom rests `--art-clear` above the copy (`--foot-top`, also the copy's top margin), which leaves room for the small drift and tumble after the rest pose, so the figure never reaches the text (closest gaps measured: 22 px at 1280, 24 px at 1728, 31 px at 390). That point is also the tumble pivot and the halo's centre. `--fig-tilt` (0deg; -3deg on phones) turns the whole figure. Sizes per breakpoint: 290 px by default, 345 px from 1500 px wide, 420 px from 1900 px, 250 px on tablets and 205 px on phones. `--fall` is the drop along the shaft before the rest pose, starting above the stage's top edge (560, 660, 780, 480 and 380 px); `--drift` is the little that follows (40, 46, 54, 34 and 26 px). The visible fall is about 36% of the stage height at 1280 and 42% at 1728.
  - To swap in a different image: export it already lying along the shaft (legs toward the top right), with a transparent background, at about 2x the largest `--fig-w` (840 px wide or more). Then replace the `src`, `width` and `height` of the `<img>`, set `--fig-ratio` to its height / width, and set `--body-ax` / `--body-ay` to the point that should sit at the scene's centre (usually the chest or hips), as fractions of the image box. Check it at 1280, 1440, 1728, 2200, 768 and 390 px wide, and update `tests/about-scenes.test.js`, which checks `--fig-ratio` against the image's `width` and `height` attributes.
- Loose feathers (CSS only, `.beam-feathers > span`, 12 of them): each span is masked to a small feather shape (an inline SVG data URL), lit from the top with a bright shaft line, and placed by `--x`, `--y`, size `--s` (a fraction of `--fig-w`), angle `--r` and opacity `--o`. On scroll they move with him at first, then fall at `--d` x 0.4 of his speed, drift sideways by `--dx` and turn by `--spin`, so they lag above him.
- Clouds (CSS only, `.cinematic-stage::before`): overlapping dark radial gradients at the stage's edges and corners, plus three faint lit rims where they meet the shaft, so the light reads as breaking through clouds. They sit between the shaft and the figure and keep clear of the copy's contrast.
- Falling light: the shaft's brighter top-right end (`.cinematic-light::after`, masked to grow up the shaft) stays bright while he falls away from it, and the halo behind him (`.beam-halo`) thins. On scroll (`--cine-scene` view timeline) the figure drops out of the bright end of the shaft into his rest pose, tumbling between about -16 and +10 degrees, then drifts a little. Without scroll-driven animation support, with reduced motion, without JavaScript and in print, everything rests in place, with the figure centred and fully visible and the feathers still. This replaced the ascending figure and its rising motes (November 10, 2026), which had replaced the inline EEG-and-agent-graph signal path, which had replaced `light-sculpture.svg` (abstract porcelain loops from November 8).
- `grain.svg`: original SVG turbulence texture for the cinematic panel.
- The hero's orbit accent (inline SVG in `web/index.html`; the former `sculpture.svg` file was removed on November 10, 2026), project-cover illustrations and favicon were authored for the initial draft. Project covers are representative illustrations, not production screenshots.

The scene compositions and scroll movement still need desktop/mobile browser comparison against reference checkpoints. The portrait, exact typeface, final figure (the Icarus cutout can be swapped as described above) and full nine-scene fidelity remain open in SPECIFICATION.md.

# Fonts

Self-hosted in `web/assets/fonts/`, declared at the top of `web/styles.css` and preloaded by `web/index.html`. Chosen by Cesar on November 9, 2026: Archivo for display and body text, Geist Mono for small labels.

| File | Family | Source | Version | License |
| --- | --- | --- | --- | --- |
| `archivo-latin.woff2` (56,380 bytes) | Archivo, variable `wght` 400–900 and `wdth` 87.5–100%, normal style | Google Fonts CSS2 API (`family=Archivo:wdth,wght@62..125,100..900`), latin subset served from `fonts.gstatic.com/s/archivo/v25/` (90,096 bytes), then axis-limited on November 10, 2026 with fontTools 4.63 `varLib.instancer` (`wght` 400–900, `wdth` 87.5–100; default instance unchanged) | Google Fonts v25, downloaded November 9, 2026 | SIL Open Font License 1.1, `OFL-Archivo.txt`. Copyright 2020 The Archivo Project Authors (Omnibus-Type) |
| `geist-mono-latin.woff2` (23,108 bytes) | Geist Mono, variable `wght` 100–900, normal style | Google Fonts CSS2 API (`family=Geist+Mono:wght@100..900`), latin subset served from `fonts.gstatic.com/s/geistmono/v6/` | Google Fonts v6, downloaded November 9, 2026 | SIL Open Font License 1.1, `OFL-GeistMono.txt`. Copyright 2024 The Geist Project Authors (Vercel) |
| `archivo-italic-note.woff2` (1,376 bytes) | Archivo Italic 400 at 100% width, only the glyphs of "making." (a, g, i, k, m, n and the full stop), declared as the separate family `Archivo Note` for the closing note | Google Fonts CSS2 API text subset (`family=Archivo:ital,wght@1,400&text=making.`), served from `fonts.gstatic.com/l/font?kit=…&v=v25`; Google did the subsetting, the file is unmodified | Google Fonts v25, downloaded November 11, 2026 (SHA-256 `ac4882aed802613e0b38d8b9277b466c471bcf54a3ab1f4d5c2c6dc70af19e75`) | SIL Open Font License 1.1, `OFL-Archivo.txt` (same family and copyright as above) |

- License texts come from `github.com/google/fonts` (`ofl/archivo/OFL.txt`, `ofl/geistmono/OFL.txt`) and ship next to the font files.
- The two main files are the latin subset only (`unicode-range` U+0000-00FF plus common punctuation, U+2191 and U+2193). Characters outside it, such as the ↗ ↘ ← → ↔ arrows, render from the local fallback fonts.
- The closing note's italic *making.* uses the real Archivo Italic drawing, replacing the earlier Georgia accent (owner's choice, November 11, 2026). Its `@font-face` covers only those seven code points, so any other character in that `em` falls back to Archivo upright with a synthesized slant; change the text and the file must be fetched again with the new `text=` value. No local subsetter was needed (fontTools/pip and npm were unreachable that day).
- `Archivo Fallback` and `Geist Mono Fallback` are local Arial/Helvetica and Courier New/Menlo faces with `size-adjust` and ascent/descent overrides measured in Chrome against these files, to limit layout shift during the swap.
- Geist Mono is unmodified (Google's latin subsetting only). Archivo's axes were narrowed to what the site uses: display 850 at 87.5% width, body 400–700 at 100% (CSS weights 400–850; nothing below 400). Google's CSS2 API serves the same full-axis latin file for narrower ranges, so the limit was applied locally; brotli for woff2 came from Node's built-in zlib through a temporary shim. Headlines were compared at 1440 against the original file: identical glyph extents and layout, differences only in edge anti-aliasing. Any new weight below 400 or width outside 87.5–100% would be synthesized or clamped, so widen the instance first. OFL permits bundling and redistribution with the site; neither copyright line declares a Reserved Font Name. Keep the license files beside the fonts.

# Data

## Evaluation lab: UCI Sentiment Labelled Sentences

Used by `web/lab/sentiment-eval.html`, a public reproduction that shows how Cesar evaluates a sentiment classifier. It is not the Companionship Chatbot's model, data or reported result, and the page says so.

- **Dataset:** Sentiment Labelled Sentences, UCI Machine Learning Repository, dataset 331. Page: https://archive.ics.uci.edu/dataset/331/sentiment+labelled+sentences. DOI: https://doi.org/10.24432/C57604.
- **Citation:** Kotzias, D., Denil, M., de Freitas, N., and Smyth, P. (2015). From Group to Individual Labels Using Deep Features. KDD 2015. UCI asks users to cite the paper.
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0), as stated on the UCI dataset page (checked November 11, 2026). Sharing and adaptation are allowed with credit; the lab page and the JSON carry the citation, the licence and a note of the changes.
- **File:** https://archive.ics.uci.edu/static/public/331/sentiment+labelled+sentences.zip, retrieved November 11, 2026, 84,188 bytes, SHA-256 `afc26626d710899948693e1a61405dce197f57ffa719fa1130d346b4cc095343`. The script refuses a zip with any other hash.
- **Contents used:** `amazon_cells_labelled.txt`, `yelp_labelled.txt`, `imdb_labelled.txt` (1,000 sentences each, 500 positive and 500 negative; one `sentence<TAB>label` per line).
- **Changes:** Windows-1252 punctuation stored as C1 control characters in the IMDb file (U+0085, U+0096, U+0097) mapped back to "...", "-" and "--"; whitespace collapsed; 21 exact repeats (ignoring case and spacing) removed before the split, leaving 2,979 sentences.
- **What is committed:** only `web/lab/data/sentiment-eval.json` (about 98 KB): dataset metadata, model settings, reference metrics, bootstrap intervals, the chosen failure examples and the 596 test sentences with both models' P(positive). The raw zip, the training and validation sentences and the trained weights are not committed. The zip is cached outside the repository at `$TMPDIR/sentiment-eval/sentiment.zip`.
- **Rebuild:** `python3 scripts/eval/build_sentiment_eval.py` (Python 3 standard library; `--zip PATH` uses a local copy). Seed 331; the same seed writes a byte-identical JSON and page. The script also rewrites the page's generated blocks (evidence strip, no-JS reference tables, failure examples, method numbers) between `<!-- generated:NAME -->` markers, so edit the hand-written text around them, not inside them.

## Build trace: `web/trace/build-trace.json`

Hand-curated on November 11, 2026 from the site's own records: git commit times and subjects
(`3839873..7395a47`, exact) and the OpenCode session transcripts of rounds 4 and 5 (message times
to the minute; task intervals between them are marked `estimated`). There is no generator: each
of the 52 spans is a short paraphrase of a real step, its real result (test counts, review
findings, failures and retries) and the commit it ended in. Roles are role types, not separate
agent instances.

- **Privacy rules it follows** (the repository is public): no file paths, usernames, machine or
  employer names, internal systems, other people's names, URLs or verbatim prompts; website work
  only. `tests/trace.test.js` checks the schema, that every commit exists in git history, and the
  privacy patterns.
- **Used by** the build tour (cursor labels, the Trace panel) and `web/lab/build-trace.html`.
  Both say it is a recorded replay of rounds 4–5 and that cursor positions, typing and the
  number of cursors are a visualization.
- **To extend it** to a later round, add spans the same way (real commits only, `timing` honest),
  update `run`, `totals` and the title's round range, and re-run `node --test`.
