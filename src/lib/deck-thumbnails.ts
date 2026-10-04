import {
  cardPicture,
  type ChoiceQuestion,
  type QuizLevel,
  type TrueFalseQuestion,
} from "@/lib/deck";

export type IllustratedCard = ChoiceQuestion | TrueFalseQuestion;

const LANDING_DESIGN_PREVIEWS = [
  {
    id: "landing-bezier-curve",
    kind: "choice",
    prompt: "¿Cuántos puntos de control dan forma a una curva Bézier cúbica?",
    options: ["Dos", "Uno", "Tres", "Cuatro"],
    fact:
      "Una curva Bézier cúbica usa dos extremos y dos puntos de control para definir su forma.",
    image: "/images/bezier-curve.svg",
    imageAlt:
      "Una curva con dos extremos y dos puntos de control desplazados",
    imageCredit: { title: "Curva Bézier cúbica" },
  },
  {
    id: "landing-oklch-color",
    kind: "choice",
    prompt: "¿Qué valor de OKLCH controla la intensidad del color?",
    options: ["Croma", "Luminosidad", "Tono", "Opacidad"],
    fact:
      "En OKLCH, L representa la luminosidad, C el croma y H el ángulo del tono.",
    image: "/images/oklch-color-space.svg",
    imageAlt: "Un espectro de colores vivos con luminosidad uniforme",
    imageCredit: { title: "Espacio de color OKLCH" },
  },
] satisfies IllustratedCard[];

/** The first three playable cards that carry artwork. */
export function deckIllustratedCards(levels: QuizLevel[]): IllustratedCard[] {
  return levels
    .flatMap((level) => level.questions)
    .filter(
      (question): question is IllustratedCard =>
        question.kind !== "order" && !!cardPicture(question)
    )
    .slice(0, 3);
}

/** Landing-only examples: design engineering on the edges, deck in the middle. */
export function landingIllustratedCards(
  levels: QuizLevel[]
): IllustratedCard[] {
  void levels;
  const middleCard: IllustratedCard = {
    id: "landing-starry-night", kind: "choice",
    prompt: "¿A qué movimiento pertenece La noche estrellada?",
    options: ["Posimpresionismo", "Impresionismo", "Surrealismo", "Romanticismo"],
    fact: "La noche estrellada, de Van Gogh, es una obra del posimpresionismo.",
    image: "/images/oD7sywyaLRVRE8ocCeCBBE5dPdk.png",
    imageAlt: "La noche estrellada, pintura de Vincent van Gogh",
    imageCredit: { title: "La noche estrellada", author: "Vincent van Gogh" },
  };

  return middleCard
    ? [LANDING_DESIGN_PREVIEWS[0], middleCard, LANDING_DESIGN_PREVIEWS[1]]
    : LANDING_DESIGN_PREVIEWS;
}

/** Up to three pictures from a deck, in card order. Either image slot counts. */
export function deckThumbnails(levels: QuizLevel[]): string[] {
  return deckIllustratedCards(levels).map((question) => cardPicture(question)!);
}
