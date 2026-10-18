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

export type ArenaBoardFit = BoardFit & ReservedBands;
export type ArenaBoardFitOptions = Pick<ReservedBandsOptions, "touchControlsVisible">;

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

/**
 * Canonical arena fit used by every game mode. Keeping the reserved-band lookup
 * and board scaling together prevents individual Phaser scenes from drifting to
 * different board sizes at the same viewport.
 */
export function computeArenaBoardFit(
  viewportWidth: number,
  viewportHeight: number,
  boardWidth: number,
  boardHeight: number,
  options: ArenaBoardFitOptions
): ArenaBoardFit {
  // Reserve the playable mode's full control footprint for every mode. This is
  // intentionally mode-independent so local, bot-skirmish, and online boards
  // remain the same size when switching modes on the same device.
  const bands = computeReservedBands(viewportWidth, viewportHeight, {
    isPlayer: true,
    touchControlsVisible: options.touchControlsVisible
  });
  const fit = computeBoardFit(viewportWidth, viewportHeight, boardWidth, boardHeight, {
    reservedWidth: bands.reservedSides,
    reservedHeight: bands.reservedTop + bands.reservedBottom
  });

  return { ...fit, ...bands };
}

export type ArenaCameraPlan = ArenaBoardFit & {
  /** "fit" shows the whole board (today's path); "follow" tracks the player. */
  mode: "fit" | "follow";
};

// Desktop HUD footprint (brand + two chip rows on top, mode row + key chips at the
// bottom). Mirrors globals.css like DEFAULT_RESERVED_BANDS_CONFIG does.
export const DESKTOP_HUD_BANDS = { top: 168, bottom: 112 } as const;

export type FollowCameraOptions = ArenaBoardFitOptions & {
  cellSize: number;
  /**
   * Keep the desktop HUD clear of a board that doesn't fit between its rows.
   * ArenaScene opts in only for boards larger than the standard arena, so 13x11
   * framing is unchanged.
   */
  reserveDesktopHud?: boolean;
  /** Below this on-screen tile size the whole board is too small to read. */
  minTilePx?: number;
  /** In follow mode, roughly how many tiles stay visible around the player. */
  minVisibleCols?: number;
  minVisibleRows?: number;
};

/**
 * Picks how the arena camera frames a board. A board that still fits the
 * viewport at a readable tile size keeps the fit-to-screen path, so every 13x11
 * board (and large boards on roomy screens) is unchanged. Otherwise the camera
 * follows the player at a zoom that shows about minVisibleCols x minVisibleRows
 * tiles of the area left between the HUD and touch-control bands.
 */
export function computeFollowCamera(
  viewportWidth: number,
  viewportHeight: number,
  boardWidth: number,
  boardHeight: number,
  {
    cellSize,
    minTilePx = 30,
    minVisibleCols = 11,
    minVisibleRows = 9,
    reserveDesktopHud = false,
    ...fitOptions
  }: FollowCameraOptions
): ArenaCameraPlan {
  const arenaFit = computeArenaBoardFit(viewportWidth, viewportHeight, boardWidth, boardHeight, fitOptions);
  const noBands = arenaFit.reservedTop + arenaFit.reservedBottom + arenaFit.reservedSides === 0;
  const fitsNatively = boardWidth <= viewportWidth && boardHeight <= viewportHeight - DESKTOP_HUD_BANDS.top - DESKTOP_HUD_BANDS.bottom;
  const fit: ArenaBoardFit =
    reserveDesktopHud && noBands && !fitsNatively
      ? {
          ...computeBoardFit(viewportWidth, viewportHeight, boardWidth, boardHeight, {
            reservedHeight: DESKTOP_HUD_BANDS.top + DESKTOP_HUD_BANDS.bottom
          }),
          reservedTop: DESKTOP_HUD_BANDS.top,
          reservedBottom: DESKTOP_HUD_BANDS.bottom,
          reservedSides: 0
        }
      : arenaFit;

  if (fit.zoom * cellSize >= minTilePx) {
    return { ...fit, mode: "fit" };
  }

  const availableWidth = Math.max(1, viewportWidth - fit.reservedSides);
  const availableHeight = Math.max(1, viewportHeight - fit.reservedTop - fit.reservedBottom);
  const followZoom = Math.min(
    1,
    availableWidth / (minVisibleCols * cellSize),
    availableHeight / (minVisibleRows * cellSize)
  );

  return { ...fit, mode: "follow", zoom: Math.max(fit.zoom, followZoom) };
}
