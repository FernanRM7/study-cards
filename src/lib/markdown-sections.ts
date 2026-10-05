const SECTION_BYTES = 16_000;
const bytes = (text: string) => new TextEncoder().encode(text).length;

/** Split on paragraphs, retaining fenced code blocks and tables as units.
 * A huge paragraph can be divided at whitespace; an oversized code block or
 * table stays intact and the review UI explains that it needs manual splitting. */
export function splitMarkdownSection(text: string): string[] {
  if (bytes(text) <= SECTION_BYTES) return [text];
  const blocks: string[] = [];
  let block: string[] = [];
  let fence: { char: string; length: number } | null = null;
  for (const line of text.split("\n")) {
    const mark = line.match(/^\s*(`{3,}|~{3,})/);
    if (mark) {
      if (!fence) fence = { char: mark[1][0], length: mark[1].length };
      else if (mark[1][0] === fence.char && mark[1].length >= fence.length && line.trim() === mark[1]) fence = null;
    }
    block.push(line);
    if (!line.trim() && !fence) { blocks.push(block.join("\n") + "\n"); block = []; }
  }
  if (block.length) blocks.push(block.join("\n"));
  const sections: string[] = [];
  let current = "";
  for (const paragraph of blocks) {
    const structured = /(^|\n)\s*(`{3,}|~{3,}|\|)/.test(paragraph);
    const pieces = bytes(paragraph) > SECTION_BYTES && !structured ? splitParagraph(paragraph) : [paragraph];
    for (const piece of pieces) {
      if (current && bytes(current + piece) > SECTION_BYTES) { sections.push(current); current = ""; }
      current += piece;
    }
  }
  if (current) sections.push(current);
  return sections.filter(section => section.trim());
}

function splitParagraph(text: string): string[] {
  const result: string[] = [];
  let current = "";
  let size = 0;
  // Code points keep emoji and accented characters intact.
  for (const word of text.match(/\S+\s*|\s+/g) ?? []) {
    if (bytes(word) <= SECTION_BYTES) {
      if (size + bytes(word) > SECTION_BYTES) { result.push(current); current = ""; size = 0; }
      current += word; size += bytes(word);
    } else for (const character of word) {
      const length = bytes(character);
      if (size + length > SECTION_BYTES) { result.push(current); current = ""; size = 0; }
      current += character; size += length;
    }
  }
  if (current) result.push(current);
  return result;
}
