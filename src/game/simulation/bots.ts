import type { ArenaGrid, GridPoint } from "./arena";
import { isWalkable } from "./arena";
import {
  findSafeEscapeMove,
  getAdjacentTiles,
  isDangerTile,
  manhattanDistance,
  type BombThreat
} from "./danger";
import type { ActorLoadout, PowerupType } from "./powerups";
import { MAX_LOADOUT } from "./powerups";

export type BotId = "bot-a" | "bot-b";

export type BotTraitSet = {
  aggression: number;
  powerupGreed: number;
  blockGreed: number;
  riskTolerance: number;
  patience: number;
};

export type BotProfile = {
  id: string;
  name: string;
  texture: string;
  traits: BotTraitSet;
};

export type BotActorState = {
  id: BotId;
  tile: GridPoint;
  alive: boolean;
  loadout: ActorLoadout;
  profile: BotProfile;
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
};

export const BOT_PROFILES: Record<BotId, BotProfile> = {
  "bot-a": {
    id: "fuse-rush",
    name: "Fuse Rush",
    texture: "bot-fuse-core",
    traits: {
      aggression: 9,
      powerupGreed: 4,
      blockGreed: 8,
      riskTolerance: 7,
      patience: 3
    }
  },
  "bot-b": {
    id: "circuit-shade",
    name: "Circuit Shade",
    texture: "bot-circuit-core",
    traits: {
      aggression: 5,
      powerupGreed: 9,
      blockGreed: 6,
      riskTolerance: 4,
      patience: 8
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
  powerups = []
}: BotTurnContext): BotTurnIntent {
  const blockedWithoutActor = blockedTiles.filter((tile) => !sameTile(tile, actor.tile));

  if (isDangerTile(arena, bombs, actor.tile)) {
    const escapeMove = findSafeEscapeMove({
      arena,
      from: actor.tile,
      bombs,
      blockedTiles: blockedWithoutActor
    });

    return escapeMove ? { type: "move", tile: escapeMove } : { type: "wait" };
  }

  if (bombs.length > 0) {
    const cautiousPowerupMove = findPowerupMove({
      arena,
      actor,
      bombs,
      blockedTiles: blockedWithoutActor,
      powerups,
      minimumScore: 11
    });

    return cautiousPowerupMove ? { type: "move", tile: cautiousPowerupMove } : { type: "wait" };
  }

  const bombIntent = chooseBombIntent({
    arena,
    actor,
    opponentTile,
    bombs,
    activeBombCount,
    blockedTiles: blockedWithoutActor
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
    minimumScore: 7
  });

  if (powerupMove) {
    return { type: "move", tile: powerupMove };
  }

  return choosePressureMove({
    arena,
    from: actor.tile,
    target: opponentTile,
    bombs,
    blockedTiles: blockedWithoutActor
  });
}

function chooseBombIntent({
  arena,
  actor,
  opponentTile,
  bombs,
  activeBombCount,
  blockedTiles
}: {
  arena: ArenaGrid;
  actor: BotActorState;
  opponentTile: GridPoint;
  bombs: BombThreat[];
  activeBombCount: number;
  blockedTiles: GridPoint[];
}): BotTurnIntent | null {
  if (activeBombCount >= actor.loadout.bombs) {
    return null;
  }

  const nearOpponent = manhattanDistance(actor.tile, opponentTile) <= actor.loadout.blast;
  const nearSoftBlock = hasAdjacentSoftBlock(arena, actor.tile);
  const traits = actor.profile.traits;
  const bombScore =
    (nearOpponent ? traits.aggression * 1.4 : 0) + (nearSoftBlock ? traits.blockGreed : 0);
  const threshold = 9 + traits.patience * 0.2 - traits.riskTolerance * 0.25;

  if (bombScore < threshold) {
    return null;
  }

  const escapeMove = findSafeEscapeMove({
    arena,
    from: actor.tile,
    bombs: [
      ...bombs,
      {
        tile: actor.tile,
        range: actor.loadout.blast
      }
    ],
    blockedTiles: [...blockedTiles, actor.tile]
  });

  if (!escapeMove) {
    return null;
  }

  return { type: "plant-bomb", moveTo: escapeMove };
}

function findPowerupMove({
  arena,
  actor,
  bombs,
  blockedTiles,
  powerups,
  minimumScore
}: {
  arena: ArenaGrid;
  actor: BotActorState;
  bombs: BombThreat[];
  blockedTiles: GridPoint[];
  powerups: BotPowerupTarget[];
  minimumScore: number;
}) {
  const candidates = powerups
    .map((powerup) => {
      const step = findFirstStepToward({
        arena,
        from: actor.tile,
        target: powerup.tile,
        bombs,
        blockedTiles
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
  blockedTiles
}: {
  arena: ArenaGrid;
  from: GridPoint;
  target: GridPoint;
  bombs: BombThreat[];
  blockedTiles: GridPoint[];
}): BotTurnIntent {
  const step = findFirstStepToward({
    arena,
    from,
    target,
    bombs,
    blockedTiles
  });

  return step ? { type: "move", tile: step } : { type: "wait" };
}

function findFirstStepToward({
  arena,
  from,
  target,
  bombs,
  blockedTiles
}: {
  arena: ArenaGrid;
  from: GridPoint;
  target: GridPoint;
  bombs: BombThreat[];
  blockedTiles: GridPoint[];
}) {
  const queue: Array<{ tile: GridPoint; path: GridPoint[] }> = [{ tile: from, path: [] }];
  const visited = new Set([tileKey(from)]);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (sameTile(current.tile, target) && current.path.length > 0) {
      return current.path[0];
    }

    getAdjacentTiles(current.tile)
      .filter((neighbor) => {
        const key = tileKey(neighbor);

        return (
          !visited.has(key) &&
          isWalkable(arena, neighbor) &&
          !blockedTiles.some((blocked) => sameTile(blocked, neighbor)) &&
          !isDangerTile(arena, bombs, neighbor)
        );
      })
      .sort((a, b) => manhattanDistance(a, target) - manhattanDistance(b, target))
      .forEach((neighbor) => {
        visited.add(tileKey(neighbor));
        queue.push({
          tile: neighbor,
          path: [...current.path, neighbor]
        });
      });
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
