import { NextResponse } from "next/server";
import { z } from "zod";
import { findDeckCover } from "@/lib/image-search";

export const maxDuration = 15;

const Body = z.object({ topic: z.string().trim().min(2).max(400) });

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Revisa el tema del mazo." }, { status: 400 });
  if (process.env.FLASHCARDS_IMAGES === "off") return NextResponse.json({ cover: null });
  try {
    const cover = await findDeckCover(body.data.topic, { signal: request.signal });
    return NextResponse.json({ cover });
  } catch {
    return NextResponse.json({ cover: null }, { status: request.signal.aborted ? 499 : 200 });
  }
}
