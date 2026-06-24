// Router de Cercanías Madrid sobre la red real (Dijkstra con penalización de
// transbordo). Devuelve tramos con coordenadas reales, línea y color oficiales.
import {
  CERCANIAS_NODOS,
  CERCANIAS_EDGES,
  CERCANIAS_COLORS,
  type CercaniasNodo,
} from "./cercaniasGraph";

export type LngLat = [number, number];

const TRANSBORDO_SECS = 240;

const NODO = new Map<string, CercaniasNodo>();
CERCANIAS_NODOS.forEach((n) => NODO.set(n.k, n));

interface Arista { to: string; secs: number; }
const ADJ = new Map<string, Arista[]>();
CERCANIAS_EDGES.forEach(([a, b, secs]) => {
  if (!ADJ.has(a)) ADJ.set(a, []);
  if (!ADJ.has(b)) ADJ.set(b, []);
  ADJ.get(a)!.push({ to: b, secs });
  ADJ.get(b)!.push({ to: a, secs });
});

function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180, la2 = (b[1] * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function estacionMasCercana(p: LngLat): { nodo: CercaniasNodo; distM: number } {
  let best = CERCANIAS_NODOS[0], bestD = Infinity;
  for (const n of CERCANIAS_NODOS) {
    const d = haversineM(p, [n.lng, n.lat]);
    if (d < bestD) { bestD = d; best = n; }
  }
  return { nodo: best, distM: bestD };
}

// Línea común entre dos estaciones contiguas (para etiquetar y colorear el tramo).
function lineaComun(a: string, b: string): string {
  const na = NODO.get(a)!, nb = NODO.get(b)!;
  const comun = na.l.find((x) => nb.l.includes(x));
  return comun ? `C${comun}` : "C1";
}

export interface CercaniasTramo {
  linea: string;
  color: string;
  desde: string;
  hasta: string;
  paradas: number;
  secs: number;
  coords: LngLat[];
}

export interface CercaniasRuta {
  tramos: CercaniasTramo[];
  totalSecs: number;
  transbordos: number;
  origen: CercaniasNodo;
  destino: CercaniasNodo;
  caminarOrigenM: number;
  caminarDestinoM: number;
}

export function rutaCercanias(origen: LngLat, destino: LngLat): CercaniasRuta | null {
  const o = estacionMasCercana(origen);
  const d = estacionMasCercana(destino);
  if (!o.nodo || !d.nodo || o.nodo.k === d.nodo.k) return null;

  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  dist.set(o.nodo.k, 0);
  prev.set(o.nodo.k, null);
  const pq: { k: string; cost: number }[] = [{ k: o.nodo.k, cost: 0 }];

  const pop = () => {
    let bi = 0;
    for (let i = 1; i < pq.length; i++) if (pq[i].cost < pq[bi].cost) bi = i;
    return pq.splice(bi, 1)[0];
  };

  while (pq.length) {
    const { k, cost } = pop();
    if ((dist.get(k) ?? Infinity) < cost) continue;
    if (k === d.nodo.k) break;
    for (const ar of ADJ.get(k) ?? []) {
      const nc = cost + ar.secs;
      if (nc < (dist.get(ar.to) ?? Infinity)) {
        dist.set(ar.to, nc);
        prev.set(ar.to, k);
        pq.push({ k: ar.to, cost: nc });
      }
    }
  }
  if (!prev.has(d.nodo.k)) return null;

  // reconstruir camino de nodos
  const path: string[] = [];
  let cur: string | null = d.nodo.k;
  while (cur) { path.unshift(cur); cur = prev.get(cur) ?? null; }
  if (path.length < 2) return null;

  // agrupar por línea en tramos
  const tramos: CercaniasTramo[] = [];
  let transbordos = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const linea = lineaComun(a, b);
    const na = NODO.get(a)!, nb = NODO.get(b)!;
    const secs = (ADJ.get(a) ?? []).find((x) => x.to === b)?.secs ?? 300;
    const last = tramos[tramos.length - 1];
    if (last && last.linea === linea) {
      last.hasta = nb.n;
      last.paradas += 1;
      last.secs += secs;
      last.coords.push([nb.lng, nb.lat]);
    } else {
      if (last) transbordos += 1;
      tramos.push({
        linea,
        color: CERCANIAS_COLORS[linea] ?? "#017251",
        desde: na.n, hasta: nb.n, paradas: 1, secs,
        coords: [[na.lng, na.lat], [nb.lng, nb.lat]],
      });
    }
  }

  const totalSecs = tramos.reduce((s, t) => s + t.secs, 0) + transbordos * TRANSBORDO_SECS;
  return {
    tramos, totalSecs, transbordos,
    origen: o.nodo, destino: d.nodo,
    caminarOrigenM: Math.round(o.distM), caminarDestinoM: Math.round(d.distM),
  };
}
