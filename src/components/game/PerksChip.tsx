import type { SpecialPowerupType } from "@/game/simulation/powerups";

export const PERK_LABELS: Record<SpecialPowerupType, string> = {
  shield: "Shield",
  vision: "Vision",
  kick: "Kick",
  remote: "Remote"
};

/**
 * The perk icons a fighter holds; screen readers get the names instead. The names use
 * <small>, because touch layouts hide every <span> inside a HUD chip.
 */
export function PerkIcons({ perks }: Readonly<{ perks: readonly SpecialPowerupType[] }>) {
  return (
    <>
      {perks.map((perk) => (
        <i aria-hidden="true" className={`stat-icon stat-icon-${perk}`} key={perk} title={PERK_LABELS[perk]} />
      ))}
      <small className="visually-hidden">{perks.length > 0 ? perks.map((perk) => PERK_LABELS[perk]).join(", ") : "None"}</small>
    </>
  );
}

/** One HUD chip for every perk the player holds, so new perks never add chips. */
export function PerksChip({ perks }: Readonly<{ perks: readonly SpecialPowerupType[] }>) {
  return (
    <div aria-live="polite" className="hud-chip hud-chip-perks" data-empty={perks.length === 0}>
      <span>Perks</span>
      <strong>
        <PerkIcons perks={perks} />
        {perks.length === 0 ? <small aria-hidden="true" className="hud-perks-empty">None</small> : null}
      </strong>
    </div>
  );
}
