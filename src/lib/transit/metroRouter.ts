// Router sobre la red REAL de Metro de Madrid (grafo del GTFS oficial de CRTM).
// Dijkstra con penalización de transbordo. Devuelve tramos reales: líneas,
// estaciones y tiempos correctos, además del trazado real para el mapa.
import { METRO_NODOS, METRO_EDGES, type MetroNodo } from "./metroGraph";

export type LngLat = [number, number];

const NODO = new Map<string, MetroNodo>();
METRO_NODOS.forEach((n) => NODO.set(n.k, n));

interface Arista { to: string; line: string; color: string; secs: number; }
const ADJ = new Map<string, Arista[]>();
for (const [a, b, line, color, secs] of METRO_EDGES) {
  (ADJ.get(a) ?? ADJ.set(a, []).get(a)!).push({ to: b, line, color, secs });
  (ADJ.get(b) ?? ADJ.set(b, []).get(b)!).push({ to: a, line, color, secs });
}

function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR, dLng = (b[0] - a[0]) * toR;
  const la1 = a[1] * toR, la2 = b[1] * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function estacionMasCercana(p: LngLat): { nodo: MetroNodo; distM: number } {
  let best: MetroNodo | null = null, bd = Infinity;
  for (const n of METRO_NODOS) {
    const d = haversineM(p, [n.lng, n.lat]);
    if (d < bd) { bd = d; best = n; }
  }
  return { nodo: best!, distM: bd };
}

const TRANSBORDO_SECS = 240;

export interface MetroTramo {
  linea: string;
  color: string;
  desde: string;
  hasta: string;
  paradas: number;
  secs: number;
  coords: LngLat[];
}

export interface MetroRuta {
  tramos: MetroTramo[];
  totalSecs: number;
  transbordos: number;
  origen: MetroNodo;
  destino: MetroNodo;
  caminarOrigenM: number;
  caminarDestinoM: number;
}

// Dijkstra sobre estados (estación, línea-actual) para penalizar transbordos.
export function rutaMetro(origen: LngLat, destino: LngLat): MetroRuta | null {
  const o = estacionMasCercana(origen);
  const d = estacionMasCercana(destino);
  if (!o.nodo || !d.nodo || o.nodo.k === d.nodo.k) return null;

  const startKey = o.nodo.k;
  const dist = new Map<string, number>(); // "k|line" -> secs
  const prev = new Map<string, { state: string; arista: Arista } | null>();
  const startState = `${startKey}|`;
  dist.set(startState, 0);
  prev.set(startState, null);
  // cola simple
  const pq: { state: string; cost: number }[] = [{ state: startState, cost: 0 }];

  const pop = () => {
    let bi = 0;
    for (let i = 1; i < pq.length; i++) if (pq[i].cost < pq[bi].cost) bi = i;
    return pq.splice(bi, 1)[0];
  };

  let endState: string | null = null;
  while (pq.length) {
    const { state, cost } = pop();
    if ((dist.get(state) ?? Infinity) < cost) continue;
    const [k, line] = state.split("|");
    if (k === d.nodo.k) { endState = state; break; }
    for (const ar of ADJ.get(k) ?? []) {
      const extra = ar.secs + (line && line !== ar.line ? TRANSBORDO_SECS : 0);
      const ns = `${ar.to}|${ar.line}`;
      const nc = cost + extra;
      if (nc < (dist.get(ns) ?? Infinity)) {
        dist.set(ns, nc);
        prev.set(ns, { state, arista: ar });
        pq.push({ state: ns, cost: nc });
      }
    }
  }
  if (!endState) return null;

  // reconstruir aristas
  const aristas: { from: string; arista: Arista }[] = [];
  let cur: string | null = endState;
  while (cur && prev.get(cur)) {
    const p: { state: string; arista: Arista } = prev.get(cur)!;
    const fromK = p.state.split("|")[0];
    aristas.unshift({ from: fromK, arista: p.arista });
    cur = p.state;
  }
  if (!aristas.length) return null;

  // agrupar por línea en tramos
  const tramos: MetroTramo[] = [];
  let transbordos = 0;
  for (const { from, arista } of aristas) {
    const last = tramos[tramos.length - 1];
    const fromN = NODO.get(from)!, toN = NODO.get(arista.to)!;
    if (last && last.linea === arista.line) {
      last.hasta = toN.n;
      last.paradas += 1;
      last.secs += arista.secs;
      last.coords.push([toN.lng, toN.lat]);
    } else {
      if (last) transbordos += 1;
      tramos.push({
        linea: arista.line, color: arista.color,
        desde: fromN.n, hasta: toN.n, paradas: 1, secs: arista.secs,
        coords: [[fromN.lng, fromN.lat], [toN.lng, toN.lat]],
      });
    }
  }
  const totalSecs =
    tramos.reduce((s, t) => s + t.secs, 0) + transbordos * TRANSBORDO_SECS;

  return {
    tramos, totalSecs, transbordos,
    origen: o.nodo, destino: d.nodo,
    caminarOrigenM: Math.round(o.distM), caminarDestinoM: Math.round(d.distM),
  };
}
