import { DeckCoverSchema, type Deck } from "./deck";
import { getSavedDeck, saveDeck } from "./deck-store";

const lookups = new Map<string, Promise<Deck>>();

/** Older saved decks can acquire a cover without regenerating their cards.
 * Each deck is looked up once per session; its chosen image is persisted. */
export function ensureDeckCover(deck: Deck): Promise<Deck> {
  if (deck.cover) return Promise.resolve(deck);
  const key = `${deck.slug}:${deck.title}:${deck.headline}`;
  const existing = lookups.get(key);
  if (existing) return existing;
  const lookup = (async () => {
    try {
      const response = await fetch("/api/decks/cover", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: `${deck.title}. ${deck.headline}`.slice(0, 400) }),
      });
      if (!response.ok) return deck;
      const data = await response.json() as { cover?: unknown };
      const cover = DeckCoverSchema.safeParse(data.cover);
      if (!cover.success) return deck;
      // A generator may have saved more groups while the lookup was running.
      const saved = getSavedDeck(deck.slug);
      const enriched = { ...(saved ?? deck), cover: saved?.cover ?? cover.data };
      if (saved) saveDeck(enriched);
      return enriched;
    } catch {
      return deck;
    }
  })();
  lookups.set(key, lookup);
  return lookup;
}
