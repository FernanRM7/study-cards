import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { structured, generationAvailable } from "../server/ai-provider";
import { planDeck, writeLevel } from "../server/generate";
import { DeckPlanSchema } from "../deck";
const fetchMock = vi.fn();
const schema = z.object({ answer: z.string() });
const options = { schema, system: "system", prompt: "topic", maxTokens: 50 };
const success = (response: unknown, usage?: object) => new Response(JSON.stringify({ success: true, result: { response, usage } }));
const failure = (status: number, code: number, message: string) => new Response(JSON.stringify({ success: false, errors: [{ code, message }] }), { status });
const source = { id: "one", file: "biology.md", location: "Células", text: "Las células tienen membrana." };
const rawPlan = {
  slug: "biology", title: "Biología", headline: "¿Conoces las células?", tagline: "Células",
  passScore: 7, verdicts: { low: "a", mid: "b", high: "c", perfect: "d" },
  levels: [{ id: "one", name: "Bases", tagline: "Introducción", focus: "Células", hidden: false, timed: false }],
};
function cards() {
  return { questions: Array.from({ length: 10 }, (_, i) => ({ kind: "choice", id: `q-${i}`, prompt: `Pregunta ${i}`, options: ["Sí", "No"], fact: "Explicación", provenance: { kind: "material", references: [{ id: "one", file: "Inventado", location: "Inventada" }] } })) };
}
beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account"); vi.stubEnv("CLOUDFLARE_API_TOKEN", "private-test-token");
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Cloudflare generation", () => {
  it("detects configuration and validates string or object JSON; reports usage", async () => {
    expect(generationAvailable()).toBe(true);
    const usage = vi.fn();
    fetchMock.mockResolvedValueOnce(success('{"answer":"ok"}', { prompt_tokens: 5, completion_tokens: 2 }));
    expect(await structured({ ...options, onUsage: usage })).toEqual({ answer: "ok" });
    expect(usage).toHaveBeenCalledWith({ input: 5, output: 2 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format.type).toBe("json_schema");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
    expect(generationAvailable()).toBe(false);
  });
  it("repairs once and supports Qwen's choices response shape", async () => {
    fetchMock.mockResolvedValueOnce(success("invalid")).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: { choices: [{ message: { content: '{"answer":"fixed"}' } }] } })));
    expect(await structured(options)).toEqual({ answer: "fixed" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("falls back to prompted JSON when structured mode is unsupported", async () => {
    fetchMock.mockResolvedValueOnce(failure(400, 5004, "JSON Mode couldn't be met")).mockResolvedValueOnce(success({ answer: "ok" }));
    await structured(options);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toBeUndefined();
  });
  it("stops after one repair", async () => {
    fetchMock.mockImplementation(async () => success({ invalid: true }));
    await expect(structured(options)).rejects.toMatchObject({ code: "format" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([[429, 3036, "quota"], [429, 3040, "temporary"], [401, 10000, "credentials"], [403, 5035, "credentials"]])("distinguishes HTTP %i / code %i without retry", async (status, code, category) => {
    fetchMock.mockResolvedValueOnce(failure(Number(status), Number(code), "provider error"));
    await expect(structured(options)).rejects.toMatchObject({ code: category });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not call the provider for a cancelled request", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(structured({ ...options, signal: controller.signal })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("normalizes material plans and canonicalizes source labels", async () => {
    fetchMock.mockResolvedValueOnce(success({ ...rawPlan, coverQuery: "cell microscope", passScore: 6, levels: [{ ...rawPlan.levels[0], timed: true, hidden: true }] }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ query: { pages: {
      one: { title: "File:Biology.jpg", index: 1, imageinfo: [{
        thumburl: "https://upload.wikimedia.org/biology.jpg", thumbwidth: 1200,
        thumbheight: 800, mime: "image/jpeg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Biology.jpg",
        extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, ObjectName: { value: "Biology" }, Artist: { value: "Creator" } },
      }] },
    } } })));
    const plan = await planDeck("Biología", { sources: [source], levels: 1 });
    expect(plan.passScore).toBe(7); expect(plan.levels[0].timed).toBe(false); expect(plan.levels[0].hidden).toBe(false);
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("gsrsearch")).toBe("cell microscope");
    expect(plan).not.toHaveProperty("coverQuery");
    expect(plan.cover).toEqual({ image: "https://upload.wikimedia.org/biology.jpg", alt: "Biology", credit: {
      title: "Biology", author: "Creator", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Biology.jpg",
    } });
    fetchMock.mockResolvedValueOnce(success(cards()));
    const questions = await writeLevel({ topic: "Biología", plan, level: plan.levels[0], sources: [source] });
    expect(questions[0].id).toBe("one-1");
    expect(questions[0].provenance).toEqual({ kind: "material", references: [{ id: "one", file: "biology.md", location: "Células" }] });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).messages[0].content).toContain("untrusted");
  });
  it.each(["count", "options", "reference", "provenance"])("rejects invalid %s after repair", async kind => {
    const value = cards();
    if (kind === "count") value.questions.pop();
    if (kind === "options") value.questions[0].options = ["same", "same"];
    if (kind === "reference") value.questions[0].provenance.references[0].id = "missing";
    if (kind === "provenance") delete (value.questions[0] as { provenance?: unknown }).provenance;
    fetchMock.mockImplementation(async () => success(value));
    const plan = DeckPlanSchema.parse(rawPlan);
    await expect(writeLevel({ topic: "Biología", plan, level: plan.levels[0], sources: [source] })).rejects.toMatchObject({ code: "format" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
