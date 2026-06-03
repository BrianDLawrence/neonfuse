import { describe, expect, it } from "vitest";
import { computeBoardFit, computeReservedBands } from "./layout";

const BOARD_W = 624;
const BOARD_H = 528;

// Assert the full board (all rows/cols) fits inside the play area left after the
// reserved bands are removed — i.e. nothing is clipped at the bottom/sides.
function expectBoardFullyVisible(viewportW: number, viewportH: number, isPlayer: boolean) {
  const bands = computeReservedBands(viewportW, viewportH, {
    isPlayer,
    touchControlsVisible: true
  });
  const fit = computeBoardFit(viewportW, viewportH, BOARD_W, BOARD_H, {
    reservedWidth: bands.reservedSides,
    reservedHeight: bands.reservedTop + bands.reservedBottom
  });
  const availableW = viewportW - bands.reservedSides;
  const availableH = viewportH - bands.reservedTop - bands.reservedBottom;

  expect(BOARD_W * fit.zoom).toBeLessThanOrEqual(availableW + 0.001);
  expect(BOARD_H * fit.zoom).toBeLessThanOrEqual(availableH + 0.001);
  expect(fit.zoom).toBeGreaterThan(0);
  return { bands, fit };
}

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

describe("computeReservedBands", () => {
  it("reserves a top HUD band + bottom D-pad band on a portrait phone (playing)", () => {
    expect(
      computeReservedBands(390, 640, {
        isPlayer: true,
        touchControlsVisible: true
      })
    ).toEqual({
      reservedTop: 120,
      reservedBottom: 176,
      reservedSides: 0
    });
  });

  it("reserves only the top HUD band in portrait when watching (bot-skirmish)", () => {
    expect(
      computeReservedBands(390, 640, {
        isPlayer: false,
        touchControlsVisible: true
      })
    ).toEqual({
      reservedTop: 120,
      reservedBottom: 0,
      reservedSides: 0
    });
  });

  it("reserves side bands on a landscape phone (playing)", () => {
    expect(
      computeReservedBands(844, 340, {
        isPlayer: true,
        touchControlsVisible: true
      })
    ).toEqual({
      reservedTop: 0,
      reservedBottom: 0,
      reservedSides: 300
    });
  });

  it("reserves a tablet bottom band on an iPad portrait viewport (playing)", () => {
    expect(
      computeReservedBands(834, 1112, {
        isPlayer: true,
        touchControlsVisible: true
      })
    ).toEqual({
      reservedTop: 120,
      reservedBottom: 224,
      reservedSides: 0
    });
  });

  it("reserves tablet side bands on an iPad landscape viewport (playing)", () => {
    expect(
      computeReservedBands(1112, 834, {
        isPlayer: true,
        touchControlsVisible: true
      })
    ).toEqual({
      reservedTop: 0,
      reservedBottom: 0,
      reservedSides: 420
    });
  });

  it("reserves a tablet bottom band on an iPad Pro portrait viewport (playing)", () => {
    expect(
      computeReservedBands(1024, 1366, {
        isPlayer: true,
        touchControlsVisible: true
      })
    ).toEqual({
      reservedTop: 120,
      reservedBottom: 224,
      reservedSides: 0
    });
  });

  it("reserves tablet side bands on an iPad Pro landscape viewport (playing)", () => {
    expect(
      computeReservedBands(1366, 1024, {
        isPlayer: true,
        touchControlsVisible: true
      })
    ).toEqual({
      reservedTop: 0,
      reservedBottom: 0,
      reservedSides: 420
    });
  });

  it("reserves nothing on desktop when touch controls are not visible", () => {
    expect(
      computeReservedBands(1280, 800, {
        isPlayer: true,
        touchControlsVisible: false
      })
    ).toEqual({
      reservedTop: 0,
      reservedBottom: 0,
      reservedSides: 0
    });
  });

  it("does not reserve player controls in bot-skirmish on touch tablets", () => {
    expect(
      computeReservedBands(1112, 834, {
        isPlayer: false,
        touchControlsVisible: true
      })
    ).toEqual({
      reservedTop: 0,
      reservedBottom: 0,
      reservedSides: 0
    });
  });
});

// Regression for the iOS Safari bug: at the REDUCED visible viewport sizes Safari
// actually exposes (toolbars eat height), the whole board must still be visible and
// the control bands intact. The prior test used the full 390x844 device size and
// missed this.
describe("board fits at reduced iOS visible viewports", () => {
  it("portrait 390x640 — full board visible above the D-pad band", () => {
    expectBoardFullyVisible(390, 640, true);
  });

  it("portrait 390x620 (heavy toolbar, tightest case) — full board still visible", () => {
    expectBoardFullyVisible(390, 620, true);
  });

  it("landscape 844x340 — full board height visible, not cut at the bottom", () => {
    const { bands } = expectBoardFullyVisible(844, 340, true);
    expect(bands.reservedSides).toBe(300);
  });

  it("iPad portrait 834x1112 — full board visible above tablet controls", () => {
    const { bands } = expectBoardFullyVisible(834, 1112, true);
    expect(bands.reservedBottom).toBe(224);
  });

  it("iPad landscape 1112x834 — full board visible between tablet controls", () => {
    const { bands } = expectBoardFullyVisible(1112, 834, true);
    expect(bands.reservedSides).toBe(420);
  });

  it("iPad Pro portrait 1024x1366 — full board visible above tablet controls", () => {
    const { bands } = expectBoardFullyVisible(1024, 1366, true);
    expect(bands.reservedBottom).toBe(224);
  });

  it("iPad Pro landscape 1366x1024 — full board visible between tablet controls", () => {
    const { bands } = expectBoardFullyVisible(1366, 1024, true);
    expect(bands.reservedSides).toBe(420);
  });
});
