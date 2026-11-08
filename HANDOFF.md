# Personal Website handoff

Updated: November 7, 2026 (America/New_York), recruiter-ready pass.

## Confirmed state

- Owner confirmed full name Cesar Alejandro Tortolero Trujillo and preferred short/display name Cesar Tortolero. Conversational name: Cesar. This supersedes prior inferred names.
- Public repository: https://github.com/KoT3sts/personal-website (default branch main). Owner explicitly requested public visibility on November 7, 2026 so another account can help improve it.
- Local source: C:\Users\lucen\OneDrive\Documents\Playground\Personal Website.
- An existing ChatGPT project named Personal website was found. A local app project with that name is now also listed at C:\Users\lucen\OneDrive\Documents\ChatGPT\Personal website. The requested conversation move is pending; do not assume it succeeded or that the separate app folder contains the repository.
- Implementation branch: feat/reference-portfolio.
- The reel was successfully retrieved through its public embed and visually inspected. See docs/reference.md.
- Built a complete static portfolio in web/: editorial hero, original SVG orbital sculpture and project covers, dark about section, draggable perspective gallery, project dialogs, approach section, and GitHub contact footer.
- Project content covers Barking Village, Work Helper, and VoiceLab with broad source-backed descriptions. No employment, degree, or availability claims were invented.
- Sites project ID is persisted in .openai/hosting.json. Published owner-private. Do not recreate the Site.
- Verified owner-private preview: https://cesar-tortolero.cesartortolero.chatgpt.site. Branding, biography, footer, page/social titles, and metadata now use the confirmed name. The author metadata records the full name.
- Deployed application source commit: 3a741478a9ef1bf46b1fdf5d2200f47c814e6b0e. Later handoff-only commits do not change the deployed application.
- Successful name-update deployment: appgdep_6aefa6a25a448191a2b7f632c473318e. Saved version: appgprj_6aefa2cbe6f48191b090628a5e61b07e~appgver_8dd2a9d23ae081919dc2bbd03a2971c6.
- Full/short name preference is also saved in global Codex AGENTS.md, workspace AGENTS.md, shared USER-PREFERENCES.md, and this project's instructions and brief. Technical paths and historical notes retain their existing identifiers.
- Source was pushed to both the Sites source repository and GitHub branch feat/reference-portfolio. GitHub main retains the setup baseline pending review.

## Verification and blockers

- GitHub CLI authentication succeeded for KoT3sts outside the network sandbox.
- GitHub metadata now confirms visibility=PUBLIC and default branch main. A pre-publication scan covered 42 blob versions across all local Git history and found no credential patterns or sensitive filenames.
- npm test: 10/10 pass, including wraparound, pointer/keyboard controls, focus leaving inactive cards, dialog content and return focus, reduced motion, internal destinations, and asset existence.
- npm run check, npm run build, and git diff --check pass. Local page, JavaScript, and SVG requests return HTTP 200.
- Independent review found a swipe/focus bug. A regression test failed first, then passed after moving focus before hiding the outgoing panel.
- DOM tests use JSDOM 26.1.0. The modal test models missing native open/close methods; browser-native Escape and focus trapping are not verified by it.
- Local browser access is disabled in Work settings. No desktop/mobile screenshot QA was possible; responsive layout needs a real-device look.

## Capabilities follow-up (on top of 0c3787c, uncommitted) — November 7, 2026

- New dark section "What I can do" (`#capabilities`) between About and Experience: eight capabilities from the owner's list, each with a one-line proof and tool tags (no tags on "Teach and unblock developers" and "Work across English and Spanish"). Ruled two-column list on desktop, one column on mobile. Not added to the nav: the 375px nav is already full.
- About: the Georgia Tech sentence became a separate "Currently" row: "Pursuing an M.S. in Computer Science (Machine Learning) at Georgia Tech, part-time, while working full-time." The About link now points to `#capabilities` ("What I can do").
- Section numbers shifted (Experience 03 … Say hello 07).
- `tests/portfolio.test.js`: new test for section order, eight capabilities with proof lines, the Currently text, and no "open to work" wording (not executed here; jsdom unavailable). A browser-side replica passed 37/37.
- Checks: `npm run check`, `npm run build`, `git diff --check`, `node --test tests/gallery-state.test.js` (4/4) pass. Browser at 375 and 1280: no horizontal overflow, no console errors, new text contrast 5.9:1 to 16:1. Screenshots `caps-*.png` in `~/Documents/Work/Screenshots/personal-website/`.
- Owner to confirm wording: "teams I helped train" (brief said "teams he trained"; he co-delivered the workshops), "Eight things I can take on, each backed by work I've done", and "Fluent in both" as the proof for languages.

## Recruiter-ready update (branch feat/recruiter-ready) — November 7, 2026

