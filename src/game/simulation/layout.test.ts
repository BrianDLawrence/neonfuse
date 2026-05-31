import { describe, expect, it } from "vitest";
import { computeBoardFit } from "./layout";

const BOARD_W = 624;
const BOARD_H = 528;

describe("computeBoardFit", () => {
  it("never upscales when the viewport already fits the board", () => {
    const fit = computeBoardFit(1920, 1080, BOARD_W, BOARD_H);

    expect(fit.zoom).toBe(1);
  });

  it("shrinks to the width-bound ratio on a narrow portrait viewport", () => {
    const fit = computeBoardFit(390, 844, BOARD_W, BOARD_H);

    // Width is the binding constraint here (390/624 < 844/528).
    expect(fit.zoom).toBeCloseTo(390 / BOARD_W, 5);
  });

  it("shrinks to the height-bound ratio on a short landscape viewport", () => {
    const fit = computeBoardFit(844, 390, BOARD_W, BOARD_H);

    // Height is the binding constraint here (390/528 < 844/624).
    expect(fit.zoom).toBeCloseTo(390 / BOARD_H, 5);
  });

  it("reserves vertical space for a control band, reducing available height", () => {
    // Wide enough that width never binds, so the reserved band is what drives zoom.
    const withoutBand = computeBoardFit(700, 700, BOARD_W, BOARD_H);
    const withBand = computeBoardFit(700, 700, BOARD_W, BOARD_H, { reservedHeight: 250 });

    expect(withBand.zoom).toBeLessThan(withoutBand.zoom);
    // 450 available height vs 528 board height -> height becomes the binding ratio.
    expect(withBand.zoom).toBeCloseTo((700 - 250) / BOARD_H, 5);
  });

  it("reserves horizontal space for side controls, reducing available width", () => {
    // Tall enough that height never binds, so the reserved side bands drive zoom.
    const withoutBands = computeBoardFit(900, 900, BOARD_W, BOARD_H);
    const withBands = computeBoardFit(900, 900, BOARD_W, BOARD_H, { reservedWidth: 320 });

    expect(withBands.zoom).toBeLessThan(withoutBands.zoom);
    // 580 available width vs 624 board width -> width becomes the binding ratio.
    expect(withBands.zoom).toBeCloseTo((900 - 320) / BOARD_W, 5);
  });

  it("centers the scaled board within the available area", () => {
    const fit = computeBoardFit(800, 600, BOARD_W, BOARD_H);
    const scaledW = BOARD_W * fit.zoom;
    const scaledH = BOARD_H * fit.zoom;

    expect(fit.offsetX).toBeCloseTo((800 - scaledW) / 2, 5);
    expect(fit.offsetY).toBeCloseTo((600 - scaledH) / 2, 5);
  });

  it("returns a safe default for degenerate inputs", () => {
    for (const fit of [
      computeBoardFit(0, 0, BOARD_W, BOARD_H),
      computeBoardFit(390, 100, BOARD_W, BOARD_H, { reservedHeight: 200 }),
      computeBoardFit(390, 844, 0, 0)
    ]) {
      expect(Number.isFinite(fit.zoom)).toBe(true);
      expect(fit.zoom).toBeGreaterThan(0);
    }
  });
});
