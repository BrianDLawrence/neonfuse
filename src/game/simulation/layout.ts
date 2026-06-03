// Pure viewport geometry — engine-agnostic, not a game rule. Lives here so it can
// be unit-tested without Phaser. Computes how to scale and center the fixed-size
// arena board inside an arbitrary viewport (and optional reserved control band).

export type BoardFit = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type ReservedSpace = {
  // Total horizontal space to set aside (e.g. side controls in landscape).
  reservedWidth?: number;
  // Total vertical space to set aside (e.g. a bottom control band in portrait).
  reservedHeight?: number;
};

export function computeBoardFit(
  viewportWidth: number,
  viewportHeight: number,
  boardWidth: number,
  boardHeight: number,
  { reservedWidth = 0, reservedHeight = 0 }: ReservedSpace = {}
): BoardFit {
  const availableWidth = Math.max(0, viewportWidth - Math.max(0, reservedWidth));
  const availableHeight = Math.max(0, viewportHeight - Math.max(0, reservedHeight));

  if (boardWidth <= 0 || boardHeight <= 0 || availableWidth <= 0 || availableHeight <= 0) {
    return { zoom: 1, offsetX: 0, offsetY: 0 };
  }

  // Never upscale past native size — keeps the board crisp and desktop unchanged.
  const zoom = Math.min(1, availableWidth / boardWidth, availableHeight / boardHeight);
  const offsetX = (viewportWidth - boardWidth * zoom) / 2;
  const offsetY = (availableHeight - boardHeight * zoom) / 2;

  return { zoom, offsetX, offsetY };
}

export type ReservedBands = {
  reservedTop: number;
  reservedBottom: number;
  reservedSides: number;
};

export type ReservedBandsConfig = {
  // Widths/heights below these thresholds are treated as a phone (must mirror the
  // CSS @media breakpoints in globals.css).
  mobileBreakpoint: number;
  landscapeMaxHeight: number;
  // Space the HUD chrome / touch controls occupy (must mirror the CSS sizes).
  hudTopPx: number;
  touchBandPx: number;
  touchTabletBandPx: number;
  touchSidePx: number;
  touchTabletSidePx: number;
};

export const DEFAULT_RESERVED_BANDS_CONFIG: ReservedBandsConfig = {
  mobileBreakpoint: 760,
  landscapeMaxHeight: 520,
  hudTopPx: 120,
  touchBandPx: 176,
  touchTabletBandPx: 224,
  touchSidePx: 150,
  touchTabletSidePx: 210
};

export type ReservedBandsOptions = {
  isPlayer: boolean;
  touchControlsVisible: boolean;
};

// How much room the HUD + on-screen touch controls need so the camera can keep the
// board fully visible: in portrait a top band for the HUD plus (when playing) a
// bottom band for the D-pad; in landscape, (when playing) side bands for the
// controls. Pure so it can be unit-tested at the real visible viewport sizes.
//
// NOTE: these are fixed values that mirror the CSS in globals.css and will drift if
// the CSS changes. A future hardening would measure the real HUD/control heights
// (getBoundingClientRect) and pass them across the GameEvents boundary.
export function computeReservedBands(
  viewportWidth: number,
  viewportHeight: number,
  { isPlayer, touchControlsVisible }: ReservedBandsOptions,
  config: ReservedBandsConfig = DEFAULT_RESERVED_BANDS_CONFIG
): ReservedBands {
  const isPortrait = viewportHeight >= viewportWidth;

  if (isPortrait && (viewportWidth <= config.mobileBreakpoint || touchControlsVisible)) {
    const touchBandPx =
      viewportWidth <= config.mobileBreakpoint ? config.touchBandPx : config.touchTabletBandPx;

    return {
      reservedTop: config.hudTopPx,
      reservedBottom: isPlayer && touchControlsVisible ? touchBandPx : 0,
      reservedSides: 0
    };
  }

  if (!isPortrait && (viewportHeight <= config.landscapeMaxHeight || touchControlsVisible)) {
    const touchSidePx =
      viewportHeight <= config.landscapeMaxHeight ? config.touchSidePx : config.touchTabletSidePx;

    return {
      reservedTop: 0,
      reservedBottom: 0,
      reservedSides: isPlayer && touchControlsVisible ? touchSidePx * 2 : 0
    };
  }

  return { reservedTop: 0, reservedBottom: 0, reservedSides: 0 };
}
