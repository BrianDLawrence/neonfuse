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
