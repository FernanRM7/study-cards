import { NextResponse } from "next/server";
import { z } from "zod";
import { MaterialSchema } from "@/lib/material";
import { classifyMaterial, suggestionsAvailable } from "@/lib/server/suggest-material";
import { GenerationError } from "@/lib/server/ai-provider";

export const maxDuration = 60;
const Body = z.object({ topic: z.string().trim().min(2).max(120), sources: MaterialSchema.refine(sources => sources.length <= 64) });
export function GET() { return NextResponse.json({ available: suggestionsAvailable() }); }
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 32_768) return NextResponse.json({ error: "Selecciona menos contenido." }, { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 32_768) return NextResponse.json({ error: "Selecciona menos contenido." }, { status: 413 });
  let input: unknown;
  try { input = JSON.parse(text); } catch { input = null; }
  const body = Body.safeParse(input);
  if (!body.success) return NextResponse.json({ error: "Revisa el objetivo y el contenido." }, { status: 400 });
  try { return NextResponse.json(await classifyMaterial(body.data.topic, body.data.sources, request.signal)); }
  catch (error) {
    if (request.signal.aborted) return NextResponse.json({ error: "Análisis cancelado." }, { status: 499 });
    if (error instanceof GenerationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "No pudimos sugerir contenido. Usa tu selección manual." }, { status: 503 });
  }
}
