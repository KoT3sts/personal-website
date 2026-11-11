# Hallmark audit (audit only), November 10, 2026

Owner-approved as a one-off outside check. Hallmark was cloned to a temp folder
(Nutlope/hallmark at 7e213cb, MIT) and nothing was installed globally. Its findings
are notes; Hallmark did not change or style the site.

Command (static tier, on a copy of `web/`):

```
node skills/hallmark/scripts/sloplint.mjs site/index.html site/*.css --genre atmospheric
```

Result: 374 FAIL, 175 REFLEX, 10 WARN across 8 files. The render tier (eight widths in a
headless browser) did not run: installing `puppeteer-core` in the temp clone failed with
npm 503. The site's own browser checks at 390, 1280 and 1728 cover the layout side.

## Fixed

- **34, `overflow-x: clip` on html and body**: added in `web/styles.css`. Checked in the
  browser: the Experience sticky stage still pins, and there is no horizontal overflow at
  390 or 1280 during or after the tour.

## Already covered or false positives

- **62, content hidden until a script runs** (`[data-reveal="pending"]`,
  `[data-headline="pending"]`): those attributes are only set by `motion.js`, so with
  scripting off nothing is hidden.
- **34, `100vw` in `.agentic-plan`**: the tour's plan popover, `min(330px, 100vw - 20px)`,
  positioned inside the fixed dock; it can't widen the page (measured overflow 0).
- **56, two sticky `top: 0` elements**: the About opening and the Experience stage are
  never on screen together.
- **46a, "95% accuracy"**: Cesar's own reported result (resume).
- **58, 1627 visible words** and **F8, 16 scroll patterns**: this is a long portfolio with a
  guided tour, not a landing page; the budget does not apply.

## Deliberate exceptions (owner's decision: keep the site's look)

- **67, labels in tracked capitals** (about 50 findings): the mono uppercase labels are
  the site's type system (SPECIFICATION §7). Readable text on the homepage, case studies and 404 page now meets the 11 px floor (`tests/readability.test.js`); exceptions are the 8 px TORTOLERO wordmark lockup, nav links at 11 px below 375 px wide, and the tour's decorative cursor labels (10–10.5 px, hidden from assistive technology).
- **54, eyebrows before headings** (section-top, chapter org lines, hero kicker): same
  system; each carries information (section number, employer, place).
- **63, middle-dot meta strings and arrows after link text** ("ADP · ROSELAND, NJ",
  "Read the case study →"): kept as part of the label style.
- **48, colour literals outside tokens** (about 300) and **24b, spacing off the 4 px
  scale** (175): the scenes use many one-off gradient stops, shadows and optical
  spacing. Moving them all to tokens is a refactor with no visible change; not done.
- **7a, pure `#fff`** on the scene pill hover, **55a, line-height .9 on a wrapping caps
  heading** (`.explorer-hub h3`), **19, an em dash in copy**, **F1, straight quotes**: noted;
  small candidates for a later polish pass.
- **20, Hallmark stamp in the CSS**: only for pages Hallmark builds.
- **Georgia italic in the closing note** (48, font literal): intentional single accent.

## Worth doing later

- Typographic quotes in the copy (I'm, don't) and line-height 1 on `.explorer-hub h3`.
- Run the render tier once npm is reachable:
  `npm i --no-save puppeteer-core` in the temp clone, then add `--render`.

## Follow-up, November 11, 2026 (round 5)

- **npm still unavailable:** `npm view jsdom@26.1.0` returned E503 from registry.npmjs.org, so
  `npm ci`, the full `npm test` and the render tier (`puppeteer-core`) could not run here. pip
  through Artifactory returned 403 as well.
- **Full test run, substitute:** `node --test` passes 102 tests; the two jsdom suites can't
  load jsdom. Both passed in the Chrome harness (the test files served to headless Chrome
  with node shims and an iframe in place of jsdom): entrance 59/59 in jsdom mode (no layout,
  no `requestAnimationFrame`) and 59/59 with real layout; portfolio 10/10 in jsdom mode. The
  harness gained `doesNotMatch`, binary `readFile` and a bootless `app.js` for this run.
  In real-layout mode two portfolio nav tests read before their animation frame; that is a
  harness artefact, not a site failure.
- **Static tier rerun** on the same 11 files (base 36ee593 vs round 5): 403 → 402 FAIL,
  208 → 208 REFLEX, 11 → 9 WARN. Gone: F1 straight quotes (6), 55a on `.explorer-hub h3`,
  the glass-panel warning on the header bar, and the Georgia font literal (replaced by the
  `Archivo Note` literal). Still open: 55a on `.cs-intro h1` (line-height .86, case-study
  pages).
- Fixed from "Worth doing later": typographic apostrophes in visible text, line-height 1 on
  `.explorer-hub h3`. The render tier is still outstanding.
