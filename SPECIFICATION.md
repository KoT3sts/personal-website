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

- Return to warm off-white and place large landscape project/interface screenshots across a wide horizontal band.
- Match the ribbon's curved outer surfaces, perspective, visible neighboring work, and fluid movement. Keep framing minimal so the interfaces dominate.
- Show the active project's caption/category and current/total index near the center below the screenshots; keep the large section label lower left.
- Provide pointer drag, touch, previous/next controls, and keyboard equivalents with one shared selection state.
- Evaluate the effect at rest and mid-transition. Three independently tilted flat cards are a baseline, not completion of the ribbon requirement.
- Technology is subordinate to fidelity: use segmented geometry/shaders or another measured approach if CSS transforms cannot reproduce continuous curvature. Research library APIs before implementing them.

### V07 — Circular / vertical work explorer

- This is a second, distinct gallery composition. Do not collapse both reference galleries into the current single coverflow.
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
- Do not hide the portrait, replace both galleries with a generic list, or remove reference-defining scenes merely to pass a mobile width check. Use deliberate, documented responsive versions.

## 7. Current draft versus target

| Area | Current repository baseline | Remaining fidelity work |
| --- | --- | --- |
| Intro | No reference-style opening | Wavy luminous outline, point orbit, brand reveal |
| Hero | Large type and original orbital SVG | Cesar portrait, silhouette/overlap/fade, closer type and peripheral layout |
| About transition | Missing | Illustrated field and centered ABOUT ME panel |
| Cinematic scene | Two-column copy and orbital graphic | Inset light-shaft scene and edge-aligned copy |
| Experience | Missing | Approved timeline content and horizontal typographic chapters |
| Curved showcase | Flat perspective coverflow, illustrated covers | Real/sanitized visuals, continuous ribbon curvature and matching motion |
| Circular work explorer | Missing | Circular arrangement, stacked state, coordinated titles/index/controls |
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
3. Implement and compare the experience motion, ribbon gallery, circular/stacked explorer, and disclosures one scene at a time.
4. Adapt and verify mobile/tablet, reduced motion, focus behavior, fallbacks, and performance.
5. Record a full-page interaction walkthrough and obtain Cesar's visual sign-off against the video.

Existing source is in `web/`; static builds go to `dist/`. Contributors should start from `feat/reference-portfolio` while [draft PR #1](https://github.com/KoT3sts/personal-website/pull/1) is open. The stack may evolve if faithful effects require it; do not rebuild unrelated working behavior without reason. Repository visibility is public; hosted Site audience remains owner-private unless Cesar explicitly changes it.

## 10. Definition of done

- [ ] All nine scene counterparts exist in the required sequence with approved, truthful content.
- [ ] Portrait-led hero and both distinct gallery experiences match the reference's composition and depth.
- [ ] Static screenshots compare each observed checkpoint with a corresponding implementation state at the agreed desktop viewport. Crop to the website and normalize scale; disclose camera distortion and unknown measurements.
- [ ] Review also includes a 20–40 second implementation recording showing intro/reveal, page progression, a ribbon drag, ring/stack selection, capability expansion, and contact close. Duration is a QA deliverable, not site autoplay behavior.
- [ ] Every major difference is listed as fixed, asset/content-blocked, or explicitly approved. No unmeasured claim of pixel-perfect matching.
- [ ] Mobile/tablet and reduced-motion checks pass; touch scrolling, keyboard navigation, focus restoration, native dialog Escape, and working links are verified in a real browser.
- [ ] Screenshots and recording identify commit, viewport, browser, and device; review evidence is linked in the handoff/PR without customer data.
- [ ] Existing automated tests, syntax checks, build, and diff checks pass; relevant new interaction behavior has meaningful coverage.
- [ ] Cesar has reviewed the comparison and agreed that the site captures the video closely enough. Passing tests or publishing a URL alone does not satisfy this goal.

## 11. New enhancement — first-visit entrance

**Owner intent:** Keep the portfolio experience specified above and add a special entrance when someone opens the website for the first time, inspired by [this second Instagram reel](https://www.instagram.com/reel/DfWWldaTQTz/).

**Evidence status:** The public post metadata identifies creator `sahirveerancheri`, caption "Agentic Build", and a 57.213-second video. Only its cover has been visually inspected: a dark canvas with several groups of colored cursor-like markers. Instagram's embed marks the video blocked and does not expose playable media. The full animation, interaction, and reveal sequence have not been observed. Do not claim this effect is understood or faithfully implemented from the cover alone.

### Relationship to the existing design

- This is an entrance into the same portfolio, not a replacement for its reference-based layout, portrait, project galleries, or content.
- The exact new animation must be specified after an accessible clip, owner screen recording, or adequate frame sequence is inspected.
- Avoid two consecutive loading experiences. Integrate the original V01 orbital brand moment into the new entrance or transition directly from the new entrance to V02; settle this after seeing the complete second reference.
- A possible interpretation is a staged, agent/cursor-themed assembly of the portfolio. This is a proposal inferred from the cover/caption, not a verified description of the reel or an approved storyboard.

### Proposed first-visit behavior

- On a normal first visit to the home page, offer/run the entrance once, then reveal the working portfolio.
- Record successful completion or deliberate skip locally in that browser. Returning visits go directly to the portfolio. This is browser/device-local behavior, not cross-device identity tracking.
- Provide a visible **Skip intro** control immediately and a discoverable **Replay intro** control after arrival. Exact labels can be refined with Cesar.
- Honor direct section links and navigation history: do not move someone away from the section they requested to force the intro.
- Reduced-motion preference bypasses the elaborate movement and reveals an equivalent stable state. Failed assets, unsupported rendering, or unavailable local storage must never prevent access to the site.
- Load actual portfolio content independently of the entrance. Do not put a real AI/code-generation dependency, account login, or external API key into this presentation effect.
- Recommended architecture is deterministic visual choreography over prebuilt content. Genuine live AI agents would be a separate product scope, not assumed from the reference's caption.
- Duration, scene timing, mobile treatment, and pointer participation remain open until the full reel is inspected. Do not invent timing requirements from its total video length.

### Additional acceptance gates

- [ ] Obtain and inspect the complete second reference; create an observed storyboard with timestamps and distinguish proposed changes.
- [ ] Confirm the entrance-to-portfolio transition and its relationship to V01 without duplicate loaders.
- [ ] Demonstrate first visit, returning visit, skip, replay, deep link, reduced motion, failed asset, and unavailable-storage paths.
- [ ] Compare the entrance in desktop and phone recordings against the second reference and obtain Cesar's visual sign-off.

Status: feature intent recorded; exact storyboard and implementation remain pending reference access. No entrance code has been added by this specification update.
