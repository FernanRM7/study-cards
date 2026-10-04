"use client";
import { createElement, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { useIcon } from "@/lib/icon-context";
import { Tooltip } from "@/components/ui/tooltip";
import { ShareLinkButton } from "@/components/share-link-button";
import { bestScoresFor } from "@/lib/deck-store";
import { examAnswer, examPrompt, isExamOrderCorrect, shuffleExam } from "@/lib/exam";
import type { Deck, QuizQuestion } from "@/lib/deck";

type RunCard = { q: QuizQuestion; options: string[]; order: number[] };
type Answer = { text: string; correct: boolean };
export function ExamModal({ open, onOpenChange, deck }: { open: boolean; onOpenChange: (value: boolean) => void; deck: Deck }) {
  const CloseIcon = useIcon("x");
  const [view, setView] = useState<"intro" | "run" | "result">("intro");
  const [run, setRun] = useState<RunCard[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [confirmExit, setConfirmExit] = useState(false);
  const [notice, setNotice] = useState("");
  const [coverFailed, setCoverFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  const total = deck.levels[0].questions.length;
  const score = answers.filter(a => a.correct).length;
  const current = run[index];
  const start = () => {
    const cards = shuffleExam(deck.levels[0].questions).map(q => {
      const order = q.kind === "order" ? shuffleExam(q.items.map((_, i) => i)) : [];
      if (q.kind === "order" && isExamOrderCorrect(q, order)) order.push(order.shift()!);
      return { q, order, options: q.kind === "choice" ? shuffleExam(q.options) : ["Verdadero", "Falso"] };
    });
    setRun(cards); setIndex(0); setAnswers([]); setPicked(null); setOrder(cards[0].order);
    setNotice(""); setView("run"); submitting.current = false;
    requestAnimationFrame(() => heading.current?.focus());
  };
  const close = (next: boolean) => {
    if (!next && view === "run") { setConfirmExit(true); return; }
    if (!next) setView("intro");
    onOpenChange(next);
  };
  const submit = () => {
    if (!current || submitting.current || (current.q.kind !== "order" && picked === null)) return;
    submitting.current = true;
    const q = current.q;
    const text = q.kind === "order" ? order.map(i => q.items[i].label).join(" → ") : picked!;
    const answer = { text, correct: q.kind === "order" ? isExamOrderCorrect(q, order) : text === examAnswer(q) };
    const next = [...answers, answer];
    setAnswers(next);
    if (index + 1 === run.length) {
      const points = next.filter(a => a.correct).length;
      try {
        const best = bestScoresFor(deck.slug);
        localStorage.setItem(`${deck.slug}-quiz-v1`, JSON.stringify({ best: { ...best, [deck.levels[0].id]: Math.max(best[deck.levels[0].id] ?? 0, points) } }));
      } catch { setNotice("No se pudo guardar tu puntuación en este navegador."); }
      setView("result");
    } else {
      setIndex(index + 1); setPicked(null); setOrder(run[index + 1].order);
    }
    requestAnimationFrame(() => { submitting.current = false; heading.current?.focus(); });
  };
  const move = (position: number, delta: number) => setOrder(values => {
    const next = [...values]; const other = position + delta;
    [next[position], next[other]] = [next[other], next[position]]; return next;
  });
  return <Dialog.Root open={open} onOpenChange={close}>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
      <Dialog.Content lang="es" aria-describedby="exam-description" className="fixed left-1/2 top-1/2 z-[60] flex max-h-[92dvh] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-border bg-background p-5 outline-none sm:p-8">
        <div className={view === "intro" && !confirmExit ? "flex items-start justify-between gap-4" : "flex justify-end"}>
          <Dialog.Title className={view === "intro" && !confirmExit ? "font-heading text-2xl" : "sr-only"}>{deck.title}</Dialog.Title>
          <Button variant="ghost" size="icon-sm" aria-label="Cerrar" onClick={() => close(false)}>{createElement(CloseIcon, { size: 20 })}</Button>
        </div>
        <Dialog.Description id="exam-description" className={view === "intro" && !confirmExit ? "mt-2 text-sm text-muted-foreground" : "sr-only"}>
          {total} tarjetas · sin cronómetro · respuestas al finalizar
        </Dialog.Description>
        <div className="mt-5 min-h-0 overflow-y-auto overscroll-contain pr-1">
          {confirmExit ? <div>
            <h2 ref={heading} tabIndex={-1} className="text-lg font-medium">¿Salir del examen?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Este intento no se guardará. Podrás empezar de nuevo.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={() => setConfirmExit(false)}>Seguir respondiendo</Button>
              <Button variant="ghost" onClick={() => { setConfirmExit(false); setView("intro"); onOpenChange(false); }}>Salir</Button>
            </div>
          </div> : view === "intro" ? <div>
            <h2 ref={heading} tabIndex={-1} className="text-lg font-medium">Pon a prueba tus temas</h2>
            <p className="mt-2 text-sm text-muted-foreground">Necesitas al menos {Math.ceil(total * .7)} aciertos. Al terminar podrás revisar todas tus respuestas.</p>
            {bestScoresFor(deck.slug)[deck.levels[0].id] !== undefined && <p className="mt-2 text-sm">Mejor resultado: {bestScoresFor(deck.slug)[deck.levels[0].id]} de {total}</p>}
            {deck.cover && !coverFailed && <figure className="mt-4">
              <Image unoptimized src={deck.cover.image} alt={deck.cover.alt} width={800} height={450} onError={() => setCoverFailed(true)} className="max-h-48 w-full rounded-2xl object-cover" />
              <figcaption className="mt-1 text-xs text-muted-foreground">{deck.cover.credit?.source ? <a href={deck.cover.credit.source} target="_blank" rel="noreferrer">{deck.cover.credit.title}</a> : deck.cover.credit?.title} {deck.cover.credit?.author} {deck.cover.credit?.license}</figcaption>
            </figure>}
            <Button className="mt-5" onClick={start}>Comenzar examen</Button>
          </div> : view === "run" && current ? <div>
            <p className="text-sm text-muted-foreground" role="status">Pregunta {index + 1} de {total}</p>
            <h2 ref={heading} tabIndex={-1} className="mt-3 font-heading text-2xl outline-none">{examPrompt(current.q)}</h2>
            {current.q.kind === "choice" && current.q.image && <Image unoptimized src={current.q.image} alt={current.q.imageAlt ?? "Imagen de la pregunta"} width={600} height={300} className="mt-3 max-h-40 w-full rounded-xl object-contain" />}
            {current.q.kind === "order" ? <ol className="mt-4 space-y-2">
              {order.map((item, position) => <li key={item} className="flex items-center gap-2 rounded-xl border border-border p-2">
                <span className="min-w-0 flex-1 break-words">{current.q.kind === "order" ? current.q.items[item].label : ""}</span>
                <Button variant="ghost" disabled={position === 0} aria-label={`Subir elemento ${position + 1}`} onClick={() => move(position, -1)}>↑</Button>
                <Button variant="ghost" disabled={position === order.length - 1} aria-label={`Bajar elemento ${position + 1}`} onClick={() => move(position, 1)}>↓</Button>
              </li>)}
            </ol> : <RadioGroup key={current.q.id} className="mt-4 w-full" aria-label="Tu respuesta"
              selectedIndex={current.options.findIndex(option => option === picked)}>
              {current.options.map((option, optionIndex) => <RadioItem key={option} index={optionIndex}
                label={option} value={option} selected={picked === option} onSelect={() => setPicked(option)}
                className="h-auto min-h-12 py-3 [&>span]:min-w-0 [&>span]:break-words [&>span]:whitespace-normal" />)}
            </RadioGroup>}
            <Button className="mt-5" disabled={current.q.kind !== "order" && picked === null} onClick={submit}>
              {index + 1 === total ? "Terminar examen" : "Siguiente"}
            </Button>
          </div> : view === "result" ? <div>
            <h2 ref={heading} tabIndex={-1} className="font-heading text-3xl outline-none">{score} de {total} · {Math.round(score / total * 100)} %</h2>
            <p className="mt-2">{score >= Math.ceil(total * .7) ? "¡Examen aprobado!" : "Sigue practicando estos temas."}</p>
            {notice && <p role="alert" className="mt-2 text-sm text-destructive">{notice}</p>}
            <div className="mt-4 flex items-center gap-3"><Button onClick={start}>Reintentar</Button><ShareLinkButton deck={deck} /></div>
            <h3 className="mt-6 text-lg font-medium">Revisa tus respuestas</h3>
            <ol className="mt-4 space-y-5">{run.map(({ q }, i) => <li key={q.id} className="border-b border-border pb-4 text-sm">
              <p className="font-medium">{i + 1}. {examPrompt(q)}</p>
              <p className="mt-2">{answers[i].correct ? "Correcta" : "Incorrecta"} · Tu respuesta: {answers[i].text}</p>
              <p className="mt-1">Respuesta correcta: {examAnswer(q)}</p>
              <p className="mt-2 text-muted-foreground">{q.fact}</p>
              {q.sourceDeck && <p className="mt-2 text-xs text-muted-foreground">Mazo: {q.sourceDeck.title}</p>}
              {q.provenance && <Tooltip contentClassName="z-[100]" className="max-w-72 whitespace-normal"
                content={<span>{q.provenance.kind === "ai" ? "Complemento de IA" : `Basada en tu material · ${q.provenance.references.map(r => r.file + ", " + r.location).join(" · ")}`}. La procedencia no garantiza exactitud.</span>}>
                <Button variant="ghost" size="sm" aria-label="Ver procedencia">ⓘ Ver procedencia</Button>
              </Tooltip>}
              {q.kind !== "order" && (q.revealImage || (q.kind === "choice" && q.image)) && <Image unoptimized src={(q.revealImage ?? (q.kind === "choice" ? q.image : undefined))!} alt={q.imageAlt ?? "Imagen de la respuesta"} width={600} height={300} className="mt-3 max-h-40 w-full rounded-xl object-contain" />}
              {q.kind !== "order" && q.imageCredit && <p className="mt-1 text-xs text-muted-foreground">{q.imageCredit.source ? <a href={q.imageCredit.source} target="_blank" rel="noreferrer">{q.imageCredit.title}</a> : q.imageCredit.title} {q.imageCredit.author} {q.imageCredit.license}</p>}
            </li>)}</ol>
          </div> : null}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
