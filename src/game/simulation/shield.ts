/** How long a broken shield keeps protecting its fighter. A guess to tune by play. */
export const SHIELD_GRACE_MS = 1000;

export type ShieldedFighter = {
  alive: boolean;
  /** 1 while the shield is up. */
  shield: number;
  /** Blasts can't hurt the fighter before this time; 0 when there is no grace. */
  guardUntil: number;
};

export type ShieldHitResult = ShieldedFighter & {
  /** True when this hit broke the shield. */
  absorbed: boolean;
};

/**
 * Applies one blast hit at `time`. Pure: the caller decides what counts as a hit.
 * A hit during the grace changes nothing. Otherwise a raised shield breaks and starts
 * the grace, and with no shield the fighter is knocked out. Callers resolve every blast
 * of a tick (a whole chain) as one hit, so one shield covers the chain.
 */
export function resolveShieldHit(fighter: ShieldedFighter, time: number): ShieldHitResult {
  if (!fighter.alive || time < fighter.guardUntil) {
    return { ...fighter, absorbed: false };
  }

  if (fighter.shield >= 1) {
    return { alive: true, shield: 0, guardUntil: time + SHIELD_GRACE_MS, absorbed: true };
  }

  return { ...fighter, alive: false, absorbed: false };
}

/** True while a broken shield's grace still protects the fighter. */
export function isShieldGuarding(fighter: { guardUntil?: number }, time: number): boolean {
  return time < (fighter.guardUntil ?? 0);
}
