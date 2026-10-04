"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { ShareLinkButton } from "@/components/share-link-button";
import { removeDeck } from "@/lib/deck-store";
import type { Deck } from "@/lib/deck";

// ── The decks on this page ──────────────────────────────────
// The decks written in this browser, each on the same
// line as the status line below them: the title, the link icon that copies
// the deck's share link, and the same Play button. Shown under the headline
// once there is a saved deck to choose from.

interface DeckListProps {
  decks: Deck[];
  /** The built-in deck's slug: its share link is the site itself. */
  builtInSlug: string;
  onPlay: (slug: string) => void;
  onDeleted: (slug: string) => void;
}

export function DeckList({ decks, builtInSlug, onPlay, onDeleted }: DeckListProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Deck | null>(null);
  const [error, setError] = useState("");
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const confirm = () => {
    if (!selected || selected.slug === builtInSlug) return;
    try {
      const index = decks.findIndex(deck => deck.slug === selected.slug);
      const next = decks[index + 1] ?? decks[index - 1];
      removeDeck(selected.slug);
      onDeleted(selected.slug);
      setOpen(false);
      requestAnimationFrame(() => {
        if (next) buttons.current.get(next.slug)?.focus({ preventScroll: true });
        else document.querySelector<HTMLHeadingElement>("main h1")?.focus({ preventScroll: true });
      });
    } catch {
      setError("No se pudo eliminar el mazo. Revisa los permisos de almacenamiento del navegador.");
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
    <ul className="space-y-3">
      {decks.map((deck) => (
        <li
          key={deck.slug}
          className="flex min-h-9 items-center gap-3 text-[14px] leading-snug text-foreground"
        >
          {deck.slug !== builtInSlug && <DialogTrigger render={<Button
            ref={element => { if (element) buttons.current.set(deck.slug, element); else buttons.current.delete(deck.slug); }}
            variant="ghost" size="icon-sm" className="shrink-0"
            aria-label={`Eliminar ${deck.title}`} onClick={() => { setSelected(deck); setError(""); }}>
            <Trash2 size={16} aria-hidden />
          </Button>} />}
          <span className="min-w-0 truncate text-[16px]">{deck.title}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <ShareLinkButton deck={deck} builtIn={deck.slug === builtInSlug} />
            <Button
              variant="primary"
              size="lg"
              className="rounded-full"
              onClick={() => onPlay(deck.slug)}
            >
              Play
            </Button>
          </span>
        </li>
      ))}
    </ul>
    <DialogContent showCloseButton={false} lang="es">
      <DialogHeader>
        <DialogTitle className="break-words">¿Eliminar “{selected?.title}”?</DialogTitle>
        <DialogDescription className="break-words">
          Se eliminará de este navegador.
        </DialogDescription>
      </DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <DialogClose render={<Button variant="ghost">Cancelar</Button>} />
        <Button onClick={confirm}>Eliminar mazo</Button>
      </DialogFooter>
    </DialogContent>
    </Dialog>
  );
}
