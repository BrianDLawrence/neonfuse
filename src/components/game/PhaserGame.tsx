"use client";

import { useEffect, useRef } from "react";
import type * as Phaser from "phaser";
import type { PowerupDropRates } from "@/game/simulation/powerups";

type Loadout = {
  bombs: number;
  blast: number;
  speed: number;
};

type PhaserGameProps = {
  powerupDropRates: PowerupDropRates;
  onRoundStatusChange?: (status: string) => void;
  onLoadoutChange?: (loadout: Loadout) => void;
  onMatchStatsChange?: (stats: { wins: number; losses: number }) => void;
};

export function PhaserGame({
  powerupDropRates,
  onRoundStatusChange,
  onLoadoutChange,
  onMatchStatsChange
}: PhaserGameProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const roundStatusChangeRef = useRef(onRoundStatusChange);
  const loadoutChangeRef = useRef(onLoadoutChange);
  const matchStatsChangeRef = useRef(onMatchStatsChange);
  const powerupDropRatesRef = useRef(powerupDropRates);

  useEffect(() => {
    powerupDropRatesRef.current = powerupDropRates;
    roundStatusChangeRef.current = onRoundStatusChange;
    loadoutChangeRef.current = onLoadoutChange;
    matchStatsChangeRef.current = onMatchStatsChange;
  }, [onLoadoutChange, onMatchStatsChange, onRoundStatusChange, powerupDropRates]);

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
          onMatchStatsChange: (stats) => matchStatsChangeRef.current?.(stats),
          getPowerupDropRates: () => powerupDropRatesRef.current
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
