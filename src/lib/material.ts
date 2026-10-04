import { z } from "zod";

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_REMOTE_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_XML_BYTES = 100 * 1024 * 1024;
export const MAX_SOURCE_BYTES = 24_000;
export const SourceFragmentSchema = z.object({
  id: z.string().min(1).max(100),
  file: z.string().min(1).max(255),
  location: z.string().min(1).max(200),
  text: z.string().trim().min(1),
});
export type SourceFragment = z.infer<typeof SourceFragmentSchema>;
export const MaterialSchema = z.array(SourceFragmentSchema).min(1).max(500).superRefine((sources, ctx) => {
  if (new Set(sources.map(s => s.id)).size !== sources.length)
    ctx.addIssue({ code: "custom", message: "Las referencias del material deben ser únicas." });
  if (sourceBytes(sources) > MAX_SOURCE_BYTES)
    ctx.addIssue({ code: "custom", message: "Selecciona menos secciones: el límite es 24,000 bytes UTF-8." });
});
export const CardCountSchema = z.union([z.literal(10), z.literal(20), z.literal(30)]);
export function sourceBytes(sources: SourceFragment[]): number {
  // Include reference labels and serialization, not just the document body.
  return new TextEncoder().encode(JSON.stringify(sources)).length;
}
export interface ExtractedMaterial {
  sources: SourceFragment[];
  warnings: string[];
}
