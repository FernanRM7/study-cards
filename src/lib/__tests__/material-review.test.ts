import { describe, expect, it } from "vitest";
import { extractMarkdown } from "../extract-material";
import { materialBatches, materialChapters } from "../material-review";
import { MaterialSchema } from "../material";
import { splitMarkdownSection } from "../markdown-sections";

describe("Markdown review", () => {
  it("groups repeated subsection names under distinct chapters without changing references", () => {
    const { sources } = extractMarkdown("# Guía\nIntro\n## Redes\nBase\n### Resumen\nUno\n## Seguridad\nBase\n### Resumen\nDos", "guia.md", "md");
    const chapters = materialChapters(sources);
    expect(chapters.map(c => c.title)).toEqual(["Guía", "Redes", "Seguridad"]);
    expect(chapters[1].sources.map(s => s.location)).toEqual(["Redes", "Resumen"]);
    expect(chapters.flatMap(c => c.sources)).toEqual(sources);
  });
  it("packs 92 sections into usable blocks, keeping every fragment exactly once", () => {
    const markdown = Array.from({ length: 92 }, (_, i) => `## Capítulo ${i}\n${"Información ñ ".repeat(80)}`).join("\n");
    const { sources } = extractMarkdown(markdown, "grande.md", "md");
    const batches = materialBatches(materialChapters(sources));
    expect(batches.length).toBeGreaterThan(1);
    batches.forEach(batch => expect(MaterialSchema.safeParse(batch).success).toBe(true));
    expect(batches.flat()).toEqual(sources);
  });
  it("splits long prose with and without headings without dropping or breaking Unicode", () => {
    const body = "Redes 🌐 y seguridad. ".repeat(3500);
    const sections = splitMarkdownSection(body);
    expect(sections.join("")).toBe(body);
    expect(sections.length).toBeGreaterThan(1);
    const { sources } = extractMarkdown(body, "sin-titulos.md", "md");
    sources.forEach(source => expect(MaterialSchema.safeParse([source]).success).toBe(true));
    expect(new Set(sources.map(s => s.id)).size).toBe(sources.length);
    expect(sources[1].location).toContain("Parte 2");
  });
  it("keeps tables and fenced code intact; oversized structured content stays visible", () => {
    const code = '```ios\n' + 'show ip route\n'.repeat(2200) + '```';
    const table = '| Puerto | Protocolo |\n|---|---|\n| 443 | HTTPS |';
    const prose = "Introducción.\n\n".repeat(1300);
    const { sources } = extractMarkdown(`${prose}${code}\n\n${table}`, "comandos.md", "md");
    expect(sources.some(s => s.text.includes(code))).toBe(true);
    expect(sources.some(s => s.text.includes(table))).toBe(true);
    const chapters = materialChapters(sources);
    const batches = materialBatches(chapters);
    expect(chapters.flatMap(c => c.sources)).toEqual(sources);
    batches.forEach(batch => expect(MaterialSchema.safeParse(batch).success).toBe(true));
    expect(batches.flat().some(s => s.text.includes(code))).toBe(false);
  });
});
