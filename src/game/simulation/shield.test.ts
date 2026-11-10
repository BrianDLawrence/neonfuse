import { describe, expect, it } from "vitest";
import { isShieldGuarding, resolveShieldHit, SHIELD_GRACE_MS } from "./shield";

describe("resolveShieldHit", () => {
  const shielded = { alive: true, shield: 1, guardUntil: 0 };

  it("knocks out a fighter with no shield", () => {
    expect(resolveShieldHit({ alive: true, shield: 0, guardUntil: 0 }, 5000)).toEqual({
      alive: false, shield: 0, guardUntil: 0, absorbed: false
    });
  });

  it("uses up the shield on the first hit and starts the grace", () => {
    expect(resolveShieldHit(shielded, 5000)).toEqual({
      alive: true, shield: 0, guardUntil: 5000 + SHIELD_GRACE_MS, absorbed: true
    });
  });

  it("shrugs off further hits during the grace, then a hit counts again", () => {
    const broken = resolveShieldHit(shielded, 5000);
    expect(resolveShieldHit(broken, 5000 + SHIELD_GRACE_MS - 1)).toEqual({ ...broken, absorbed: false });
    expect(resolveShieldHit(broken, 5000 + SHIELD_GRACE_MS).alive).toBe(false);
  });

  it("keeps a shield picked up during the grace for the next hit", () => {
    const broken = resolveShieldHit(shielded, 5000);
    const rearmed = { ...broken, shield: 1 };
    expect(resolveShieldHit(rearmed, 5500)).toEqual({ ...rearmed, absorbed: false });
    expect(resolveShieldHit(rearmed, 5000 + SHIELD_GRACE_MS)).toMatchObject({ alive: true, shield: 0, absorbed: true });
  });

  it("leaves a fighter who is already out alone", () => {
    const out = { alive: false, shield: 1, guardUntil: 0 };
    expect(resolveShieldHit(out, 5000)).toEqual({ ...out, absorbed: false });
  });

  it("reports the grace window", () => {
    expect(isShieldGuarding({ guardUntil: 6000 }, 5999)).toBe(true);
    expect(isShieldGuarding({ guardUntil: 6000 }, 6000)).toBe(false);
    expect(isShieldGuarding({}, 0)).toBe(false);
  });
});
