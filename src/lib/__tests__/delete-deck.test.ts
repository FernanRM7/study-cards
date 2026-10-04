// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { listSavedDecks, removeDeck, saveDeck } from "../deck-store";
import { deckFixture } from "./fixtures";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
it("removes only the chosen deck from persistent storage", () => {
  saveDeck(deckFixture({ slug: "one" }));
  saveDeck(deckFixture({ slug: "two" }));
  removeDeck("one");
  expect(listSavedDecks().map(deck => deck.slug)).toEqual(["two"]);
  expect(JSON.parse(localStorage.getItem("flashcards:decks:v1")!)).toHaveLength(1);
  removeDeck("two");
  expect(listSavedDecks()).toEqual([]);
});
it("reports a failed deletion and preserves the saved deck", () => {
  saveDeck(deckFixture({ slug: "one" }));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
  expect(() => removeDeck("one")).toThrow();
  expect(listSavedDecks().map(deck => deck.slug)).toEqual(["one"]);
});
