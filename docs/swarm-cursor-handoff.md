# Swarm cursor contribution handoff

Owner: **Cesar Tortolero**. This brief lets another agent improve the first-visit cursor crew without changing the portfolio's final design or needing write access to the owner's GitHub account.

## The request, clearly

Keep the portfolio looking and moving like the [primary reference](https://www.instagram.com/reel/DexTHhNTeh0/). On the first visit, add the feeling that a coordinated swarm of agent cursors is assembling that same website, inspired by the [second reference](https://www.instagram.com/reel/DfWWldaTQTz/). It is visual choreography over real, prebuilt content. Do not turn it into a chat interface, an actual AI editing service, a second website design, or a long loading screen.

Read **SPECIFICATION.md section 11** for the observed storyboard and acceptance contract. Cesar supplied a 16.23-second screen recording: clustered colored cursors spread to page anchors; frames, corner handles, cross marks and typing indicators appear; the heading, navigation, copy and imagery assemble in parallel; activity continues naturally through About and Projects. The excerpt does not establish the original effect's ending. Our timing and role names are deliberate adaptations, not facts measured from the complete reel.

## Start from the current code

The implementation lives on **`feat/reference-portfolio`**, not `main`. Draft portfolio PR: https://github.com/KoT3sts/personal-website/pull/1.

Use a separate clone so this work does not overwrite the recruiter's content branch or another agent's edits:

```sh
git clone --branch feat/reference-portfolio --single-branch https://github.com/KoT3sts/personal-website.git personal-website-swarm
cd personal-website-swarm
git switch -c codex/swarm-cursor-polish
git rev-parse HEAD > swarm-base.txt
npm ci
```

Record the exact base SHA before editing. The prior application milestone is `02348d8157cf9638ae30b39f08fb5f9df3f254ff`; the subsequent handoff is `e4763436b52d47c6f4eca83a82b0b1a7f6c3f7ee`. Fetch the live feature branch rather than assuming either remains its newest commit.

## Your ownership

Own only:

- `web/entrance.js`: eligibility, cursor choreography, timing, geometry and cleanup.
- `web/entrance.css`: decorative cursors, labels, bounds, staged presentation and responsive motion.
- `tests/entrance.test.js`: behavior and regression tests.

You are not alone in the codebase. Preserve other agents' edits. Do not change `web/index.html`, `web/styles.css`, `web/about-scenes.css`, project copy/assets, `SPECIFICATION.md`, hosting, credentials or deployment configuration. Propose any necessary changes outside your ownership in the handoff instead of making them silently. The main agent owns integration and publication.

The recruiter branch carries separate content changes. It is not the base for cursor work; do not replace the current feature branch with the older content bundle.

## What already works

`initAgenticEntrance(document, window, config)` and `shouldPlayEntrance(...)` are exported from `web/entrance.js`. The entrance bootstraps separately from the gallery in `web/app.js`.

- First eligible home visit: approximately **4.5 seconds** of hero assembly. Five named cursors on desktop, three on narrow screens: Layout, Content, Projects, Motion, QA.
- Targets use actual element bounds, not recording coordinates. Hero anchors include brand, nav, kicker, headline, artwork, intro, note and scroll cue.
- During that first visit, natural scrolling can trigger one **0.9-second** tracing pass for a lower section. The cinematic scene is `#introduction`, following the illustrated `#about` transition. Project images are also targets.
- Section tracing deliberately leaves visible text readable. Do not regress this by hiding paragraphs a visitor has already started reading.
- Completion/skip saves `cesar:portfolio:agentic-intro:v1=seen`. Returning visits show content immediately. Footer Replay intro is hero-only and does not reset that preference or reenable lower-section assembly.
- Skip, Escape, Tab, deliberate navigation, or leaving the hero by scrolling settle content and disable later automatic passes. Deep links, back/forward visits, reduced motion and unavailable storage bypass automatic entrance.
- Decorative elements are hidden from assistive technology and cannot intercept clicks. Skip/Replay are real controls with at least 44px hit areas. Never move the real pointer, intercept typing or announce every simulated keystroke.

## The next useful improvement

Make the existing crew feel purposeful and coordinated. Prioritize one focused patch:

1. Give roles consistent jobs and colors; use real target geometry for arrival, alignment and exit paths. The current implementation mostly visits frame corners and rotates role labels by target index.
2. Add restrained editor-like details observed in the recording—cross marks, tiny bounds/size badges or a text caret—without duplicating live headings or adding noisy announcements.
3. Improve parallel assembly cadence and status labels so navigation, headline, artwork and side copy feel like different concurrent tasks, then dissolve into a clean page. Status must describe presentation stages, not invented model/API activity.

If exploring deeper section construction, prepare visual regions before exposure and keep real text stable and accessible. Do not conceal existing content after it enters the viewport. No auto-scroll, forced guided tour, repeated loading screen, visitor model calls or API keys. Do not add a separate orbital intro; any brand moment must fit into the same entrance.

## Acceptance and verification

Preserve existing first-visit, return, Skip/Escape/Tab/navigation, replay, deep-link, storage, reduced-motion, history-cache and tracing tests. Add meaningful coverage for changed behavior; useful uncovered cases include switching reduced motion while running, hidden-tab cleanup, page exit, overlapping observer entries and asset failure. Fix a newly discovered failure in the owned files; explain any issue requiring a broader change.

Run:

```sh
npm test
npm run check
npm run build
git diff --check
```

Use the footer Replay intro for repeat visual checks. Check desktop 1440×900 and mobile 390×844 / 360×800. Verify actual bounds follow the elements, links work during/after assembly, all decoration disappears, and reduced motion leaves readable content. Record a short sanitized clip showing hero, one lower section, one project image and clean completion. Tests do not replace visual comparison; list device/browser/viewport and anything you could not verify.

## Return the work without GitHub write access

The second account cannot be invited to this repository. That does not prevent preparing local commits and returning patches. Do not change account permissions or log the personal account into the other computer for this task.

After committing only your owned files:

```sh
mkdir -p swarm-patches
BASE=$(cat swarm-base.txt)
git format-patch --binary --output-directory swarm-patches "$BASE"..HEAD
git diff --name-only "$BASE"..HEAD > swarm-patches/changed-files.txt
git rev-parse HEAD > swarm-patches/head.txt
cp swarm-base.txt swarm-patches/base.txt
```

Include a small `swarm-patches/HANDOFF.md`: what changed, why, exact tests/results, browser evidence, unresolved issues and the source-reference timestamps used. Package that directory with the short sanitized clip if available. Return it through a user-approved transfer channel (for example a separate Overleaf transfer project) and give Cesar the exact project name. A download ZIP is a transport package, not a contribution already merged or deployed.

Keep this package limited to website patches and review evidence. Do not include the private career repository, application answers, résumés, contact records, other-computer setup, tokens, raw logs or phone notifications. The main agent will verify the base, inspect the patch, apply it on an integration branch, rerun checks and publish to the existing private preview.
