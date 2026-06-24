// CLIENT-ONLY. Nunca importa mapbox-gl a nivel de módulo: lo carga
// dinámicamente dentro de un useEffect, con guarda de window. Si no hay
// VITE_MAPBOX_TOKEN, renderiza un fallback visual sin romper el SSR.

import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import { getMapboxToken } from "@/lib/transit/routeGeo";

export type LngLat = [number, number];

export interface MapaMarcador {
  pos: LngLat;
  color?: string;
  tamano?: number;
  borde?: string;
}

export interface MapaRutaSegmento {
  coords: LngLat[];
  color?: string;
  dashed?: boolean;
}

export interface MapaVehiculo {
  pos: LngLat;
  svgUrl: string;
  rotacionDeg?: number;
  tamano?: number; // ancho en px
  seguir?: boolean; // el mapa recentra siguiendo al vehículo (modo navegación)
}

interface Props {
  centro: LngLat;
  zoom?: number;
  /** Tramos de la polyline (orden = orden visual). */
  ruta?: MapaRutaSegmento[];
  /** Paradas / waypoints estáticos. */
  marcadores?: MapaMarcador[];
  /** Punto que avanza por la ruta (se anima con easeTo al cambiar). */
  marcadorActivo?: LngLat;
  /** Marcador de "tu ubicación actual" (punto azul con halo). */
  ubicacionActual?: LngLat;
  /** Vehículo SVG que se anima al cambiar pos (p.ej. Cabify acercándose). */
  vehiculo?: MapaVehiculo;
  /** Si hay ruta, ajusta el encuadre a todos sus puntos al montar. */
  fitRuta?: boolean;
  className?: string;
  interactive?: boolean;
  /** Padding (px) que reserva el viewport. Útil cuando un bottom sheet cubre el mapa. */
  paddingBottom?: number;
}

function MapaFallback({ className }: { className?: string }) {
  // Fallback simple cuando no hay token: degradado claro tipo mapa.
  return (
    <div
      className={`absolute inset-0 ${className ?? ""}`}
      aria-label="Mapa no disponible (sin VITE_MAPBOX_TOKEN)"
      style={{
        background:
          "linear-gradient(180deg, #f1f0f6 0%, #e7e6f0 100%)",
        backgroundImage:
          "radial-gradient(circle at 35% 40%, rgba(113,69,214,0.08), transparent 60%)," +
          "linear-gradient(180deg, #f1f0f6 0%, #e7e6f0 100%)," +
          "repeating-linear-gradient(0deg, transparent 0 39px, #00000008 39px 40px)," +
          "repeating-linear-gradient(90deg, transparent 0 39px, #00000008 39px 40px)",
      }}
    />
  );
}

// Recolorea el estilo base de Mapbox hacia la paleta del mapa de Cabify.
// (El estilo original es un JSON de Google Maps, que Mapbox no acepta; aquí
// trasladamos su paleta a las capas del estilo light de Mapbox.)
function aplicarEstiloCabify(map: MapboxMap) {
  let layers: { id: string; type: string }[] = [];
  try { layers = map.getStyle()?.layers || []; } catch { return; }
  for (const l of layers) {
    const id = l.id;
    try {
      if (l.type === "background") map.setPaintProperty(id, "background-color", "#e7e5f0");
      else if (l.type === "fill") {
        if (/water/i.test(id)) map.setPaintProperty(id, "fill-color", "#a9ddf3");
        else if (/(park|green|grass|wood|landcover|pitch|golf|cemetery|scrub|garden|recreation|forest|national|vegetation|farmland)/i.test(id)) {
          map.setPaintProperty(id, "fill-color", "#bfe39e");
          try { map.setPaintProperty(id, "fill-opacity", 1); } catch { /* ignore */ }
        }
        else if (/landuse/i.test(id)) {
          // landuse engloba parques y zonas verdes en light-v11: verde suave.
          map.setPaintProperty(id, "fill-color", "#cce8b4");
        }
        else if (/building/i.test(id)) map.setPaintProperty(id, "fill-color", "#efeef6");
        // (el resto del suelo queda en el lavanda claro del fondo)
      } else if (l.type === "line") {
        if (/water/i.test(id)) map.setPaintProperty(id, "line-color", "#a9ddf3");
        else if (/(motorway|trunk|highway)/i.test(id)) map.setPaintProperty(id, "line-color", "#cfd0e0");
        else if (/(road|street|bridge|tunnel|transit)/i.test(id)) map.setPaintProperty(id, "line-color", "#ffffff");
      } else if (l.type === "symbol") {
        try { map.setPaintProperty(id, "text-color", "#4b4c6a"); } catch { /* sin texto */ }
        try { map.setPaintProperty(id, "text-halo-color", "#ffffff"); } catch { /* sin halo */ }
      }
    } catch { /* la capa no soporta esa propiedad */ }
  }
}

