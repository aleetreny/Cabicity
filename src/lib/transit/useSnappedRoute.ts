import { useEffect, useState } from "react";
import type { Opcion } from "./engine";
import { buildRouteGeo, snapRouteGeoToRoads, type RouteGeo } from "./routeGeo";

// Construye la geometría sintética inmediata y, en segundo plano, intenta
// snapearla a calles reales con Mapbox Directions. Mientras llega la respuesta
// se muestra la versión sintética para no parpadear el mapa.
export function useSnappedRoute(op: Opcion | null | undefined, destinoTexto: string | undefined): RouteGeo | null {
  const [geo, setGeo] = useState<RouteGeo | null>(() =>
    op ? buildRouteGeo(op, destinoTexto || op.id) : null
  );

  useEffect(() => {
    if (!op) {
      setGeo(null);
      return;
    }
    const base = buildRouteGeo(op, destinoTexto || op.id);
    setGeo(base);
    const ctrl = new AbortController();
    let cancelled = false;
    snapRouteGeoToRoads(base, op, ctrl.signal).then((snapped) => {
      if (!cancelled) setGeo(snapped);
    });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [op, destinoTexto]);

  return geo;
}
