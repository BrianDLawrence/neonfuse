/**
 * Whether the player asked their OS for reduced motion. Presentation only:
 * effects read it to skip camera shake and soften flashes; gameplay never does.
 */
export function prefersReducedMotion() {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
