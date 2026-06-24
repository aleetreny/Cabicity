// Insignia oficial de línea de Metro de Madrid: círculo del color de la línea
// con el número en blanco. Acepta códigos tipo "L1".."L12" o "R" (Ramal).
interface Props {
  linea: string;
  size?: number;
  className?: string;
}

// Colores oficiales del Metro de Madrid (aprox. según manual de identidad).
const METRO_COLORS: Record<string, string> = {
  L1: "#36A8E0",
  L2: "#E2342D",
  L3: "#FFD700",
  L4: "#8B4513",
  L5: "#9ACD32",
  L6: "#9E9E9E",
  L7: "#F39200",
  L8: "#E91E89",
  L9: "#A4308A",
  L10: "#003D7C",
  L11: "#0E833F",
  L12: "#A49A00",
  R: "#FFFFFF",
};

export function MetroLineBadge({ linea, size = 28, className }: Props) {
  const code = (linea || "").toUpperCase().trim();
  const bg = METRO_COLORS[code] ?? "#2760c2";
  // Texto: número sin la "L" (L8 → "8"); para "R" mantenemos "R".
  const label = code === "R" ? "R" : code.replace(/^L/, "");
  const isRamal = code === "R";
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: isRamal ? "#003D7C" : "#FFFFFF",
        display: "grid",
        placeItems: "center",
        fontWeight: 800,
        fontSize: Math.round(size * 0.5),
        lineHeight: 1,
        fontFamily: "system-ui, -apple-system, sans-serif",
        border: isRamal ? "2px solid #003D7C" : "none",
        flexShrink: 0,
      }}
      aria-label={`Línea ${label} del Metro de Madrid`}
    >
      {label}
    </div>
  );
}

// Extrae el código de línea (p.ej. "L8") desde el título del tramo, que tiene
// formato "L8 · Origen → Destino".
export function extractMetroLinea(titulo: string): string | null {
  const m = titulo.match(/^\s*(L\d{1,2}|R)\b/i);
  return m ? m[1].toUpperCase() : null;
}

// ---- Cercanías Renfe Madrid ----
// Colores oficiales aproximados de cada línea.
const CERCANIAS_COLORS: Record<string, string> = {
  "C-1": "#66CCFF",
  "C-2": "#008B30",
  "C-3": "#9E1882",
  "C-4": "#003399",
  "C-5": "#FFD400",
  "C-7": "#E40613",
  "C-8": "#808080",
  "C-9": "#FF6900",
  "C-10": "#B4E1FA",
};

const CERCANIAS_DARK_TEXT = new Set(["C-5", "C-10", "C-1"]);

export function CercaniasLineBadge({ linea, size = 28, className }: { linea: string; size?: number; className?: string }) {
  const code = (linea || "").toUpperCase().trim();
  const bg = CERCANIAS_COLORS[code] ?? "#017251";
  const dark = CERCANIAS_DARK_TEXT.has(code);
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        background: bg,
        color: dark ? "#111" : "#FFFFFF",
        display: "grid",
        placeItems: "center",
        fontWeight: 800,
        fontSize: Math.round(size * 0.38),
        lineHeight: 1,
        fontFamily: "system-ui, -apple-system, sans-serif",
        flexShrink: 0,
        letterSpacing: "-0.02em",
      }}
      aria-label={`Línea ${code} de Cercanías`}
    >
      {code}
    </div>
  );
}

// Extrae "C-4" desde el título "C-4 · Origen → Destino".
export function extractCercaniasLinea(titulo: string): string | null {
  const m = titulo.match(/^\s*(C-\d{1,2})\b/i);
  return m ? m[1].toUpperCase() : null;
}

