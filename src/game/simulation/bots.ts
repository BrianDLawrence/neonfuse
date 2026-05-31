import type { ArenaGrid, GridPoint } from "./arena";
import { isWalkable } from "./arena";
import {
  getAdjacentTiles,
  isDangerTile,
  manhattanDistance,
  type BombThreat
} from "./danger";
import type { ActorLoadout, PowerupType } from "./powerups";
import { MAX_LOADOUT } from "./powerups";

export type BotId = "bot-a" | "bot-b";
export type BotProfileId = "fuse-rush" | "circuit-shade" | "volt-warden" | "glitch-bloom";
export type BotSelection = Record<BotId, BotProfileId>;

export type BotTraitSet = {
  aggression: number;
  powerupGreed: number;
  blockGreed: number;
  riskTolerance: number;
  patience: number;
};

export type BotProfile = {
  id: BotProfileId;
  name: string;
  texture: string;
  accent: string;
  tagline: string;
  summary: string;
  strengths: string[];
  quirk: string;
  llmPersona: string;
  traits: BotTraitSet;
};

export type BotActorState = {
  id: BotId;
  tile: GridPoint;
  alive: boolean;
  loadout: ActorLoadout;
  profile: BotProfile;
  turn: number;
};

export type BotPowerupTarget = {
  tile: GridPoint;
  type: PowerupType;
};

export type BotTurnIntent =
  | { type: "wait" }
  | { type: "move"; tile: GridPoint }
  | { type: "plant-bomb"; moveTo?: GridPoint };

export type BotTurnContext = {
  arena: ArenaGrid;
  actor: BotActorState;
  opponentTile: GridPoint;
  bombs: BombThreat[];
  activeBombCount: number;
  blockedTiles?: GridPoint[];
  powerups?: BotPowerupTarget[];
  decisionSeed?: number;
};

export const BOT_PROFILE_ORDER: BotProfileId[] = [
  "fuse-rush",
  "circuit-shade",
  "volt-warden",
  "glitch-bloom"
];

export const DEFAULT_BOT_SELECTION: BotSelection = {
  "bot-a": "fuse-rush",
  "bot-b": "circuit-shade"
};

export const BOT_PROFILES: Record<BotProfileId, BotProfile> = {
  "fuse-rush": {
    id: "fuse-rush",
    name: "Fuse Rush",
    texture: "bot-fuse-core",
    accent: "#f43f5e",
    tagline: "Aggressive lane breaker",
    summary: "Presses forward, cracks soft blocks early, and looks for fast bomb pressure.",
    strengths: ["Early block clearing", "Direct pressure", "Low hesitation"],
    quirk: "Can overcommit if the arena narrows before an escape opens.",
    llmPersona:
      "A bold, momentum-driven bomber that values tempo, soft-block pressure, and forcing action.",
    traits: {
      aggression: 9,
      powerupGreed: 4,
      blockGreed: 8,
      riskTolerance: 7,
      patience: 3
    }
  },
  "circuit-shade": {
    id: "circuit-shade",
    name: "Circuit Shade",
    texture: "bot-circuit-core",
    accent: "#8b5cf6",
    tagline: "Cautious upgrade hunter",
    summary: "Prioritizes useful powerups, waits out danger, and bombs when the opening is clean.",
    strengths: ["Powerup routing", "Survival bias", "Patient timing"],
    quirk: "Can give up initiative while searching for the perfect upgrade path.",
    llmPersona:
      "A reserved tactical bot that prefers upgrades, safe lanes, and measured counterplay.",
    traits: {
      aggression: 5,
      powerupGreed: 9,
      blockGreed: 6,
      riskTolerance: 4,
      patience: 8
    }
  },
  "volt-warden": {
    id: "volt-warden",
    name: "Volt Warden",
    texture: "bot-volt-core",
    accent: "#22d3ee",
    tagline: "Trap-setting defender",
    summary: "Controls space with careful bombs and tries to turn soft-block pockets into traps.",
    strengths: ["Defensive spacing", "Trap setup", "Stable escapes"],
    quirk: "Sometimes spends extra time shaping the arena before committing to a chase.",
    llmPersona:
      "A disciplined trapper bot that values lane control, defensive spacing, and reliable exits.",
    traits: {
      aggression: 6,
      powerupGreed: 5,
      blockGreed: 9,
      riskTolerance: 3,
      patience: 7
    }
  },
  "glitch-bloom": {
    id: "glitch-bloom",
    name: "Glitch Bloom",
    texture: "bot-glitch-core",
    accent: "#a3e635",
    tagline: "Chaotic power spike",
    summary: "Takes odd routes, chases tempo swings, and is comfortable making messy fights happen.",
    strengths: ["Route variety", "Swingy attacks", "Powerup opportunism"],
    quirk: "Its high-risk choices can create spectacular wins or very loud mistakes.",
    llmPersona:
      "A volatile opportunist bot that embraces messy routes, sudden attacks, and expressive risk.",
    traits: {
      aggression: 7,
      powerupGreed: 8,
      blockGreed: 5,
      riskTolerance: 8,
      patience: 4
    }
  }
};

