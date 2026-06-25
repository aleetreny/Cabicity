// Genera coordenadas deterministas para una opción de viaje, ancladas en Madrid.
import type { Opcion, Tramo } from "./engine";

export type LngLat = [number, number];

// Origen por defecto de la demo: Calle de Pradillo, 42 (Chamartín).
const SOL: LngLat = [-3.6708, 40.449];

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  const x = s.trim().toLowerCase();
  for (let i = 0; i < x.length; i++) {
    h ^= x.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function kmToDeg(km: number, lat: number): { dLng: number; dLat: number } {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return { dLng, dLat };
}

// Avanza desde un punto a una distancia y bearing (grados), con jitter por km.
function advance(from: LngLat, km: number, bearingDeg: number, seed: number, jitter = 0.4): LngLat[] {
  const points: LngLat[] = [from];
  const steps = Math.max(2, Math.min(40, Math.ceil(km * 2)));
  const segKm = km / steps;
  let cur: LngLat = from;
  let bear = bearingDeg;
  for (let i = 1; i <= steps; i++) {
    // pequeña oscilación de rumbo para que la línea no sea recta
    bear += (((seed + i * 97) % 31) - 15) * (jitter * 0.6);
    const rad = (bear * Math.PI) / 180;
    const { dLng, dLat } = kmToDeg(segKm, cur[1]);
    const next: LngLat = [
      cur[0] + Math.sin(rad) * dLng,
      cur[1] + Math.cos(rad) * dLat,
    ];
    points.push(next);
    cur = next;
  }
  return points;
}

export interface SegmentGeo {
  tramoIdx: number;
  tipo: Tramo["tipo"];
  color: string;
  coords: LngLat[];
}

export interface RouteGeo {
  origen: LngLat;
  destino: LngLat;
  segments: SegmentGeo[];
  stops: LngLat[]; // inicio + transbordos + fin
  flat: LngLat[];  // polyline completa
  stepPositions: LngLat[]; // una posición por paso (acumulado por duración)
}

function lerp(a: LngLat, b: LngLat, f: number): LngLat {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

function colorVisualTramo(t: Tramo): string {
  // Paleta pensada para lectura en mapa: a pie gris punteado, Cabify morado,
  // bus azul, bici naranja y trenes rojos/verdes. En Metro respetamos el color
  // real de la línea cuando viene del grafo GTFS.
  if (t.tipo === "andando") return "#30324f";
  if (t.tipo === "cabify") return "#7145d6";
  if (t.tipo === "bus") return "#0072ce";
  if (t.tipo === "bicimad") return "#f28c28";
  if (t.tipo === "ave") return "#d71920";
  if (t.tipo === "cercanias") return t.color || "#008a5c";
  return t.color || "#0055a4";
}

export function buildRouteGeo(
  op: Opcion,
  destinoTexto: string,
  destinoReal?: LngLat,
  origenReal: LngLat = SOL
): RouteGeo {
  const seed = hashStr(destinoTexto || op.id);
  // Rumbo base 0-360 según destino
  let bearing = seed % 360;
  // Distancia total para interpolar tramos sintéticos a lo largo de la línea
  // real ORIGEN→destino (así los pines de inicio/intermedios/fin son reales).
  const totalKm = op.tramos.reduce((s, t) => s + Math.max(0.1, t.distanciaKm), 0) || 1;
  let cumKm = 0;
  // Distancia interurbana real fuera de Madrid: la dejamos en escala visual ≤ 6 km equivalentes
  // para que el mapa no se aleje a otra ciudad. AVE/Cercanías se representan a escala urbana.
  const escala = (km: number) => {
    if (km <= 8) return km;
    if (km <= 30) return 4 + km * 0.15;
    return 6 + Math.log10(km) * 1.5;
  };

  const segments: SegmentGeo[] = [];
  const stops: LngLat[] = [origenReal];
  const flat: LngLat[] = [origenReal];
  let cursor: LngLat = origenReal;

  op.tramos.forEach((t, i) => {
    let segCoords: LngLat[];
    const km = Math.max(0.1, t.distanciaKm);
    if (t.coords && t.coords.length >= 2) {
      // Trazado REAL del tramo (coordenadas de estaciones GTFS/red real).
      segCoords = t.coords as LngLat[];
    } else if (destinoReal) {
      // Tramo sintético anclado a la línea real ORIGEN→destino: el inicio, los
      // transbordos y el fin caen sobre puntos reales (no aleatorios).
      const a = lerp(origenReal, destinoReal, cumKm / totalKm);
      const b = lerp(origenReal, destinoReal, (cumKm + km) / totalKm);
      segCoords = [a, b];
    } else {
      const escKm = escala(t.distanciaKm);
      // pequeño giro entre tramos para representar transbordo
      if (i > 0) bearing += ((seed >> (i * 3)) % 60) - 30;
      segCoords = advance(cursor, escKm, bearing, seed + i, t.tipo === "andando" ? 0.2 : 0.5);
    }
    cumKm += km;
    segments.push({
      tramoIdx: i,
      tipo: t.tipo,
      color: colorVisualTramo(t),
      coords: segCoords,
    });
    // añadir al flat sin duplicar el primer punto
    for (let k = 1; k < segCoords.length; k++) flat.push(segCoords[k]);
    cursor = segCoords[segCoords.length - 1];
    stops.push(cursor);
  });

  // Posiciones por paso: distribuir por duración acumulada sobre flat
  const totalDur = op.tramos.reduce((s, t) => s + t.duracionMin, 0) || 1;
  let acc = 0;
  const stepPositions: LngLat[] = [];
  op.tramos.forEach((t) => {
    t.pasos.forEach((p) => {
      acc += p.duracionMin;
      const frac = Math.min(1, acc / totalDur);
      const idx = Math.min(flat.length - 1, Math.max(0, Math.round(frac * (flat.length - 1))));
      stepPositions.push(flat[idx]);
    });
  });

  return {
    origen: origenReal,
    destino: cursor,
    segments,
    stops,
    flat,
    stepPositions,
  };
}

// Token PÚBLICO (pk) de Mapbox. Se prefiere la variable de entorno del build;
// si no está definida, este fallback permite que el mapa funcione en el sitio
// estático. Es un token público (va de por sí en el bundle del cliente); el
// secreto (sk) NUNCA debe ir aquí.
const FALLBACK_MAPBOX_PK =
  "pk.eyJ1Ijoiam9hbnNvdXAiLCJhIjoiY21xcWh5MmVkMDMweTJxcXJpc3l6bnQ1ayJ9.h607bIuTu3CC6lfEkpv1-w";

export function getMapboxToken(): string | undefined {
  const env = (import.meta.env as Record<string, string | undefined>) || {};
  const t = env.VITE_MAPBOX_TOKEN;
  return t && t.trim() ? t.trim() : FALLBACK_MAPBOX_PK;
}

// Perfil de Mapbox Directions según el tipo de tramo. Solo enrutamos los modos
// que realmente usan calles/carriles bici/aceras; los modos de raíl (metro,
// cercanías, ave) los dejamos con la polilínea sintética.
function profileFor(tipo: Tramo["tipo"]): "driving-traffic" | "walking" | "cycling" | null {
  if (tipo === "cabify" || tipo === "bus") return "driving-traffic";
  if (tipo === "andando") return "walking";
  if (tipo === "bicimad") return "cycling";
  return null;
}

async function fetchDirections(
  profile: "driving-traffic" | "walking" | "cycling",
  start: LngLat,
  end: LngLat,
  token: string,
  signal?: AbortSignal
): Promise<LngLat[] | null> {
  const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}?geometries=geojson&overview=full&access_token=${token}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: { geometry?: { coordinates?: [number, number][] } }[];
    };
    const c = data.routes?.[0]?.geometry?.coordinates;
    if (!c || c.length < 2) return null;
    return c as LngLat[];
  } catch {
    return null;
  }
}

