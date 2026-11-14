"use client";

import { useEffect, useRef } from "react";

const CONTROLS: ReadonlyArray<{ action: string; keys: string; touch: string }> = [
  { action: "Move", keys: "Arrow keys or WASD", touch: "D-pad" },
  { action: "Plant a bomb", keys: "Space", touch: "Bomb" },
  { action: "Set off a remote bomb", keys: "E or Shift", touch: "Detonate" }
];

const PICKUPS: ReadonlyArray<{ icon: string; name: string; effect: string }> = [
  { icon: "bomb", name: "Bomb", effect: "Carry one more bomb." },
  { icon: "blast", name: "Blast", effect: "Your blasts reach further." },
  { icon: "speed", name: "Speed", effect: "Move faster." }
];

const PERKS: ReadonlyArray<{ icon: string; name: string; effect: string }> = [
  { icon: "shield", name: "Shield", effect: "Survive one blast." },
  { icon: "vision", name: "Vision", effect: "See which tiles are about to blow." },
  { icon: "kick", name: "Kick", effect: "Walk into a bomb to send it sliding." },
  { icon: "remote", name: "Remote", effect: "Your bombs burn slower and blow when you say." }
];

/**
 * The rules on one screen. It opens by itself on a device's first visit, where
 * closing it starts the round over, and from the menu afterwards.
 */
export function HowToPlayScreen({
  firstVisit,
  onClose
}: Readonly<{
  firstVisit: boolean;
  onClose: () => void;
}>) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div className="admin-dialog-backdrop" onClick={onClose}>
      <section
        aria-labelledby="how-to-play-title"
        aria-modal="true"
        className="admin-dialog how-to-play-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="admin-panel">
          <div className="admin-panel-header">
            <h3 id="how-to-play-title">How to play</h3>
            <span>Last fighter standing wins</span>
          </div>

          <div className="how-to-play-body">
            <p className="how-to-play-lead">
              Plant a bomb and get clear. It blows after a short fuse and blasts in four
              directions, breaking blocks and knocking out any fighter it reaches, you
              included.
            </p>

            <section aria-labelledby="how-to-play-controls">
              <h4 id="how-to-play-controls">Controls</h4>
              <dl className="how-to-play-controls">
                {CONTROLS.map((control) => (
                  <div key={control.action}>
                    <dt>{control.action}</dt>
                    <dd>
                      <span className="key-chip">{control.keys}</span>
                      <span className="key-chip how-to-play-touch">Touch: {control.touch}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-labelledby="how-to-play-pickups">
              <h4 id="how-to-play-pickups">Pickups</h4>
              <p className="how-to-play-note">Broken blocks sometimes leave one behind. Walk over it.</p>
              <ul className="how-to-play-list">
                {PICKUPS.map((pickup) => (
                  <li key={pickup.name}>
                    <i aria-hidden="true" className={`stat-icon stat-icon-${pickup.icon}`} />
                    <strong>{pickup.name}</strong>
                    <span>{pickup.effect}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="how-to-play-perks">
              <h4 id="how-to-play-perks">Perks</h4>
              <p className="how-to-play-note">
                Rarer drops. Vision appears in every mode; the rest in Versus, Bot Skirmish
                and Party Brawl.
              </p>
              <ul className="how-to-play-list">
                {PERKS.map((perk) => (
                  <li key={perk.name}>
                    <i aria-hidden="true" className={`stat-icon stat-icon-${perk.icon}`} />
                    <strong>{perk.name}</strong>
                    <span>{perk.effect}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <button className="dialog-close-button" onClick={onClose} ref={closeRef} type="button">
            {firstVisit ? "Start the round" : "Close"}
          </button>
        </div>
      </section>
    </div>
  );
}
