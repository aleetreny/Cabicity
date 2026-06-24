export function fmtEur(v: number): string {
  if (v <= 0) return "Gratis";
  return `${v.toFixed(2).replace(".", ",")} €`;
}

export function fmtEurCashback(v: number): string {
  return `${v.toFixed(2).replace(".", ",")} €`;
}

export function fmtPuntos(p: number): string {
  return `${Math.round(p).toLocaleString("es-ES")} pts`;
}

export function fmtMin(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m - h * 60);
  return r > 0 ? `${h} h ${r} min` : `${h} h`;
}

export function fmtCo2(kg: number): string {
  if (kg < 1) return `${Math.round(kg * 1000)} g CO₂`;
  return `${kg.toFixed(2).replace(".", ",")} kg CO₂`;
}
