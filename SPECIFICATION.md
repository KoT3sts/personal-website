# Cesar Tortolero — Website Specification

Updated: November 7, 2026. Status: target specification; visual parity is not yet achieved or verified.

## 1. Ultimate goal and authority

**Make Cesar Tortolero's personal website look and move like the website shown in the reference video.** Match its composition, section sequence, typography, imagery treatment, visual depth, and interaction choreography while using Cesar's identity and truthful portfolio content.

This is the acceptance target for future contributors. The existing website is a functional first draft, not the finished interpretation of the reference. Matching only its off-white/dark palette, large text, and tilted cards is insufficient.

This file supersedes conflicting visual choices in the earlier [first-draft design](docs/superpowers/specs/2026-11-07-reference-portfolio-design.md) and [implementation plan](docs/superpowers/plans/2026-11-07-reference-portfolio.md). Repository instructions still govern safety, verification, and hosting. Any later intentional visual departure should be documented and approved by Cesar.

## 2. Reference and evidence limits

- Primary reference: [Instagram reel by echo__builds](https://www.instagram.com/reel/DexTHhNTeh0/).
- Retrieval/inspection record: [docs/reference.md](docs/reference.md). The 28.907-second reel was retrieved through its public embed and inspected locally.
- The reference is a camera recording of a laptop screen. Compare the website inside the browser, excluding the laptop, browser chrome, black video margins, and creator's overlaid caption.
- Timestamps below identify observed video frames. They are not instructions to make the website play as a fixed 29-second animation.
- Exact font files, color values, source code, model assets, scroll distances, easing curves, and the original site's mobile layout are unknown. Values proposed below are starting points, not extracted facts.
- Reproduce the visual system with original, owner-supplied, or appropriately licensed assets. Do not ship the creator's portrait, branding, project images, or the video as Cesar's work.

| Video checkpoint | Observed website state | Required counterpart |
| --- | --- | --- |
| About 1.0s | Dark opening, luminous wordmark, irregular glowing outline and orbiting point | Cesar-branded orbital intro |
| About 2.0s | Light hero; enormous two-line headline; central monochrome portrait; compact navigation | Portrait-led hero |
| About 4.5s | Monochrome swirling illustrated background and tall dark ABOUT ME panel | Full-width About transition |
| About 7.5s | Inset dark cinematic panel, diagonal light shaft, luminous central figure, small corner text and pills | Cinematic personal introduction |
| About 10.5s | Dark horizontal experience panels with huge foreground and background typography | Experience/journey sequence |
| About 13–17s | Wide project screenshots bend into a horizontal ribbon; centered caption and index | Curved showcase gallery |
| About 18–25s | Circular work arrangement becomes a rotating/stacked presentation; title, index list, drag/scroll hint | Circular/vertical work explorer |
| About 26.5s | Light numbered service rows; expanded row becomes dark and rounded | Capabilities accordion |
| About 27–28s | Dark closing section, huge contact headline and small pill links | Contact footer |

## 3. Identity and content contract

- Full name: **Cesar Alejandro Tortolero Trujillo**.
- Preferred public/display name: **Cesar Tortolero**. Conversational name: Cesar.
- Confirmed GitHub profile: [KoT3sts](https://github.com/KoT3sts).
- Existing project candidates: Barking Village, Work Helper, and VoiceLab. Their current descriptions are draft copy grounded in repository/project context.
- Confirm employment history, dates, education, skills, services offered, email, social links, and project results before presenting them as facts. Do not copy the reference creator's job titles, location, milestones, client names, dates, or metrics.
- Private project screenshots must be sanitized or replaced by representative, clearly identified illustrations. Never include customer information or operational records.
- Keep the visual section structures when content is pending, but track the missing content explicitly. Do not invent a career or extra projects to fill the layout.

## 4. Visual system

| Element | Target direction | Initial implementation value / rule |
| --- | --- | --- |
| Light sections | Warm near-white with large areas of breathing room | Start at `#eeede8`; tune using normalized reference comparisons |
| Dark sections | Almost-black with a subtle cool cast | Start at `#101114`; avoid pure-black flatness where the reference has atmosphere |
| Main type | Very heavy, tightly spaced, uppercase grotesk | Approximate weights 700–900; headline tracking around `-0.05em` to `-0.075em`; identify a closer font during visual tuning |
| Supporting type | Small uppercase labels and restrained readable body copy | Keep desktop labels compact; maintain readable mobile body text and accessible contrast |
| Accents | Primarily monochrome; highlights come from light and imagery | Current muted green is optional, not a substitute for the reference's neutral look |
| Borders and pills | Thin, quiet rules; small capsule navigation/buttons | Avoid large soft card grids or prominent dashboard-style framing |
| Composition | Strong center alignment, deliberate overlap, tiny peripheral labels | Match hierarchy and proportions before adding new decorative details |
| Depth | Image curvature, occlusion, perspective and directional light | Flat illustrations or simple card tilts are interim approximations where the reference shows richer depth |

Desktop composition is the primary fidelity target. Use 1440×900 and 1280×800 as reproducible review viewports, adjusting comparison crops for the filmed screen's aspect ratio. These are review sizes, not claims about the original viewport.

## 5. Required page sequence

### V01 — Orbital opening

- When the agentic entrance in section 11 is active, integrate this brand moment into it. Do not run two separate intros. Returning visitors may go straight to the hero.
- Begin with a near-black stage containing Cesar's short brand, a thin irregular/wavy closed outline, a bright moving point, and restrained bloom.
- The outline and point should read as a coordinated orbit, not a generic circular loading spinner. The wordmark remains the visual center.
- Reveal the light hero smoothly. Proposed duration: roughly 1.2–1.8 seconds; never hold ready content behind a fake loading delay. Provide an immediate skip path and bypass the effect for reduced motion or failed animation assets.
- Replay, repeat-visit behavior, and exact timing must be recorded during implementation; the reel does not establish them.

### V02 — Portrait-led hero

- Warm off-white, approximately one desktop viewport tall, with a compact wordmark at upper left, subtle centered capsule navigation, and verified social/contact controls at upper right.
- Preserve the reference's huge two-line portfolio headline and tight line spacing. Start with a headline width around 65–80% of the section; the lower line fades from dark at its top toward the background.
- Center a high-contrast black-and-white cutout portrait of **Cesar**, layered in front of the lower headline. The face is shadowed in the reference; the portrait body fades into the background near its lower edge.
- Starting portrait proportion: approximately 25–35% of desktop section width, anchored in the lower center. Tune the actual silhouette and overlap against the reference.
- Small role/intro content and a scroll affordance sit low on the left; short supporting copy and discipline labels balance the right.
- The current orbital monogram is a temporary stand-in. It does not satisfy the final portrait requirement. Do not generate or borrow a face and represent it as Cesar.
- Navigation must point to real sections. Its labels may reflect Cesar's content while retaining the reference's compact hierarchy.

### V03 — About transition

- Follow the hero with a full-width monochrome illustrated field dominated by swirling, star-like strokes, matching the reference's dense directional texture and contrast.
- Place a tall dark rounded panel near the center with a large, stacked ABOUT ME label. Preserve the contrast between the busy illustrated field and simple foreground panel.
- Reproduce the transition's visual states as the user scrolls. The exact animation driver is unverified; any proposed pinning, scaling, or masking must be compared with the video before acceptance.
- The original artwork source has not been established. Asset selection remains open; record provenance for the chosen replacement.

### V04 — Cinematic introduction

- Transition into a spacious near-black section with a slightly inset dark panel and a quiet border.
- Recreate the dominant diagonal, volumetric-looking light shaft from upper right toward the center/lower left, with a bright central figure or sculptural form and a deep surrounding shadow field.
- The reference appears to use a luminous suspended figure. Its precise geometry and animation are unverified. Use a suitable original/licensed model or render; a flat monogram in a circular frame is not the final target.
- Keep supporting copy small and aligned around the panel's edges, with short discipline labels and small contact/capability pills near its lower edge.
- Preserve the scene's empty space and lighting hierarchy; do not replace it with a conventional two-column text-and-graphic layout.

### V05 — Experience / journey

- Continue on dark ground with horizontally arranged chapters/panels, oversized outlined or layered foreground titles, and large low-contrast background words/year markers.
- Scrolling or explicit controls should reveal the next chapter with the reference's sense of lateral travel. Keep chapter content readable and avoid permanent vertical-scroll capture.
- Smaller captions, milestones, and category pills support the large typography. Use Cesar-approved history; the reference creator's history must not become Cesar's.
- If the career timeline is not yet supplied, this section is content-blocked. Track the gap rather than claiming that the current approach accordion fulfills it.

### V06 — Curved horizontal showcase

> **Owner decision, November 10, 2026:** the site has one project gallery, the circle explorer (V07) in #work. The curved ribbon gallery and the project dialog were removed; every cover links straight to its case study (`projects/<slug>.html`). The notes below record the reference scene only.

- Return to warm off-white and place large landscape project/interface screenshots across a wide horizontal band.
- Match the ribbon's curved outer surfaces, perspective, visible neighboring work, and fluid movement. Keep framing minimal so the interfaces dominate.
- Show the active project's caption/category and current/total index near the center below the screenshots; keep the large section label lower left.
- Provide pointer drag, touch, previous/next controls, and keyboard equivalents with one shared selection state.
- Evaluate the effect at rest and mid-transition. Three independently tilted flat cards are a baseline, not completion of the ribbon requirement.
- Technology is subordinate to fidelity: use segmented geometry/shaders or another measured approach if CSS transforms cannot reproduce continuous curvature. Research library APIs before implementing them.

### V07 — Circular / vertical work explorer

> **November 10, 2026:** this is now the site's only gallery (see V06). It sits in #work under the "LESS TALK. MORE MAKING." heading, as a dark rounded band in the light section. On desktop and tablet the band is as tall as the window and the ring's diameter aims at ~80% of the window height, limited by the width (tablet) and kept clear of the index column (desktop), so the desktop drag/scroll hint sits bottom right under the index; phones keep the flat vertical deck.

- In the reference this is a second, distinct gallery composition (the owner has since chosen a single gallery, above).
- Reproduce the circular arrangement around a central work label, plus the rotating/stacked state where an active screenshot sits near the center and neighboring screenshots recede above and below it.
- Include the large active project title toward the left, a compact index/name list toward the upper right, and a subtle drag/scroll hint near the center bottom.
- Keep card occlusion, rotation axes, active caption, and index synchronized. The precise transition between ring and stack is a visual implementation task, not a fact established by one still frame.
- The actual project count controls the arrangement. Do not invent six projects because the reference shows six items; document any count-related visual difference.
- Wheel input may advance the gallery only while interacting with its defined area. Preserve ordinary page scrolling and an obvious way to leave the section.

### V08 — Capabilities accordion

- Match the reference's light background, centered section heading, and restrained numbered rows.
- The expanded row becomes a dark, rounded, wide panel with white copy, a compact deliverables line, and a small inquiry/action link. Collapsed rows remain thin and light.
- Use confirmed capabilities or change the wording to an honest description of the work. Do not claim a service business or sales results without confirmation.
- Use accessible disclosure controls. Preserve keyboard focus, expose expanded state, and keep the content readable without animated height changes.
- The current dark approach section is not a visual match for this scene.

### V09 — Contact close

- End on near-black with an oversized, centered contact headline, subtle glow, small outlined social pills, and one brighter primary contact pill.
- Preserve generous margins and the quiet footer byline/credits. Use Cesar Tortolero for branding and copyright.
- Only show verified destinations. GitHub is currently confirmed; email and additional social accounts remain open.
- Every displayed link/action must work. Additional current-draft sections may remain only if they do not disrupt this reference sequence or are explicitly approved.

## 6. Motion and responsive behavior

- Build a scrollable website, not an autoplay recording. Scene changes respond to navigation, scrolling, or deliberate gallery input.
- Match the demonstrated motion's direction and spatial relationships first. Proposed tuning range for gallery transitions is 600–1000ms with eased settling; the original easing has not been measured.
- Avoid unnecessary continuous motion behind text. Pause expensive rendering when offscreen or when the document is hidden.
- Target smooth desktop animation near 60fps on the agreed review device; measure the actual result and record device/browser details. Use a lighter mobile fallback when required.
- Reduced motion bypasses the intro and parallax/pinned motion while preserving content, gallery selection, and navigation. Rendering/JavaScript failure must leave a readable fallback.
- Mobile was not demonstrated in the reference. At 390×844 and 360×800, preserve the same visual identity, section order, portrait/text hierarchy, and intentional depth with touch controls and readable text. Use 44px minimum targets for essential controls.
- At 768×1024, adapt layout without clipped content or unreachable controls. No accidental horizontal page overflow at any review size; horizontal movement belongs inside its gallery.
- Do not hide the portrait, replace the gallery with a generic list, or remove reference-defining scenes merely to pass a mobile width check. Use deliberate, documented responsive versions.

## 7. Current draft versus target

| Area | Current repository baseline | Remaining fidelity work |
| --- | --- | --- |
| Intro | No reference-style opening | Wavy luminous outline, point orbit, brand reveal |
| Hero | Large type and original orbital SVG | Cesar portrait, silhouette/overlap/fade, closer type and peripheral layout |
| About transition | Original vector flow field and centered dark ABOUT ME panel; progressive scroll movement | Tune illustration density and choreography against reference; desktop/mobile first pass reviewed November 8 |
| Cinematic scene | Inset beam-lit panel with a falling Icarus cut out of Cesar's own pen drawing, loose feathers, cloud banks, copy with pills beside it | Reference uses a suspended figure; ours falls on scroll. Continue geometry, lighting and spacing comparison |
| Experience | Missing | Approved timeline content and horizontal typographic chapters |
| Curved showcase | Removed by owner decision (Nov 10, 2026): one gallery, the explorer | None unless Cesar brings the ribbon back |
| Circular work explorer | The one gallery, in #work: ring to stack, index, caption, wheel/drag/keys, case-study links | Visual comparison against the reference |
| Capabilities | Dark approach accordion | Light numbered rows and dark expanded panel |
| Contact | Dark large-type footer and GitHub action | Reference pill arrangement, approved destinations, spacing/glow tuning |
| Verification | Unit/DOM checks; no completed browser comparison | Desktop/mobile screenshots, motion recording, and reference review |

## 8. Required assets and open inputs

- Cesar portrait: owner-supplied image suitable for a monochrome cutout; outstanding.
- Approved biography, career/education timeline, capabilities, and contact links: outstanding beyond existing project context and GitHub.
- Sanitized project screenshots or approved representative visuals, landscape crops, names and descriptions: existing illustrations are interim; real screenshot set outstanding.
- Illustrated About background: select an asset with recorded provenance and appropriate usage rights.
- Cinematic scene: select/create a model or render, lighting treatment, and fallback poster; document source and delivery format.
- Font: identify a suitable match, record its license, and use optimized self-hosted files when permitted.
- Store final production assets under version control or a documented durable asset location. Keep temporary reference downloads, credentials, customer data, and raw logs out of the public repository.

## 9. Implementation order and review gates

1. Approve the reference mapping and gather missing portrait/content/assets. Establish a repeatable screenshot setup.
2. Match the static desktop hero, About transition, cinematic scene, typography, and section proportions before adding more effects.
3. Implement and compare the experience motion, circular/stacked explorer (the one gallery since November 10, 2026), and disclosures one scene at a time.
4. Adapt and verify mobile/tablet, reduced motion, focus behavior, fallbacks, and performance.
5. Record a full-page interaction walkthrough and obtain Cesar's visual sign-off against the video.

Existing source is in `web/`; static builds go to `dist/`. Contributors should start from `feat/reference-portfolio` while [draft PR #1](https://github.com/KoT3sts/personal-website/pull/1) is open. The stack may evolve if faithful effects require it; do not rebuild unrelated working behavior without reason. Repository visibility is public; hosted Site audience remains owner-private unless Cesar explicitly changes it.

## 10. Definition of done

- [ ] All nine scene counterparts exist in the required sequence with approved, truthful content.
- [ ] Portrait-led hero and the explorer gallery match the reference's composition and depth (one gallery by owner decision, November 10, 2026).
- [ ] Static screenshots compare each observed checkpoint with a corresponding implementation state at the agreed desktop viewport. Crop to the website and normalize scale; disclose camera distortion and unknown measurements.
- [ ] Review also includes a 20–40 second implementation recording showing intro/reveal, page progression, ring/stack selection and a drag, capability expansion, and contact close. Duration is a QA deliverable, not site autoplay behavior.
- [ ] Every major difference is listed as fixed, asset/content-blocked, or explicitly approved. No unmeasured claim of pixel-perfect matching.
- [ ] Mobile/tablet and reduced-motion checks pass; touch scrolling, keyboard navigation, focus restoration, and working links are verified in a real browser.
- [ ] Screenshots and recording identify commit, viewport, browser, and device; review evidence is linked in the handoff/PR without customer data.
- [ ] Existing automated tests, syntax checks, build, and diff checks pass; relevant new interaction behavior has meaningful coverage.
- [ ] Cesar has reviewed the comparison and agreed that the site captures the video closely enough. Passing tests or publishing a URL alone does not satisfy this goal.

## 11. Agentic first-visit entrance

**Owner intent:** Keep the original reference-based portfolio and add a first-visit experience where agent-like cursors appear to assemble it, inspired by [this second reel](https://www.instagram.com/reel/DfWWldaTQTz/). Cesar supplied a screen recording and reiterated that the agentic treatment fits the project.

**Evidence status:** The supplied recording has now been inspected at one-second intervals and at exact opening checkpoints. It is a 16.23-second excerpt of the original post, whose public metadata reports 57.213 seconds. The excerpt shows the opening and continued construction as the page scrolls through the introduction, About, and start of Projects. It does not show the original effect's final completion/exit. The storyboard below separates those observations from our proposed adaptation.

### Observed storyboard — supplied recording timestamps

| Time | Visible behavior | What to reproduce |
| --- | --- | --- |
| 0.0s | Many colored arrow cursors cluster on a nearly empty dark workspace; a compact bottom status strip is visible | A coordinated crew arriving before page assembly |
| 0.5s | Cursors spread to distinct page positions; small crosses and coordinate/size-like badges appear | Purposeful movement toward actual layout anchors |
| 1.0s | Multiple translucent rectangles, cyan outlines, corner handles, and text insertion markers appear at once | An editor-like construction layer over page elements |
| 1.5–3.0s | Large heading, name, navigation, copy, buttons, and portrait appear in parallel, with text progressively filling selected regions | Agents visibly composing distinct parts of the real page |
| 3.0–5.0s | The hero becomes largely readable while remaining regions are adjusted; cursors and selections keep moving | A smooth handoff from construction to a usable hero |
| 5.0–11.0s | The demonstrated viewport moves down; About headings and body copy are selected/revealed while agents remain active | Further sections assembling on first exposure |
| 12.0–16.23s | The About content is readable; the project-section heading and first project regions begin assembling | The effect extends beyond a generic loading spinner |

The recording proves an assembly presentation, not that live AI inference or editing is occurring. It does not establish whether the observed scrolling was manual or automated. With the owner's approval (November 8), every eligible home load (the owner chose every visit, reloads included) runs a guided build tour: after the hero, the page glides section by section while agents build each one. Any visitor input (wheel, touch, pointer, any key, a scroll the tour did not cause, Escape or Skip tour) ends the tour where the visitor is, with all content visible and no snap-back.

### Adaptation: the same portfolio, assembled in front of the visitor

- Use the first reel's final design: warm paper hero, Cesar's portrait, monochrome typography, cinematic sections, and the explorer gallery. Do not adopt the second creator's red/black site, portrait, biography, project claims, or metrics.
- The first home visit builds the hero; the tour then assembles each section in turn as one continuous flow. The page scroll is a single velocity model that persists across sections: each stop sets a target and a cruise speed, and the scroll accelerates or brakes toward it within an acceleration limit (900 px/s² desktop, 800 tablet, 700 phone, at 1×), arrives at cruise speed instead of stopping, keeps creeping (~45–60 px/s, faster through tall sections) while agents work, and only settles fully at Contact before the handoff. The next stop starts as soon as the current stop's builder jobs are done (late review/QA work is left out), so content of the next section is built as it slides in at the bottom edge. Most of the crew stays out: on desktop about 12–15 agents plus the orchestrator stay on screen between sections (tablet ~6, phone ~4), idle ones drifting at standby spots in the lower half of the view; each stop's roster takes the carried agents first, adds a few fresh agents from the dock for roles it needs, and rotates one or two back to the dock near its end, so the dock count moves in small steps (desktop band ~10–16). Animations are deliberately soft: ~650 ms pop-ins, ≥35 ms per typed character (≤1.6 s per job), ~100 ms per cascading tag, ~700 ms frames and reviews, cursor moves ≥450 ms on eased curves. Measured at 1×: hero ~8.4 s, whole tour ~48 s on desktop (1280×800) and ~49 s on phone (375×812); about half at 2×. Content is prepared hidden only while wholly below the viewport; if an item is on screen before its agent arrives it is shown immediately and the job is downgraded to a decorative pass (measured: no on-screen hidden item longer than ~250 ms). If the visitor cancels, sections the tour had not reached may still get one short tracing pass. The tour never runs on deep links, back/forward, reduced motion or unavailable storage; Replay restarts it only on an explicit click.
- Give agents recognizable visual roles. Proposed roles: **Layout**, **Content**, **Projects**, **Motion**, and **QA**. Names are animation characters, not a claim that five actual models are connected to each visit.
- Layout frames navigation and major regions; Content fills the approved name/headline/intro; Projects places approved images and cards; Motion aligns the signature graphic; QA performs a final visual alignment sweep.
- Show purposeful cursor paths, temporary selection outlines, corner handles, short role badges, and staggered text/image reveals. Avoid random cursor confetti or a static screenshot/video of the effect.
- Use a compact optional status strip for the current assembly stage. Any progress count must correspond to actual animated targets; do not fabricate API calls, token usage, network activity, security checks, or real test results.
- One control can complete the remaining sequence immediately. When complete or skipped, remove all decorative cursors, frames, badges, and temporary status UI. The result must be the normal portfolio with no animation residue.
- Integrate the original V01 orbital brand moment into the crew's arrival if it fits. Do not add a second loader after the crew finishes.

### Proposed production timing — tunable, not measurements of the original

| Stage | Initial target | Visible result |
| --- | --- | --- |
| Arrival | 0–0.6s | A small cursor crew gathers around the brand and moves toward hero anchors |
| Layout pass | 0.4–1.3s | Temporary bounds frame the actual navigation, title, portrait, and side labels; the paper hero background settles in |
| Parallel assembly | 0.9–3.5s | Headline, approved copy, portrait, and controls appear in staggered parallel groups |
| Alignment / release | 3.5–4.5s | Brief final adjustment, decorative frames dissolve, and the hero is fully usable |
| First exposure of lower sections | About 0.5–1.2s each | A shorter local assembly pass triggered by natural scrolling; no repeated full intro |

Target approximately 4–5 seconds for the automatic hero entrance. Keep **Skip intro** visible from the first frame; do not impose an unskippable minimum duration or wait artificially for an animation when the visitor wants the content. On phones, reduce the crew and visual density before lengthening timing or covering content.

### Visit, interaction, and accessibility contract

- Decide eligibility once at page initialization. On the normal first home visit, run the hero entrance and allow one reveal per section during that page visit. Returning visits show all content immediately.
- Persist hero completion or deliberate skip locally in the browser. Keep first-visit section eligibility in the current page controller so persistence does not prematurely disable lower-section reveals during that same visit. Do not track identity across devices.
- Skip, Escape, keyboard Tab navigation, or deliberate navigation ends the active animation, reveals all content immediately, and disables every remaining automatic section pass for that visit.
- Expose **Replay intro** after arrival. Replay restarts the hero only, follows an explicit action, does not erase the saved preference, and does not renew lower-section eligibility or automatic intros on future visits.
- Respect deep links, back/forward navigation, and the visitor's scroll position. A section link must open its destination without an intro detour. Scrolling away cancels/settles the local effect instead of pulling the visitor back.
- Reduced motion bypasses pointer travel, simulated typing, parallax, and bounds animation. JavaScript/rendering errors, unavailable storage, or failed assets must reveal readable content. If persistence cannot be used reliably, bypass the automatic intro and retain explicit replay.
- Decorative overlays use `pointer-events: none` and are hidden from assistive technology. Skip/replay remain real keyboard-operable controls. Never move the visitor's actual mouse cursor or intercept unrelated typing.
- Keep the real final text in the accessibility tree; do not announce each animated character, cursor, or stage. Avoid duplicating headings/text in the live DOM for assistive technology.
- The effect must not reduce readability of already revealed content or conceal essential controls. Reuse stable reserved dimensions for imagery/text so construction does not cause disruptive layout shifts.

### Implementation boundaries

- Recommended architecture is deterministic client-side choreography over prebuilt, source-backed portfolio content. No visitor-triggered agent API calls, editor permissions, or model credentials are needed for this visual experience.
- Animate against actual element bounds after layout/font readiness. Update geometry on viewport changes, section movement, and orientation changes; do not hard-code desktop recording coordinates.
- Drive assembly stages and cleanup through one controller. Cancel timers/animation frames on skip, page exit, and replay; prevent multiple concurrent controllers or duplicate DOM overlays.
- Pause work offscreen or while the tab is hidden. Use fewer simultaneous cursors on mobile; validate the actual performance and legibility rather than copying the demo's agent count.
- The original excerpt continues building beyond 16 seconds. Compressing its hero to 4–5 seconds, defining cursor roles, using scroll-triggered section reveals, and clearing the crew are our proposed product choices. They require visual review; they are not observed facts about the original.

### Additional acceptance gates

- [x] Inspect the supplied recording and capture a timestamped storyboard for its visible opening/scroll segment. The original reel's ending remains unknown, but it is not necessary to invent one for this adaptation.
- [ ] Demonstrate the crew assembling Cesar's actual hero, a lower section, a project image/card, and the clean final handoff.
- [ ] Verify first visit, returning visit, skip, Escape, replay, section deep link, back/forward, scrolling away, reduced motion, failed assets, and unavailable-storage behavior.
- [ ] Verify on desktop and phone that cursor bounds follow the correct elements, real links stay usable, assistive technology gets stable content, and no decoration remains after completion.
- [ ] Record the adaptation, compare it against the supplied excerpt, and obtain Cesar's visual sign-off.

### First working implementation

`web/entrance.js` and `web/entrance.css` implement the 4.5-second hero entrance and 0.9-second section passes. The bootstrap is separate from the portfolio's gallery controller. Returning visits bypass automatic motion; the footer offers hero-only replay.

Lower-section passes currently trace visible content with cursors and selection frames; they do not hide/retype text already on screen. This prevents the reference effect from making readable content disappear. Further progressive section construction must be prepared before exposure if pursued.

Automated tests cover visit eligibility, completion/persistence, skip/Escape/Tab/navigation, replay, deep links, reduced motion, blocked storage, history-cache restoration, section tracing/cancellation, and minimum control hit areas. An independent code review found and prompted fixes for visible section text disappearing and undersized controls; regression tests reproduce both.

Status: first working animation implemented and automated checks passing. Real-browser motion/geometry/performance comparison and owner visual sign-off remain outstanding; overall portfolio reference parity is still incomplete.
