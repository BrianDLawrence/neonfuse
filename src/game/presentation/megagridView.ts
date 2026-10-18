import * as Phaser from "phaser";

/** Board rectangle in world coordinates. */
export type BoardRect = { left: number; top: number; width: number; height: number };

/** Screen-pixel bands the HUD and touch controls cover (from computeFollowCamera). */
export type ScreenInsets = { top: number; bottom: number; sides: number };

export type MinimapMarker = { x: number; y: number; color: number; isPlayer?: boolean };

export type IndicatorTarget = { x: number; y: number; color: number; urgent?: boolean };

const ARROW_TEXTURE = "megagrid-edge-arrow";
const ARROW_SIZE = 26;
const ARROW_MARGIN_PX = 22;
// Above every arena layer; arrows are presentation-only overlays.
const INDICATOR_DEPTH = 1_000_000;

/** The part of the world the main camera shows that the HUD and touch bands do not cover. */
export function visibleWorldRect(camera: Phaser.Cameras.Scene2D.Camera, insets: ScreenInsets) {
  const view = camera.worldView;
  const zoom = camera.zoom || 1;

  return new Phaser.Geom.Rectangle(
    view.x + insets.sides / 2 / zoom,
    view.y + insets.top / zoom,
    Math.max(1, view.width - insets.sides / zoom),
    Math.max(1, view.height - (insets.top + insets.bottom) / zoom)
  );
}

/**
 * A second, fixed camera that draws the whole board small in a corner, plus a
 * world-space overlay (outline, the main camera's view, actor dots) that only
 * the minimap camera renders.
 */
export class ArenaMinimap {
  readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private board: BoardRect = { left: 0, top: 0, width: 1, height: 1 };

  constructor(private readonly scene: Phaser.Scene) {
    this.camera = scene.cameras.add(0, 0, 1, 1, false, "minimap");
    this.camera.setBackgroundColor("rgba(7, 8, 13, 0.82)");
    this.overlay = scene.add.graphics().setDepth(INDICATOR_DEPTH - 1);
    scene.cameras.main.ignore(this.overlay);
    this.setVisible(false);
  }

  /** Objects the minimap must not draw (e.g. the edge arrows). */
  ignore(objects: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]) {
    this.camera.ignore(objects);
  }

  setVisible(visible: boolean) {
    this.camera.setVisible(visible);
    this.overlay.setVisible(visible);
  }

  /** Places the minimap in the top-right of the play area and zooms it to show the whole board. */
  layout(board: BoardRect, viewportWidth: number, insets: ScreenInsets) {
    this.board = board;
    const width = Math.round(Math.min(132, viewportWidth * 0.3));
    const height = Math.round((width * board.height) / board.width);
    const x = Math.round(viewportWidth - insets.sides / 2 - width - 10);
    const y = Math.round((insets.top > 0 ? insets.top : 56) + 8);

    this.camera.setViewport(x, y, width, height);
    this.camera.setZoom(width / board.width);
    this.camera.centerOn(board.left + board.width / 2, board.top + board.height / 2);
  }

  update(view: Phaser.Geom.Rectangle, markers: MinimapMarker[]) {
    const unit = 1 / this.camera.zoom;
    const { left, top, width, height } = this.board;

    this.overlay.clear();
    this.overlay.lineStyle(2 * unit, 0x22d3ee, 0.7).strokeRect(left, top, width, height);

    const viewLeft = Math.max(left, view.x);
    const viewTop = Math.max(top, view.y);
    const viewRight = Math.min(left + width, view.right);
    const viewBottom = Math.min(top + height, view.bottom);
    this.overlay
      .lineStyle(1.5 * unit, 0xf8fafc, 0.75)
      .strokeRect(viewLeft, viewTop, Math.max(0, viewRight - viewLeft), Math.max(0, viewBottom - viewTop));

    markers.forEach((marker) => {
      this.overlay
        .fillStyle(marker.color, 1)
        .fillCircle(marker.x, marker.y, (marker.isPlayer ? 3.5 : 3) * unit);
    });
  }

  destroy() {
    this.overlay.destroy();
    this.scene.cameras.remove(this.camera);
  }
}

/**
 * Edge arrows for bots (and urgent bombs) outside the visible area. They live
 * in world space and are re-placed every frame on the edge of what the main
 * camera shows, scaled by 1/zoom so they stay a constant size on screen.
 */
export class OffscreenIndicators {
  private readonly arrows: Phaser.GameObjects.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    if (!scene.textures.exists(ARROW_TEXTURE)) {
      const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
      graphics.fillStyle(0xffffff, 1).fillTriangle(ARROW_SIZE, ARROW_SIZE / 2, 4, 3, 4, ARROW_SIZE - 3);
      graphics.lineStyle(2, 0x07080d, 0.9).strokeTriangle(ARROW_SIZE, ARROW_SIZE / 2, 4, 3, 4, ARROW_SIZE - 3);
      graphics.generateTexture(ARROW_TEXTURE, ARROW_SIZE + 2, ARROW_SIZE);
      graphics.destroy();
    }
  }

  /** Every arrow made so far (the minimap ignores these). */
  get objects(): Phaser.GameObjects.Image[] {
    return this.arrows;
  }

  hide() {
    this.arrows.forEach((arrow) => arrow.setVisible(false));
  }

  update(
    camera: Phaser.Cameras.Scene2D.Camera,
    insets: ScreenInsets,
    targets: IndicatorTarget[],
    time: number,
    onCreate: (arrow: Phaser.GameObjects.Image) => void
  ) {
    const view = visibleWorldRect(camera, insets);
    const zoom = camera.zoom || 1;
    const margin = ARROW_MARGIN_PX / zoom;
    const inner = new Phaser.Geom.Rectangle(
      view.x + margin,
      view.y + margin,
      Math.max(1, view.width - margin * 2),
      Math.max(1, view.height - margin * 2)
    );
    const centerX = view.centerX;
    const centerY = view.centerY;
    const offscreen = targets.filter((target) => !view.contains(target.x, target.y));

    while (this.arrows.length < offscreen.length) {
      const arrow = this.scene.add.image(0, 0, ARROW_TEXTURE).setDepth(INDICATOR_DEPTH);
      this.arrows.push(arrow);
      onCreate(arrow);
    }

    this.arrows.forEach((arrow, index) => {
      const target = offscreen[index];

      if (!target) {
        arrow.setVisible(false);
        return;
      }

      // Walk from the view centre toward the target until the inner edge.
      const dx = target.x - centerX;
      const dy = target.y - centerY;
      const scale = Math.min(
        dx === 0 ? Infinity : Math.abs((inner.width / 2) / dx),
        dy === 0 ? Infinity : Math.abs((inner.height / 2) / dy)
      );
      const pulse = target.urgent ? 0.55 + 0.45 * Math.abs(Math.sin(time / 120)) : 1;

      arrow
        .setVisible(true)
        .setPosition(centerX + dx * scale, centerY + dy * scale)
        .setRotation(Math.atan2(dy, dx))
        .setScale((target.urgent ? 0.8 : 1) / zoom)
        .setTint(target.color)
        .setAlpha(pulse);
    });
  }

  destroy() {
    this.arrows.forEach((arrow) => arrow.destroy());
    this.arrows.length = 0;
  }
}
