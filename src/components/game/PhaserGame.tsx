"use client";

import { useEffect, useRef } from "react";
import type * as Phaser from "phaser";
import type { BotHudState, TouchInputState } from "@/game/createGame";
import type { GameMode } from "@/game/modes";
import type { Direction } from "@/game/simulation/arena";
import type { BotSelection } from "@/game/simulation/bots";
import type { PowerupDropRates } from "@/game/simulation/powerups";

type Loadout = {
  bombs: number;
  blast: number;
  speed: number;
};

// Imperative handle handed to the React HUD so its touch buttons can drive the
// game without GameShell ever touching a Phaser instance (keeps the boundary).
export type TouchControlsApi = {
  setDirection: (direction: Direction | null) => void;
  setMusicEnabled: (enabled: boolean, volume: number) => void;
  setMusicVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  tapBomb: () => void;
  requestReset: () => void;
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
  onRegisterTouchControls?: (api: TouchControlsApi | null) => void;
};

export function PhaserGame({
  modeCommand,
  botSelection,
  powerupDropRates,
  onRoundStatusChange,
  onLoadoutChange,
  onBotHudChange,
  onMatchStatsChange,
  onRegisterTouchControls
}: PhaserGameProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const initialModeRef = useRef(modeCommand.mode);
  const roundStatusChangeRef = useRef(onRoundStatusChange);
  const loadoutChangeRef = useRef(onLoadoutChange);
  const botHudChangeRef = useRef(onBotHudChange);
  const matchStatsChangeRef = useRef(onMatchStatsChange);
  const registerTouchControlsRef = useRef(onRegisterTouchControls);
  const powerupDropRatesRef = useRef(powerupDropRates);
  const botSelectionRef = useRef(botSelection);

  useEffect(() => {
    botSelectionRef.current = botSelection;
    powerupDropRatesRef.current = powerupDropRates;
    roundStatusChangeRef.current = onRoundStatusChange;
    loadoutChangeRef.current = onLoadoutChange;
    botHudChangeRef.current = onBotHudChange;
    matchStatsChangeRef.current = onMatchStatsChange;
    registerTouchControlsRef.current = onRegisterTouchControls;
  }, [
    botSelection,
    onBotHudChange,
    onLoadoutChange,
    onMatchStatsChange,
    onRegisterTouchControls,
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

      const game = createGame({
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
      gameRef.current = game;

      registerTouchControlsRef.current?.({
        setDirection: (direction) => {
          const touchInput = game.registry.get("touchInput") as TouchInputState | undefined;
          if (touchInput) {
            touchInput.dir = direction;
          }
        },
        setMusicEnabled: (enabled, volume) => {
          const audio = game.registry.get("audio") as {
            setMusicEnabled?: (nextEnabled: boolean, nextVolume: number) => void;
          } | undefined;
          audio?.setMusicEnabled?.(enabled, volume);
        },
        setMusicVolume: (volume) => {
          const audio = game.registry.get("audio") as { setMusicVolume?: (nextVolume: number) => void } | undefined;
          audio?.setMusicVolume?.(volume);
        },
        setSfxVolume: (volume) => {
          const audio = game.registry.get("audio") as { setSfxVolume?: (nextVolume: number) => void } | undefined;
          audio?.setSfxVolume?.(volume);
        },
        tapBomb: () => game.events.emit("touch-bomb"),
        requestReset: () => game.events.emit("touch-reset")
      });
    }

    mountGame();

    return () => {
      isMounted = false;
      registerTouchControlsRef.current?.(null);
      const audio = gameRef.current?.registry.get("audio") as { dispose?: () => Promise<void> } | undefined;
      void audio?.dispose?.();
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // Keep the layout + Phaser canvas sized to the VISIBLE viewport. iOS Safari's
  // 100vh includes the area behind the dynamic toolbars and does not fire a
  // window "resize" when the toolbar shows/hides — only visualViewport does — so
  // we sync an --app-height var (consumed by .app-frame) and force Phaser to
  // re-fit. scale.resize dispatches the RESIZE event ArenaScene.handleResize uses.
  useEffect(() => {
    let frame = 0;

    const syncViewport = () => {
      const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${visibleHeight}px`);

      const game = gameRef.current;
      const host = hostRef.current;
      if (game && host) {
        game.scale.resize(host.clientWidth, visibleHeight);
      }
    };

    const onViewportChange = () => {
      // Coalesce rapid toolbar/scroll events into one re-fit per frame.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncViewport);
    };

    syncViewport();

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", onViewportChange);
    viewport?.addEventListener("scroll", onViewportChange);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);

    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", onViewportChange);
      viewport?.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
    };
  }, []);

  return <div ref={hostRef} className="game-canvas-host" />;
}
