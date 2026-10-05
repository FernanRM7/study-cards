import { MAX_SOURCE_BYTES, sourceBytes, type SourceFragment } from "./material";

export interface MaterialChapter { id: string; title: string; file: string; sources: SourceFragment[] }

/** Keep the original fragments/references, but disclose Markdown by chapter. */
export function materialChapters(sources: SourceFragment[]): MaterialChapter[] {
  const chapters: MaterialChapter[] = [];
  for (const file of new Set(sources.map(s => s.file))) {
    const fragments = sources.filter(s => s.file === file);
    const headings = fragments.map(s => s.text.match(/^(#{1,6})\s+(.+)/));
    const depths = headings.flatMap(h => h ? [h[1].length] : []);
    const shallowest = depths.length ? Math.min(...depths) : 1;
    const descendants = depths.filter(depth => depth > shallowest);
    const level = shallowest === 1 && depths.filter(depth => depth === shallowest).length === 1 && descendants.length
      ? Math.min(...descendants) : shallowest;
    let chapter: MaterialChapter | undefined;
    fragments.forEach((source, index) => {
      const heading = headings[index];
      if (!chapter || (heading && heading[1].length <= level)) {
        chapter = { id: source.id, title: heading?.[2] ?? source.location, file, sources: [] };
        chapters.push(chapter);
      }
      chapter.sources.push(source);
    });
  }
  return chapters;
}

/** Prefer whole chapters; split a large chapter at its existing section boundaries.
 * Every usable fragment appears exactly once. Oversized single fragments remain
 * visible for manual review; they are never silently cut or sent over the limit. */
export function materialBatches(chapters: MaterialChapter[]): SourceFragment[][] {
  const batches: SourceFragment[][] = [];
  let current: SourceFragment[] = [];
  const append = (items: SourceFragment[]) => {
    if (current.length && (sourceBytes([...current, ...items]) > MAX_SOURCE_BYTES || current.length + items.length > 500)) {
      batches.push(current); current = [];
    }
    current.push(...items);
  };
  for (const chapter of chapters) {
    if (sourceBytes(chapter.sources) <= MAX_SOURCE_BYTES && chapter.sources.length <= 500) append(chapter.sources);
    else for (const source of chapter.sources) {
      if (sourceBytes([source]) <= MAX_SOURCE_BYTES) append([source]);
    }
  }
  if (current.length) batches.push(current);
  return batches;
}
