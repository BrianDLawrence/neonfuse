"use client";

import { useEffect, useRef } from "react";
import { FUSEBOT_STYLES, drawFusebot, type FusebotId } from "@/game/presentation/fusebotArt";

// Head-and-shoulders crop of the character art, in art units (see fusebotArt).
const CROP_UNITS = 92;
const CROP_TOP = -116;

/** Roster portrait drawn from the same art the arena uses, so menus and game always match. */
export function FusebotPortrait({ character, className }: Readonly<{ character: FusebotId; className: string }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const draw = () => {
      const cssSize = canvas.clientWidth || 34;
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(cssSize * ratio);
      canvas.height = Math.round(cssSize * ratio);
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        return;
      }

      const px = canvas.width;
      const unit = px / CROP_UNITS;
      const accent = FUSEBOT_STYLES[character].accent;
      ctx.clearRect(0, 0, px, px);
      const glow = ctx.createRadialGradient(px / 2, px * 0.42, 0, px / 2, px * 0.42, px * 0.7);
      glow.addColorStop(0, `${accent}55`);
      glow.addColorStop(1, "rgba(8, 10, 18, 0)");
      ctx.fillStyle = "#080a12";
      ctx.fillRect(0, 0, px, px);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, px, px);
      ctx.save();
      ctx.translate(px / 2, -CROP_TOP * unit);
      drawFusebot(ctx, character, unit * 100, { look: 0.3 });
      ctx.restore();
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [character]);

  return <canvas aria-hidden="true" className={className} ref={canvasRef} />;
}
