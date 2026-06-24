// Pequeño store en sessionStorage para pasar datos entre rutas sin librería extra.
import type { Opcion, CabifyCategoriaId } from "./engine";

export interface TripState {
  origen: string;
  destino: string;
  criterio: "equilibrado" | "rapido" | "barato" | "ecologico" | "seguro";
  destinoLng?: number;
  destinoLat?: number;
  seleccionada?: Opcion;
  categoriaCabify?: CabifyCategoriaId;
}

const KEY = "cabify-transit-trip";

export function getTrip(): TripState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TripState) : null;
  } catch {
    return null;
  }
}

export function setTrip(patch: Partial<TripState>): TripState {
  const prev = getTrip() ?? { origen: "", destino: "", criterio: "equilibrado" as const };
  const next: TripState = { ...prev, ...patch };
  sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearTrip() {
  sessionStorage.removeItem(KEY);
}
