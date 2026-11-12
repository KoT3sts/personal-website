# Case-study answers from Cesar (chat, November 11, 2026)

Answers given one by one in chat. Each one is the source for the matching question in
`docs/case-study-questions.md`; facts that come from here use source `cesar-answers` in
`docs/case-study-facts.json`.

- **Résumé title (pending fact):** "Research Peer Mentor" is a separate role from the BCI
  research. Do not put the mentoring line on the BCI page.
- **Q1, Multi-Agent Workflow:** Yes. The build trace is a run of this same workflow (one agent
  implements, one reviews, one verifies, under the orchestrator). The page can say so plainly.
  Cesar also invited richer presentation for any project: animations, graphs and more detail.
- **Q2, why read-only:** Cesar likes the reason (an agent can't trigger a deploy or merge by
  mistake), with a correction: the agents do have write access; anything that touches
  production needs Cesar's approval first (they must ask him). The page should describe it as
  read-only context tools plus a human approval gate for production, not "read-only agents".
  Expand on why delegating and automating work is the future (his view), alongside the gate.
- **Q3, measured results:** Cesar asked for metrics computed from his wiki, the trace and his
  device. Aggregate, public-safe counts (measured through November 11, 2026; script kept
  outside the repo; no internal names):
  - 514 delegation calls to specialist subagents across 121 sessions (Oct 9–Nov 11, 2026);
    delegation used in 38% of sessions.
  - 93 quality-review calls and 57 verification calls.
  - 709 calls to the read-only CI and source-control tools.
  - A searchable 199-page knowledge base compiled from 130 of 131 session exports, with 188
    retrieval calls.
  - Portfolio: 55 commits over five days, eight documented rounds; runnable node tests grew
    39 → 163; the curated replay covers 52 steps and 16 commits, 8 errors, 6 recovered.
  - Not to publish: success/reliability/approval-compliance percentages, time or cost savings,
    "all 55 commits autonomous" (only the 16 in the trace are individually supported).
- **Q4, order and loop:** Yes: implement → review → verify. When a review or check fails, the
  findings go back: either Cesar corrects the agent so it learns how to do it properly, or he
  takes over that step himself and gives it to the agent as a worked example; then it runs
  again.
- **Q5, public material:** Yes, it can be public as long as nothing ties it back to the
  employer: only Cesar's personal setup and personal projects. OK to link the site's own GitHub
  repository (once pushed) and to publish a cleaned-up version of the agent roles and rules
  (no internal names, systems, tools, paths, tickets or prompts). A screen recording is fine if
  it only shows personal work.
- **Q6–10 and Q11–13, sources Cesar pointed to (KSU DigitalCommons, found November 11, 2026;
  public, open access):**
  - "Brain-to-text communication through a non-invasive BCI", Fall 2022 Symposium of Student
    Scholars, oral presentation 136. Presenters: Cesar Lucena Trujillo, Abm. Adnan Azmee,
    Hafiz Khan, Manohar Murikipudi, Christopher Dargan; PI Md Abdullah Al Hafiz Khan.
    https://digitalcommons.kennesaw.edu/undergradsymposiumksu/Fall2022/presentations/136
    Abstract: end-to-end BCI that translates the neural signals of attempted handwriting into
    text, one character at a time following on-screen instructions; aims at any English word
    rather than a small fixed word set; EEG data is noisy and trials look alike; an autoencoder
    compresses the data to a low-dimensional space and t-SNE maps it to 2D to visualise how
    characters separate.
  - "Brain-to-text communication through an invasive BC[I]", 26th Symposium of Student
    Scholars, Spring 2022, poster 255 (Cesar Lucena Trujillo; PI Khan).
    https://digitalcommons.kennesaw.edu/undergradsymposiumksu/spring2022/presentations/255
  - "Motor Imagery Detection Toward Non-Invasive Brainwave Based Typing", Fall 2022, oral 163
    (Azmee, Murikipudi, Lucena, Gueye, Wishart, Pacheco, Khan): deep neural networks to detect
    imagined motor movement from EEG, envisioned to move a cursor to write letters.
    https://digitalcommons.kennesaw.edu/undergradsymposiumksu/Fall2022/presentations/163
  - "UC-120 Virtual Companionship Chatbot", C-Day Computing Showcase, Spring 2024 undergraduate
    capstone (Cesar Tortolero, Rakshak Gurung, Noah Clark, Fabritzzio A Cabrejos; advisor
    Sharon Parry): React Native app, DistilGPT-2 with the QuAC dataset, Python server, Firebase
    Real-Time Database; logins, stored user info, real-time chat; planned Azure deployment.
    https://digitalcommons.kennesaw.edu/cday/Spring_2024/Undergraduate_Capstone/3
  - None of these documents states the +15%, the preprocessing steps, the 95% sentiment accuracy
    or the 20% satisfaction figure; those still need Cesar's answer or another source.
  - Other KSU works listing Cesar (not on the site yet): dyslexia detection from gaming data
    (Spring 2022, with Khan), semi-supervised EHR classification with transfer learning
    (Fall 2023), post-stroke rehabilitation assessment with a CNN (Fall 2022).