Uncommitted working-tree changes on `feat/recruiter-ready`, branched from `feat/reference-portfolio`. Nothing was committed, pushed, or deployed. The established design system (warm paper/charcoal, oversized type, pill nav, mono labels, orbital sculpture, perspective gallery, dark contact footer) was kept; this is a content and polish pass, not a redesign.

Confirmed changes:

- Hero: h1 now reads "Machine Learning Engineer" (screen-reader name "Cesar Tortolero, Machine Learning Engineer"); location line "Morristown, NJ — NYC area"; intro "I build and ship ML and LLM systems on AWS" plus scope line; actions: Download résumé (PDF), LinkedIn, Email. The sculpture is sized from the viewport height on desktop so role, intro and actions sit in the first viewport at 1280×720. Below 1100px the hero switches to document flow. No "open to work" banner.
- About: rewritten in plain first person from the owner's facts only.
- New Experience section (between About and Work): ADP (Machine Learning Engineer Aug 2026–present; Associate ML Engineer Jul 2024–Jul 2026; Roseland, NJ) in three themed groups with tool tags, and Kennesaw State University (Lead Researcher, Thoughts-to-Text BCI, Sep 2021–May 2023).
- New Skills & education section (dark, after Work): five skill groups as tags, Georgia Tech and KSU education rows, spoken languages.
- Gallery: six projects (Multi-Agent Workflow, Thoughts-to-Text BCI, Companionship Chatbot, VoiceLab, Work Helper, Barking Village) with stories and stack tags for the new ones. VoiceLab, Work Helper and Barking Village copy is unchanged; no stack tags were added because the repo states none. Three new original SVG covers: `agent-workflow.svg`, `thoughts-to-text.svg`, `companion-chatbot.svg` (2.4–2.9 KB each). The arc still shows three cards: second neighbours fade out and the wrapped card is hidden (`data-far`) so it never sweeps across the stage.
- Contact: header CTA is now the résumé download; nav is About / Experience / Work / Skills / Contact (Skills is hidden below 760px for width). Footer: email pill (`mailto:Lucenatrujillo.cesar@gmail.com`), LinkedIn, GitHub, résumé. The footer moved outside `<main>` so it is a real contentinfo landmark. No phone number in the HTML.
- Meta: title, description, og:title/description and og:type updated to the Machine Learning Engineer positioning; og:url unchanged.
- Fixes: dialog cover images were letterboxed by the inherited `height="620"` attribute (now `height: auto`); several muted text colors darkened to reach 4.5:1 (3:1 for the large grey heading words); experience/skills meta text raised to 11px; local server serves `.pdf` as `application/pdf`.
- Docs: README section/project list and résumé note; `docs/project-brief.md` records the audience decision and the owner-supplied fact source.

Verification done (this machine):

- `npm run check`, `npm run build`, `git diff --check`: pass.
- `node --test tests/gallery-state.test.js`: 4/4 pass (adds a six-project wraparound case).
- Browser QA (chrome-devtools, local server): 375, 768, 1280 and 1600 widths, no horizontal overflow and no nav/wordmark collision; no console errors; dialog opens with the right project, Escape closes it and focus returns to the opener; all local assets including the PDF return 200. Sampled text contrast is at least 4.5:1. A browser-side replica of the updated jsdom assertions passed 46/46. Screenshots: `~/Documents/Work/Screenshots/personal-website/`.
- Impeccable detector ran once. Remaining findings are incumbent identity traits kept on purpose (gradient fade on the second hero line, 8–10px mono micro-labels and nav, Arial, cream paper, numbered section rows, glow on the "C" panel).

Not verified:

- `tests/portfolio.test.js` (jsdom) was updated for the new markup but NOT executed: jsdom's dependencies are incomplete in `node_modules` and could not be installed (public npm blocked, Artifactory timing out). Run `npm ci && npm test` on the owner's machine.
- Reduced motion was checked by code review only (the CSS rule and JS guard are unchanged); no OS-level reduced-motion emulation was run.
- Real-device testing (iOS Safari, Android) and screen-reader passes.
- The Contact nav item is not highlighted when the page cannot scroll far enough for the footer to cross the observer band (short footer at the very bottom). Cosmetic.

Next steps:

1. Owner review of the new copy, especially the About paragraphs, project leads, and the Experience grouping.
2. Run `npm ci && npm test` where jsdom installs; then commit on `feat/recruiter-ready` and open a PR against `feat/reference-portfolio` or `main`.
3. Republish through the Sites source helper (keep `.openai/hosting.json` unchanged).

## Next action (earlier)

Review the private preview on the owner's phone and refine content or add a supplied portrait. A draft GitHub PR preserves the implementation for review before merging into main. Native Escape/focus trapping and visual overflow still need real-device verification. The browser panel handoff was queued by the app; it is not evidence that the owner viewed it.

Another account can read/fork the public repository and propose changes. Current code: feat/reference-portfolio; draft PR: https://github.com/KoT3sts/personal-website/pull/1. Direct collaborator access has not been granted because no account username was supplied. Website hosting remains owner-private.
