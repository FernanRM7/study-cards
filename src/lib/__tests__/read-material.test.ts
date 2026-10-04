// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MAX_FILE_BYTES, MAX_REMOTE_FILE_BYTES } from "../material";
import { readMaterial } from "../read-material";
import { extractFiles } from "../extract-material";
vi.mock("../extract-material", () => ({ extractFiles: vi.fn(async (files: File[], index: number) => ({
  sources: [{ id: `file-${index + 1}-local`, file: files[0].name, location: "Inicio", text: "Contenido local" }], warnings: [],
})) }));
const file = (name: string, size: number) => {
  const result = new File(["contenido"], name);
  Object.defineProperty(result, "size", { value: size });
  return result;
};
const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
  const body = init!.body as FormData;
  return Response.json({ sources: [{ id: `${body.get("prefix")}-remote`, file: (body.get("file") as File).name, location: "Página 1", text: "Contenido remoto" }], warnings: [] });
});
const options = () => ({ remoteAvailable: true, signal: new AbortController().signal });
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });
it("routes each file by size and type, retaining order and unique references", async () => {
  const result = await readMaterial([
    file("small.pdf", MAX_REMOTE_FILE_BYTES), file("large.pptx", MAX_REMOTE_FILE_BYTES + 1), file("notes.md", 100), file("small.pptx", 100),
  ], options());
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(extractFiles).toHaveBeenCalledTimes(2);
  expect(result.sources.map(source => source.id)).toEqual(["file-1-remote", "file-2-local", "file-3-local", "file-4-remote"]);
});
it.each([{ remoteAvailable: false }, { remoteAvailable: true, forceLocal: true }])("uses local reading without a remote service or on explicit retry: %o", async config => {
  await readMaterial([file("notes.pdf", 100)], { ...options(), ...config });
  expect(fetchMock).not.toHaveBeenCalled(); expect(extractFiles).toHaveBeenCalledOnce();
});
it("validates every file before any upload", async () => {
  await expect(readMaterial([file("good.pdf", 100), file("big.pdf", MAX_FILE_BYTES + 1)], options())).rejects.toThrow(/20 MiB/);
  await expect(readMaterial([file("bad.exe", 100)], options())).rejects.toThrow(/Formato/);
  await expect(readMaterial(Array.from({ length: 6 }, () => file("notes.md", 100)), options())).rejects.toThrow(/cinco/);
  expect(fetchMock).not.toHaveBeenCalled(); expect(extractFiles).not.toHaveBeenCalled();
});
it("does not retry Firecrawl automatically on error or incomplete content", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: "No hay créditos. Usa lectura local." }, { status: 502 }));
  await expect(readMaterial([file("notes.pdf", 100)], options())).rejects.toThrow(/créditos/);
  fetchMock.mockResolvedValueOnce(Response.json({ sources: [], warnings: [] }));
  await expect(readMaterial([file("notes.pdf", 100)], options())).rejects.toThrow(/lectura local/);
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(extractFiles).not.toHaveBeenCalled();
});
it("stops when cancelled before reading", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(readMaterial([file("notes.pdf", 100)], { remoteAvailable: true, signal: controller.signal })).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled(); expect(extractFiles).not.toHaveBeenCalled();
});
