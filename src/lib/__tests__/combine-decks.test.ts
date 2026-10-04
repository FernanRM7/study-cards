// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { combineDecks } from "../combine-decks";
import { parseDeck } from "../deck";
import { saveDeck, listSavedDecks } from "../deck-store";
import { adoptSharedDeck } from "../adopt-shared-deck";
import { deckFixture, choice } from "./fixtures";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
describe("combined exams", () => {
  it("copies all groups, including hidden groups, preserving metadata and repeated questions", () => {
    const a = deckFixture({ slug: "one", questions: [choice("duplicate")] });
    a.levels.push({ ...a.levels[0], id: "hidden", hidden: true, timed: true, questions: [choice("hidden-card")] });
    a.levels[0].questions[0].provenance = { kind: "material", references: [{ id: "file-1", file: "notes.md", location: "Inicio" }] };
    const b = deckFixture({ slug: "two", questions: [choice("duplicate")] });
    const before = JSON.stringify([a, b]);
    const exam = combineDecks([a, b], "Mi examen", ["examen-combinado"]);
    expect(exam.slug).toBe("examen-combinado-2");
    expect(exam.mode).toBe("exam"); expect(exam.passScore).toBe(3);
    expect(exam.levels).toHaveLength(1); expect(exam.levels[0].timed).toBe(false);
    const cards = exam.levels[0].questions;
    expect(cards).toHaveLength(3); expect(new Set(cards.map(c => c.id)).size).toBe(3);
    expect(cards[0].provenance).toEqual(a.levels[0].questions[0].provenance);
    expect(cards[2].sourceDeck?.slug).toBe("two");
    cards[0].fact = "Changed"; expect(JSON.stringify([a, b])).toBe(before);
  });
  it("round-trips through parsing, local storage and shared-deck adoption", () => {
    const exam = combineDecks([deckFixture({ slug: "one" }), deckFixture({ slug: "two" })], "Examen", []);
    expect(parseDeck(JSON.parse(JSON.stringify(exam)))).toEqual(exam);
    saveDeck(exam, true); expect(listSavedDecks()[0]).toEqual(exam);
    expect(adoptSharedDeck({ deck: exam, id: "abcdefghjk" }, deckFixture({ slug: "builtin" }), "https://site.test")).toEqual(exam);
    expect(listSavedDecks()).toHaveLength(1);
  });
  it("rejects insufficient selection and invalid exam groups", () => {
    expect(() => combineDecks([deckFixture()], "Examen", [])).toThrow();
    const exam = combineDecks([deckFixture({ slug: "one" }), deckFixture({ slug: "two" })], "Examen", []);
    expect(() => parseDeck({ ...exam, levels: [{ ...exam.levels[0], timed: true }] })).toThrow();
  });
  it("reports blocked local persistence instead of claiming success", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    expect(() => saveDeck(deckFixture(), true)).toThrow(/guardar/);
    expect(() => adoptSharedDeck({ deck: deckFixture(), id: "abcdefghjk" }, deckFixture({ slug: "builtin" }), "https://site.test")).toThrow(/guardar/);
  });
});
