"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DECK } from "@/data";
import type { Deck } from "@/lib/deck";
import { buildDeck, GenerationUnavailable, type DeckBuild } from "@/lib/create-deck";
import { bestScoresFor, useSavedDecks } from "@/lib/deck-store";
import { adoptSharedDeck } from "@/lib/adopt-shared-deck";
import { useAgentActivity, useWebMcpTools, type DeckSummary } from "@/lib/webmcp";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/quiz/confetti";
import { WanderingCursor } from "@/components/wandering-cursor";
import { DeckList } from "@/components/deck-list";
import { ShareLinkButton } from "@/components/share-link-button";
import { LandingCardFan } from "@/components/landing-card-fan";
import { PhyllotaxisBackdrop } from "@/components/phyllotaxis-backdrop";
import { QuizModal } from "@/components/quiz/quiz-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import dynamic from "next/dynamic";

const ExamCreator = dynamic(() => import("@/components/exam-creator").then(m => m.ExamCreator));
const MaterialCreator = dynamic(() => import("@/components/material-creator").then(m => m.MaterialCreator));

/** The Button's loading glyph, on its own, for the status line. */
function Spinner() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z"
        stroke="currentColor"
        strokeWidth="1.125"
        strokeLinecap="round"
        pathLength="100"
        style={{
          strokeDasharray: "15 85",
          animation: "spinner-move 2s linear infinite, spinner-dash 4s ease-in-out infinite",
        }}
      />
    </svg>
  );
}

function statusLine(build: DeckBuild): string {
  switch (build.status.phase) {
    case "planning":
      return `Preparando un mazo sobre “${build.topic}”…`;
    case "writing":
      return `Creando el grupo ${build.status.index} de ${build.status.total}…`;
    case "ready":
      return `“${build.deck?.title}” está listo.`;
    case "error":
      return build.status.message;
  }
}

/** An agent that stops calling tools shouldn't leave a spinner behind. */
const AGENT_QUIET_MS = 90_000;

/** The landing: one question, the agent prompt that answers it, the decks
 *  on this page, and the quiz. Every deck — the built-in one and the ones
 *  written here — plays in the same modal. */
interface HomeScreenProps {
  /** A deck opened from its share link (/d/<id>): saved into this browser
   *  next to the visitor's own decks, then opened. */
  shared?: { deck: Deck; id: string };
  /** Rendered at /agent, where the copied agent prompt sends the agent: the
   *  page greets it before its first tool call. */
  agentExpected?: boolean;
}

