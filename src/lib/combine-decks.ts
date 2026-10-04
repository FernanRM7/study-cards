import { parseDeck, type Deck } from "./deck";
import { uniqueSlug } from "./deck-store";

export function combineDecks(decks: Deck[], name: string, taken: string[]): Deck {
  if (new Set(decks.map(d => d.slug)).size < 2) throw new Error("Elige al menos dos mazos.");
  if (!name.trim()) throw new Error("Escribe un nombre para el examen.");
  const questions = decks.flatMap((deck, index) => deck.levels.flatMap(level =>
    level.questions.map((question, number) => ({
      ...structuredClone(question),
      id: `exam-${index}-${level.id}-${number}`,
      sourceDeck: question.sourceDeck ?? { slug: deck.slug, title: deck.title, questionId: question.id },
    }))));
  return parseDeck({
    slug: uniqueSlug("examen-combinado", taken), mode: "exam", sharing: "manual",
    title: name.trim(), headline: name.trim(),
    tagline: `${decks.length} mazos · ${questions.length} tarjetas`,
    cta: "Comenzar examen", passScore: Math.ceil(questions.length * .7),
    verdicts: {
      low: "Sigue practicando estos temas.", mid: "Vas avanzando. Revisa las respuestas.",
      high: "Buen trabajo. Repasa lo que faltó.", perfect: "¡Todas las respuestas correctas!",
    },
    levels: [{ id: "exam", name: "Examen", tagline: "Una prueba con todos tus temas", timed: false, hidden: false, questions }],
  });
}
