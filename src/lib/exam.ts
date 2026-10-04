import type { QuizQuestion } from "./deck";
export function shuffleExam<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function examAnswer(q: QuizQuestion): string {
  if (q.kind === "choice") return q.options[0];
  if (q.kind === "truefalse") return q.answer ? "Verdadero" : "Falso";
  return [...q.items].sort((a, b) => a.value - b.value).map(i => i.label).join(" → ");
}
export function examPrompt(q: QuizQuestion): string {
  return q.kind === "truefalse" ? q.statement : q.prompt;
}

export function isExamOrderCorrect(q: Extract<QuizQuestion, { kind: "order" }>, order: number[]): boolean {
  return order.length === q.items.length && new Set(order).size === order.length
    && order.every((n, i) => n >= 0 && n < q.items.length && (i === 0 || q.items[order[i - 1]].value < q.items[n].value));
}
