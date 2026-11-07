# Reference Portfolio Implementation Plan

> Historical plan for the completed first draft. Future fidelity work must follow [SPECIFICATION.md](../../../SPECIFICATION.md); the checked steps below do not establish that the ultimate visual goal has been achieved.

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build and privately publish Cesar Tortolero's personal website from the inspected reel.

**Architecture:** Static progressive enhancement with semantic HTML, original SVG artwork, and a CSS perspective gallery. Keep state logic separate from DOM wiring; a small Node script copies source assets into dist.

**Tech Stack:** HTML, CSS, JavaScript modules, Node built-in tests, Sites static hosting.

**Spec:** docs/superpowers/specs/2026-11-07-reference-portfolio-design.md

## Global Constraints

- Display name: Cesar Tortolero.
- Static source in web/, built output in dist/.
- GitHub repository is public per the owner's later November 7 instruction; Sites preview remains owner-private.
- No invented personal details or private operational information.
- Mobile navigation, focus behavior, overflow, and reduced motion must be checked.

## Review Focus

- Negative gallery indexes and wraparound must select a real project.
- Pointer drags must preserve vertical page scrolling on phones.
- Inactive gallery panels must not capture keyboard focus.
- Detail dialogs must return focus and close using Escape.
- Without JavaScript or with reduced motion, content remains accessible.

### Task 1: Gallery interaction model

Files: web/gallery-state.js, tests/gallery-state.test.js, package.json.
Interface: createGalleryState(count, initialIndex=0) returns read-only index plus select(index) and step(delta).

- [x] Write behavior tests for wraparound, negative indexes, invalid count, and independent state instances; run to observe the missing implementation.
- [x] Implement normalized selection and validate non-integer or invalid input.
- [x] Run npm test and verify every assertion passes.

### Task 2: Complete visitor experience

Files: web/index.html, web/styles.css, web/app.js, web/assets/*.svg, scripts/build.mjs, scripts/serve.mjs.
Consumes: gallery model. Produces: responsive static site with working navigation, gallery, dialogs and contact links.

- [x] Build the semantic page and custom artwork; implement gallery controls, touch/keyboard interaction, reduced motion, active navigation, and accessible details.
- [x] Build dist, verify local HTTP responses and internal assets, and check the source for private or fabricated claims.
- [x] Run DOM interaction tests where the environment supports them. Browser access is disabled locally; report that limit unless a supported browser becomes available.

### Task 3: Review and publication

Files: .openai/hosting.json, README.md, HANDOFF.md, docs/reference.md, docs/project-brief.md.

- [x] Obtain an independent final review and address material findings.
- [x] Run tests, syntax checks, build, and diff check.
- [x] Synchronize exact source to Sites, package, deploy privately, and verify returned deployment status.
- [x] Push the implementation branch to GitHub, update the handoff and shared-memory pointers, and deliver the verified phone-accessible URL.
