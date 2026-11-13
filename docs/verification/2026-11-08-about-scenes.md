# About scenes verification — November 8, 2026

Scope: SPECIFICATION.md V03/V04, plus existing navigation and first-visit entrance integration. This is a bounded milestone, not acceptance of the complete nine-scene design.

Application commit: `02348d8157cf9638ae30b39f08fb5f9df3f254ff`. Exact source packaged and privately deployed successfully on November 8; see HANDOFF.md for deployment/version IDs. Later documentation commits do not alter the reviewed app code.

## Automated evidence

- `npm test`: 21 tests passed. The two new regressions failed before their corresponding navigation/entrance changes and passed afterward.
- `npm run check`, `npm run build`, `git diff --check`: passed.
- New SVGs parse as valid SVG XML with no script elements. No new packages or external asset requests.
- Independent read-only mapping and code review completed. The reviewer identified a fixed-height clipping risk; the scene now uses content-driven height with a viewport-based minimum.

## Browser evidence

Connected Chrome on Windows, using the local server at 127.0.0.1:4173. Browser version was not recorded. Viewport sizes below are CSS viewport overrides, not physical phone tests. Temporary viewport and motion overrides were reset after review.

| Viewport | Observation |
| --- | --- |
| 1440 × 900 | Both scenes inspected and saved as screenshots. Final cinematic footer bottom 828.27px is within stage bottom 864px; labels begin at 120.8px below the header bottom at 79px. About remains active. |
| 1280 × 800 | Final cinematic inspected. Footer bottom 819.38px is within stage bottom 840px. Page scroll width 1265px, below viewport width; no missing loaded images. |
| 1920 × 900 | Review reproduced footer extending beyond the old fixed stage (874.7px versus 854px). This motivated the content-driven height fix. |
| 1500 × 800 | After the height fix, footer bottom 758.63px is within stage bottom 759.42px. |
| 768 × 1024 | Tablet scene inspected; no horizontal page overflow. This exposed labels near the fixed header; the minimum upper inset was increased to 90px. A dedicated final tablet screenshot after that last inset adjustment remains useful. |
| 390 × 844 | Mobile cinematic inspected and saved after its inset fix. Labels at 114.4px clear the header bottom at 68.6px. Actions measure 44px high; page width 375px. |
| 360 × 800 | About title/panel and flow field inspected and saved. 48px discover action; page width 345px. |

Reduced motion emulated through Chrome's supported developer API: media matched reduce, About panel animation and transform were both `none`, and no agentic stage was present. Motion emulation was cleared afterward. Both About anchors were followed through their actual links.

Screenshots are local/private review artifacts under the workspace's `tmp/personal-website-about-review/`; reference stills remain in `tmp/personal-website-reference/`. They are not production dependencies or borrowed website imagery.

## Remaining acceptance work

The new illustration and sculpture are original adaptations; the reference has a denser painted field and a suspended human figure. No claim of exact visual parity. The hero still needs Cesar's portrait. Experience chapters, true ribbon gallery, circular/stacked explorer, light capability rows, full walkthrough recording, physical-device testing, browser-native dialog focus/Escape checks and owner sign-off remain outstanding.
