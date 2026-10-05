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

## Block review and countdown refinement — 2026-10-05

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | src/components/material-review.tsx:17 | Every chapter remained visible after choosing a block | Only chapters and fragments belonging to the active block appear; each block remembers its selection | Progressive disclosure limits review to the material being sent |
| MEDIUM | src/components/quiz/quiz-modal.tsx:1104 | Countdown moved with the vertically centered question; explanation and provenance had accumulated insets | Countdown has a stable top row; explanation and provenance share the question's leading edge | Shared edges and a distinct controls zone improve orientation |
| LOW | src/components/quiz/exam-modal.tsx:127 | Countdown switch preceded Start with its label trailing the track | Switch follows Start, aligned to the trailing edge with label before track | DOM order follows the primary action and keeps the optional setting subordinate |
| LOW | src/components/exam-creator.tsx:37 | Unavailable exam button used aria-disabled alone | Native disabled button, keyboard-focusable tooltip wrapper, enabled at two decks | Controls communicate availability and cannot perform an unavailable action |

Verification: Chromium at 390×844 and 1280×900; dark/light; real keyboard Tab
opened the unavailable-action tooltip. Zero and one deck kept the button disabled;
two enabled it and removed the tooltip. Markdown blocks exposed only their own
chapters, and deselection survived switching away and back. Study expiry rendered
Cube's red “Time’s up” inside the same timer without 0:00 or extra reveal text;
explanation and provenance both began at x=39.59375 in the mobile fixture.
Exam expiry was checked with reduced motion: inputs locked, no solution appeared,
and the next question/result followed the one-second hold. No browser errors.
The 640×450 viewport at 2× device scale (layout space equivalent to 1280×900
at 200% zoom) and RTL result mirror had no horizontal overflow; dialog bounds
stayed within the viewport. Automated tests cover per-block memory, new-material
reset, native disabled actions, pause/resume of the expiry hold, last-question
results, retry, cancellation and one-shot countdown expiry.

Not verified: native browser zoom controls, Safari/iOS, full RTL navigation,
every possible viewport, real generation or Firecrawl conversion in this review.
The desktop/mobile checks used local test decks with sharing set to manual.
No services were called to generate content, classify material or publish decks.

No HIGH findings remain in the inspected scope. Approve.

### Sugerencias opcionales por objetivo

El paso 3 incorpora el Switch Fluid existente, apagado inicialmente, con una explicación del envío de todas las secciones utilizables a Cloudflare. El análisis bloquea navegación y ofrece cancelación. La revisión permite ajustar cada bloque o recuperar la selección manual previa. Comprobado con un Markdown ficticio en escritorio y móvil; Clef seleccionó HTML y descartó una receta para un objetivo sobre HTML semántico. La extracción y generación no cambian.

### Ajuste del Switch y avance directo de Clef

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| LOW | src/components/material-creator.tsx | El padding de Fluid desplazaba el interruptor respecto al borde del contenido | Margen lógico negativo compensa el padding sin reducir el área interactiva | Align to shared edges; mantiene un borde visual común |

Se retira la explicación auxiliar del Switch. El análisis exitoso continúa al paso 4; los estados de análisis, error y cancelación siguen disponibles. Typecheck y 199 pruebas verifican el avance directo y el material generado. Not verified: zoom nativo al 200 % y espejo RTL. Approve para el alcance inspeccionado.
