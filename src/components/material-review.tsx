"use client";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { materialBatches, materialChapters } from "@/lib/material-review";
import { MAX_SOURCE_BYTES, sourceBytes, type SourceFragment } from "@/lib/material";

export function MaterialReview({ sources, selected, onChange, activeBlock, onBlockChange, blocks }: {
  sources: SourceFragment[]; selected: Set<string>; onChange: (next: Set<string>) => void;
  blocks?: SourceFragment[][];
  activeBlock: number; onBlockChange: (index: number) => void;
}) {
  const chapters = useMemo(() => materialChapters(sources), [sources]);
  const batches = useMemo(() => blocks ?? materialBatches(chapters), [chapters, blocks]);
  const large = !!blocks || sourceBytes(sources) > MAX_SOURCE_BYTES || sources.length > 500;
  const visibleIds = new Set((batches[activeBlock] ?? []).map(source => source.id));
  const visibleChapters = large ? chapters.map(chapter => ({ ...chapter, sources: chapter.sources.filter(source => visibleIds.has(source.id)) })).filter(chapter => chapter.sources.length) : chapters;
  const oversized = sources.filter(s => sourceBytes([s]) > MAX_SOURCE_BYTES);
  const toggle = (ids: string[]) => {
    const next = new Set(selected);
    if (ids.every(id => next.has(id))) ids.forEach(id => next.delete(id));
    else ids.forEach(id => next.add(id));
    onChange(next);
  };
  return <div className="space-y-4">
    {large && <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Tu material necesita varios mazos. Elige un bloque y revisa sus secciones. Cada bloque conserva el texto original.</p>
      <div className="flex flex-wrap gap-3">{batches.map((batch, index) => <Button key={batch[0].id}
        variant={index === activeBlock ? "secondary" : "tertiary"}
        aria-pressed={index === activeBlock}
        onClick={() => onBlockChange(index)}>Bloque {index + 1} · {batch.length} secciones</Button>)}</div>
    </div>}
    {oversized.length > 0 && <p role="alert" className="text-sm text-destructive">{oversized.length} secciones son demasiado largas por sí solas. Divide esas secciones en tu archivo antes de incluirlas.</p>}
    <ScrollArea role="region" className="h-72 rounded-xl border border-border" viewportClassName="p-3" aria-label="Contenido extraído" tabIndex={0}>
      <div className="space-y-5">{visibleChapters.map(chapter => {
        const included = chapter.sources.filter(s => selected.has(s.id)).length;
        return <details key={chapter.id} className="rounded-xl bg-muted/40 p-3">
          <summary className="cursor-pointer break-words text-sm font-medium">{chapter.title}
            <span className="mt-1 block text-xs font-normal text-muted-foreground">{chapter.file} · {included} de {chapter.sources.length} secciones</span>
          </summary>
          <div className="mt-4 space-y-5">
            <Button variant="tertiary" size="sm" onClick={() => toggle(chapter.sources.map(s => s.id))}>{included === chapter.sources.length ? "Quitar capítulo" : "Incluir capítulo"}</Button>
            {chapter.sources.map(source => <article key={source.id} className="space-y-2">
              <Switch label={source.location} checked={selected.has(source.id)} onToggle={() => toggle([source.id])} />
              <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Leer esta sección</summary>
                <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{source.text}</p>
              </details>
            </article>)}
          </div>
        </details>;
      })}</div>
    </ScrollArea>
  </div>;
}
