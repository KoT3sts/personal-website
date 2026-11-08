# Agentic Entrance Implementation Plan

> Use superpowers:executing-plans for inline implementation, with a focused final review.

**Goal:** Ship a first working version of the cursor-crew entrance based on the supplied recording.
**Architecture:** One client-side controller enhances existing elements with temporary frames/cursors and CSS reveals. All content remains prebuilt; persistent visit eligibility and explicit replay are separate.
**Tech Stack:** JavaScript modules, CSS, Node/JSDOM tests, existing static build and private Sites hosting.
**Spec:** SPECIFICATION.md section 11.

## Constraints and review focus

- Preserve the first reel's final portfolio design; no backend model calls or invented live-agent claims.
- Skip, Escape, Tab, navigation, rendering failure, and storage failure reveal content and cancel all further automatic reveals.
- Replay is hero-only; direct links, reduced motion, and returning visits bypass automatic animation.
- No timers/overlays survive cancellation; cursor positions use live element bounds; no forced scroll except explicit replay to Home.
- The current portfolio remains an incomplete baseline for overall visual parity.

## Tasks

- [x] Write failing eligibility and DOM lifecycle tests in tests/entrance.test.js.
- [x] Add web/entrance.js controller and web/entrance.css; connect bootstrap and stylesheet.
- [x] Test first visit, completion, skip/Escape/navigation, returning visit, replay, deep links, reduced motion, and unavailable storage.
- [x] Run full tests, syntax checks, build, and diff checks; obtain an independent implementation review and fix material issues.
- [x] Package exact source, publish owner-private, push the existing GitHub branch, and save the handoff/evidence limits.
