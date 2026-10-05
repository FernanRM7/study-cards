// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MaterialReview } from "../material-review";
vi.mock("@/components/ui/scroll-area", () => ({ ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/ui/switch", () => ({ Switch: ({ label }: { label: string }) => <span>{label}</span> }));
it('shows only the fragments in the active block, including a partial chapter', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const sources = [0, 1, 2, 3].map(i => ({ id: String(i), file: 'notes.md', location: `Sección ${i}`, text: `${i === 0 ? '## Tema' : '### Apartado ' + i}\n` + 'a'.repeat(8500) }));
  const props = { sources, selected: new Set(['0']), onChange: vi.fn(), onBlockChange: vi.fn() };
  try {
    act(() => root.render(<MaterialReview {...props} activeBlock={0} />));
    expect(host.textContent).toContain('Sección 0'); expect(host.textContent).toContain('Sección 1');
    expect(host.textContent).not.toContain('Sección 2'); expect(host.textContent).not.toContain('Sección 3');
    expect(host.textContent).toContain('1 de 2 secciones');
    act(() => root.render(<MaterialReview {...props} activeBlock={1} />));
    expect(host.textContent).toContain('Sección 2'); expect(host.textContent).not.toContain('Sección 0');
  } finally { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
