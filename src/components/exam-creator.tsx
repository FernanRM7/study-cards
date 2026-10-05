"use client";
import { createElement, useRef, useState } from "react";
import { motion, MotionConfig, useReducedMotion } from "framer-motion";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { CheckboxGroup, CheckboxItem } from "@/components/ui/checkbox-group";
import { combineDecks } from "@/lib/combine-decks";
import { saveDeck } from "@/lib/deck-store";
import { spring } from "@/lib/springs";
import { useIcon } from "@/lib/icon-context";
import type { Deck } from "@/lib/deck";

export function ExamCreator({ decks, disabled, onPlay, onSaved, open, panelVisible, instantMotion, onOpenChange }: {
  open: boolean; panelVisible: boolean; instantMotion: boolean; onOpenChange: (open: boolean, keyboard?: boolean) => void;
  decks: Deck[]; disabled: boolean; onPlay: (deck: Deck) => void; onSaved: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const ArrowLeft = useIcon("arrow-left");
  const transition = instantMotion ? { duration: 0 } : reduceMotion ? { duration: spring.fast.duration } : { ...spring.slow, bounce: 0 };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("Examen combinado");
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const chosen = decks.filter(d => selected.has(d.slug));
  const count = chosen.reduce((n, d) => n + d.levels.reduce((sum, l) => sum + l.questions.length, 0), 0);
  const checked = new Set(decks.flatMap((d, i) => selected.has(d.slug) ? [i] : []));
  const create = () => {
    try {
      const deck = combineDecks(chosen, name, decks.map(d => d.slug));
      saveDeck(deck, true);
      onSaved();
      onOpenChange(false, true);
      onPlay(deck);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo crear el examen."); }
  };
  return <motion.section layout={reduceMotion ? false : "position"} transition={{ layout: transition }} lang="es" className={panelVisible ? "mt-8 w-full" : "mt-3 w-full"} aria-label="Combinar mazos">
    <Tooltip side="bottom" className="max-w-64 whitespace-normal" content="Guarda al menos dos mazos para combinarlos." forceOpen={!open && decks.length < 2 ? undefined : false}>
    <Button ref={trigger} variant="secondary" size={open ? "icon-lg" : "lg"} disabled={disabled} aria-disabled={!open && decks.length < 2 || undefined}
      aria-label={open ? "Volver a mis mazos" : undefined}
      aria-expanded={open} aria-controls="exam-picker" onClick={event => { if (!open && decks.length < 2) return; onOpenChange(!open, event.detail === 0); trigger.current?.focus({ preventScroll: true }); }}>
      {open ? <span aria-hidden>{createElement(ArrowLeft, { size: 20 })}</span> : "Crear examen"}</Button>
    </Tooltip>
    {panelVisible && <motion.div initial={{ opacity: 0, transform: reduceMotion || instantMotion ? "none" : "translateY(-8px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} transition={transition} id="exam-picker" className="mt-4 rounded-2xl border border-border bg-background p-4 sm:p-5">
      <h2 className="text-lg font-medium">Elige tus mazos</h2>
      <p className="mt-1 text-sm text-muted-foreground">Todas sus tarjetas formarán una sola prueba. Verás las respuestas al terminar.</p>
      <MotionConfig reducedMotion="user"><CheckboxGroup className="mt-4 w-full" checkedIndices={checked} aria-label="Mazos del examen">
        {decks.map((deck, index) => <CheckboxItem key={deck.slug} index={index}
          label={`${deck.title} · ${deck.levels.reduce((n, l) => n + l.questions.length, 0)} tarjetas`}
          className="min-h-12 h-auto py-2 [&>span]:min-w-0 [&>span]:break-words"
          checked={selected.has(deck.slug)} onToggle={() => setSelected(current => {
            const next = new Set(current); if (next.has(deck.slug)) next.delete(deck.slug); else next.add(deck.slug); return next;
          })} />)}
      </CheckboxGroup></MotionConfig>
      <label className="mt-4 block text-sm font-medium" htmlFor="exam-name">Nombre del examen</label>
      <input id="exam-name" className="mt-2 w-full rounded-xl border border-border bg-transparent p-3 text-sm focus-visible:outline-2"
        value={name} maxLength={200} onChange={e => setName(e.target.value)} />
      <p role="status" className="mt-3 text-sm text-muted-foreground">{chosen.length} mazos · {count} tarjetas</p>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-between gap-3">
        <Button variant="ghost" onClick={() => { onOpenChange(false, true); trigger.current?.focus({ preventScroll: true }); }}>Volver</Button>
        <Button disabled={chosen.length < 2 || !name.trim()} onClick={create}>Crear y estudiar</Button>
      </div>
    </motion.div>}
  </motion.section>;
}
