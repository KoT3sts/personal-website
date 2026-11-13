# Case-study questions for Cesar (round 8, updated in round 9)

The six case studies (`web/projects/*.html`) open with an "In 30 seconds" block and only say what a published source supports. Every new sentence, number and chart value, with its source, is in a ledger: `docs/case-study-facts.json` (the three main projects) and `docs/case-study-facts-side.json` (the side projects). Public records the pages quote are copied word for word into `docs/case-study-sources/`, and `tests/case-studies.test.js` checks every quote against them.

**Questions 1–15 are answered** (your answers: `docs/case-study-answers.md`, November 11, 2026). What changed in round 9:

- **Multi-Agent Workflow (Q1–Q5):** the page says plainly that the build trace is a recorded run of this workflow; the access story is corrected (agents have write access; CI and source-control context comes through read-only tools; production waits for your approval); the implement → review → verify loop and what happens on a failure are an animated diagram; aggregate metrics measured through November 11, 2026 are shown as counters and charts (no success or approval rates, no time saved); no tool, system or employer names. The repository is mentioned as going public with the next push, not linked yet.
- **Thoughts-to-Text BCI (Q6–Q10):** the +15% and the "Research Peer Mentor" line are gone. The page leads with the three 2022 KSU DigitalCommons records (Fall 2022 talk 136, Spring 2022 poster 255, Fall 2022 talk 163), the published method (autoencoder, then t-SNE in 2D), the open-vocabulary decision and the noisy-EEG limit. The scatter chart is labelled as an illustration with synthetic points.
- **Companionship Chatbot (Q11–Q15):** your role wording, First Place (Undergraduate Capstone, C-Day Spring 2024) with the KSU winners page, and the public report's facts (architecture, eight emotions, the 10-prompt test, 1,360 lines and 28 components, the two Azure deployment plans). The 95% and 20% are gone everywhere.

Still for you to read (status `pending-cesar` in `docs/case-study-facts.json`):

- Multi-Agent Workflow, "Why I work this way": six sentences of opinion written in your voice from your Q2 direction (delegation and automation as where engineering is going, and the approval gate as what makes it safe), and the line "This site is where the workflow is easiest to see."
- If the +15%, 95% or 20% ever turn up in a source, they can come back with that source.

## VoiceLab

16. **What does it do today?** Which writing signals it explains (sentence length, word choice, readability, something else), and what "meaning-preserving revision" does: does it suggest edits and check that the meaning didn't change? How?
17. **Stack and model.** Language, libraries, and whether a local LLM is involved (which one?). "Local" is on the homepage; how is text kept on the device?
18. **Status and a link.** Is it still a local prototype? Is there a repository, a demo video or a screenshot you're happy to publish?
19. **The authorship line.** The page keeps "This experiment does not establish authorship." Is there a limit you'd add, such as which languages or text lengths it was tried on?

## Work Helper

20. **What is built so far?** What the local onboarding prototype does (the steps a user goes through) and what comes next.
21. **Stack, status and a link.** Language and framework, whether it uses an LLM, and whether there is anything public to open.

## Barking Village

22. **What exists, and is it in use?** The homepage says full-stack and lists care sessions, daily planning, room status and dog records, but not the stage. Is it a prototype, in development, or used by real staff?
23. **Stack.** Frontend, backend, database and hosting.
24. **Your role and a link.** Solo or with others? Is there a demo, screenshots with sample data, or a repository you're happy to publish? (The page must keep "No customer or operational data is shown.")