- **Q6, the +15%:** Cesar does not remember where the +15% came from. Decision: the site stops
  claiming it (homepage capability proof, Experience bullet, explorer facts, case study, cover
  illustration and its descriptions) until a source turns up; the BCI story leads with the
  published work instead. (The résumé is Cesar's call.)
- **Q7–Q10, answered from the publications (Cesar: "take my BCI stuff to answer this"):**
  - Q7 what was classified: characters of attempted handwriting from non-invasive EEG,
    participants writing one character at a time following on-screen instructions; aim: any
    English word rather than a small fixed word set. Classifier not stated; the published method
    compresses EEG with an autoencoder and maps it to 2D with t-SNE to see how characters
    separate. A sister project (motor imagery) used deep neural networks.
  - Q8 hard decision: an open-vocabulary, character-by-character design instead of choosing
    from a limited set of words (stated in the abstract).
  - Q9 limit: EEG is noisy and trials of different characters look alike (stated in the
    abstract); the work shows the representation, not a finished real-time typing system.
  - Q10 public: the three DigitalCommons records (Fall 2022 oral 136, Spring 2022 poster 255,
    Fall 2022 oral 163), lead investigator Dr. Md Abdullah Al Hafiz Khan.
- **Q11–Q15, Companionship Chatbot (Cesar: "the whole thing was mine"; numbers not
  remembered; pointed to the KSU C-Day records, the YouTube video and the app demo):**
  - Award: **First Place, Undergraduate Capstone, Spring 2024 C-Day** (KSU CCSE winners page:
    https://www.kennesaw.edu/ccse/events/computing-showcase/sp24-cday-winners.php).
    Public records list a four-person team (Cesar Tortolero, Rakshak Gurung, Noah Clark,
    Fabritzzio A Cabrejos; course CS4850, Prof. Sharon Perry). Cesar says the whole build was
    his. Site wording must not contradict the public team listing: "I built it end to end" plus
    "four-person capstone team" — Cesar to confirm the exact phrasing.
  - Links: final presentation video https://youtu.be/NBu8LE_WF8Q ; project report (PDF)
    https://virtualcompanionchatbot.wordpress.com/wp-content/uploads/2024/04/ind13-virtualcompanionshipchatbot-finalreport.pdf ;
    project site https://virtualcompanionchatbot.wordpress.com/ ; GitHub
    https://github.com/NoahDClark/VirtualCompanionChatbot ; poster
    https://digitalcommons.kennesaw.edu/cgi/viewcontent.cgi?article=1411&context=cday
  - From the report (public): React Native app (login, chat, past conversations), Python server
    hosting a DistilGPT-2 model with the QuAC dataset, Firebase Realtime Database; a sentiment
    module added to the LLM pipeline that names the emotion in a message (joy, sadness, anger,
    fear, surprise, disgust, trust, anticipation) so the reply can console or celebrate; tested
    by feeding labelled prompts and checking only the detected emotion (10-prompt set);
    1,360 lines of code, 28 components; deployment plan: two Azure NC6s_v3 GPU servers
    (east + west) with replicated Firebase, ~$5,070.56/month for ~2,400 requests/min
    (~22,000 users), or one server at about half the cost for ~1,200 requests/min (~10,000
    users).
  - The 95% sentiment accuracy and 20% higher satisfaction are not in any public record and
    Cesar does not remember their source: remove from the site like the +15%.
- **Q11 settled, chatbot role (Cesar):** "I mostly designed the backend LLM part; one partner
  designed the front end; I was also in charge of planning and directing the project; the other
  two briefly assisted with the front end." Page wording: "I led the four-person capstone team
  (planning and direction) and designed the backend LLM: the DistilGPT-2 server and the sentiment
  module. One teammate designed the React Native app; two more helped with it briefly."
- **Q16–Q24, side projects (Cesar, November 11, 2026):** "For that one you can come up with
  something. I don't have much info on it; if needed I'll get back to editing later on. Just
  create cool graphs and explain a bit. Also make sure everything else has cool graphs."
  Decision: VoiceLab, Work Helper and Barking Village get honest, clearly labelled
  illustrations and in-browser demos of what each project explores (sample data only, no
  claimed results); their remaining questions stay open in `docs/case-study-questions.md`.
  Every case study gets real charts/diagrams built from its sourced facts.
- **Final confirmations (November 11, 2026):** "24 AWS accounts" and "about a day → minutes"
  confirmed from the wiki (24-account platform; Cesar's own wording on Nov 3 and Nov 9).
  "Revised more than 40 times" is good. Experience dates stay as they are. Cesar has the rights
  to the Icarus image. "Why I work this way" and the "How I evaluate agents" essay are approved.
  Résumé to be updated to match the site (no +15%, 95% or 20%).
