// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ensureDeckCover } from "../deck-cover";
import { getSavedDeck, saveDeck } from "../deck-store";
import { deckFixture } from "./fixtures";

const cover = { image: "https://upload.wikimedia.org/editor.jpg", alt: "Editor de código", credit: { license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Editor.jpg" } };

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("saved deck covers", () => {
  it("adds and persists a cover without losing groups saved during lookup", async () => {
    const deck = { ...deckFixture(), slug: "cover-groups" };
    saveDeck(deck);
    const newer = { ...deck, levels: [...deck.levels, { ...deck.levels[0], id: "extra", questions: deck.levels[0].questions.map(question => ({ ...question, id: `extra-${question.id}` })) }] };
    vi.stubGlobal("fetch", vi.fn(async () => {
      saveDeck(newer);
      return new Response(JSON.stringify({ cover }));
    }));
    const enriched = await ensureDeckCover(deck);
    expect(enriched.levels).toHaveLength(newer.levels.length);
    expect(getSavedDeck(deck.slug)?.cover).toEqual(cover);
    expect(getSavedDeck(deck.slug)?.levels).toHaveLength(newer.levels.length);
  });

  it("preserves a deck when the image provider is unavailable", async () => {
    const deck = { ...deckFixture(), slug: "cover-offline" };
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Offline"); }));
    expect(await ensureDeckCover(deck)).toBe(deck);
  });

  it("keeps the previously selected image without making another request", async () => {
    const deck = { ...deckFixture(), cover };
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await ensureDeckCover(deck)).toBe(deck);
    expect(fetch).not.toHaveBeenCalled();
  });
});
