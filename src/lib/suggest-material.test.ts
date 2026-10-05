import { afterEach, describe, expect, it, vi } from "vitest";
import { classificationBatches, suggestMaterial } from "./suggest-material";
import { sourceBytes } from "./material";
const sources = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, file: "notes.md", location: `Sección ${i}`, text: "Contenido útil" }));
afterEach(() => vi.unstubAllGlobals());
describe("material suggestions", () => {
  it("bounds contexts and question counts without changing references", () => {
    const input = sources(140);
    const batches = classificationBatches(input);
    expect(batches.flat()).toEqual(input);
    expect(batches.every(batch => batch.length <= 64 && sourceBytes(batch) <= 24000)).toBe(true);
    expect(classificationBatches([{ ...input[0], text: "x".repeat(25000) }])).toEqual([]);
  });
  it("maps validated scores and reports complete progress", async () => {
    const input = sources(2);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ scores: [{ id: "s0", relevance: 0.8 }, { id: "s1", relevance: 0.1 }] })));
    const progress = vi.fn();
    expect([...await suggestMaterial("Redes", input, new AbortController().signal, progress)]).toEqual(["s0"]);
    expect(progress).toHaveBeenLastCalledWith(1, 1);
  });
  it("rejects duplicate or invented references", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ scores: [{ id: "s0", relevance: 1 }, { id: "s0", relevance: 1 }] })));
    await expect(suggestMaterial("Redes", sources(2), new AbortController().signal, vi.fn())).rejects.toThrow("validar");
  });
  it("does not retry quota failures or return partial suggestions", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ scores: sources(64).map(s => ({ id: s.id, relevance: 1 })) }))
      .mockResolvedValueOnce(Response.json({ code: "quota" }, { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(suggestMaterial("Redes", sources(65), new AbortController().signal, vi.fn())).rejects.toThrow("cuota");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("cancels before sending material", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const abort = new AbortController(); abort.abort();
    await expect(suggestMaterial("Redes", sources(2), abort.signal, vi.fn())).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
