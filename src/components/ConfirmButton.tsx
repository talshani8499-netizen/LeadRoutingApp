"use client";

import { useEffect, useRef, useState } from "react";

// A two-step inline confirm for destructive actions. First click arms it
// ("Confirm?"), second click within a few seconds runs onConfirm; clicking away
// or waiting disarms. Keeps dangerous operations (delete source/rule, deactivate
// agent) from firing on a single mis-click, without a heavy modal.
export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = "Confirm?",
  className = "text-xs text-red-500 hover:underline",
}: {
  onConfirm: () => void;
  label: string;
  confirmLabel?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function handleClick() {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 3500);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setArmed(false);
    onConfirm();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={armed ? "text-xs font-semibold text-red-600 hover:underline" : className}
      aria-label={armed ? confirmLabel : label}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
