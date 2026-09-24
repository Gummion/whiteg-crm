import { ImageResponse } from "next/og";

/** App icon (G mark on black) rendered as PNG at build time — no binary files in the repo. */
export function brandIcon(size: number, radius = 0) {
  const s = size * 0.56 / 150; // mark scale inside the square
  const ox = (size - 150 * s) / 2, oy = (size - 144 * s) / 2;
  const box = (x: number, y: number, w: number, h: number, bg: string) => (
    <div style={{ position: "absolute", left: ox + x * s, top: oy + y * s, width: w * s, height: h * s, background: bg }} />
  );
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: "#0a0a0b", display: "flex", position: "relative", borderRadius: radius }}>
        {box(0, 0, 150, 36, "#fff")}
        {box(0, 0, 36, 144, "#fff")}
        {box(0, 112, 100, 32, "#fff")}
        {box(114, 72, 36, 72, "#fff")}
        {box(76, 72, 38, 28, "#ED9C35")}
      </div>
    ),
    { width: size, height: size }
  );
}
