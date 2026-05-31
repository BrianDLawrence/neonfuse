"use client";

import { useEffect, useRef } from "react";
import type * as Phaser from "phaser";
import type { BotHudState } from "@/game/createGame";
import type { GameMode } from "@/game/modes";
import type { BotSelection } from "@/game/simulation/bots";
import type { PowerupDropRates } from "@/game/simulation/powerups";

type Loadout = {
  bombs: number;
  blast: number;
  speed: number;
};

type PhaserGameProps = {
  modeCommand: {
    mode: GameMode;
    sequence: number;
  };
  botSelection: BotSelection;
  powerupDropRates: PowerupDropRates;
  onRoundStatusChange?: (status: string) => void;
  onLoadoutChange?: (loadout: Loadout) => void;
  onBotHudChange?: (bots: BotHudState[]) => void;
  onMatchStatsChange?: (stats: { wins: number; losses: number }) => void;
};

export function PhaserGame({
  modeCommand,
  botSelection,
  powerupDropRates,
  onRoundStatusChange,
  onLoadoutChange,
  onBotHudChange,
  onMatchStatsChange
}: PhaserGameProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const initialModeRef = useRef(modeCommand.mode);
  const roundStatusChangeRef = useRef(onRoundStatusChange);
  const loadoutChangeRef = useRef(onLoadoutChange);
  const botHudChangeRef = useRef(onBotHudChange);
  const matchStatsChangeRef = useRef(onMatchStatsChange);
  const powerupDropRatesRef = useRef(powerupDropRates);
  const botSelectionRef = useRef(botSelection);

  useEffect(() => {
    botSelectionRef.current = botSelection;
    powerupDropRatesRef.current = powerupDropRates;
    roundStatusChangeRef.current = onRoundStatusChange;
    loadoutChangeRef.current = onLoadoutChange;
    botHudChangeRef.current = onBotHudChange;
    matchStatsChangeRef.current = onMatchStatsChange;
  }, [
    botSelection,
    onBotHudChange,
    onLoadoutChange,
    onMatchStatsChange,
    onRoundStatusChange,
    powerupDropRates
  ]);

  useEffect(() => {
    if (!gameRef.current) {
      return;
    }

    gameRef.current.registry.set("gameMode", modeCommand.mode);
    gameRef.current.events.emit("mode-change", modeCommand.mode);
  }, [modeCommand.mode, modeCommand.sequence]);

  useEffect(() => {
    let isMounted = true;

    async function mountGame() {
      const { createGame } = await import("@/game/createGame");

      if (!hostRef.current || !isMounted || gameRef.current) {
        return;
      }

      gameRef.current = createGame({
        parent: hostRef.current,
        initialMode: initialModeRef.current,
        events: {
          onRoundStatusChange: (status) => roundStatusChangeRef.current?.(status),
          onLoadoutChange: (loadout) => loadoutChangeRef.current?.(loadout),
          onBotHudChange: (bots) => botHudChangeRef.current?.(bots),
          onMatchStatsChange: (stats) => matchStatsChangeRef.current?.(stats),
          getPowerupDropRates: () => powerupDropRatesRef.current,
          getBotSelection: () => botSelectionRef.current
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
