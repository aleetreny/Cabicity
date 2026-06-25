import { BICIMAD_STATIONS, type BiciMadStation } from "./bicimadData";
import type { LngLat } from "./metroRouter";

function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR, dLng = (b[0] - a[0]) * toR;
  const la1 = a[1] * toR, la2 = b[1] * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestStation(
  point: LngLat,
  predicate: (station: BiciMadStation) => boolean
): { station: BiciMadStation; distM: number } | null {
  let best: { station: BiciMadStation; distM: number } | null = null;
  for (const station of BICIMAD_STATIONS) {
    if (station.status !== "IN_SERVICE" || !predicate(station)) continue;
    const distM = haversineM(point, [station.lng, station.lat]);
    if (!best || distM < best.distM) best = { station, distM };
  }
  return best;
}

export interface BiciMadRuta {
  origen: BiciMadStation;
  destino: BiciMadStation;
  caminarOrigenM: number;
  caminarDestinoM: number;
  biciKm: number;
  totalBasesOrigen: number;
  totalBasesDestino: number;
  bikesSnapshot: number;
  freeBasesSnapshot: number;
}

export function rutaBiciMad(origen: LngLat, destino: LngLat): BiciMadRuta | null {
  const origenStation = nearestStation(origen, (station) => station.dockBikesSnapshot > 0);
  const destinoStation = nearestStation(destino, (station) => station.freeBasesSnapshot > 0);
  if (!origenStation || !destinoStation || origenStation.station.id === destinoStation.station.id) return null;

  if (origenStation.distM > 650 || destinoStation.distM > 650) return null;

  const biciKm =
    Math.round(
      (haversineM(
        [origenStation.station.lng, origenStation.station.lat],
        [destinoStation.station.lng, destinoStation.station.lat]
      ) / 1000) * 1.25 * 10
    ) / 10;

  if (biciKm < 0.4 || biciKm > 7) return null;

  return {
    origen: origenStation.station,
    destino: destinoStation.station,
    caminarOrigenM: Math.round(origenStation.distM),
    caminarDestinoM: Math.round(destinoStation.distM),
    biciKm,
    totalBasesOrigen: origenStation.station.totalBases,
    totalBasesDestino: destinoStation.station.totalBases,
    bikesSnapshot: origenStation.station.dockBikesSnapshot,
    freeBasesSnapshot: destinoStation.station.freeBasesSnapshot,
  };
}
