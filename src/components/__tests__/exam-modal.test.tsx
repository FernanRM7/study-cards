// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExamModal } from "../quiz/exam-modal";
import { choice, deckFixture } from "@/lib/__tests__/fixtures";
const onClose = vi.fn();
vi.mock("@/components/ui/dynamic-island", () => ({ TIMED_QUESTION_SECONDS: 10, DynamicIsland: ({ active, onTimeout, seconds }: { active: boolean; onTimeout: () => void; seconds: number }) =>
  <button data-seconds={seconds} disabled={!active} onClick={onTimeout}>Agotar tiempo</button> }));
vi.mock("@/components/ui/radio-group", () => ({
  RadioGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  RadioItem: ({ label, onSelect }: { label: string; onSelect: () => void }) => <button onClick={onSelect}>{label}</button>,
}));
vi.mock("@/components/ui/switch", () => ({ Switch: ({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) =>
  <button role="switch" aria-checked={checked} onClick={onToggle}>{label}</button> }));
vi.mock("@/components/share-link-button", () => ({ ShareLinkButton: () => null }));
let root: Root, host: HTMLDivElement;
const deck = deckFixture({ mode: 'exam', passScore: 2, timerSeconds: 45, questions: [choice('first'), choice('second')] });
async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent === text || b.getAttribute('aria-label') === text);
  expect(button, text).toBeTruthy(); await act(async () => button!.click());
}
async function start() {
  await act(async () => root.render(<ExamModal open deck={deck} onOpenChange={onClose} />));
  await click('Modo contrarreloj'); await click('Comenzar examen');
  await act(async () => { vi.advanceTimersByTime(16); });
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  localStorage.clear(); onClose.mockClear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('exam timeout', () => {
  it('locks the answer, waits one second, and waits before the last result without revealing answers early', async () => {
    await start();
    expect(document.querySelector('button[data-seconds]')?.getAttribute('data-seconds')).toBe('10');
    await click('Paris'); await click('Agotar tiempo');
    expect(document.body.textContent).toContain('Pregunta 1 de 2');
    expect([...document.querySelectorAll('button')].find(b => b.textContent === 'Siguiente')!.disabled).toBe(true);
    await click('Siguiente');
    expect(document.body.textContent).not.toContain('Respuesta correcta:');
    await act(async () => { vi.advanceTimersByTime(999); });
    expect(document.body.textContent).toContain('Pregunta 1 de 2');
    await act(async () => { vi.advanceTimersByTime(17); });
    expect(document.body.textContent).toContain('Pregunta 2 de 2');
    await click('Agotar tiempo');
    expect(localStorage.getItem('test-deck-quiz-v1')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(document.body.textContent).toContain('0 de 2');
    expect(document.body.textContent?.match(/Sin respuesta \(tiempo agotado\)/g)).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem('test-deck-quiz-v1')!).best.one).toBe(0);
    await click('Reintentar');
    expect(document.body.textContent).toContain('Pregunta 1 de 2');
  });
  it('pauses the advance during exit confirmation and discards it on closing', async () => {
    await start(); await click('Agotar tiempo');
    await act(async () => { vi.advanceTimersByTime(400); });
    await click('Cerrar');
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(document.body.textContent).toContain('¿Salir del examen?');
    await click('Seguir respondiendo');
    await act(async () => { vi.advanceTimersByTime(599); });
    expect(document.body.textContent).toContain('Pregunta 1 de 2');
    await act(async () => { vi.advanceTimersByTime(17); });
    expect(document.body.textContent).toContain('Pregunta 2 de 2');
    await click('Agotar tiempo'); await click('Cerrar'); await click('Salir');
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(onClose).toHaveBeenCalledWith(false);
    expect(localStorage.getItem('test-deck-quiz-v1')).toBeNull();
  });
});