export function chooseBotTurn({
  arena,
  actor,
  opponentTile,
  bombs,
  activeBombCount,
  blockedTiles = [],
  powerups = [],
  decisionSeed = 0
}: BotTurnContext): BotTurnIntent {
  const blockedWithoutActor = blockedTiles.filter((tile) => !sameTile(tile, actor.tile));

  if (isDangerTile(arena, bombs, actor.tile)) {
    const escapePath = findSafeEscapePath({
      arena,
      from: actor.tile,
      bombs,
      blockedTiles: blockedWithoutActor,
      pathSeed: decisionSeed + actor.turn * 19
    });

    return escapePath ? { type: "move", tile: escapePath[0] } : { type: "wait" };
  }

  if (bombs.length > 0) {
    const cautiousPowerupMove = findPowerupMove({
      arena,
      actor,
      bombs,
      blockedTiles: blockedWithoutActor,
      powerups,
      minimumScore: 11,
      decisionSeed
    });

    return cautiousPowerupMove ? { type: "move", tile: cautiousPowerupMove } : { type: "wait" };
  }

  const preferredPowerupMove = findPowerupMove({
    arena,
    actor,
    bombs,
    blockedTiles: blockedWithoutActor,
    powerups,
    minimumScore: 11,
    decisionSeed
  });

  if (preferredPowerupMove) {
    return { type: "move", tile: preferredPowerupMove };
  }

  const bombIntent = chooseBombIntent({
    arena,
    actor,
    opponentTile,
    bombs,
    activeBombCount,
    blockedTiles: blockedWithoutActor,
    decisionSeed
  });

  if (bombIntent) {
    return bombIntent;
  }

  const powerupMove = findPowerupMove({
    arena,
    actor,
    bombs,
    blockedTiles: blockedWithoutActor,
    powerups,
    minimumScore: 7,
    decisionSeed
  });

  if (powerupMove) {
    return { type: "move", tile: powerupMove };
  }

  return choosePressureMove({
    arena,
    from: actor.tile,
    target: opponentTile,
    bombs,
    blockedTiles: blockedWithoutActor,
    decisionSeed
  });
}

function chooseBombIntent({
  arena,
  actor,
  opponentTile,
  bombs,
  activeBombCount,
  blockedTiles,
  decisionSeed
}: {
  arena: ArenaGrid;
  actor: BotActorState;
  opponentTile: GridPoint;
  bombs: BombThreat[];
  activeBombCount: number;
  blockedTiles: GridPoint[];
  decisionSeed: number;
}): BotTurnIntent | null {
  if (activeBombCount >= actor.loadout.bombs) {
    return null;
  }

  const nearOpponent = manhattanDistance(actor.tile, opponentTile) <= actor.loadout.blast;
  const nearSoftBlock = hasAdjacentSoftBlock(arena, actor.tile);
  const traits = actor.profile.traits;
  const jitter = seededJitter(actor.tile, actor.turn + decisionSeed);
  const bombScore =
    (nearOpponent ? traits.aggression * 1.35 : 0) +
    (nearSoftBlock ? traits.blockGreed * 1.25 : 0) +
    jitter * 3;
  const threshold = 8.4 + traits.patience * 0.16 - traits.riskTolerance * 0.32;

  if (bombScore < threshold) {
    return null;
  }

  const escapePath = findSafeEscapePath({
    arena,
    from: actor.tile,
    bombs: [
      ...bombs,
      {
        tile: actor.tile,
        range: actor.loadout.blast
      }
    ],
    blockedTiles: [...blockedTiles, actor.tile],
    pathSeed: decisionSeed + actor.turn * 23
  });

  if (!escapePath) {
    return null;
  }

  return { type: "plant-bomb", moveTo: escapePath[0] };
}

function findSafeEscapePath({
  arena,
  from,
  bombs,
  blockedTiles,
  pathSeed,
  maxDepth = 6
}: {
  arena: ArenaGrid;
  from: GridPoint;
  bombs: BombThreat[];
  blockedTiles: GridPoint[];
  pathSeed?: number;
  maxDepth?: number;
}) {
  const queue: Array<{ tile: GridPoint; path: GridPoint[] }> = [{ tile: from, path: [] }];
  const visited = new Set([tileKey(from)]);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.path.length > 0 && !isDangerTile(arena, bombs, current.tile)) {
      return current.path;
    }

    if (current.path.length >= maxDepth) {
      continue;
    }

    sortTilesByJitter(getAdjacentTiles(current.tile), pathSeed).forEach((neighbor) => {
      const key = tileKey(neighbor);

      if (
        visited.has(key) ||
        !isWalkable(arena, neighbor) ||
        blockedTiles.some((blocked) => sameTile(blocked, neighbor))
      ) {
        return;
      }

      visited.add(key);
      queue.push({
        tile: neighbor,
        path: [...current.path, neighbor]
      });
    });
  }

  return null;
}

