"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LegalLinks } from "@/components/legal/LegalPage";

export type ShellMenuItem = {
  label: string;
  onSelect: () => void;
  /** Toggle items (Music) report their state with aria-pressed. */
  pressed?: boolean;
};

/**
 * The HUD's overflow menu: account, settings and legal links that are not
 * needed mid-match. A disclosure (button + panel), so every entry stays a
 * plain button or link reachable with Tab.
 */
export function ShellMenu({
  items,
  onSignOut
}: Readonly<{
  items: ShellMenuItem[];
  onSignOut: () => void;
}>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);

    if (restoreFocus) {
      buttonRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    rootRef.current?.querySelector<HTMLElement>(".shell-menu-item")?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [close, open]);

  return (
    <div className="shell-menu" ref={rootRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="shell-menu-button"
        onClick={() => setOpen((current) => !current)}
        ref={buttonRef}
        type="button"
      >
        <span className="shell-menu-glyph" aria-hidden="true" />
        Menu
      </button>
      <div className="shell-menu-panel" hidden={!open} id={panelId}>
        <div className="shell-menu-group">
          {items.map((item) => (
            <button
              aria-pressed={item.pressed}
              className="shell-menu-item"
              key={item.label}
              onClick={() => {
                close(false);
                item.onSelect();
              }}
              type="button"
            >
              {item.label}
              {item.pressed === undefined ? null : (
                <span className="shell-menu-state">{item.pressed ? "On" : "Off"}</span>
              )}
            </button>
          ))}
        </div>
        <LegalLinks className="shell-menu-group shell-menu-legal" linkClassName="shell-menu-item" />
        <button
          className="shell-menu-item shell-menu-signout"
          onClick={() => {
            close(false);
            onSignOut();
          }}
          type="button"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
