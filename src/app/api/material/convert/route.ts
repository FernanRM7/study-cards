import Firecrawl from "firecrawl";
import { NextResponse } from "next/server";
import { MAX_REMOTE_FILE_BYTES, normalizeRemoteMaterial } from "@/lib/firecrawl-material";

export const runtime = "nodejs";
export const maxDuration = 150;
export function GET() {
  return NextResponse.json({ available: !!process.env.FIRECRAWL_API_KEY });
}
export async function POST(request: Request) {
  if (!process.env.FIRECRAWL_API_KEY) return NextResponse.json({ error: "La conversión no está disponible. Usa la lectura local." }, { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REMOTE_FILE_BYTES + 64_000)
    return NextResponse.json({ error: "Para este archivo, usa la lectura local." }, { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    const prefix = form.get("prefix");
    if (!(file instanceof File) || !/\.(pdf|pptx)$/i.test(file.name) || file.name.length > 255 ||
        typeof prefix !== "string" || !/^file-[1-5]$/.test(prefix))
      return NextResponse.json({ error: "Elige un archivo PDF o PPTX válido." }, { status: 400 });
    if (file.size > MAX_REMOTE_FILE_BYTES || !file.size)
      return NextResponse.json({ error: "Para archivos de más de 4 MB, usa la lectura local." }, { status: 413 });
    request.signal.throwIfAborted();
    const client = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY, maxRetries: 0, timeoutMs: 120_000 });
    const parsed = await client.parse({ data: Buffer.from(await file.arrayBuffer()), filename: file.name }, {
      formats: ["markdown"], timeout: 120_000,
      ...(/\.pdf$/i.test(file.name) ? { parsers: [{ type: "pdf" as const, mode: "auto" as const, pages: true }] } : {}),
    });
    request.signal.throwIfAborted();
    const result = normalizeRemoteMaterial(parsed, file.name, prefix);
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_REMOTE_FILE_BYTES)
      return NextResponse.json({ error: "El contenido convertido es demasiado grande. Usa la lectura local." }, { status: 413 });
    return NextResponse.json(result);
  } catch (cause) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    const status = typeof cause === "object" && cause && "status" in cause ? Number(cause.status) : 0;
    return NextResponse.json({ error: status === 402
      ? "No hay créditos disponibles para convertir. Usa la lectura local."
      : "No se pudo convertir el archivo. Puedes intentar la lectura local." }, { status: 502 });
  }
}
