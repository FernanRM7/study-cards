import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as planRoute } from "./plan/route";
import { POST as levelRoute } from "./level/route";
import { generationAvailable, planDeck, writeLevel } from "@/lib/server/generate";
import { GenerationError } from "@/lib/server/ai-provider";
import { DeckPlanSchema } from "@/lib/deck";
vi.mock("@/lib/server/generate", () => ({
  generationAvailable: vi.fn(), planDeck: vi.fn(), writeLevel: vi.fn(),
  GenerationRefused: class extends Error {},
}));
const sources = [{ id: "one", file: "notes.md", location: "Inicio", text: "Study material" }];
const plan = DeckPlanSchema.parse({
  slug: "study", title: "Study", headline: "Study?", tagline: "Study", passScore: 7,
  verdicts: { low: "a", mid: "b", high: "c", perfect: "d" },
  levels: [{ id: "one", name: "One", tagline: "One", focus: "Study" }],
});
const request = (body: unknown) => new Request("http://localhost/api/decks/plan", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
beforeEach(() => { vi.mocked(generationAvailable).mockReturnValue(true); vi.mocked(planDeck).mockReset(); vi.mocked(writeLevel).mockReset(); });
describe("material API contracts", () => {
  it("returns configuration errors without calling a provider", async () => {
    vi.mocked(generationAvailable).mockReturnValue(false);
    const result = await planRoute(request({ topic: "Study" }));
    expect(result.status).toBe(503); expect(await result.json()).toMatchObject({ code: "credentials" });
    expect(planDeck).not.toHaveBeenCalled();
  });
  it.each([[], [sources[0], sources[0]], [{ ...sources[0], text: "a".repeat(24000) }]].map(value => ({ value })))("rejects invalid sources before spending tokens", async ({ value }) => {
    expect((await planRoute(request({ topic: "Study", sources: value, cardCount: 10 }))).status).toBe(400);
    expect(planDeck).not.toHaveBeenCalled();
  });
  it("derives the requested level count, forwards cancellation, and includes measured usage", async () => {
    vi.mocked(planDeck).mockImplementation(async (_topic, options) => { options?.onUsage?.({ input: 20, output: 10 }); return plan; });
    const req = request({ topic: "Study", sources, cardCount: 30 });
    const result = await planRoute(req);
    expect(result.status).toBe(200); expect(await result.json()).toMatchObject({ usage: { input: 20, output: 10 } });
    expect(planDeck).toHaveBeenCalledWith("Study", expect.objectContaining({ levels: 3, sources, signal: req.signal }));
  });
  it("keeps topic-only agent requests compatible", async () => {
    vi.mocked(planDeck).mockResolvedValue(plan);
    expect((await planRoute(request({ topic: "Study" }))).status).toBe(200);
    expect(vi.mocked(planDeck).mock.calls[0][1]).not.toHaveProperty("levels");
  });
  it("distinguishes quota exhaustion from temporary errors", async () => {
    vi.mocked(planDeck).mockRejectedValue(new GenerationError("quota", "Cuota agotada", 429));
    const result = await planRoute(request({ topic: "Study", sources }));
    expect(result.status).toBe(429); expect(await result.json()).toMatchObject({ code: "quota" });
  });
  it("rejects mismatched or timed material plans", async () => {
    const result = await levelRoute(request({ topic: "Study", sources, cardCount: 20, plan, levelId: "one" }));
    expect(result.status).toBe(400); expect(writeLevel).not.toHaveBeenCalled();
    const timed = { ...plan, levels: [{ ...plan.levels[0], timed: true }] };
    expect((await levelRoute(request({ topic: "Study", sources, cardCount: 10, plan: timed, levelId: "one" }))).status).toBe(400);
  });
});
