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
  onMatchStatsChange?: (stats: { wins: number; losses: number }) => void;
};

export function PhaserGame({
  onRoundStatusChange,
  onLoadoutChange,
  onMatchStatsChange
}: PhaserGameProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const roundStatusChangeRef = useRef(onRoundStatusChange);
  const loadoutChangeRef = useRef(onLoadoutChange);
  const matchStatsChangeRef = useRef(onMatchStatsChange);

  useEffect(() => {
    roundStatusChangeRef.current = onRoundStatusChange;
    loadoutChangeRef.current = onLoadoutChange;
    matchStatsChangeRef.current = onMatchStatsChange;
  }, [onLoadoutChange, onMatchStatsChange, onRoundStatusChange]);

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
          onLoadoutChange: (loadout) => loadoutChangeRef.current?.(loadout),
          onMatchStatsChange: (stats) => matchStatsChangeRef.current?.(stats)
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
