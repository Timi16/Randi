interface MarkProps {
  size?: number;
  /** Tile colour; the cut around the coin is always the tile (or background) colour. */
  tile?: string | null;
  stroke?: string;
  coin?: string;
  /** Background behind a tile-less mark, for the cut. */
  bg?: string;
}

/** The Randi mark: an R whose bowl is a coin (docs/Frontend.md §2.6). */
export function Mark({ size = 32, tile = "#0E0B10", stroke = "#FFFFFF", coin = "#FFD13B", bg }: MarkProps) {
  const cut = tile ?? bg ?? "#FFFFFF";
  const cutWidth = size < 32 ? 8 : 6;
  return (
    <svg width={size} height={size} viewBox={tile ? "0 0 120 120" : "20 20 80 80"} aria-hidden="true" focusable="false">
      {tile && <rect width="120" height="120" rx={size < 32 ? 26 : 30} fill={tile} />}
      <path d="M51 56h20l24 38H75z" fill={stroke} />
      <rect x="25" y="26" width="20" height="68" rx="3" fill={stroke} />
      <circle cx="63" cy="46" r="22" fill={coin} stroke={cut} strokeWidth={cutWidth} />
    </svg>
  );
}

/** Lowercase "randi" with the dot of the i replaced by the coin. */
export function Wordmark({ size = 26, color = "currentColor", coin = "#D0216A" }: { size?: number; color?: string; coin?: string }) {
  return (
    <span
      aria-label="randi"
      role="img"
      style={{ fontWeight: 900, fontStretch: "105%", fontSize: size, letterSpacing: "-0.035em", lineHeight: 1, color, display: "inline-flex", alignItems: "baseline" }}
    >
      <span aria-hidden="true">rand</span>
      <span aria-hidden="true" style={{ position: "relative", display: "inline-block", letterSpacing: 0, lineHeight: 1 }}>
        ı
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "0.075em",
            width: "0.165em",
            height: "0.165em",
            borderRadius: "50%",
            transform: "translateX(-50%)",
            background: coin,
          }}
        />
      </span>
    </span>
  );
}

export function Lockup({ dark = false, size = 26 }: { dark?: boolean; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.38) }}>
      {dark ? <Mark size={Math.round(size * 1.25)} tile="#FFFFFF" stroke="#0E0B10" coin="#D0216A" /> : <Mark size={Math.round(size * 1.3)} />}
      <Wordmark size={size} color={dark ? "#FFFFFF" : "#0E0B10"} coin={dark ? "#FFD13B" : "#D0216A"} />
    </span>
  );
}
