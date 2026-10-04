import { NextResponse } from "next/server";
import { z } from "zod";
import { MaterialSchema, CardCountSchema } from "@/lib/material";
import { GenerationError, type TokenUsage } from "@/lib/server/ai-provider";
import {
  GenerationRefused,
  generationAvailable,
  planDeck,
} from "@/lib/server/generate";

// Planning is a short request; the ceiling is for slow days.
export const maxDuration = 60;

const Body = z.object({
  topic: z.string().trim().min(2).max(120),
  notes: z.string().max(2000).optional(),
  sources: MaterialSchema.optional(),
  cardCount: CardCountSchema.default(10),
});

export async function POST(request: Request) {
  if (!generationAvailable())
    return NextResponse.json(
      { error: "La generación no está configurada. Añade las credenciales del proveedor en .env.local.", code: "credentials" },
      { status: 503 }
    );
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: "Revisa el tema (2–120 caracteres) y el material: selecciona entre 1 y 500 secciones únicas, hasta 24,000 bytes UTF-8, y 10, 20 o 30 tarjetas." }, { status: 400 });
  const usage: TokenUsage = { input: 0, output: 0 };
  let hasUsage = false;
  const onUsage = (u: TokenUsage) => { hasUsage = true; usage.input += u.input; usage.output += u.output; };
  try {
    const plan = await planDeck(body.data.topic, {
      notes: body.data.notes, sources: body.data.sources,
      ...(body.data.sources ? { levels: body.data.cardCount / 10 } : {}),
      signal: request.signal, onUsage,
    });
    return NextResponse.json({ plan, ...(hasUsage ? { usage } : {}) });
  } catch (error) {
    if (error instanceof GenerationError)
      return NextResponse.json({ error: error.message, code: error.code, ...(hasUsage ? { usage } : {}) }, { status: error.status });
    if (request.signal.aborted) return NextResponse.json({ error: "Generación cancelada." }, { status: 499 });
    if (error instanceof GenerationRefused)
      return NextResponse.json({ error: error.message }, { status: 422 });
    console.error("plan failed");
    return NextResponse.json(
      { error: "Couldn't plan the deck. Try again in a moment." },
      { status: 500 }
    );
  }
}
