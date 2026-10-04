// The browser side of deck generation: plan, then one level at a time,
// saving after each so the deck is playable (and persisted) as soon as its
// first level lands, while the rest keep arriving.

import {
  assembleDeck,
  type Deck,
  type DeckPlan,
  type LevelBrief,
  type QuizQuestion,
} from "./deck";
import { type SourceFragment } from "./material";
import { saveDeck } from "./deck-store";

export type BuildStatus =
  | { phase: "planning" }
  | { phase: "writing"; level: LevelBrief; index: number; total: number }
  | { phase: "ready" }
  | { phase: "error"; message: string };

export interface DeckBuild {
  topic: string;
  usage?: { input: number; output: number };
  /** Null until the first level is written. */
  deck: Deck | null;
  /** Levels still to come, in order. */
  pending: LevelBrief[];
  status: BuildStatus;
}

export class GenerationUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationUnavailable";
  }
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal, onUsage?: (usage?: { input: number; output: number }) => void): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; usage?: { input: number; output: number } } & T;
  onUsage?.(data.usage);
  if (res.status === 503) throw new GenerationUnavailable(data.error ?? "Unavailable");
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export interface BuildOptions {
  notes?: string;
  sources?: SourceFragment[];
  cardCount?: 10 | 20 | 30;
  signal?: AbortSignal;
  /** Every change: status, a new level, an error. */
  onUpdate?: (build: DeckBuild) => void;
  /** Once, when the first level exists. */
  onPlayable?: (deck: Deck) => void;
  /** Slugs already in use (built-in + saved), to keep the new one unique. */
  takenSlugs?: Iterable<string>;
}

export async function buildDeck(
  topic: string,
  { notes, sources, cardCount = 10, signal, onUpdate, onPlayable, takenSlugs = [] }: BuildOptions = {}
): Promise<Deck> {
  const build: DeckBuild = { topic, deck: null, pending: [], status: { phase: "planning" } };
  const emit = () => onUpdate?.({ ...build, pending: [...build.pending] });
  emit();

  const addUsage = (usage?: { input: number; output: number }) => {
    if (usage) build.usage = { input: (build.usage?.input ?? 0) + usage.input, output: (build.usage?.output ?? 0) + usage.output };
  };
  let plan: DeckPlan;
  try {
    const result = await post<{ plan: DeckPlan; usage?: { input: number; output: number } }>("/api/decks/plan", { topic, notes, sources, cardCount }, signal, addUsage);
    plan = result.plan;
  } catch (error) {
    build.status = { phase: "error", message: signal?.aborted ? "Generación cancelada." : error instanceof Error ? error.message : String(error) };
    emit();
    throw error;
  }
  const taken = new Set(takenSlugs);
  let slug = plan.slug;
  for (let i = 2; taken.has(slug); i++) slug = `${plan.slug}-${i}`;

  build.pending = [...plan.levels];
  const cards: Record<string, QuizQuestion[]> = {};
  const avoid: string[] = [];

  for (let i = 0; i < plan.levels.length; i++) {
    const level = plan.levels[i];
    build.status = { phase: "writing", level, index: i + 1, total: plan.levels.length };
    emit();
    try {
      const { questions } = await post<{ questions: QuizQuestion[]; usage?: { input: number; output: number } }>(
        "/api/decks/level",
        { topic, plan, levelId: level.id, avoid, notes, sources, cardCount },
        signal, addUsage
      );
      signal?.throwIfAborted();
      cards[level.id] = questions;
      const nextDeck = { ...assembleDeck(plan, cards, slug), ...(sources ? { sharing: "manual" as const } : {}) };
      saveDeck(nextDeck, true);
      build.deck = nextDeck;
      for (const q of questions) avoid.push(q.kind === "truefalse" ? q.statement : q.prompt);
    } catch (error) {
      // A level that fails after the first one is written leaves a shorter
      // but playable deck; a failure before that is a failure.
      build.status = {
        phase: "error",
        message: (signal?.aborted ? "Generación cancelada." : error instanceof Error ? error.message : String(error)) + (build.deck ? " El mazo quedó incompleto; los conjuntos terminados siguen guardados." : ""),
      };
      build.pending = [];
      emit();
      if (!build.deck) throw error;
      return build.deck;
    }
    build.pending = plan.levels.slice(i + 1);
    if (i === 0) onPlayable?.(build.deck);
    emit();
  }

  build.status = { phase: "ready" };
  emit();
  return build.deck!;
}
