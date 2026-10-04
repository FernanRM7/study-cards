"use client";

import { createElement, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Deck } from "@/lib/deck";
import { useIcon } from "@/lib/icon-context";
import { shareDeck } from "@/lib/share";
import { spring } from "@/lib/springs";

// The link icon next to a deck's Play button: one press copies the deck's
// share link (/d/<id>). A deck without a link yet gets one first — usually
// already made in the background while it was played. The icon turns into
// a check for a beat once copied, a cross if the clipboard or the store
// refused. The built-in deck's link is the site itself.

/** How long the acknowledgement stays: eight slow-tier beats. */
const HOLD_MS = spring.slow.duration * 8 * 1000;

interface ShareLinkButtonProps {
  deck: Deck;
  builtIn?: boolean;
}

export function ShareLinkButton({ deck, builtIn = false }: ShareLinkButtonProps) {
  const LinkIcon = useIcon("link");
  const CheckIcon = useIcon("check");
  const XIcon = useIcon("x");
  const [error, setError] = useState("");
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      const url = builtIn ? `${window.location.origin}/` : await shareDeck(deck);
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch (cause) {
      setError(cause instanceof Error && /400|too large|demasiado grande/i.test(cause.message)
        ? "El mazo es demasiado grande para compartirlo."
        : cause instanceof Error && /set up|configured|disponible/i.test(cause.message)
          ? "Compartir no está disponible en este sitio."
          : "No se pudo compartir el mazo. Inténtalo de nuevo.");
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), HOLD_MS);
  };

  const label =
    state === "copied" ? "Enlace copiado" : state === "failed" ? error : "Compartir mazo";

  return (
    <span className="relative inline-flex">
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0 rounded-full"
      onClick={copy}
      aria-label={label}
      title={label}
      aria-live="polite"
    >
      {/* Icon-only buttons take the glyph as their child. createElement
          rather than JSX: the icon components come from a hook, which the
          "no components created during render" lint mistakes for a new
          component each render. */}
      {createElement(state === "copied" ? CheckIcon : state === "failed" ? XIcon : LinkIcon, { size: 16 })}
    </Button>
    {state === "failed" && <span role="alert" className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-border bg-background p-3 text-xs text-destructive shadow-lg">{error}</span>}
    </span>
  );
}
