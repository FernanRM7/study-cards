import { NextResponse } from "next/server";
import { MODEL, PROVIDER, generationAvailable } from "@/lib/server/ai-provider";

/** Whether this deployment can write decks, so the landing page knows what
 *  to offer before anyone types. */
export function GET() {
  const available = generationAvailable();
  return NextResponse.json({ available, provider: PROVIDER, model: available ? MODEL : null });
}
