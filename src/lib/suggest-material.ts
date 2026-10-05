import { z } from "zod";
import { MAX_SOURCE_BYTES, sourceBytes, type SourceFragment } from "@/lib/material";

export const SuggestionsSchema = z.object({ scores: z.array(z.object({ id: z.string(), relevance: z.number().min(0).max(1) })) });

/** Clef accepts at most 64 questions. Bound the full source context before sending it. */
export function classificationBatches(sources: SourceFragment[]): SourceFragment[][] {
  const batches: SourceFragment[][] = [];
  for (const source of sources) {
    if (sourceBytes([source]) > MAX_SOURCE_BYTES) continue;
    const last = batches.at(-1);
    if (last && last.length < 64 && sourceBytes([...last, source]) <= MAX_SOURCE_BYTES) last.push(source);
    else batches.push([source]);
  }
  return batches;
}

export async function suggestMaterial(topic: string, sources: SourceFragment[], signal: AbortSignal,
  onProgress: (done: number, total: number) => void): Promise<Set<string>> {
  const batches = classificationBatches(sources);
  const selected = new Set<string>();
  if (!batches.length) throw new Error("No hay secciones que podamos analizar. Usa la selección manual.");
  for (let index = 0; index < batches.length; index++) {
    signal.throwIfAborted();
    onProgress(index, batches.length);
    const response = await fetch("/api/material/suggest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, sources: batches[index] }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.code === "quota" ? "La cuota gratuita de hoy se terminó. Puedes usar tu selección manual."
      : "No pudimos sugerir contenido. Puedes usar tu selección manual.");
    const { scores } = SuggestionsSchema.parse(body);
    const expected = new Set(batches[index].map(source => source.id));
    if (scores.length !== expected.size || new Set(scores.map(score => score.id)).size !== expected.size || scores.some(score => !expected.has(score.id)))
      throw new Error("No pudimos validar las sugerencias. Usa tu selección manual.");
    for (const score of scores) if (score.relevance >= 0.5) selected.add(score.id);
  }
  signal.throwIfAborted();
  onProgress(batches.length, batches.length);
  return selected;
}
