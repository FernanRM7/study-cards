// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaterialCreator } from "../material-creator";
import { deckFixture } from "@/lib/__tests__/fixtures";
import type { DeckBuild } from "@/lib/create-deck";

const mocks = vi.hoisted(() => ({ read: vi.fn(), build: vi.fn(), play: vi.fn() }));
vi.mock("@/lib/read-material", () => ({ readMaterial: mocks.read, RemoteMaterialError: class extends Error {} }));
vi.mock("@/lib/create-deck", () => ({ buildDeck: mocks.build }));
vi.mock("@/components/ui/ask-user-questions", () => ({ AskUserQuestions: ({ onComplete }: { onComplete: (answers: object) => void }) =>
  <button onClick={() => onComplete({ topic: { otherText: "Redes" }, count: { selectedIds: ["10"] } })}>Responder pasos</button> }));
vi.mock("@/components/material-review", () => ({ MaterialReview: () => <div>Revisión de prueba</div> }));
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
