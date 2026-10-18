import { describe, expect, it } from "vitest";
import { resolveRoundWinner } from "./round";

const player = (alive: boolean) => ({ id: "player" as const, alive });
const botA = (alive: boolean) => ({ id: "bot-a" as const, alive });
const botB = (alive: boolean) => ({ id: "bot-b" as const, alive });

describe("resolveRoundWinner with a player", () => {
  it("keeps a 1v1 going while both stand", () => {
    expect(resolveRoundWinner([player(true), botA(true)])).toBeNull();
  });

  it("matches the 1v1 rules: KO, loss, and a shared blast draw", () => {
    expect(resolveRoundWinner([player(true), botA(false)])).toBe("player");
    expect(resolveRoundWinner([player(false), botA(true)])).toBe("bot");
    expect(resolveRoundWinner([player(false), botA(false)])).toBe("draw");
  });

  it("keeps a gauntlet going until every bot is down", () => {
    expect(resolveRoundWinner([player(true), botA(false), botB(true)])).toBeNull();
    expect(resolveRoundWinner([player(true), botA(false), botB(false)])).toBe("player");
  });

  it("counts the player going down while one gauntlet bot stands as a loss", () => {
    expect(resolveRoundWinner([player(false), botA(false), botB(true)])).toBe("bot");
  });

  it("calls a draw when the player and the last bots go down together", () => {
    expect(resolveRoundWinner([player(false), botA(false), botB(false)])).toBe("draw");
  });
});

describe("resolveRoundWinner without a player", () => {
  it("names the last bot standing in a skirmish", () => {
    expect(resolveRoundWinner([botA(true), botB(true)])).toBeNull();
    expect(resolveRoundWinner([botA(false), botB(true)])).toBe("bot-b");
    expect(resolveRoundWinner([botA(false), botB(false)])).toBe("draw");
  });
});
