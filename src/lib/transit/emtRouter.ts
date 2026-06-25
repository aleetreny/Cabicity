// Router EMT sobre el GTFS oficial de CRTM.
// Aristas dirigidas por stop_times reales y Dijkstra con penalización de cambio
// de línea/variante para producir rutas de bus realistas.
import { EMT_EDGES, EMT_NODOS, type EmtNodo } from "./emtGraph";

export type LngLat = [number, number];

const NODO = new Map<string, EmtNodo>();
EMT_NODOS.forEach((n) => NODO.set(n.k, n));

interface Arista {
  to: string;
  line: string;
  lineKey: string;
  color: string;
  secs: number;
  headsign: string;
}

const ADJ = new Map<string, Arista[]>();
for (const [a, b, line, lineKey, color, secs, headsign] of EMT_EDGES) {
  // En la demo evitamos rutas "tramposas" de día con nocturnos (N*) o servicios
  // especiales/sustitutorios (SE*). Google Maps también prioriza líneas regulares
  // para viajes urbanos normales, aunque haya una arista GTFS técnicamente válida.
  if (/^(N|S)/i.test(line)) continue;
  (ADJ.get(a) ?? ADJ.set(a, []).get(a)!).push({ to: b, line, lineKey, color, secs, headsign });
}

function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR, dLng = (b[0] - a[0]) * toR;
  const la1 = a[1] * toR, la2 = b[1] * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function candidatosParada(p: LngLat, maxM: number, limit = 10) {
  return EMT_NODOS
    .map((n) => ({ nodo: n, distM: haversineM(p, [n.lng, n.lat]) }))
    .sort((a, b) => a.distM - b.distM)
    .filter((x) => x.distM <= maxM)
    .slice(0, limit);
}

class MinHeap<T> {
  private values: { item: T; cost: number }[] = [];

  push(item: T, cost: number) {
    this.values.push({ item, cost });
    this.bubbleUp(this.values.length - 1);
  }

  pop(): { item: T; cost: number } | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || !last) return first;
    if (this.values.length) {
      this.values[0] = last;
      this.sinkDown(0);
    }
    return first;
  }

  get length() {
    return this.values.length;
  }

  private bubbleUp(i: number) {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.values[p].cost <= this.values[i].cost) break;
      [this.values[p], this.values[i]] = [this.values[i], this.values[p]];
      i = p;
    }
  }

  private sinkDown(i: number) {
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let b = i;
      if (l < this.values.length && this.values[l].cost < this.values[b].cost) b = l;
      if (r < this.values.length && this.values[r].cost < this.values[b].cost) b = r;
      if (b === i) break;
      [this.values[b], this.values[i]] = [this.values[i], this.values[b]];
      i = b;
    }
  }
}

const TRANSBORDO_SECS = 900;
const MAX_TRANSBORDOS = 1;
const WALK_SPEED_MPS = 5000 / 3600;

export interface EmtTramo {
  linea: string;
  color: string;
  desde: string;
  desdeKey: string;
  hasta: string;
  hastaKey: string;
  nextKey: string;
  headsign: string;
  paradas: number;
  secs: number;
  coords: LngLat[];
}

export interface EmtRuta {
  tramos: EmtTramo[];
  totalSecs: number;
  transbordos: number;
  origen: EmtNodo;
  destino: EmtNodo;
  caminarOrigenM: number;
  caminarDestinoM: number;
}

export function rutaEmt(origen: LngLat, destino: LngLat): EmtRuta | null {
  const origenes = candidatosParada(origen, 1000, 14);
  // Permitimos caminar algo más al final: una ruta de 1 línea + 12-18 min a pie
  // suele ser más humana que cinco transbordos para dejarte en la puerta.
  const destinos = candidatosParada(destino, 1700, 28);
  if (!origenes.length || !destinos.length) return null;

  const targetDist = new Map(destinos.map((x) => [x.nodo.k, x.distM]));
  const targetSet = new Set(targetDist.keys());
  const dist = new Map<string, number>();
  const prev = new Map<string, { state: string; from: string; arista: Arista } | null>();
  const originByState = new Map<string, { nodo: EmtNodo; distM: number }>();
  const pq = new MinHeap<string>();

  origenes.forEach(({ nodo, distM }) => {
    const state = `${nodo.k}||0`;
    const cost = Math.round(distM / WALK_SPEED_MPS);
    if (cost < (dist.get(state) ?? Infinity)) {
      dist.set(state, cost);
      prev.set(state, null);
      originByState.set(state, { nodo, distM });
      pq.push(state, cost);
    }
  });

  let endState: string | null = null;
  while (pq.length) {
    const item = pq.pop();
    if (!item) break;
    const { item: state, cost } = item;
    if ((dist.get(state) ?? Infinity) < cost) continue;
    const [k, lineaActual, transferText] = state.split("|");
    const transferCount = Number(transferText || "0");
    if (targetSet.has(k)) {
      endState = state;
      break;
    }
    for (const ar of ADJ.get(k) ?? []) {
      const cambiaLinea = Boolean(lineaActual && lineaActual !== ar.line);
      const nextTransfers = transferCount + (cambiaLinea ? 1 : 0);
      if (nextTransfers > MAX_TRANSBORDOS) continue;
      const extra = ar.secs + (cambiaLinea ? TRANSBORDO_SECS : 0);
      const ns = `${ar.to}|${ar.line}|${nextTransfers}`;
      const nc = cost + extra;
      if (nc < (dist.get(ns) ?? Infinity)) {
        dist.set(ns, nc);
        prev.set(ns, { state, from: k, arista: ar });
        const originInfo = originByState.get(state);
        if (originInfo) originByState.set(ns, originInfo);
        pq.push(ns, nc);
      }
    }
  }
  if (!endState) return null;

  const aristas: { from: string; arista: Arista }[] = [];
  let cur: string | null = endState;
  while (cur && prev.get(cur)) {
    const p: { state: string; from: string; arista: Arista } = prev.get(cur)!;
    aristas.unshift({ from: p.from, arista: p.arista });
    cur = p.state;
  }
  if (!aristas.length) return null;

  const tramos: EmtTramo[] = [];
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
        linea: arista.line,
        color: arista.color,
        desde: fromN.n,
        desdeKey: fromN.k,
        hasta: toN.n,
        hastaKey: toN.k,
        nextKey: toN.k,
        headsign: arista.headsign,
        paradas: 1,
        secs: arista.secs,
        coords: [[fromN.lng, fromN.lat], [toN.lng, toN.lat]],
      });
    }
  }

  const [destinoKey] = endState.split("|");
  const origenInfo = originByState.get(endState);
  const destinoNodo = NODO.get(destinoKey)!;
  const caminarDestinoM = targetDist.get(destinoKey) ?? haversineM(destino, [destinoNodo.lng, destinoNodo.lat]);
  const totalSecs =
    (dist.get(endState) ?? tramos.reduce((s, t) => s + t.secs, 0)) +
    Math.round(caminarDestinoM / WALK_SPEED_MPS);

  return {
    tramos,
    totalSecs,
    transbordos,
    origen: origenInfo?.nodo ?? NODO.get(aristas[0].from)!,
    destino: destinoNodo,
    caminarOrigenM: Math.round(origenInfo?.distM ?? 0),
    caminarDestinoM: Math.round(caminarDestinoM),
  };
}
