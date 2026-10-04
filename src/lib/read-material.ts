import { MAX_FILES, MAX_FILE_BYTES, MAX_REMOTE_FILE_BYTES, SourceFragmentSchema, type ExtractedMaterial } from "./material";

export class RemoteMaterialError extends Error {}

/** Choose a reader per file, preserving the upload order and reference IDs. */
export async function readMaterial(files: File[], options: {
  remoteAvailable: boolean;
  forceLocal?: boolean;
  signal: AbortSignal;
  onRemoteStart?: () => void;
}): Promise<ExtractedMaterial> {
  if (!files.length || files.length > MAX_FILES) throw new Error("Selecciona entre uno y cinco archivos.");
  // Validate the whole selection before uploading anything to Firecrawl.
  for (const file of files) {
    if (!/\.(md|pdf|pptx)$/i.test(file.name)) throw new Error("Formato no admitido. Usa .md, .pdf o .pptx.");
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: el límite es 20 MiB por archivo.`);
    if (file.name.length > 255) throw new Error("El nombre del archivo es demasiado largo.");
    if (!file.size) throw new Error("No contiene texto útil extraíble.");
  }
  const result: ExtractedMaterial = { sources: [], warnings: [] };
  for (const [index, file] of files.entries()) {
    options.signal.throwIfAborted();
    let extracted: ExtractedMaterial;
    const remote = options.remoteAvailable && !options.forceLocal && /\.(pdf|pptx)$/i.test(file.name) && file.size <= MAX_REMOTE_FILE_BYTES;
    if (remote) {
      options.onRemoteStart?.();
      const body = new FormData();
      body.set("file", file); body.set("prefix", `file-${index + 1}`);
      try {
        const response = await fetch("/api/material/convert", { method: "POST", body, signal: options.signal });
        const data = await response.json();
        if (!response.ok) throw new RemoteMaterialError(typeof data.error === "string" ? data.error : "No se pudo convertir el archivo. Usa la lectura local.");
        const sources = SourceFragmentSchema.array().min(1).parse(data.sources);
        if (!Array.isArray(data.warnings) || !data.warnings.every((warning: unknown) => typeof warning === "string")) throw new Error();
        extracted = { sources, warnings: data.warnings };
      } catch (cause) {
        options.signal.throwIfAborted();
        if (cause instanceof RemoteMaterialError) throw cause;
        throw new RemoteMaterialError("No se pudo convertir el archivo. Puedes intentar la lectura local.");
      }
    } else {
      const { extractFiles } = await import("./extract-material");
      extracted = await extractFiles([file], index);
    }
    options.signal.throwIfAborted();
    result.sources.push(...extracted.sources);
    result.warnings.push(...extracted.warnings);
  }
  return result;
}
