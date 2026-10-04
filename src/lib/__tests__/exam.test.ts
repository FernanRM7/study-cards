import { describe, expect, it } from "vitest";
import { examAnswer, isExamOrderCorrect, shuffleExam } from "../exam";
import type { QuizQuestion } from "../deck";
describe("exam answers", () => {
  it("grades ordering by values rather than original array positions", () => {
    const q: Extract<QuizQuestion, { kind: "order" }> = { kind: "order", id: "x", prompt: "Sort", fact: "Order",
      items: [{ label: "Large", value: 30 }, { label: "Small", value: 10 }, { label: "Medium", value: 20 }] };
    expect(examAnswer(q)).toBe("Small → Medium → Large");
    expect(isExamOrderCorrect(q, [1, 2, 0])).toBe(true);
    expect(isExamOrderCorrect(q, [0, 1, 2])).toBe(false);
    expect(isExamOrderCorrect(q, [1, 1, 0])).toBe(false);
  });
  it("shuffles a copy without losing cards or changing answer ordering", () => {
    const cards = ["one", "two", "three", "four"];
    const shuffled = shuffleExam(cards);
    expect(shuffled).not.toBe(cards);
    expect([...shuffled].sort()).toEqual([...cards].sort());
    expect(cards).toEqual(["one", "two", "three", "four"]);
  });
});
