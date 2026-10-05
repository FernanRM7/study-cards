"use client";

import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";

/* Adapted from Dynamic island by Bencho (https://bencho.dev/licence), MIT.
   Compact timer only: the expanded layouts, controls and placeholder media
   are deliberately omitted. The quiz owns the activity and timeout action. */

/* shut: one mark at each end of the pill, the middle left dark for the
   camera, as on the real one */
const COMPACT = { w: 150, h: 36, r: 18 };
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (s: number) => `${Math.floor(s / 60)}:${pad(s % 60)}`;

/** Key by attempt and question. Pausing carries the remaining time across
 * exit confirmation; wall-clock elapsed time handles throttled browser tabs. */
export function DynamicIsland({ seconds, active, onTimeout }: {
  seconds: number; active: boolean; onTimeout: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  const remaining = useRef(seconds * 1000);
  const expired = useRef(false);
  const timeout = useRef(onTimeout);
  useEffect(() => { timeout.current = onTimeout; }, [onTimeout]);
  useEffect(() => {
    if (!active || expired.current) return;
    const started = Date.now();
    const base = remaining.current;
    const tick = () => {
      remaining.current = Math.max(0, base - (Date.now() - started));
      setLeft(Math.ceil(remaining.current / 1000));
      if (!remaining.current && !expired.current) {
        expired.current = true;
        timeout.current();
      }
    };
    const interval = window.setInterval(tick, 100);
    return () => {
      remaining.current = Math.max(0, base - (Date.now() - started));
      window.clearInterval(interval);
    };
  }, [active]);
  return <span role="timer" aria-live="off" aria-label={`${Math.ceil(left)} segundos restantes`}
    className="dynamic-island" style={{ width: COMPACT.w, minHeight: COMPACT.h, borderRadius: COMPACT.r }}>
    <Timer size={15} strokeWidth={2.4} aria-hidden="true" />
    <span className="dynamic-island-number">{clock(left)}</span>
  </span>;
}
