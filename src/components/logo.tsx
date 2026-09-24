/** Vector White G logo (same geometry as the PDF logo) — crisp at any size, no image file needed. */
export function GMark({ size = 24, color = "currentColor", accent = "#ED9C35", className }: { size?: number; color?: string; accent?: string; className?: string }) {
  return (
    <svg width={size * 1.04} height={size} viewBox="0 0 150 144" className={className} aria-hidden>
      <rect x="0" y="0" width="150" height="36" fill={color} />
      <rect x="0" y="0" width="36" height="144" fill={color} />
      <rect x="0" y="112" width="100" height="32" fill={color} />
      <rect x="114" y="100" width="36" height="44" fill={color} />
      <polygon points="150,70 150,100 76,100" fill={color} />
      <polygon points="76,72 148,72 76,99" fill={accent} />
    </svg>
  );
}

export function Logo({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span className={"inline-flex items-end text-white " + (className ?? "")} aria-label="White G">
      <span style={{ fontSize: size, lineHeight: 1, letterSpacing: size * 0.24, fontWeight: 500, marginRight: size * 0.1 }}>WHITE</span>
      <GMark size={size * 0.98} className="mb-[0.16em]" />
    </span>
  );
}