// Sustituye las polilíneas sintéticas por rutas reales obtenidas de Mapbox
// Directions para cada segmento "ruteable" (cabify, bus, andando, bicimad).
// Reconstruye `flat` y reposiciona `stepPositions` proporcionalmente.
export async function snapRouteGeoToRoads(
  geo: RouteGeo,
  op: Opcion,
  signal?: AbortSignal
): Promise<RouteGeo> {
  const token = getMapboxToken();
  if (!token) return geo;

  const newSegments = await Promise.all(
    geo.segments.map(async (seg) => {
      const profile = profileFor(seg.tipo);
      if (!profile) return seg;
      const start = seg.coords[0];
      const end = seg.coords[seg.coords.length - 1];
      const snapped = await fetchDirections(profile, start, end, token, signal);
      if (!snapped) return seg;
      return { ...seg, coords: snapped };
    })
  );

  // Reconstruir flat y stops a partir de los nuevos segmentos.
  const flat: LngLat[] = [];
  const stops: LngLat[] = [];
  newSegments.forEach((s, i) => {
    if (i === 0) {
      flat.push(s.coords[0]);
      stops.push(s.coords[0]);
    }
    for (let k = 1; k < s.coords.length; k++) flat.push(s.coords[k]);
    stops.push(s.coords[s.coords.length - 1]);
  });

  // Posiciones por paso (mismo criterio que buildRouteGeo).
  const totalDur = op.tramos.reduce((s, t) => s + t.duracionMin, 0) || 1;
  let acc = 0;
  const stepPositions: LngLat[] = [];
  op.tramos.forEach((t) => {
    t.pasos.forEach((p) => {
      acc += p.duracionMin;
      const frac = Math.min(1, acc / totalDur);
      const idx = Math.min(flat.length - 1, Math.max(0, Math.round(frac * (flat.length - 1))));
      stepPositions.push(flat[idx]);
    });
  });

  return {
    origen: flat[0] ?? geo.origen,
    destino: flat[flat.length - 1] ?? geo.destino,
    segments: newSegments,
    stops,
    flat,
    stepPositions,
  };
}

