// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractFiles, extractMarkdown, extractPdf, extractPptx } from "../extract-material";
import { MaterialSchema, sourceBytes, MAX_SOURCE_BYTES, MAX_XML_BYTES, MAX_FILE_BYTES } from "../material";

const destroy = vi.fn();
const getTextContent = vi.fn();
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.resolve({ numPages: 3, getPage: async () => ({ getTextContent }) }), destroy }),
}));
const fragment = { id: "one", file: "test.md", location: "Inicio", text: "Conceptos" };
function presentation() {
  return zipSync({
    "ppt/presentation.xml": strToU8('<p:presentation xmlns:p="urn:p" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId r:id="second"/><p:sldId r:id="first"/></p:sldIdLst></p:presentation>'),
    "ppt/_rels/presentation.xml.rels": strToU8('<Relationships><Relationship Id="first" Target="slides/slide1.xml"/><Relationship Id="second" Target="slides/slide2.xml"/></Relationships>'),
    "ppt/slides/slide1.xml": strToU8('<slide><p><t>Uno</t></p></slide>'),
    "ppt/slides/slide2.xml": strToU8('<slide><p><t>Dos</t></p></slide>'),
    "ppt/slides/_rels/slide2.xml.rels": strToU8('<Relationships><Relationship Id="notes" Target="../notesSlides/notesSlide2.xml"/></Relationships>'),
    "ppt/notesSlides/notesSlide2.xml": strToU8('<notes><sp><ph type="body"/><p><t>Nota del segundo archivo</t></p></sp><sp><ph type="sldNum"/><p><t>99</t></p></sp></notes>'),
    "ppt/media/image.bin": new Uint8Array(1024),
  });
}
function fakeFile(name: string, text: string, size = text.length): File {
  return { name, size, text: async () => text, arrayBuffer: async () => new TextEncoder().encode(text).buffer } as File;
}
describe("material limits", () => {
  it("counts UTF-8 and reference labels; never accepts duplicate references", () => {
    expect(sourceBytes([{ ...fragment, text: "ñ" }])).toBeGreaterThan(sourceBytes([{ ...fragment, text: "a" }]));
    expect(MaterialSchema.safeParse([fragment, fragment]).success).toBe(false);
    expect(MaterialSchema.safeParse([{ ...fragment, text: "a".repeat(MAX_SOURCE_BYTES) }]).success).toBe(false);
    expect(MaterialSchema.safeParse([fragment]).success).toBe(true);
  });
  it("rejects too many files, oversized files, empty files and unsupported formats", async () => {
    await expect(extractFiles(Array(6).fill(fakeFile("a.md", "a")))).rejects.toThrow("cinco");
    await expect(extractFiles([fakeFile("a.md", "a", MAX_FILE_BYTES + 1)])).rejects.toThrow("20 MiB");
    await expect(extractFiles([fakeFile("a.md", "  ")])).rejects.toThrow("texto útil");
    await expect(extractFiles([fakeFile("a.docx", "a")])).rejects.toThrow("Formato");
  });
});
describe("extraction", () => {
  it("splits Markdown at headings but preserves code blocks and unique file references", async () => {
    const result = extractMarkdown("Introducción\n# Tema\ntexto\n```md\n# código\n```\n## Otro\nmás", "a.md", "file-1");
    expect(result.sources.map(s => s.location)).toEqual(["Inicio", "Tema", "Otro"]);
    expect(result.sources[1].text).toContain("# código");
    const combined = await extractFiles([fakeFile("a.md", "# Tema\nUno"), fakeFile("b.md", "# Tema\nDos")]);
    expect(new Set(combined.sources.map(s => s.id)).size).toBe(2);
  });
  it("extracts PDF pages and warns about empty/scanned pages; destroys the task", async () => {
    getTextContent.mockResolvedValueOnce({ items: [{ str: "Página uno", hasEOL: true }] })
      .mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ items: [{ str: "Página tres", hasEOL: false }] });
    const result = await extractPdf(new Uint8Array(), "test.pdf", "pdf");
    expect(result.sources.map(s => s.location)).toEqual(["Página 1", "Página 3"]);
    expect(result.warnings.join(" ")).toContain("página 2");
    expect(destroy).toHaveBeenCalled();
  });
  it("respects the presentation ordering, notes relationships and excludes slide numbers", async () => {
    const result = await extractPptx(presentation(), "slides.pptx", "ppt");
    expect(result.sources[0].text).toContain("Dos\nNotas del presentador:\nNota");
    expect(result.sources[0].text).not.toContain("99");
    expect(result.sources[1].text).toBe("Uno");
    expect(result.sources[0].location).toBe("Diapositiva 1");
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it("rejects corrupt and encrypted/non-ZIP presentations", async () => {
    await expect(extractPptx(new Uint8Array([1, 2]), "bad.pptx", "bad")).rejects.toThrow();
    await expect(extractPptx(zipSync({ "a.xml": strToU8("<a/>") }), "bad.pptx", "bad")).rejects.toThrow("incompleto");
  });
  it("rejects XML declared beyond the decompressed size limit before allocating it", async () => {
    const bytes = presentation();
    // First local ZIP header's uncompressed size.
    new DataView(bytes.buffer).setUint32(22, MAX_XML_BYTES + 1, true);
    await expect(extractPptx(bytes, "large.pptx", "large")).rejects.toThrow("100 MiB");
  });
});
