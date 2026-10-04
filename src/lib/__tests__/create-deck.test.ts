// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDeck, type DeckBuild } from "../create-deck";
import { DeckPlanSchema } from "../deck";
import { listSavedDecks } from "../deck-store";
import { choice } from "./fixtures";
const plan = DeckPlanSchema.parse({
  slug: "study", title: "Study", headline: "Study?", tagline: "Study", passScore: 7,
  verdicts: { low: "a", mid: "b", high: "c", perfect: "d" },
  levels: ["one", "two"].map(id => ({ id, name: id, tagline: id, focus: id })),
});
const sources = [{ id: "f-1", file: "notes.md", location: "Inicio", text: "Study" }];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn();
beforeEach(() => { localStorage.clear(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());
describe("incremental material decks", () => {
  it("sends selected fragments, records usage, and persists private decks after each set", async () => {
    fetchMock.mockResolvedValueOnce(json({ plan, usage: { input: 10, output: 1 } }))
      .mockResolvedValueOnce(json({ questions: Array.from({ length: 10 }, (_, i) => choice(`one-${i}`)), usage: { input: 20, output: 2 } }))
      .mockResolvedValueOnce(json({ questions: Array.from({ length: 10 }, (_, i) => choice(`two-${i}`)) }));
    const updates: DeckBuild[] = [];
    const deck = await buildDeck("Study", { sources, cardCount: 20, onUpdate: b => updates.push(b) });
    expect(deck.sharing).toBe("manual"); expect(deck.levels).toHaveLength(2);
    expect(listSavedDecks()[0]).toEqual(deck);
    expect(updates.at(-1)?.usage).toEqual({ input: 30, output: 3 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ sources, cardCount: 20 });
    expect(updates.some(b => b.deck?.levels.length === 1)).toBe(true);
  });
  it.each([false, true])("preserves the first set when a later call fails or is cancelled (%s)", async cancel => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(json({ plan }))
      .mockResolvedValueOnce(json({ questions: Array.from({ length: 10 }, (_, i) => choice(`one-${i}`)) }))
      .mockImplementationOnce(async () => { if (cancel) { controller.abort(); throw new DOMException("Aborted", "AbortError"); } return json({ error: "Cuota agotada" }, 429); });
    const updates: DeckBuild[] = [];
    const deck = await buildDeck("Study", { sources, cardCount: 20, signal: controller.signal, onUpdate: b => updates.push(b) });
    expect(deck.levels).toHaveLength(1); expect(listSavedDecks()[0].levels).toHaveLength(1);
    expect(updates.at(-1)?.status).toMatchObject({ phase: "error", message: expect.stringContaining("incompleto") });
  });
  it("reports failure before the first playable set without saving a deck", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "Missing credentials" }, 503));
    const updates: DeckBuild[] = [];
    await expect(buildDeck("Study", { sources, onUpdate: b => updates.push(b) })).rejects.toThrow("credentials");
    expect(listSavedDecks()).toEqual([]); expect(updates.at(-1)?.status.phase).toBe("error");
  });
  it("does not claim a material deck was saved when localStorage is full", async () => {
    fetchMock.mockResolvedValueOnce(json({ plan }))
      .mockResolvedValueOnce(json({ questions: Array.from({ length: 10 }, (_, i) => choice(`one-${i}`)) }));
    const updates: DeckBuild[] = [];
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    await expect(buildDeck("Study", { sources, onUpdate: b => updates.push(b) })).rejects.toThrow("guardar");
    expect(updates.at(-1)?.deck).toBeNull();
    expect(updates.at(-1)?.status.phase).toBe("error");
    spy.mockRestore();
  });

});
