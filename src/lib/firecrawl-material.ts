import { z } from "zod";
import { extractMarkdown } from "./extract-material";
import type { ExtractedMaterial } from "./material";

export { MAX_REMOTE_FILE_BYTES } from "./material";
const ParsedDocument = z.object({
  markdown: z.string().optional(),
  pages: z.array(z.object({ pageNumber: z.number().int().positive(), markdown: z.string() })).optional(),
  metadata: z.object({ numPages: z.number().optional(), totalPages: z.number().optional() }).passthrough().optional(),
  warning: z.string().optional(),
});
export function normalizeRemoteMaterial(raw: unknown, file: string, prefix: string): ExtractedMaterial {
  const doc = ParsedDocument.parse(raw);
  const warnings: string[] = [];
  let result: ExtractedMaterial;
  if (/\.pdf$/i.test(file)) {
    if (!doc.pages?.length) throw new Error("No se recibieron las páginas del documento. Prueba la lectura local.");
    if (new Set(doc.pages.map(p => p.pageNumber)).size !== doc.pages.length) throw new Error("Las páginas recibidas no son válidas.");
    result = { sources: doc.pages.filter(p => p.markdown.trim()).map(p => ({
      id: `${prefix}-${p.pageNumber}`, file, location: `Página ${p.pageNumber}`, text: p.markdown.trim(),
    })), warnings };
    for (const page of doc.pages) if (!page.markdown.trim()) warnings.push(`${file}, página ${page.pageNumber}: no encontramos texto.`);
    if ((doc.metadata?.totalPages ?? 0) > (doc.metadata?.numPages ?? doc.pages.length))
      warnings.push(`${file}: la conversión no incluyó todas las páginas. Puedes usar la lectura local.`);
  } else {
    result = extractMarkdown(doc.markdown ?? "", file, prefix);
    warnings.push(`${file}: revisa las secciones. La conversión puede omitir notas del presentador y no identifica cada diapositiva. Puedes usar la lectura local.`);
    result.warnings.push(...warnings);
  }
  if (!result.sources.length) throw new Error("No encontramos texto para usar en ese archivo.");
  if (doc.warning) result.warnings.push(`${file}: la conversión indicó contenido incompleto. Revisa el texto o usa la lectura local.`);
  return result;
}