export function HomeScreen({ shared, agentExpected = false }: HomeScreenProps = {}) {
  const materialBusy = useRef(false);
  const [storageNotice, setStorageNotice] = useState("");
  const [creatorView, setCreatorView] = useState<"material" | "exam" | null>(null);
  const materialOpen = creatorView === "material";
  const examOpen = creatorView === "exam";
  const [decksCollapsed, setDecksCollapsed] = useState(false);
  const [keyboardTransition, setKeyboardTransition] = useState(false);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const navigationRevisionRef = useRef(0);
  const reduceMotion = useReducedMotion() ?? false;
  const creatorTarget = useRef<"material" | "exam" | null>(null);
  const navigateCreator = (next: "material" | "exam" | null, keyboard = false) => {
    navigationRevisionRef.current += 1;
    setNavigationRevision(navigationRevisionRef.current);
    creatorTarget.current = next;
    setKeyboardTransition(keyboard);
    setCreatorView(next);
    if (!next || keyboard) setDecksCollapsed(!!next);
  };
  const toggleMaterial = (next: boolean, keyboard = false) => navigateCreator(next ? "material" : null, keyboard);
  const toggleExam = (next: boolean, keyboard = false) => navigateCreator(next ? "exam" : null, keyboard);
  // Navigation back is immediate, including every layout projection.
  const instantNavigation = !creatorView || keyboardTransition;
  const navigationMotion = instantNavigation ? { duration: 0 }
    : reduceMotion ? { duration: spring.fast.duration } : { ...spring.slow, bounce: 0 };
  const saved = useSavedDecks();
  // Newest first, so a deck just written sits at the top of the list.
  const savedDecks = useMemo(() => [...saved].reverse(), [saved]);
  // Keep the example registered for WebMCP and slug reservation. The visible
  // picker below contains only decks saved by the visitor.
  const decks = useMemo(() => [DECK, ...savedDecks], [savedDecks]);

  const [activeDeck, setActiveDeck] = useState<Deck>(DECK);
  const [quizOpen, setQuizOpen] = useState(false);
  const [build, setBuild] = useState<DeckBuild | null>(null);
  const building = build?.status.phase === "planning" || build?.status.phase === "writing";

  // Whether the open quiz is the deck's first showing, right after it was
  // made here: that open gets the confetti and the "Deck unlocked" line.
  // A deck opened from a link, the list, or later on is simply opened.
  const [fresh, setFresh] = useState(false);
  const openDeck = useCallback((deck: Deck, options?: { fresh?: boolean }) => {
    setActiveDeck(deck);
    setFresh(!!options?.fresh);
    setQuizOpen(true);

  }, []);

  // A shared deck lands in this browser's collection under its own slug —
  // or a fresh one if that slug is taken by a different deck — remembers
  // the link it came from, and opens. Once per page load.
  const sharedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!shared || sharedRef.current === shared.id) return;
    sharedRef.current = shared.id;
    // The store, not `decks`: during hydration the React snapshot of the
    // saved decks is still the server's empty one.
    let deck = shared.deck;
    try {
      deck = adoptSharedDeck(shared, DECK, window.location.origin);
      void Promise.resolve().then(() => setStorageNotice("Mazo guardado en este navegador."));
    } catch {
      void Promise.resolve().then(() => setStorageNotice("No se pudo guardar el mazo en este navegador. Podrás estudiarlo mientras esté abierto."));
    }
    // Not in the effect's own tick: opening is a state change.
    void Promise.resolve().then(() => openDeck(deck));
  }, [shared, openDeck]);

  const playDeck = useCallback(
    (slug?: string): Deck => {
      const deck = slug ? decks.find((d) => d.slug === slug) : DECK;
      if (!deck) throw new Error(`No deck "${slug}". Try list_flashcard_decks.`);
      openDeck(deck);
      return deck;
    },
    [decks, openDeck]
  );

  // One build at a time; a second request while one runs is ignored (the
  // tool says so).
  const buildRef = useRef<Promise<Deck> | null>(null);
  const generateDeck = useCallback(
    (topic: string, notes?: string): Promise<Deck> => {
      if (buildRef.current || materialBusy.current) throw new Error("A deck is already being written. Wait for it to finish.");
      let playable: ((deck: Deck) => void) | null = null;
      let failed: ((error: unknown) => void) | null = null;
      const firstLevel = new Promise<Deck>((resolve, reject) => {
        playable = resolve;
        failed = reject;
      });
      const run = buildDeck(topic, {
        notes,
        takenSlugs: decks.map((d) => d.slug),
        onUpdate: (b) => {
          setBuild(b);
          // The open modal follows the deck as levels arrive.
          if (b.deck) setActiveDeck((cur) => (cur.slug === b.deck!.slug ? b.deck! : cur));
        },
        onPlayable: (deck) => {
          openDeck(deck, { fresh: true });
          playable?.(deck);
        },
      });
      buildRef.current = run;
      run
        .catch((error: unknown) => {
          const message =
            error instanceof GenerationUnavailable
              ? "Deck generation isn't set up on this deployment."
              : error instanceof Error
                ? error.message
                : String(error);
          setBuild({ topic, deck: null, pending: [], status: { phase: "error", message } });
          failed?.(new Error(message));
        })
        .finally(() => {
          buildRef.current = null;
        });
      return firstLevel;
    },
    [decks, openDeck]
  );

  const listDecks = useCallback(
    (): DeckSummary[] =>
      decks.map((d) => {
        const best = bestScoresFor(d.slug);
        return {
          slug: d.slug,
          title: d.title,
          headline: d.headline,
          builtIn: d.slug === DECK.slug,
          levels: d.levels.map((l) => ({
            id: l.id,
            name: l.name,
            cards: l.questions.length,
            timed: l.timed,
            hidden: l.hidden,
            ...(best[l.id] !== undefined ? { best: best[l.id] } : {}),
          })),
        };
      }),
    [decks]
  );

  const findDeck = useCallback(
    (slug: string) => decks.find((d) => d.slug === slug),
    [decks]
  );

  // The store forgets the deck; the page just makes sure it isn't left open.
  const deleteDeck = useCallback(
    (slug: string) => {
      if (activeDeck.slug === slug) {
        setQuizOpen(false);
        setActiveDeck(DECK);
      }
    },
    [activeDeck.slug]
  );

  useWebMcpTools({ generateDeck, openDeck, playDeck, listDecks, findDeck, deleteDeck });

  // The agent prompt sends its agent to /agent, so the page can acknowledge
  // the agent as soon as it lands — before its first tool call — and then
  // follow along call by call until the deck is published.
  const activity = useAgentActivity();
  // Quiet detection without resetting state: the timer records which call
  // it timed out on, and a new call (a new `at`) is never equal to it.
  const [quietAt, setQuietAt] = useState<number | null>(null);
  useEffect(() => {
    if (activity.phase !== "working") return;
    const id = setTimeout(() => setQuietAt(activity.at), AGENT_QUIET_MS);
    return () => clearTimeout(id);
  }, [activity]);
  const agentQuiet = activity.phase === "working" && quietAt === activity.at;
  // The same patience for an agent that never shows up: a stale /agent
  // link (a refresh after the session, a link the agent echoed back) falls
  // back to the prompt instead of waiting forever.
  const [expectedGaveUp, setExpectedGaveUp] = useState(false);
  useEffect(() => {
    if (!agentExpected || activity.phase !== "idle") return;
    const id = setTimeout(() => setExpectedGaveUp(true), AGENT_QUIET_MS);
    return () => clearTimeout(id);
  }, [agentExpected, activity.phase]);
  const agentState: "expected" | "working" | "quiet" | "done" | null =
    activity.phase === "working"
      ? agentQuiet
        ? "quiet"
        : "working"
      : activity.phase === "done"
        ? "done"
        : agentExpected && !expectedGaveUp
          ? "expected"
          : null;
  // The headline follows the work: who has just arrived, what is being
  // created while the agent writes, what is ready once it has published.
  const headline = "Study cards";
  // Once published with other decks listed, the new deck is already the
  // list's last row: a status line naming it again would list it twice.
  const creatorPanelVisible = !!creatorView && (decksCollapsed || savedDecks.length === 0 || agentState === "working");
  const readyInList = agentState === "done" && savedDecks.length > 0;

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-start overflow-x-clip bg-surface-1 px-6 sm:justify-center">
      <PhyllotaxisBackdrop />

      <motion.main
        layout={reduceMotion ? false : "position"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...spring.slow, bounce: 0, layout: navigationMotion }}
        // 480px: wide enough for "Creating your flashcards…" on one line.
        // A flex column so the status line can step above the deck list
        // while the agent is expected (`order-last` on the list below).
        className="relative z-10 flex w-full max-w-[480px] flex-col py-24"
      >
        {!build && !agentState && (
          <LandingCardFan
            levels={DECK.levels}
          />
        )}

        {/* The great unlock: the moment an agent starts writing, fireworks
            fill the page. Keyed on the start of this stretch of work, so
            they play once per deck, not once per call. Publishing opens the
            quiz, whose intro brings its own volley — no second one here. */}
        {activity.phase === "working" && agentState === "working" && (
          <Confetti key={activity.since} />
        )}
        {/* The agent's hand: a big cursor drifting over the page from the
            moment it lands until it has published. */}
        <AnimatePresence>
          {(agentState === "expected" || agentState === "working") && (
            <WanderingCursor key="cursor" />
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            tabIndex={-1}
            key={headline}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: spring.moderate.exit.duration } }}
            transition={{ duration: spring.slow.duration, ease: "easeOut" }}
            className={cn(
              "relative z-10 text-balance font-heading text-[52px] leading-none text-foreground",
              "sm:whitespace-nowrap"
            )}
          >
            {headline}
          </motion.h1>
        </AnimatePresence>

        {/* The decks on this page, once there is a choice to make. They step
            aside while an agent is writing. */}
        <AnimatePresence initial={false}>
          {savedDecks.length > 0 && agentState !== "working" && (
            <motion.div
              key="decks"
              // While the agent is expected the status line reads first and
              // the decks follow it.
              className={cn(
                decksCollapsed ? "hidden" : agentState === "expected" ? "order-last mt-4" : "mt-8"
              )}
              inert={!!creatorView}
              aria-hidden={!!creatorView || undefined}
              onAnimationComplete={() => {
                if (creatorTarget.current && navigationRevisionRef.current === navigationRevision) setDecksCollapsed(true);
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: creatorView ? 0 : 1, transition: {
                duration: instantNavigation ? 0 : reduceMotion ? spring.fast.duration : spring.moderate.exit.duration,
              } }}
              exit={{ opacity: 0, transition: { duration: spring.moderate.exit.duration } }}
            >
              <DeckList decks={savedDecks} builtInSlug={DECK.slug} onPlay={(slug) => playDeck(slug)}
                onDeleted={deleteDeck} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status under the headline: what the generator is doing, or what this
            deployment can do. */}
        <AnimatePresence mode="wait" initial={false}>
          {!readyInList && (build || agentState) && (
          <motion.div
            key={
              build
                ? `${build.status.phase}-${build.status.phase === "writing" ? build.status.index : ""}`
                : agentState
                  ? `agent-${agentState}-${activity.phase === "working" ? activity.tool : ""}`
                  : "idle"
            }
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: spring.fast.exit.duration } }}
            transition={{ duration: spring.moderate.duration, ease: "easeOut" }}
            className={cn(
              "flex min-h-9 items-center gap-3 text-[14px] leading-snug text-muted-foreground",
              agentState === "expected"
                ? "mt-8"
                : savedDecks.length > 0 && agentState !== "working"
                ? "mt-4"
                : build || agentState
                  ? "mt-8"
                  : "mt-2"
            )}
          >
            {build ? (
              <>
                {building && <Spinner />}
                <span className={cn(build.status.phase === "error" && "text-destructive")}>
                  {statusLine(build)}
                </span>
                {build.deck && !quizOpen && (
                  <Button
                    variant="primary"
                    size="lg"
                    className="ml-auto shrink-0 rounded-full"
                    onClick={() => openDeck(build.deck!)}
                  >
                    Estudiar
                  </Button>
                )}
              </>
            ) : agentState === "expected" ? (
              // The agent has landed and is asking, in its own chat, what
              // the human wants to learn: send them back there.
              <span>Tu agente espera una respuesta. Contéstale en el chat.</span>
            ) : agentState === "working" ? (
              // The headline's shimmer and the wandering cursor carry the
              // state; the line stays empty (its height is reserved).
              null
            ) : agentState === "quiet" ? (
              <span>Tu agente dejó de responder. Puedes elegir un mazo.</span>
            ) : agentState === "done" && activity.phase === "done" ? (
              <>
                <span>“{activity.deck.title}” está listo.</span>
                {!quizOpen && (
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    <ShareLinkButton deck={activity.deck} />
                    <Button
                      variant="primary"
                      size="lg"
                      className="rounded-full"
                      onClick={() => openDeck(activity.deck)}
                    >
                      Estudiar
                    </Button>
                  </span>
                )}
              </>
            ) : null}
          </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          onAnimationComplete={() => { if (creatorTarget.current === "exam" && navigationRevisionRef.current === navigationRevision) setDecksCollapsed(true); }}
          hidden={examOpen && decksCollapsed}
          inert={examOpen} aria-hidden={examOpen || undefined}
          animate={{ opacity: examOpen ? 0 : 1 }}
          transition={{ duration: instantNavigation ? 0 : reduceMotion ? spring.fast.duration : spring.moderate.exit.duration }}
          className="w-full">
          <MaterialCreator open={materialOpen} onOpenChange={toggleMaterial}
            panelVisible={materialOpen && creatorPanelVisible}
            instantMotion={instantNavigation}
            disabled={!!building || agentState === "working"}
            takenSlugs={decks.map(d => d.slug)} onPlay={deck => openDeck(deck, { fresh: true })}
            onBusyChange={busy => { materialBusy.current = busy; }} />
        </motion.div>
        <motion.div
          onAnimationComplete={() => { if (creatorTarget.current === "material" && navigationRevisionRef.current === navigationRevision) setDecksCollapsed(true); }}
          hidden={materialOpen && decksCollapsed}
          inert={materialOpen} aria-hidden={materialOpen || undefined}
          animate={{ opacity: materialOpen ? 0 : 1 }}
          transition={{ duration: instantNavigation ? 0 : reduceMotion ? spring.fast.duration : spring.moderate.exit.duration }}
          className="w-full">
          <ExamCreator open={examOpen} onOpenChange={toggleExam}
            panelVisible={examOpen && creatorPanelVisible} instantMotion={instantNavigation}
            decks={savedDecks} disabled={!!building || agentState === "working"}
            onPlay={deck => openDeck(deck, { fresh: true })}
            onSaved={() => setStorageNotice("Examen guardado en este navegador.")} />
        </motion.div>
        {storageNotice && <p role="status" className="mt-3 text-sm text-muted-foreground">{storageNotice}</p>}
      </motion.main>

      <div className="fixed z-20" style={{ right: "max(1.5rem, env(safe-area-inset-right))", bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
        <ThemeToggle />
      </div>

      <QuizModal
        key={activeDeck.slug}
        open={quizOpen}
        onOpenChange={setQuizOpen}
        deck={activeDeck}
        celebrate={fresh}
        // Not while this deck is still being written: a link is forever,
        // and it would point at the levels that had landed so far.
        shareable={
          activeDeck.slug !== DECK.slug && !(building && build?.deck?.slug === activeDeck.slug)
        }
      />
    </div>
  );
}