function findPowerupMove({
  arena,
  actor,
  bombs,
  blockedTiles,
  powerups,
  minimumScore,
  decisionSeed
}: {
  arena: ArenaGrid;
  actor: BotActorState;
  bombs: BombThreat[];
  blockedTiles: GridPoint[];
  powerups: BotPowerupTarget[];
  minimumScore: number;
  decisionSeed: number;
}) {
  const candidates = powerups
    .map((powerup) => {
      const step = findFirstStepToward({
        arena,
        from: actor.tile,
        target: powerup.tile,
        bombs,
        blockedTiles,
        pathSeed: decisionSeed + actor.turn * 29
      });

      if (!step) {
        return null;
      }

      const distance = manhattanDistance(actor.tile, powerup.tile);
      const need = getPowerupNeed(actor.loadout, powerup.type);
      const score = actor.profile.traits.powerupGreed + need * 4 - distance;

      return {
        score,
        step
      };
    })
    .filter((candidate): candidate is { score: number; step: GridPoint } => Boolean(candidate))
    .filter((candidate) => candidate.score >= minimumScore);

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((a, b) => b.score - a.score)[0].step;
}

function choosePressureMove({
  arena,
  from,
  target,
  bombs,
  blockedTiles,
  decisionSeed
}: {
  arena: ArenaGrid;
  from: GridPoint;
  target: GridPoint;
  bombs: BombThreat[];
  blockedTiles: GridPoint[];
  decisionSeed: number;
}): BotTurnIntent {
  const step = findFirstStepToward({
    arena,
    from,
    target,
    bombs,
    blockedTiles,
    acceptNearest: true,
    pathSeed: decisionSeed
  });

  return step ? { type: "move", tile: step } : { type: "wait" };
}

function findFirstStepToward({
  arena,
  from,
  target,
  bombs,
  blockedTiles,
  acceptNearest = false,
  pathSeed
}: {
  arena: ArenaGrid;
  from: GridPoint;
  target: GridPoint;
  bombs: BombThreat[];
  blockedTiles: GridPoint[];
  acceptNearest?: boolean;
  pathSeed?: number;
}) {
  const queue: Array<{ tile: GridPoint; path: GridPoint[] }> = [{ tile: from, path: [] }];
  const visited = new Set([tileKey(from)]);
  let nearest: { distance: number; path: GridPoint[] } | null = null;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDistance = manhattanDistance(current.tile, target);

    if (sameTile(current.tile, target) && current.path.length > 0) {
      return current.path[0];
    }

    if (
      acceptNearest &&
      current.path.length > 0 &&
      (!nearest || currentDistance < nearest.distance)
    ) {
      nearest = {
        distance: currentDistance,
        path: current.path
      };
    }

    sortTilesByDistance(getAdjacentTiles(current.tile), target, pathSeed)
      .filter((neighbor) => {
        const key = tileKey(neighbor);

        return (
          !visited.has(key) &&
          isWalkable(arena, neighbor) &&
          !blockedTiles.some((blocked) => sameTile(blocked, neighbor)) &&
          !isDangerTile(arena, bombs, neighbor)
        );
      })
      .forEach((neighbor) => {
        visited.add(tileKey(neighbor));
        queue.push({
          tile: neighbor,
          path: [...current.path, neighbor]
        });
      });
  }

  if (acceptNearest && nearest) {
    return nearest.path[0];
  }

  return null;
}

function hasAdjacentSoftBlock(arena: ArenaGrid, tile: GridPoint) {
  return getAdjacentTiles(tile).some((neighbor) => arena[neighbor.y]?.[neighbor.x] === "soft");
}

function getPowerupNeed(loadout: ActorLoadout, powerup: PowerupType) {
  if (powerup === "bomb") {
    return loadout.bombs >= MAX_LOADOUT.bombs ? 0 : 1;
  }

  if (powerup === "blast") {
    return loadout.blast >= MAX_LOADOUT.blast ? 0 : 1;
  }

  return loadout.speed >= MAX_LOADOUT.speed ? 0 : 1;
}

function sameTile(a: GridPoint, b: GridPoint) {
  return a.x === b.x && a.y === b.y;
}

function tileKey(tile: GridPoint) {
  return `${tile.x}:${tile.y}`;
}

function sortTilesByDistance(tiles: GridPoint[], target: GridPoint, seed?: number) {
  return [...tiles].sort((a, b) => {
    const aScore = manhattanDistance(a, target) + seededTileNoise(a, seed) * 0.45;
    const bScore = manhattanDistance(b, target) + seededTileNoise(b, seed) * 0.45;

    return aScore - bScore;
  });
}

function sortTilesByJitter(tiles: GridPoint[], seed?: number) {
  return [...tiles].sort((a, b) => seededTileNoise(a, seed) - seededTileNoise(b, seed));
}

function seededTileNoise(tile: GridPoint, seed = 0) {
  if (seed === 0) {
    return 0;
  }

  return seededJitter(tile, seed);
}

function seededJitter(tile: GridPoint, seed: number) {
  const value = tile.x * 31 + tile.y * 17 + seed * 13;
  return ((value % 100) + 100) % 100 / 100;
}
