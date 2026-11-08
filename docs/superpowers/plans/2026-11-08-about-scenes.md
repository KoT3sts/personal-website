# Reference About Scenes Implementation Plan

> **For agentic workers:** Execute with superpowers:executing-plans, then obtain one independent branch review.

**Goal:** Implement the specification's V03 illustrated About transition and V04 cinematic introduction, without waiting for the cross-computer career transfer.

**Architecture:** Retain static HTML/CSS/JS and the existing feature branch and Site. Keep `#about` on the illustrated transition; add `#introduction` for the cinematic panel and map both to the existing About navigation. Use original SVG artwork, in-flow scenes, and optional CSS scroll-driven movement with a static fallback. Preserve first-visit tracing without hiding visible content.

**Tech Stack:** Existing buildless HTML/CSS/ES modules; Node tests with JSDOM. No new dependencies.

**Spec:** SPECIFICATION.md, V03/V04 and sections 3, 6, 11.

## Global constraints

- Preserve Cesar Tortolero branding, existing draft biography, project stories and functional anchors.
- No invented career claims or portrait; use an explicitly abstract original sculpture.
- Preserve owner-private hosting and the existing project ID. Do not merge the draft PR.
- `prefers-reduced-motion` bypasses scene movement; unsupported animation timelines retain a complete static design.
- No scroll hijacking, new loader, essential content hidden by JavaScript, or external artwork dependencies.

## Review focus

- About navigation remains active over both adjacent scenes and remains legible over each background.
- Mobile scenes retain title, luminous artwork, readable copy and 44px actions without overlap or horizontal overflow.
- New scene tracing cannot hide already-visible text or interfere with scroll-driven CSS transforms.
- All content and anchors remain available without JavaScript or SVG rendering.
- Artwork is original, decorative, local and documented; real-browser appearance remains a separate verification gate.

### Task 1: Build the two About compositions

**Files:** `web/index.html`, `web/about-scenes.css`, `web/assets/about-flow.svg`, `web/assets/light-sculpture.svg`, `docs/assets.md`.

**Interfaces:** `#about` precedes `#introduction`; the second scene uses `data-nav-section="about"`. Existing `.about-copy` text and `#work` links survive. Decorative art is excluded from the accessibility tree.

- [ ] Replace the two-column monogram scene with the original swirling field and tall dark ABOUT ME panel, followed by an inset near-black light-shaft scene with edge-aligned copy and pill actions.
- [ ] Add responsive sizing, a static fallback, and reduced-motion-safe optional scroll choreography.
- [ ] Document source/provenance and gaps; check asset XML and syntax/build. No implementation-shaped tests for decorative styling.

### Task 2: Integrate navigation and entrance; verify and publish

**Files:** `web/app.js`, `web/entrance.js`, `tests/portfolio.test.js`, `tests/entrance.test.js`, `SPECIFICATION.md`, `HANDOFF.md`.

**Interfaces:** nav observer resolves `data-nav-section` before element ID; scene tracing includes the new stage and copy without adding visibility prerequisites.

- [ ] Add failing tests for both scenes mapping to About while the header follows the scene's actual dark/light treatment; run and observe failure.
- [ ] Implement navigation mapping; add a new-scene entrance regression proving existing content stays visible through tracing/cancellation.
- [ ] Run tests/check/build/diff; independently review the whole change and fix material issues.
- [ ] Commit and push the existing feature branch, update the draft PR and private preview, save a durable handoff.

## Execution notes

Owner explicitly requested continuing the main website work while they resolve transfer. This is the next bounded milestone in the existing approved reference direction; portrait and career copy remain pending. Work stays in the established `feat/reference-portfolio` checkout to preserve the existing Site source binding and PR. A new parallel implementation checkout is unnecessary; the mapping and review agents are read-only.
