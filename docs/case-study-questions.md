# Case-study questions for Cesar (round 8)

The six case studies (`web/projects/*.html`) now open with an "In 30 seconds" block. They only say what the homepage, the lab pages, the build trace or your November 2026 résumé support. Every new sentence and its source is in `docs/case-study-facts.json`. Where no source supports a diagram, a "One hard decision" section or a "One limit" section, the page leaves it out and the question is below. Answer any of them and the page can grow.

Résumé facts waiting for your yes (status `pending-cesar` in the facts file):

- Thoughts-to-Text BCI: "I also mentored 50+ undergraduate researchers as a Research Peer Mentor (2022–2023)." Only the title "Research Peer Mentor" is new. The homepage already says you mentored 50+ undergraduate researchers.

## Multi-Agent Workflow

1. **Is the build trace a run of this workflow?** The page's Result row says "A recorded agent run built two rounds of this site: 52 steps and 16 commits, errors and retries included", and its limit section uses that run's errors and resumed tasks. The essay connects the two, but no source says the run used the workflow itself (the same subagents and MCP servers). If it did, can the page say so plainly? If it didn't, what should the Result row say instead?
2. **Why read-only?** The decision section says the agents get read-only access to delivery tools, but no source gives the reason. Was it a rule you chose (what would write access have risked?), a platform constraint, or both?
3. **Any measured result for the workflow itself?** For example, review findings caught before merge, time from task to verified change, or how many people or projects use it. The page currently has no outcome number of its own.
4. **What does the verifier check, and in what order do the roles run?** The diagram draws implement, review, verify left to right, following the homepage wording. Is that the order, and does a failed review or verification loop back?
5. **Can anything be public?** A sanitised config, a public repository, or a short screen recording. The site's own repository (`KoT3sts/personal-website`) is public, but GitHub was last pushed on Nov 9, before the rounds 4–5 commits the trace records, so the page does not link it yet.

## Thoughts-to-Text BCI

6. **Which preprocessing steps produced the +15%, and what was the baseline?** For example filtering (which bands), artifact removal (ICA, regression or rejection), re-referencing, and epoching or windowing. Is +15% in percentage points or relative to the baseline, and what was the accuracy before and after?
7. **What was classified, and on what data?** The task (imagined words, letters or a small set of classes), the number of classes, participants and trials, and whether the data was recorded in the lab or a public dataset. Which classifier was used?
8. **One hard decision.** Was there a choice you argued for, such as keeping fewer channels, a stricter artifact rule, or a different split between training and test sessions?
9. **One limit.** For example, small number of participants, one session, offline only (not real time), or accuracy still far from usable thoughts-to-text.
10. **Is there something public to open?** An NCUR abstract or proceedings entry, a poster or slides, or a KSU news item about the stipend. (Your GitHub fork `handwritingBCI` is someone else's published code, so the page does not link it.)

## Companionship Chatbot

11. **Was it a team project, and what was your part?** The My part row keeps the old page's claim, "I built an LLM companionship chatbot with sentiment analysis." If KSU CDay was a team entry, which parts were yours?
12. **How were the 95% and the 20% measured?** For 95%: the classes (positive, neutral, negative?), the test set size and where the labels came from. For the 20% higher satisfaction: compared with what (the same bot without sentiment?), how many users, and what survey or scale.
13. **How did the sentiment signal reach the LLM?** For example, a classifier label added to the prompt, a change of tone or response style, or escalation on negative sentiment. Which LLM and which sentiment model? With this the page can show a small diagram like the other two.
14. **One hard decision.** For example, a separate classifier instead of asking the LLM itself, or how the bot handled strongly negative messages.
15. **Can the original model, data or a write-up be shared?** The limit section says neither the original model nor its data is published on the site. If something can be shared (even a slide), the page can link it.

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
