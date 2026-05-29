"use client";

import { useEffect, useRef } from "react";
import type * as Phaser from "phaser";

type Loadout = {
  bombs: number;
  blast: number;
};

type PhaserGameProps = {
  onRoundStatusChange?: (status: string) => void;
  onLoadoutChange?: (loadout: Loadout) => void;
};

export function PhaserGame({
  onRoundStatusChange,
  onLoadoutChange
}: PhaserGameProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const roundStatusChangeRef = useRef(onRoundStatusChange);
  const loadoutChangeRef = useRef(onLoadoutChange);

  useEffect(() => {
    roundStatusChangeRef.current = onRoundStatusChange;
    loadoutChangeRef.current = onLoadoutChange;
  }, [onLoadoutChange, onRoundStatusChange]);

  useEffect(() => {
    let isMounted = true;

    async function mountGame() {
      const { createGame } = await import("@/game/createGame");

      if (!hostRef.current || !isMounted || gameRef.current) {
        return;
      }

      gameRef.current = createGame({
        parent: hostRef.current,
        events: {
          onRoundStatusChange: (status) => roundStatusChangeRef.current?.(status),
          onLoadoutChange: (loadout) => loadoutChangeRef.current?.(loadout)
        }
      });
    }

    mountGame();

    return () => {
      isMounted = false;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={hostRef} className="game-canvas-host" />;
}
