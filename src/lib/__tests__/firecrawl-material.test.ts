import { describe, expect, it } from "vitest";
import { normalizeRemoteMaterial } from "../firecrawl-material";
describe("remote document extraction", () => {
  it("retains physical PDF page numbers and reports missing/empty pages", () => {
    const result = normalizeRemoteMaterial({
      pages: [{ pageNumber: 3, markdown: "## Cells\nCells have membranes." }, { pageNumber: 4, markdown: "" }],
      metadata: { numPages: 2, totalPages: 6 },
    }, "biology.pdf", "file-2");
    expect(result.sources[0]).toMatchObject({ id: "file-2-3", location: "Página 3" });
    expect(result.warnings).toHaveLength(2);
  });
  it("creates sections for PPTX without fabricating slide references", () => {
    const result = normalizeRemoteMaterial({ markdown: "# App shell\nHTML\n# Manifest\nJSON" }, "web.pptx", "file-1");
    expect(result.sources.map(s => s.location)).toEqual(["App shell", "Manifest"]);
    expect(result.warnings.join(" ")).toMatch(/notas del presentador/);
  });
  it("rejects invalid, empty and unreferenced PDF conversion", () => {
    expect(() => normalizeRemoteMaterial({ markdown: "only text" }, "a.pdf", "file-1")).toThrow();
    expect(() => normalizeRemoteMaterial({ pages: [{ pageNumber: 1, markdown: "" }] }, "a.pdf", "file-1")).toThrow();
    expect(() => normalizeRemoteMaterial({ pages: [{ pageNumber: 1, markdown: "a" }, { pageNumber: 1, markdown: "b" }] }, "a.pdf", "file-1")).toThrow();
  });
});
