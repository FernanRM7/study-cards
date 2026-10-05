// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ExamCreator } from "../exam-creator";
import { deckFixture } from "@/lib/__tests__/fixtures";
it('disables creation with zero or one deck and enables it at two without an extra tab stop', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const onOpenChange = vi.fn();
  const props = { disabled: false, onPlay: vi.fn(), onSaved: vi.fn(), open: false, panelVisible: false, instantMotion: true, onOpenChange };
  try {
    for (const count of [0, 1, 2]) {
      const decks = Array.from({ length: count }, (_, i) => deckFixture({ slug: `deck-${i}` }));
      act(() => root.render(<ExamCreator {...props} decks={decks} />));
      const button = host.querySelector('button')!;
      expect(button.disabled).toBe(count < 2);
      expect(button.parentElement?.getAttribute('tabindex')).toBe(count < 2 ? '0' : null);
      act(() => button.click());
      expect(onOpenChange).toHaveBeenCalledTimes(count === 2 ? 1 : 0);
    }
  } finally { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
