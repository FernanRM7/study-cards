import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { parse, configuration } = vi.hoisted(() => ({ parse: vi.fn(), configuration: vi.fn() }));
vi.mock("firecrawl", () => ({ default: class { constructor(options: unknown) { configuration(options); } parse = parse; } }));
import { GET, POST } from "./route";
function request(file = new File(["pdf"], "notes.pdf"), signal?: AbortSignal) {
  const form = new FormData(); form.set("file", file); form.set("prefix", "file-1");
  return new Request("http://localhost/api/material/convert", { method: "POST", body: form, signal });
}
beforeEach(() => { vi.stubEnv("FIRECRAWL_API_KEY", "private-key"); parse.mockReset(); configuration.mockClear(); });
afterEach(() => vi.unstubAllEnvs());
describe("optional Firecrawl conversion", () => {
  it("exposes availability without exposing credentials and normalizes PDF pages", async () => {
    expect(await GET().json()).toEqual({ available: true });
    parse.mockResolvedValue({ pages: [{ pageNumber: 1, markdown: "# Heading\nText" }] });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).sources[0].location).toBe("Página 1");
    expect(configuration).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
    expect(parse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ parsers: [{ type: "pdf", mode: "auto", pages: true }] }));
  });
  it("rejects oversized and unsupported files without provider calls", async () => {
    expect((await POST(request(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.pdf")))).status).toBe(413);
    expect((await POST(request(new File(["x"], "invalid.md")))).status).toBe(400);
    expect(parse).not.toHaveBeenCalled();
  });
  it("offers local extraction for missing credits, configuration and temporary errors", async () => {
    parse.mockRejectedValue({ status: 402 });
    expect((await (await POST(request())).json()).error).toMatch(/créditos/);
    parse.mockRejectedValue(new Error("timeout"));
    expect((await (await POST(request())).json()).error).toMatch(/lectura local/);
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    expect(await GET().json()).toEqual({ available: false });
    expect((await POST(request())).status).toBe(503);
  });
  it("stops cancelled requests without initiating conversion", async () => {
    const abort = new AbortController(); abort.abort();
    expect((await POST(request(undefined, abort.signal))).status).toBe(499);
    expect(parse).not.toHaveBeenCalled();
  });
});
