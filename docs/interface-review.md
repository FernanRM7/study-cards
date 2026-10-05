# Study cards — layout review

Scope: material review, creator actions, deck intro, question timer and exam views.

## Group with space and disclose progressively

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | src/components/material-review.tsx:29 | Hundreds of sections exposed as one flat list | Chapters disclose their sections; long documents offer bounded blocks | Progressive disclosure makes selection manageable without removing source content |
| MEDIUM | src/components/quiz/quiz-modal.tsx:1079 | 700px question panel and a large empty intro area | 620px maximum question panel; text-only intro sizes to content with a 24px content/action gap | Group with space: reduce dead area while keeping deliberate separation |

## Keep controls distinct from content

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| LOW | src/components/exam-creator.tsx:37 | Persistent hint beneath the disabled action | Tooltip under the focusable unavailable action | The hint appears when relevant and does not compete with primary actions; bottom placement avoids covering Añadir material |

Verification: Chromium at 1280px and 390px; light/dark; reduced motion;
640×450 CSS viewport at 2× device scale (space equivalent to 1280×900 at 200%);
exam result RTL mirror; no horizontal overflow in inspected views. Close control
remained in view at the reduced viewport and the exam body remained scrollable.
Created/opened/deleted a simulated deck, then uploaded a different Markdown file
without reload. The full CCNA file produced nine valid blocks. Intro switch,
study timeout, exam expiry and end-only review were exercised.

Not verified: native browser zoom controls, Safari/iOS, every possible viewport,
full RTL navigation, real generation or Firecrawl conversion during this review.
Generation was mocked in-browser; Markdown stayed local. RTL is not a supported
product locale; mixed-direction scoring copy still follows the inherited browser
bidi behavior. Component timer tests cover pause/resume, elapsed time and one-shot
expiry. Creator lifecycle tests cover preserving pending work and resetting a
completed creation.

No HIGH findings remain in the inspected scope. Approve.
