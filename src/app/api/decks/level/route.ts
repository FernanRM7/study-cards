import { NextResponse } from "next/server";
import { z } from "zod";
import { MaterialSchema, CardCountSchema } from "@/lib/material";
import { GenerationError, type TokenUsage } from "@/lib/server/ai-provider";
import { DeckPlanSchema } from "@/lib/deck";
import {
  GenerationRefused,
  generationAvailable,
  writeLevel,
} from "@/lib/server/generate";

// Writing ten cards with thinking on can take a minute on a slow day.
export const maxDuration = 120;

const Body = z.object({
  topic: z.string().trim().min(2).max(120),
  plan: DeckPlanSchema,
  levelId: z.string(),
  avoid: z.array(z.string().max(300)).max(200).default([]),
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
    return NextResponse.json({ error: "Solicitud inválida. Revisa el plan y los límites del material seleccionado." }, { status: 400 });
  const { topic, plan, levelId, avoid, notes, sources, cardCount } = body.data;
  if (sources && (plan.levels.length !== cardCount / 10 || plan.passScore !== 7 || plan.levels.some(l => l.hidden || l.timed)))
    return NextResponse.json({ error: "El plan de estudio debe tener conjuntos de diez tarjetas, sin cronómetro ni conjuntos ocultos." }, { status: 400 });
  const level = plan.levels.find((l) => l.id === levelId);
  if (!level)
    return NextResponse.json({ error: `No level "${levelId}" in the plan.` }, { status: 400 });
  const usage: TokenUsage = { input: 0, output: 0 };
  let hasUsage = false;
  const onUsage = (u: TokenUsage) => { hasUsage = true; usage.input += u.input; usage.output += u.output; };
  try {
    const questions = await writeLevel({ topic, plan, level, avoid, notes, sources, signal: request.signal, onUsage });
    return NextResponse.json({ questions, ...(hasUsage ? { usage } : {}) });
  } catch (error) {
    if (error instanceof GenerationError)
      return NextResponse.json({ error: error.message, code: error.code, ...(hasUsage ? { usage } : {}) }, { status: error.status });
    if (request.signal.aborted) return NextResponse.json({ error: "Generación cancelada." }, { status: 499 });
    if (error instanceof GenerationRefused)
      return NextResponse.json({ error: error.message }, { status: 422 });
    console.error("level failed");
    return NextResponse.json(
      { error: `Couldn't write the ${level.name} level. Try again in a moment.` },
      { status: 500 }
    );
  }
}
