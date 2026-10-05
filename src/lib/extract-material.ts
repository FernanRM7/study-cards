import { splitMarkdownSection } from "./markdown-sections";
import { MAX_FILES, MAX_FILE_BYTES, MAX_XML_BYTES, type ExtractedMaterial, type SourceFragment } from "./material";

function xml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length || /<!DOCTYPE/i.test(text))
    throw new Error("La presentación contiene XML inválido.");
  return doc;
}
const elements = (doc: Document | Element, name: string) => Array.from(doc.getElementsByTagNameNS("*", name));
function paragraphs(doc: Document): string {
  return elements(doc, "p").map(p => elements(p, "t").map(t => t.textContent ?? "").join("")).filter(Boolean).join("\n");
}
function resolvePath(base: string, target: string): string {
  const parts = (target.startsWith("/") ? target.slice(1) : `${base}/${target}`).split("/");
  const result: string[] = [];
  for (const part of parts) {
    if (part === "..") result.pop();
    else if (part && part !== ".") result.push(part);
  }
  return result.join("/");
}

/** Decompress only XML, checking both declared and actual cumulative size. */
async function pptxXml(data: Uint8Array): Promise<Record<string, string>> {
  const { Unzip, UnzipInflate, strFromU8 } = await import("fflate");
  const files: Record<string, string> = {};
  let declared = 0;
  let actual = 0;
  let failure: Error | null = null;
  let pending = 0;
  let seen = 0;
  const unzip = new Unzip(file => {
    seen++;
    if (!/\.(xml|rels)$/i.test(file.name)) return;
    declared += file.originalSize ?? 0;
    if (declared > MAX_XML_BYTES) {
      failure = new Error("La presentación supera el límite de 100 MiB de XML.");
      return;
    }
    pending++;
    const chunks: Uint8Array[] = [];
    file.ondata = (error, chunk, final) => {
      if (error) { failure = error; file.terminate(); return; }
      actual += chunk.length;
      if (actual > MAX_XML_BYTES) {
        failure = new Error("La presentación supera el límite de 100 MiB de XML.");
        file.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) {
        const joined = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let offset = 0;
        for (const c of chunks) { joined.set(c, offset); offset += c.length; }
        files[file.name] = strFromU8(joined);
        pending--;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let i = 0; i < data.length; i += 65536) {
    unzip.push(data.subarray(i, i + 65536), i + 65536 >= data.length);
    if (failure) throw failure;
  }
  if (!seen || pending || !files["ppt/presentation.xml"] || !files["ppt/_rels/presentation.xml.rels"])
    throw new Error("El archivo PPTX está incompleto, protegido o no es una presentación válida.");
  return files;
}

export async function extractPptx(data: Uint8Array, file: string, prefix: string): Promise<ExtractedMaterial> {
  const files = await pptxXml(data);
  const relationships = (name: string) => {
    if (!files[name]) return new Map<string, string>();
    return new Map(elements(xml(files[name]), "Relationship")
      .filter(r => r.getAttribute("TargetMode") !== "External")
      .map(r => [r.getAttribute("Id")!, r.getAttribute("Target")!]));
  };
  const rels = relationships("ppt/_rels/presentation.xml.rels");
  const sources: SourceFragment[] = [];
  const warnings = [`${file}: las imágenes, diagramas y gráficos no se interpretan.`];
  const ids = elements(xml(files["ppt/presentation.xml"]), "sldId");
  for (const [index, slide] of ids.entries()) {
    const rid = slide.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = rid ? rels.get(rid) : undefined;
    if (!target) throw new Error("No se pudo resolver el orden de las diapositivas.");
    const path = resolvePath("ppt", target);
    if (!files[path]) throw new Error("Falta una diapositiva de la presentación.");
    const doc = xml(files[path]);
    let text = paragraphs(doc);
    const slash = path.lastIndexOf("/");
    const slideRels = relationships(`${path.slice(0, slash)}/_rels/${path.slice(slash + 1)}.rels`);
    const notesTarget = [...slideRels.values()].find(t => /notesSlides\//.test(t));
    if (notesTarget) {
      const notesPath = resolvePath(path.slice(0, slash), notesTarget);
      if (!files[notesPath]) throw new Error("Faltan las notas de una diapositiva.");
      const notesDoc = xml(files[notesPath]);
      const notes = elements(notesDoc, "sp").filter(sp => !elements(sp, "ph").some(ph => ["sldNum", "hdr", "ftr", "dt"].includes(ph.getAttribute("type") ?? "")))
        .map(sp => elements(sp, "p").map(p => elements(p, "t").map(t => t.textContent ?? "").join("")).join("\n")).filter(Boolean).join("\n");
      if (notes.trim()) text += `\nNotas del presentador:\n${notes}`;
    }
    if (text.trim()) sources.push({ id: `${prefix}-${index + 1}`, file, location: `Diapositiva ${index + 1}`, text: text.trim() });
    else warnings.push(`${file}, diapositiva ${index + 1}: sin texto extraíble.`);
  }
  return { sources, warnings };
}

export function extractMarkdown(text: string, file: string, prefix: string): ExtractedMaterial {
  if (text.includes("\0")) throw new Error("El archivo Markdown contiene datos binarios.");
  const sources: SourceFragment[] = [];
  let title = "Inicio";
  let lines: string[] = [];
  let fenced = false;
  const flush = () => {
    const body = lines.join("\n").trim();
    if (body) {
      const chunks = splitMarkdownSection(body);
      chunks.forEach((text, index) => sources.push({
        id: `${prefix}-${sources.length + 1}`, file,
        location: (chunks.length > 1 ? `${title.slice(0, 160)} · Parte ${index + 1}` : title).slice(0, 200), text,
      }));
    }
    lines = [];
  };
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && line.match(/^#{1,6}\s+(.+)/);
    if (heading) { flush(); title = heading[1]; }
    lines.push(line);
  }
  flush();
  return { sources, warnings: /!\[.*?\]\(/.test(text) ? [`${file}: las imágenes enlazadas no se interpretan.`] : [] };
}

export async function extractPdf(data: Uint8Array, file: string, prefix: string): Promise<ExtractedMaterial> {
  const pdfjs = await import("pdfjs-dist");
  // Next emits the version-matched worker as a local asset; no CDN dependency.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data });
  try {
    const doc = await task.promise;
    const sources: SourceFragment[] = [];
    const warnings = [`${file}: los escaneos, imágenes y diagramas no se interpretan. Revisa el orden del texto extraído.`];
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      const text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
      if (text) sources.push({ id: `${prefix}-${page}`, file, location: `Página ${page}`, text });
      else warnings.push(`${file}, página ${page}: sin texto extraíble; podría ser un escaneo.`);
    }
    return { sources, warnings };
  } finally { await task.destroy(); }
}

export async function extractFiles(files: File[], startIndex = 0): Promise<ExtractedMaterial> {
  if (!files.length || files.length > MAX_FILES) throw new Error("Selecciona entre uno y cinco archivos.");
  const result: ExtractedMaterial = { sources: [], warnings: [] };
  for (const [index, file] of files.entries()) {
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: el límite es 20 MiB por archivo.`);
    if (file.name.length > 255) throw new Error("El nombre del archivo es demasiado largo.");
    const prefix = `file-${startIndex + index + 1}`;
    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      let extracted: ExtractedMaterial;
      if (ext === "md") extracted = extractMarkdown(new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()), file.name, prefix);
      else if (ext === "pdf") extracted = await extractPdf(new Uint8Array(await file.arrayBuffer()), file.name, prefix);
      else if (ext === "pptx") extracted = await extractPptx(new Uint8Array(await file.arrayBuffer()), file.name, prefix);
      else throw new Error("Formato no admitido. Usa .md, .pdf o .pptx.");
      if (!extracted.sources.length) throw new Error("No contiene texto útil extraíble.");
      result.sources.push(...extracted.sources);
      result.warnings.push(...extracted.warnings);
    } catch (error) {
      throw new Error(`${file.name}: ${error instanceof Error ? error.message : "no se pudo leer el archivo"}`);
    }
  }
  return result;
}
