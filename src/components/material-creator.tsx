"use client";

import { createElement, useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import { AskUserQuestions, type AskUserAnswer, type AskUserQuestion } from "@/components/ui/ask-user-questions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MaterialReview } from "@/components/material-review";
import { buildDeck, type DeckBuild } from "@/lib/create-deck";
import { MaterialSchema, sourceBytes, type ExtractedMaterial } from "@/lib/material";
import { readMaterial, RemoteMaterialError } from "@/lib/read-material";
import type { Deck } from "@/lib/deck";
import { useIcon } from "@/lib/icon-context";
import { spring } from "@/lib/springs";

type Stage = "upload" | "review" | "questions" | "confirm" | "generating" | "ready";
type CardCount = 10 | 20 | 30;

const questions: AskUserQuestion[] = [
  {
    id: "topic",
    title: "¿Qué quieres aprender?",
    freeText: true,
    freeTextMultiline: false,
    freeTextPlaceholder: "Por ejemplo: el sistema solar",
    freeTextValidate: value => value.trim().length < 2 ? "Escribe al menos dos caracteres." : undefined,
    skippable: false,
    nextLabel: "Continuar",
  },
  {
    id: "count",
    title: "¿Cuántas tarjetas quieres?",
    options: [10, 20, 30].map(n => ({ id: String(n), title: `${n} tarjetas` })),
    skippable: false,
    nextLabel: "Continuar",
  },
];

function friendlyError(message: string): string {
  if (/se agotó la cuota|daily free allocation|daily.*quota|neurons.*limit/i.test(message))
    return "La cuota gratuita de hoy se terminó. Inténtalo mañana; las tarjetas creadas siguen guardadas.";
  if (/credenciales|configura|account id|api token|permisos de workers|anthropic/i.test(message))
    return "La creación de tarjetas no está disponible ahora. Inténtalo más tarde.";
  if (/cancelad/i.test(message)) return "Se canceló la creación. Puedes volver a intentarlo.";
  if (/selecciona menos|24,000 bytes|límite de 24/i.test(message)) return "Selecciona menos contenido para continuar.";
  if (/20 mib|20 mb por archivo|supera el límite de 100 mib/i.test(message)) return "El archivo es demasiado grande. Elige uno más pequeño.";
  if (/formato no admitido/i.test(message)) return "Ese tipo de archivo no se puede añadir. Elige un archivo MD, PDF o PPTX.";
  if (/sin texto útil|no contiene texto útil/i.test(message)) return "No encontramos texto para usar en ese archivo.";
  if (/imágenes enlazadas no se interpretan/i.test(message)) return message.replace(/las imágenes enlazadas no se interpretan\./i, "Hay imágenes enlazadas que no podemos leer.");
  if (/imágenes, diagramas y gráficos no se interpretan/i.test(message)) return message.replace(/las imágenes, diagramas y gráficos no se interpretan\./i, "No podemos leer las imágenes, los diagramas ni los gráficos de este archivo.");
  if (/sin texto extraíble|podría ser un escaneo|escaneos/i.test(message))
    return message.replace(/sin texto extraíble/gi, "sin texto que podamos leer").replace(/podría ser un escaneo/gi, "podría ser un documento escaneado").replace(/los escaneos, imágenes y diagramas no se interpretan\./i, "No podemos leer escaneos, imágenes ni diagramas.");
  if (/comprimida|xml|presentación incompleta|pptx/i.test(message)) return "No se pudo leer la presentación. Comprueba que el archivo esté completo.";
  return "No se pudieron crear las tarjetas. Inténtalo de nuevo.";
}

export function MaterialCreator({ open, panelVisible, instantMotion, onOpenChange, disabled, takenSlugs, onPlay, onBusyChange }: {
  open: boolean;
  panelVisible: boolean;
  instantMotion: boolean;
  onOpenChange: (open: boolean, keyboard?: boolean) => void;
  disabled: boolean;
  takenSlugs: string[];
  onPlay: (deck: Deck) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [localRetry, setLocalRetry] = useState(false);
  const remoteCapability = useRef<Promise<boolean> | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const extractionController = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    remoteCapability.current = fetch("/api/material/convert", { signal: abort.signal }).then(r => r.ok ? r.json() : null)
      .then(data => data?.available === true).catch(() => false);
    void remoteCapability.current.then(available => { if (!abort.signal.aborted) setRemoteAvailable(available); });
    return () => abort.abort();
  }, []);
  const reduceMotion = useReducedMotion() ?? false;
  const ArrowLeft = useIcon("arrow-left");
  const trigger = useRef<HTMLButtonElement>(null);
  const [readyDialogOpen, setReadyDialogOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("upload");
  const [material, setMaterial] = useState<ExtractedMaterial | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, AskUserAnswer>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState<CardCount>(10);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [build, setBuild] = useState<DeckBuild | null>(null);
  const controller = useRef<AbortController | null>(null);
  const studyButton = useRef<HTMLButtonElement>(null);
  const sources = useMemo(() => material?.sources.filter(source => selected.has(source.id)) ?? [], [material, selected]);
  const valid = MaterialSchema.safeParse(sources).success;
  const step = stage === "upload" ? 1 : stage === "review" ? 2 : stage === "questions" ? 2 + questionIndex + 1 : 5;
  const buildStatus = build?.status;
  const statusText = buildStatus?.phase === "planning" ? "Preparando tus tarjetas…"
    : buildStatus?.phase === "writing" ? `Creando grupo ${buildStatus.index} de ${buildStatus.total}…`
    : buildStatus?.phase === "ready" ? "Tus tarjetas están listas."
    : buildStatus?.phase === "error" ? friendlyError(buildStatus.message) : "";

  const load = async (files: File[], forceLocal = false) => {
    if (extractionController.current) return;
    const abort = new AbortController();
    extractionController.current = abort;
    setPendingFiles(files);
    setLocalRetry(false);
    let attemptedRemote = false;
    setExtracting(true);
    onBusyChange(true);
    setError("");

    try {
      const available = forceLocal ? false : await (remoteCapability.current ?? Promise.resolve(false));
      abort.signal.throwIfAborted();
      const result = await readMaterial(files, {
        remoteAvailable: available, forceLocal, signal: abort.signal,
        onRemoteStart: () => { attemptedRemote = true; },
      });
      abort.signal.throwIfAborted();
      setMaterial(result);
      setSelected(new Set(MaterialSchema.safeParse(result.sources).success ? result.sources.map(source => source.id) : []));
      const initialTopic = topic || files[0]?.name.replace(/\.[^.]+$/, "").slice(0, 120) || "";
      setTopic(initialTopic);
      setAnswers(current => ({ ...current, topic: { questionId: "topic", selectedIds: [], otherText: initialTopic } }));
      setStage("review");
    } catch (cause) {
      setLocalRetry(attemptedRemote && !forceLocal);
      setError(abort.signal.aborted ? "Se canceló la lectura. Puedes volver a intentarlo."
        : cause instanceof RemoteMaterialError ? cause.message
        : friendlyError(cause instanceof Error ? cause.message : ""));
    } finally {
      extractionController.current = null;
      setExtracting(false);
      onBusyChange(false);
    }
  };

  const generate = async () => {
    if (controller.current || disabled || !valid || topic.trim().length < 2) return;
    const abort = new AbortController();
    controller.current = abort;
    setStage("generating");
    setReadyDialogOpen(false);
    setError("");
    setBuild(null);
    onBusyChange(true);
    try {
      const deck = await buildDeck(topic.trim(), {
        sources,
        cardCount: count,
        takenSlugs,
        signal: abort.signal,
        onUpdate: next => setBuild(next),
      });
      setBuild(current => current ? { ...current, deck } : current);
      setStage("ready");
      setReadyDialogOpen(true);
    } catch (cause) {
      setStage("confirm");
      setError(friendlyError(cause instanceof Error ? cause.message : ""));
    } finally {
      controller.current = null;
      onBusyChange(false);
    }
  };

  const onAnswersChange = (next: Record<string, AskUserAnswer>) => {
    setAnswers(next);
    const nextTopic = next.topic?.otherText;
    if (nextTopic !== undefined) setTopic(nextTopic);
    const selectedCount = Number(next.count?.selectedIds[0]);
    if (selectedCount === 10 || selectedCount === 20 || selectedCount === 30) setCount(selectedCount);
  };

  const stepLabel = stage === "ready" ? "Listo" : `Paso ${step} de 5`;
  const transition = reduceMotion ? { duration: 0 } : spring.moderate;
  // Preserve unfinished work across navigation, but a finished deck is not a draft.
  const resetCreation = () => {
    setStage("upload"); setMaterial(null); setSelected(new Set()); setAnswers({});
    setQuestionIndex(0); setTopic(""); setCount(10); setBuild(null); setError("");
    setPendingFiles([]); setLocalRetry(false); setReadyDialogOpen(false);
  };
  const study = () => {
    if (!build?.deck) return;
    setReadyDialogOpen(false);
    onOpenChange(false, true);
    onPlay(build.deck);
    resetCreation();
  };

  const panelTransition = instantMotion ? { duration: 0 }
    : reduceMotion ? { duration: spring.fast.duration } : { ...spring.slow, bounce: 0 };
  return <motion.section layout={reduceMotion ? false : "position"}
    transition={{ layout: panelTransition }} lang="es" className="mt-8 w-full" aria-label="Crear tarjetas desde tu material">
    <Button ref={trigger} variant="secondary" size={open ? "icon-lg" : "lg"} aria-label={open ? "Volver a mis mazos" : undefined} aria-expanded={open} aria-controls={`${id}-panel`}
      disabled={disabled || extracting || stage === "generating"}
      onClick={event => {
        if (!open && stage === "ready") resetCreation();
        onOpenChange(!open, event.detail === 0);
        trigger.current?.focus({ preventScroll: true });
      }}>
      {open ? <span aria-hidden>{createElement(ArrowLeft, { size: 20 })}</span> : "Añadir material"}
    </Button>
    {panelVisible && <motion.div key="material-panel"
      initial={{ opacity: 0, transform: reduceMotion || instantMotion ? "none" : "translateY(-8px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={panelTransition} inert={!open} aria-hidden={!open || undefined} id={`${id}-panel`} className="mt-4 w-full rounded-2xl border border-border bg-background p-4 sm:p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground" aria-live="polite">{stepLabel}</p>
        {stage !== "ready" && <div className="flex gap-1.5" aria-hidden>
          {Array.from({ length: 5 }, (_, index) => <span key={index} className={`h-1.5 w-6 rounded-full ${index < step ? "bg-foreground" : "bg-border"}`} />)}
        </div>}
      </div>
      <motion.div key={stage} initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} transition={transition}>
        {stage === "upload" && <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Añade tu material</h2>
            <p className="mt-1 text-sm text-muted-foreground">Elige apuntes en MD, PDF o PPTX. Puedes añadir hasta cinco archivos.</p>
          </div>
          {remoteAvailable && <p className="text-xs text-muted-foreground">Los PDF y PPTX de hasta 4 MB se envían a Firecrawl para leerlos. Los archivos más grandes y los MD se leen en tu navegador.</p>}
          <label htmlFor={`${id}-files`} className="sr-only">Seleccionar archivos</label>
          <input id={`${id}-files`} type="file" accept=".md,.pdf,.pptx" multiple disabled={extracting || disabled}
            className="block w-full min-w-0 rounded-xl border border-border p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void load(files); }} />
          <p className="text-xs text-muted-foreground">Cada archivo puede pesar hasta 20 MB. Los archivos originales no se guardan.</p>
          {extracting && <div className="flex items-center justify-between gap-3"><p role="status" className="text-sm">Leyendo tus archivos…</p><Button variant="ghost" onClick={() => extractionController.current?.abort()}>Cancelar lectura</Button></div>}
          {error && localRetry && pendingFiles.length > 0 && !extracting && <Button variant="secondary" onClick={() => { void load(pendingFiles, true); }}>Usar lectura local</Button>}
          {material && <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">{new Set(material.sources.map(source => source.file)).size} archivos listos</p>
            <Button size="lg" disabled={!valid} onClick={() => setStage("review")}>Continuar</Button>
          </div>}
        </div>}

        {stage === "review" && material && <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Revisa el contenido</h2>
            <p className="mt-1 text-sm text-muted-foreground">Elige las partes que quieras usar. Puedes leerlas antes de continuar.</p>
          </div>
          {material.warnings.length > 0 && <details className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground">
            <summary className="cursor-pointer">Avisos sobre tus archivos ({material.warnings.length})</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">{material.warnings.map((warning, index) => <li key={index}>{friendlyError(warning)}</li>)}</ul>
          </details>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="tertiary" disabled={extracting} onClick={() => setSelected(new Set(material.sources.map(source => source.id)))}>Incluir todo</Button>
            <Button type="button" variant="tertiary" disabled={extracting} onClick={() => setSelected(new Set())}>Quitar todo</Button>
          </div>
          <MaterialReview sources={material.sources} selected={selected} onChange={setSelected} />
          <p className="text-xs text-muted-foreground" aria-live="polite">{sources.length} secciones seleccionadas</p>
          {!valid && <p role="alert" className="text-sm text-destructive">{sources.length === 0 ? "Elige al menos una parte para continuar." : sourceBytes(sources) > 24_000 ? "Selecciona menos contenido para continuar." : "Selecciona menos partes para continuar."}</p>}
          <div className="flex flex-wrap justify-between gap-3 pt-1">
            <Button variant="ghost" onClick={() => setStage("upload")}>Atrás</Button>
            <Button size="lg" disabled={!valid} onClick={() => setStage("questions")}>Continuar</Button>
          </div>
        </div>}

        {stage === "questions" && <AskUserQuestions
          questions={questions}
          currentIndex={questionIndex}
          onCurrentIndexChange={setQuestionIndex}
          answers={answers}
          onAnswersChange={onAnswersChange}
          onComplete={completed => {
            const nextTopic = completed.topic?.otherText?.trim() ?? "";
            const nextCount = Number(completed.count?.selectedIds[0]);
            if (nextTopic.length < 2 || (nextCount !== 10 && nextCount !== 20 && nextCount !== 30)) return;
            setTopic(nextTopic);
            setCount(nextCount);
            setStage("confirm");
          }}
          onBackAtStart={() => setStage("review")}
          backLabel="Atrás"
          progressLabel={current => `Paso ${current + 2} de 5`}
          className="mx-auto"
        />}

        {stage === "confirm" && <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Crea tus tarjetas</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tema: {topic}</p>
            <p className="text-sm text-muted-foreground">Cantidad: {count} tarjetas</p>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-between gap-3 pt-1">
            <Button variant="ghost" onClick={() => { setQuestionIndex(1); setStage("questions"); }}>Atrás</Button>
            <Button size="lg" disabled={disabled || !valid} onClick={() => void generate()}>Crear tarjetas</Button>
          </div>
        </div>}

        {stage === "generating" && <div className="space-y-4">
          <h2 className="text-lg font-medium">Creando tus tarjetas</h2>
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{statusText || "Preparando tus tarjetas…"}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Progress className="min-w-28 flex-1" aria-label="Creando tarjetas" value={null} />
            <Button type="button" variant="tertiary" onClick={() => controller.current?.abort()}>Cancelar</Button>
          </div>
        </div>}

        {stage === "ready" && build?.deck && <div className="flex flex-wrap gap-3"><Button ref={studyButton} size="lg" onClick={() => setReadyDialogOpen(true)}>Abrir mazo</Button><Button variant="secondary" onClick={resetCreation}>Añadir otro material</Button></div>}
      </motion.div>
      {error && stage !== "confirm" && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    </motion.div>}
    <Dialog.Root open={readyDialogOpen && !!build?.deck} onOpenChange={setReadyDialogOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/35 backdrop-blur-[2px]" />
        <Dialog.Content
          onCloseAutoFocus={event => { event.preventDefault(); if (open) requestAnimationFrame(() => studyButton.current?.focus()); }}
          className="fixed left-1/2 top-1/2 z-[71] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border bg-background p-6 shadow-2xl outline-none sm:p-8"
        >
          <Dialog.Title className="font-heading text-2xl">{build?.status.phase === "error" ? "Tu mazo quedó incompleto" : "Tus tarjetas están listas"}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Guardadas en este navegador. {build?.deck?.title} · {build?.deck?.levels.reduce((total, level) => total + level.questions.length, 0)} tarjetas
          </Dialog.Description>
          {build?.status.phase === "error" && <p role="status" className="mt-3 text-sm leading-relaxed text-muted-foreground">{friendlyError(build.status.message)} Los grupos terminados se guardaron.</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Dialog.Close asChild><Button variant="ghost">Cerrar</Button></Dialog.Close>
            <Button size="lg" onClick={study}>Estudiar tarjetas</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </motion.section>;
}
