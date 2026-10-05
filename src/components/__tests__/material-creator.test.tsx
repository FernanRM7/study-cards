// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaterialCreator } from "../material-creator";
import { deckFixture } from "@/lib/__tests__/fixtures";
import type { SourceFragment } from "@/lib/material";
import type { DeckBuild } from "@/lib/create-deck";

const mocks = vi.hoisted(() => ({ read: vi.fn(), build: vi.fn(), play: vi.fn(), suggest: vi.fn() }));
vi.mock("@/lib/suggest-material", () => ({ suggestMaterial: mocks.suggest }));
vi.mock("@/lib/read-material", () => ({ readMaterial: mocks.read, RemoteMaterialError: class extends Error {} }));
vi.mock("@/lib/create-deck", () => ({ buildDeck: mocks.build }));
vi.mock("@/components/ui/ask-user-questions", () => ({ AskUserQuestions: ({ onComplete, onCurrentIndexChange }: { onComplete: (answers: object) => void; onCurrentIndexChange: (index: number) => void }) =>
  <><button onClick={() => onCurrentIndexChange(1)}>Continuar objetivo</button><button onClick={() => onComplete({ topic: { otherText: "Redes" }, count: { selectedIds: ["10"] } })}>Responder pasos</button></> }));
vi.mock("@/components/material-review", () => ({ MaterialReview: ({ activeBlock, onBlockChange, selected, onChange, sources }: {
  activeBlock: number; onBlockChange: (index: number) => void; selected: Set<string>;
  onChange: (next: Set<string>) => void; sources: SourceFragment[];
}) => <div>Revisión de prueba <span data-testid="selection">{activeBlock}:{[...selected].join(",")}</span>
  <button onClick={() => onBlockChange(activeBlock === 0 ? 1 : 0)}>Cambiar bloque</button>
  <button onClick={() => onChange(new Set([...selected].filter(id => id !== sources[0].id)))}>Excluir primera sección</button>
</div> }));
let root: Root, host: HTMLDivElement;
function Harness() {
  const [open, setOpen] = useState(true);
  return <MaterialCreator open={open} panelVisible={open} instantMotion onOpenChange={setOpen}
    disabled={false} takenSlugs={[]} onBusyChange={() => {}} onPlay={mocks.play} />;
}
async function click(text: string) {
  const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent === text);
  expect(button, text).toBeTruthy();
  await act(async () => { button!.click(); });
}
async function upload() {
  const input = document.querySelector('input[type=file]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['# Redes\nTexto'], 'redes.md')] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}
async function finish() {
  await upload(); await click('Continuar'); await click('Responder pasos'); await click('Crear tarjetas');
  expect(document.body.textContent).toContain('Tus tarjetas están listas');
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }))));
  mocks.play.mockReset();
  mocks.read.mockResolvedValue({ sources: [{ id: 'one', file: 'redes.md', location: 'Redes', text: 'Redes y protocolos' }], warnings: [] });
  mocks.build.mockImplementation(async (_topic: string, options: { onUpdate: (build: DeckBuild) => void }) => {
    const deck = deckFixture(); options.onUpdate({ topic: 'Redes', deck, pending: [], status: { phase: 'ready' } }); return deck;
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
describe('new material after a completed deck', () => {
  it('remembers selections per block across steps, close/reopen and generates only the active block', async () => {
    const fragments = [0, 1, 2, 3].map(i => ({ id: `part-${i}`, file: 'large.md', location: `Sección ${i}`, text: `## Tema ${i}\n` + 'a'.repeat(8500) }));
    mocks.read.mockResolvedValue({ sources: fragments, warnings: [] });
    await act(async () => root.render(<Harness />)); await upload();
    const selection = () => document.querySelector('[data-testid=selection]')!.textContent;
    expect(selection()).toBe('0:part-0,part-1');
    await click('Excluir primera sección'); expect(selection()).toBe('0:part-1');
    await click('Cambiar bloque'); expect(selection()).toBe('1:part-2,part-3');
    await click('Quitar todo'); expect(selection()).toBe('1:');
    await click('Cambiar bloque'); expect(selection()).toBe('0:part-1');
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Volver a mis mazos"]')!.click());
    await click('Añadir material'); expect(selection()).toBe('0:part-1');
    await click('Continuar'); await click('Responder pasos'); await click('Atrás'); await click('Responder pasos');
    await click('Crear tarjetas');
    expect(mocks.build.mock.lastCall?.[1].sources.map((s: SourceFragment) => s.id)).toEqual(['part-1']);
  });
  it('resets block selections when replacing the material', async () => {
    await act(async () => root.render(<Harness />)); await upload(); await click('Quitar todo');
    await click('Atrás'); await upload();
    expect(document.querySelector('[data-testid=selection]')!.textContent).toBe('0:one');
  });

  it('starts clean after studying, while the saved deck is passed to the game', async () => {
    await act(async () => root.render(<Harness />));
    await finish(); await click('Estudiar tarjetas'); expect(mocks.play).toHaveBeenCalledTimes(1);
    await click('Añadir material');
    expect(document.querySelector('input[type=file]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Abrir mazo');
    await upload(); expect(document.body.textContent).toContain('Revisa el contenido');
  });
  it('clears a finished result when returning and reopening, but preserves an unfinished review', async () => {
    await act(async () => root.render(<Harness />));
    await upload();
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Volver a mis mazos"]')!.click());
    await click('Añadir material'); expect(document.body.textContent).toContain('Revisa el contenido');
    await click('Continuar'); await click('Responder pasos'); await click('Crear tarjetas'); await click('Cerrar');
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Volver a mis mazos"]')!.click());
    await click('Añadir material');
    expect(document.querySelector('input[type=file]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Abrir mazo');
  });
});

describe('optional objective suggestions', () => {
  it('keeps analysis off by default and advances directly with relevant material', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ available: true })));
    mocks.suggest.mockResolvedValue(new Set(['two']));
    mocks.read.mockResolvedValue({ sources: [
      { id: 'one', file: 'redes.md', location: 'Uno', text: 'Introducción' },
      { id: 'two', file: 'redes.md', location: 'Dos', text: 'Protocolos' },
    ], warnings: [] });
    await act(async () => root.render(<Harness />)); await upload(); await click('Continuar');
    const toggle = document.querySelector<HTMLButtonElement>('[role=switch]')!;
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await act(async () => toggle.click());
    await click('Continuar objetivo');
    expect(mocks.suggest).toHaveBeenCalledWith('redes', expect.arrayContaining([expect.objectContaining({ id: 'one' })]), expect.any(AbortSignal), expect.any(Function));
    expect(document.body.textContent).not.toContain('Revisa el contenido');
    expect(document.body.textContent).not.toContain('Al continuar, enviaremos');
    await click('Responder pasos'); await click('Crear tarjetas');
    expect(mocks.build.mock.calls.at(-1)![1].sources.map((s: SourceFragment) => s.id)).toEqual(['two']);
  });
});

it('hides the Clef switch when the server disables suggestions', async () => {
  await act(async () => root.render(<Harness />)); await upload(); await click('Continuar');
  expect(document.querySelector('[role=switch]')).toBeNull();
  expect(document.body.textContent).not.toContain('Sugerir contenido según mi objetivo');
  await click('Continuar objetivo');
  expect(document.body.textContent).not.toContain('Revisa el contenido');
});
