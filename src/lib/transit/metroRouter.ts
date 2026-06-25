// Router sobre la red REAL de Metro de Madrid (grafo del GTFS oficial de CRTM).
// Dijkstra con penalización fuerte de transbordo. Devuelve tramos reales:
// líneas, estaciones y tiempos, además del trazado real para el mapa.
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

function candidatosEstacion(p: LngLat, maxM: number, limit = 10) {
  return METRO_NODOS
    .map((n) => ({ nodo: n, distM: haversineM(p, [n.lng, n.lat]) }))
    .sort((a, b) => a.distM - b.distM)
    .filter((x) => x.distM <= maxM)
    .slice(0, limit);
}

const TRANSBORDO_SECS = 540;
const MAX_TRANSBORDOS = 2;
const WALK_SPEED_MPS = 5000 / 3600;

export interface MetroTramo {
  linea: string;
  color: string;
  desde: string;
  desdeKey: string;
  hasta: string;
  hastaKey: string;
  nextKey: string;
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

// Arrancamos y terminamos desde varias estaciones candidatas, no solo desde la
// boca más cercana. Eso permite escoger una ruta con 1-2 líneas y algo de
// caminata frente a una ruta "óptima" de segundos que encadena transbordos.
export function rutaMetro(origen: LngLat, destino: LngLat): MetroRuta | null {
  const origenes = candidatosEstacion(origen, 1800, 10);
  const destinos = candidatosEstacion(destino, 2200, 14);
  if (!origenes.length || !destinos.length) return null;

  const targetDist = new Map(destinos.map((x) => [x.nodo.k, x.distM]));
  const targetSet = new Set(targetDist.keys());
  const dist = new Map<string, number>(); // "k|line|transfers" -> secs
  const prev = new Map<string, { state: string; arista: Arista } | null>();
  const originByState = new Map<string, { nodo: MetroNodo; distM: number }>();
  const pq: { state: string; cost: number }[] = [];

  origenes.forEach(({ nodo, distM }) => {
    const state = `${nodo.k}||0`;
    const cost = Math.round(distM / WALK_SPEED_MPS);
    if (cost < (dist.get(state) ?? Infinity)) {
      dist.set(state, cost);
      prev.set(state, null);
      originByState.set(state, { nodo, distM });
      pq.push({ state, cost });
    }
  });

  const pop = () => {
    let bi = 0;
    for (let i = 1; i < pq.length; i++) if (pq[i].cost < pq[bi].cost) bi = i;
    return pq.splice(bi, 1)[0];
  };

  let endState: string | null = null;
  let endCost = Infinity;
  while (pq.length) {
    const { state, cost } = pop();
    if ((dist.get(state) ?? Infinity) < cost) continue;
    const [k, line, transferText] = state.split("|");
    const transferCount = Number(transferText || "0");
    if (targetSet.has(k)) {
      const total = cost + Math.round((targetDist.get(k) ?? 0) / WALK_SPEED_MPS);
      if (total < endCost) {
        endCost = total;
        endState = state;
      }
      continue;
    }
    for (const ar of ADJ.get(k) ?? []) {
      const cambiaLinea = Boolean(line && line !== ar.line);
      const nextTransfers = transferCount + (cambiaLinea ? 1 : 0);
      if (nextTransfers > MAX_TRANSBORDOS) continue;
      const extra = ar.secs + (cambiaLinea ? TRANSBORDO_SECS : 0);
      const ns = `${ar.to}|${ar.line}|${nextTransfers}`;
      const nc = cost + extra;
      if (nc < (dist.get(ns) ?? Infinity)) {
        dist.set(ns, nc);
        prev.set(ns, { state, arista: ar });
        const originInfo = originByState.get(state);
        if (originInfo) originByState.set(ns, originInfo);
        pq.push({ state: ns, cost: nc });
      }
    }
  }
  if (!endState) return null;

  const aristas: { from: string; arista: Arista }[] = [];
  let cur: string | null = endState;
  while (cur && prev.get(cur)) {
    const p: { state: string; arista: Arista } = prev.get(cur)!;
    const fromK = p.state.split("|")[0];
    aristas.unshift({ from: fromK, arista: p.arista });
    cur = p.state;
  }
  if (!aristas.length) return null;

  const tramos: MetroTramo[] = [];
  let transbordos = 0;
  for (const { from, arista } of aristas) {
    const last = tramos[tramos.length - 1];
    const fromN = NODO.get(from)!, toN = NODO.get(arista.to)!;
    if (last && last.linea === arista.line) {
      last.hasta = toN.n;
      last.hastaKey = toN.k;
      last.paradas += 1;
      last.secs += arista.secs;
      last.coords.push([toN.lng, toN.lat]);
    } else {
      if (last) transbordos += 1;
      tramos.push({
        linea: arista.line, color: arista.color,
        desde: fromN.n, desdeKey: fromN.k,
        hasta: toN.n, hastaKey: toN.k, nextKey: toN.k,
        paradas: 1, secs: arista.secs,
        coords: [[fromN.lng, fromN.lat], [toN.lng, toN.lat]],
      });
    }
  }

  const [destinoKey] = endState.split("|");
  const origenInfo = originByState.get(endState);
  const destinoNodo = NODO.get(destinoKey)!;
  const caminarDestinoM = targetDist.get(destinoKey) ?? haversineM(destino, [destinoNodo.lng, destinoNodo.lat]);
  const totalSecs =
    Number.isFinite(endCost)
      ? endCost
      : tramos.reduce((s, t) => s + t.secs, 0) + transbordos * TRANSBORDO_SECS;

  return {
    tramos, totalSecs, transbordos,
    origen: origenInfo?.nodo ?? NODO.get(aristas[0].from)!,
    destino: destinoNodo,
    caminarOrigenM: Math.round(origenInfo?.distM ?? 0),
    caminarDestinoM: Math.round(caminarDestinoM),
  };
}
