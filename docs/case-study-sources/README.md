# Case-study sources

Verbatim excerpts of the public records (and Cesar's own metrics) that the case studies in
`web/projects/` quote. `tests/case-studies.test.js` reads these files: every quote in a
`docs/case-study-facts*.json` ledger entry that names one of these sources must appear in the
file, word for word (case, spacing and curly apostrophes are normalised).

Each file starts with the URL it was copied from and the date it was read. Copy text exactly
as published, typos included; do not summarise inside these files. Navigation, cookie banners
and unrelated entries on the same page are left out. Email addresses are left out.

| Source id | File | What |
|---|---|---|
| ksu-bci-136 | ksu-bci-136.txt | KSU DigitalCommons record, Fall 2022 Symposium of Student Scholars, oral presentation 136 |
| ksu-bci-255 | ksu-bci-255.txt | KSU DigitalCommons record, 26th Symposium of Student Scholars (Spring 2022), poster 255 |
| ksu-motor-163 | ksu-motor-163.txt | KSU DigitalCommons record, Fall 2022 Symposium of Student Scholars, oral presentation 163 |
| ksu-cday-120 | ksu-cday-120.txt | KSU DigitalCommons record of the C-Day Spring 2024 capstone UC-120, plus the text of its poster |
| ksu-cday-winners | ksu-cday-winners.txt | KSU CCSE "Spring 2024 C-Day Winners" page, Undergraduate Capstone section |
| chatbot-report | chatbot-report-excerpts.txt | The capstone team's final report (PDF on the project site), excerpts |
| chatbot-site | chatbot-site.txt | The capstone team's project site (WordPress) |
| metrics | workflow-metrics.txt | Cesar's aggregate counts for the multi-agent workflow and this site, measured through November 11, 2026 |

Other source ids used by the ledgers: `homepage`, `lab`, `trace` (published pages of this site),
`cesar-answers` (`docs/case-study-answers.md`), `handoff` (`HANDOFF.md`), `method` (how an on-page
chart or demo works; needs a note) and two that can't be checked by the test:

- `résumé 2026-11`: kept outside the repository, so its facts stay `pending-cesar` until Cesar confirms.
- `opinion`: Cesar's views written in his voice from his direction (paired with `cesar-answers`, whose
  quotes are checked). They are published because he asked for the section, and stay `pending-cesar`
  until he has read the wording.

`pending-cesar` is only allowed for those two; any other source must be `approved`.
