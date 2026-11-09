# Original artwork

All production SVG artwork lives in `web/assets/`. No images from the Instagram reel or private career package are shipped.

- `about-flow.svg`: original deterministic vector flow field, authored for this site on November 8, 2026. Streamlines curve around several vortices; pale contour rings and seed points create a monochrome illustrated sky. Inspired by the reference's swirling contrast and density, without copying its painting or silhouette.
- `light-sculpture.svg`: original vector sculpture, authored for this site on November 8, 2026. Interwoven porcelain-like loops with directional highlights. This is an abstract visual adaptation of V04, not a portrait of Cesar or a reproduction of the reference's suspended human figure.
- `grain.svg`: original SVG turbulence texture for the cinematic panel.
- Existing sculpture, project-cover illustrations and favicon were authored for the initial draft. Project covers are representative illustrations, not production screenshots.

The scene compositions and scroll movement still need desktop/mobile browser comparison against reference checkpoints. The portrait, exact typeface, suspended figure geometry and full nine-scene fidelity remain open in SPECIFICATION.md.

# Fonts

Self-hosted in `web/assets/fonts/`, declared at the top of `web/styles.css` and preloaded by `web/index.html`. Chosen by Cesar on November 9, 2026: Archivo for display and body text, Geist Mono for small labels.

| File | Family | Source | Version | License |
| --- | --- | --- | --- | --- |
| `archivo-latin.woff2` (90,096 bytes) | Archivo, variable `wght` 100–900 and `wdth` 62–125%, normal style | Google Fonts CSS2 API (`family=Archivo:wdth,wght@62..125,100..900`), latin subset served from `fonts.gstatic.com/s/archivo/v25/` | Google Fonts v25, downloaded November 9, 2026 | SIL Open Font License 1.1, `OFL-Archivo.txt`. Copyright 2020 The Archivo Project Authors (Omnibus-Type) |
| `geist-mono-latin.woff2` (23,108 bytes) | Geist Mono, variable `wght` 100–900, normal style | Google Fonts CSS2 API (`family=Geist+Mono:wght@100..900`), latin subset served from `fonts.gstatic.com/s/geistmono/v6/` | Google Fonts v6, downloaded November 9, 2026 | SIL Open Font License 1.1, `OFL-GeistMono.txt`. Copyright 2024 The Geist Project Authors (Vercel) |

- License texts come from `github.com/google/fonts` (`ofl/archivo/OFL.txt`, `ofl/geistmono/OFL.txt`) and ship next to the font files.
- Both files are the latin subset only (`unicode-range` U+0000-00FF plus common punctuation, U+2191 and U+2193). Characters outside it, such as the ↗ ↘ ← → ↔ arrows, render from the local fallback fonts.
- `Archivo Fallback` and `Geist Mono Fallback` are local Arial/Helvetica and Courier New/Menlo faces with `size-adjust` and ascent/descent overrides measured in Chrome against these files, to limit layout shift during the swap.
- The fonts are unmodified (Google's latin subsetting only). OFL permits bundling and redistribution with the site; neither copyright line declares a Reserved Font Name. Keep the license files beside the fonts.