export function MapaMapbox({
  centro,
  zoom = 12,
  ruta,
  marcadores,
  marcadorActivo,
  ubicacionActual,
  vehiculo,
  fitRuta = true,
  className,
  interactive = false,
  paddingBottom = 0,
}: Props) {
  const token = getMapboxToken();
  const containerRef = useRef<HTMLDivElement>(null);
  // Referencias mutables sin tipar mapbox a nivel de módulo.
  const mapRef = useRef<unknown>(null);
  const mapboxRef = useRef<unknown>(null);
  const mapLoadedRef = useRef<boolean>(false);
  const movingMarkerRef = useRef<unknown>(null);
  const vehiculoMarkerRef = useRef<unknown>(null);
  const vehiculoImgRef = useRef<HTMLImageElement | null>(null);
  // Punto al que vuelve el botón "centrar mi ubicación".
  const focoRef = useRef<LngLat>(centro);
  focoRef.current = ubicacionActual ?? marcadorActivo ?? centro;
  // Se muestra el botón cuando el usuario ha desplazado el mapa a mano.
  const [desviado, setDesviado] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const drawnCountRef = useRef(0);

  const centrarUbicacion = () => {
    const map = mapRef.current as { easeTo: (o: unknown) => void; getZoom: () => number } | null;
    if (!map) return;
    try { map.easeTo({ center: focoRef.current, zoom: Math.max(map.getZoom(), zoom), duration: 700 }); } catch { /* ignore */ }
    setDesviado(false);
  };

  // Init mapa (cliente only, import dinámico)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!token || !containerRef.current) return;

    let cancelled = false;
    let mapInstance: { remove: () => void } | null = null;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      await import("mapbox-gl/dist/mapbox-gl.css");
      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = token;

      const routeColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--route")
          .trim() || "#7145d6";

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: centro,
        zoom,
        attributionControl: false,
        interactive,
      });
      mapInstance = map;
      mapRef.current = map;
      mapboxRef.current = mapboxgl;
      // Reserva espacio en la parte inferior (bottom sheet) para que el centro
      // visual quede en el área realmente visible del mapa.
      if (paddingBottom > 0) {
        try { map.setPadding({ top: 0, right: 0, bottom: paddingBottom, left: 0 }); } catch { /* ignore */ }
        try { map.jumpTo({ center: centro, zoom }); } catch { /* ignore */ }
      }

      // Interactivo: al mover el mapa a mano aparece el botón "centrar mi
      // ubicación" (como Google Maps). No recentramos solos: dejamos que el
      // usuario decida cuándo volver, igual que cualquier app de mapas.
      if (interactive) {
        map.on("dragstart", (e: { originalEvent?: unknown }) => {
          if (e.originalEvent) setDesviado(true);
        });
        map.on("moveend", (e: { originalEvent?: unknown }) => {
          if (e.originalEvent) setDesviado(true);
        });
      }

      map.on("load", () => {
        aplicarEstiloCabify(map);
        // Marcador de "tu ubicación actual" (punto azul con halo)
        if (ubicacionActual) {
          const wrap = document.createElement("div");
          wrap.style.cssText = "position:relative;width:22px;height:22px;";
          const halo = document.createElement("div");
          halo.style.cssText = "position:absolute;inset:-10px;border-radius:999px;background:rgba(39,96,194,0.16);";
          const dot = document.createElement("div");
          dot.style.cssText = "position:absolute;inset:0;border-radius:999px;background:#2760c2;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.35);";
          wrap.appendChild(halo);
          wrap.appendChild(dot);
          new mapboxgl.Marker({ element: wrap, anchor: "center" }).setLngLat(ubicacionActual).addTo(map);
        }
        // La ruta se pinta (y repinta al ajustarse a las calles) en un efecto
        // dedicado más abajo, en cuanto el mapa está listo.

        // Paradas estáticas
        marcadores?.forEach((m) => {
          const el = document.createElement("div");
          const size = m.tamano ?? 12;
          el.style.width = `${size}px`;
          el.style.height = `${size}px`;
          el.style.borderRadius = "999px";
          el.style.background = m.color ?? "#ffffff";
          el.style.border = `3px solid ${m.borde ?? routeColor}`;
          el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.18)";
          new mapboxgl.Marker({ element: el, anchor: "center" })
            .setLngLat(m.pos)
            .addTo(map);
        });

        // Marker que avanza
        if (marcadorActivo) {
          const adv = document.createElement("div");
          adv.style.width = "20px";
          adv.style.height = "20px";
          adv.style.borderRadius = "999px";
          adv.style.background = routeColor;
          adv.style.border = "4px solid #ffffff";
          adv.style.boxShadow = "0 2px 8px rgba(113,69,214,0.45)";
          movingMarkerRef.current = new mapboxgl.Marker({
            element: adv,
            anchor: "center",
          })
            .setLngLat(marcadorActivo)
            .addTo(map);
        }

        // Vehículo (SVG cenital) — se anima en efecto dedicado al cambiar pos
        if (vehiculo) {
          const wrap = document.createElement("div");
          const w = vehiculo.tamano ?? 44;
          wrap.style.cssText = `width:${w}px;height:${w}px;display:grid;place-items:center;`;
          const img = document.createElement("img");
          img.src = vehiculo.svgUrl;
          img.alt = "";
          img.style.cssText = `width:100%;height:auto;transform:rotate(${vehiculo.rotacionDeg ?? 0}deg);transition:transform 150ms linear;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.25));`;
          wrap.appendChild(img);
          vehiculoImgRef.current = img;
          vehiculoMarkerRef.current = new mapboxgl.Marker({ element: wrap, anchor: "center" })
            .setLngLat(vehiculo.pos)
            .addTo(map);
        }
        mapLoadedRef.current = true;
        setMapReady(true);
      });
    })();

    return () => {
      cancelled = true;
      if (mapInstance) {
        try {
          mapInstance.remove();
        } catch {
          /* ignore */
        }
      }
      mapRef.current = null;
      mapboxRef.current = null;
      mapLoadedRef.current = false;
      movingMarkerRef.current = null;
      vehiculoMarkerRef.current = null;
      vehiculoImgRef.current = null;
    };
    // Re-montamos cuando cambia el token; el resto se actualiza en efectos
    // dedicados de abajo para no recrear el mapa en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Animar marcador activo cuando cambia (lo crea si aún no existe)
  useEffect(() => {
    const map = mapRef.current as { easeTo: (o: unknown) => void; getZoom: () => number; addTo?: unknown } | null;
    const mapboxgl = mapboxRef.current as { Marker: new (o: unknown) => { setLngLat: (p: LngLat) => unknown; addTo: (m: unknown) => unknown } } | null;
    if (!map || !mapboxgl || !marcadorActivo || !mapLoadedRef.current) return;
    let mk = movingMarkerRef.current as { setLngLat: (p: LngLat) => void } | null;
    if (!mk) {
      const routeColor =
        getComputedStyle(document.documentElement).getPropertyValue("--route").trim() || "#7145d6";
      const adv = document.createElement("div");
      adv.style.cssText = `width:20px;height:20px;border-radius:999px;background:${routeColor};border:4px solid #fff;box-shadow:0 2px 8px rgba(113,69,214,0.45);`;
      mk = new mapboxgl.Marker({ element: adv, anchor: "center" }) as unknown as { setLngLat: (p: LngLat) => void };
      (mk as { setLngLat: (p: LngLat) => { addTo: (m: unknown) => unknown } }).setLngLat(marcadorActivo).addTo(map);
      movingMarkerRef.current = mk;
    } else {
      mk.setLngLat(marcadorActivo);
    }
    map.easeTo({
      center: marcadorActivo,
      duration: 900,
      zoom: Math.max(map.getZoom(), 13.5),
    });
  }, [marcadorActivo]);

  // Animar vehículo cuando cambia su posición o rotación (lo crea si no existe)
  useEffect(() => {
    const map = mapRef.current as unknown;
    const mapboxgl = mapboxRef.current as { Marker: new (o: unknown) => { setLngLat: (p: LngLat) => unknown; addTo: (m: unknown) => unknown } } | null;
    if (!map || !mapboxgl || !vehiculo || !mapLoadedRef.current) return;
    let mk = vehiculoMarkerRef.current as { setLngLat: (p: LngLat) => void } | null;
    if (!mk) {
      const wrap = document.createElement("div");
      const w = vehiculo.tamano ?? 44;
      wrap.style.cssText = `width:${w}px;height:${w}px;display:grid;place-items:center;`;
      const img = document.createElement("img");
      img.src = vehiculo.svgUrl;
      img.alt = "";
      img.style.cssText = `width:100%;height:auto;transform:rotate(${vehiculo.rotacionDeg ?? 0}deg);transition:transform 150ms linear;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.25));`;
      wrap.appendChild(img);
      vehiculoImgRef.current = img;
      mk = new mapboxgl.Marker({ element: wrap, anchor: "center" }) as unknown as { setLngLat: (p: LngLat) => void };
      (mk as { setLngLat: (p: LngLat) => { addTo: (m: unknown) => unknown } }).setLngLat(vehiculo.pos).addTo(map);
      vehiculoMarkerRef.current = mk;
    } else {
      mk.setLngLat(vehiculo.pos);
      if (vehiculoImgRef.current) {
        vehiculoImgRef.current.style.transform = `rotate(${vehiculo.rotacionDeg ?? 0}deg)`;
      }
    }
    // Modo navegación: el mapa sigue al vehículo recentrándose en él.
    if (vehiculo.seguir) {
      try { (map as { setCenter: (p: LngLat) => void }).setCenter(vehiculo.pos); } catch { /* ignore */ }
    }
  }, [vehiculo?.pos, vehiculo?.rotacionDeg, vehiculo?.seguir]);

  // Pinta (y repinta) la ruta cuando cambia — p. ej. al ajustarse a las calles
  // (Mapbox Directions) o al cambiar de opción. Limpia siempre lo anterior.
  useEffect(() => {
    const map = mapRef.current as {
      getLayer: (id: string) => unknown; removeLayer: (id: string) => void;
      getSource: (id: string) => unknown; removeSource: (id: string) => void;
      addSource: (id: string, s: unknown) => void; addLayer: (l: unknown) => void;
      fitBounds: (b: unknown, o: unknown) => void;
    } | null;
    const mapboxgl = mapboxRef.current as { LngLatBounds: new () => { extend: (c: LngLat) => void } } | null;
    if (!map || !mapReady) return;

    for (let i = 0; i < drawnCountRef.current; i++) {
      for (const lid of [`seg-${i}-line`, `seg-${i}-casing`]) {
        try { if (map.getLayer(lid)) map.removeLayer(lid); } catch { /* ignore */ }
      }
      try { if (map.getSource(`seg-${i}`)) map.removeSource(`seg-${i}`); } catch { /* ignore */ }
    }
    drawnCountRef.current = 0;
    if (!ruta || ruta.length === 0) return;

    const routeColor =
      getComputedStyle(document.documentElement).getPropertyValue("--route").trim() || "#7145d6";
    ruta.forEach((seg, i) => {
      const id = `seg-${i}`;
      map.addSource(id, {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: seg.coords } },
      });
      map.addLayer({
        id: `${id}-casing`, type: "line", source: id,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 1 },
      });
      map.addLayer({
        id: `${id}-line`, type: "line", source: id,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": seg.color || routeColor, "line-width": 6, ...(seg.dashed ? { "line-dasharray": [1.2, 1.6] } : {}) },
      });
    });
    drawnCountRef.current = ruta.length;

    if (fitRuta && mapboxgl) {
      const bounds = new mapboxgl.LngLatBounds();
      ruta.forEach((s) => s.coords.forEach((c) => bounds.extend(c)));
      try { map.fitBounds(bounds, { padding: 56, duration: 0, maxZoom: 15 }); } catch { /* ignore */ }
    }
  }, [mapReady, ruta, fitRuta]);

  if (!token) {
    return <MapaFallback className={className} />;
  }

  return (
    <>
      <div
        ref={containerRef}
        className={className}
        // Inline style: gana en especificidad/orden a `.mapboxgl-map { position: relative }`
        // de mapbox-gl.css, que si no colapsa la altura del contenedor (inset-0 deja de
        // aplicar al volverse relative) y el mapa se queda en blanco.
        style={{ position: "absolute", inset: 0 }}
      />
      {interactive && desviado && (
        <button
          onClick={centrarUbicacion}
          aria-label="Centrar mi ubicación"
          className="absolute right-4 z-20 w-11 h-11 rounded-full bg-surface grid place-items-center"
          style={{ bottom: paddingBottom > 0 ? paddingBottom + 16 : 16, boxShadow: "var(--shadow-rised)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3.2" fill="var(--brand)" stroke="none" />
            <circle cx="12" cy="12" r="7" />
            <line x1="12" y1="1.5" x2="12" y2="4.5" />
            <line x1="12" y1="19.5" x2="12" y2="22.5" />
            <line x1="1.5" y1="12" x2="4.5" y2="12" />
            <line x1="19.5" y1="12" x2="22.5" y2="12" />
          </svg>
        </button>
      )}
    </>
  );
}
