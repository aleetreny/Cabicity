import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Phone, MessageSquare, Shield } from "lucide-react";
import { PhoneFrame } from "@/components/transit/PhoneFrame";
import { getTrip, type TripState } from "@/lib/transit/store";
import { categoriasParaOpcion } from "@/lib/transit/engine";
import { buildRouteGeo, type LngLat } from "@/lib/transit/routeGeo";
import { MapaMapbox, type MapaMarcador, type MapaRutaSegmento } from "@/components/transit/MapaMapbox";
import { fmtEur } from "@/lib/transit/format";

type Categoria = ReturnType<typeof categoriasParaOpcion>[number];

export const Route = createFileRoute("/recogida-cabify")({
  component: RecogidaCabify,
});

// Aproximación lineal: distancia en km entre dos lat/lng (suficiente para
// mover un marcador a escala urbana en Madrid; no necesitamos haversine real).
function kmEntre(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * 111;
  const dLng = (b[0] - a[0]) * 111 * Math.cos((a[1] * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// Bearing en grados desde "from" hacia "to" (0 = norte, 90 = este).
function bearingHacia(from: LngLat, to: LngLat): number {
  const dLng = to[0] - from[0];
  const dLat = to[1] - from[1];
  const rad = Math.atan2(dLng, dLat);
  return (rad * 180) / Math.PI;
}

function interp(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function RecogidaCabify() {
  const navigate = useNavigate();
  const [trip, setT] = useState<TripState | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const t = getTrip();
    if (!t?.seleccionada || !t.seleccionada.modos.includes("cabify")) {
      navigate({ to: t?.seleccionada ? "/navegacion" : "/resultados" });
      return;
    }
    setT(t);
  }, [navigate]);

  const op = trip?.seleccionada;

  const categoria: Categoria | undefined = useMemo(() => {
    if (!op) return undefined;
    const cats = categoriasParaOpcion(op);
    return cats.find((c) => c.id === trip?.categoriaCabify) ?? cats[0];
  }, [op, trip?.categoriaCabify]);

  const geo = useMemo(() => (op ? buildRouteGeo(op, trip?.destino || op.id) : null), [op, trip?.destino]);

  // Punto de partida del Cabify: a ~0.9 km al noroeste del origen.
  // (Determinista, así no salta entre renders del preview.)
  const carStart: LngLat | null = useMemo(() => {
    if (!geo) return null;
    const o = geo.origen;
    const dKm = 0.9;
    const lat = o[1] - dKm / 111;
    const lng = o[0] - dKm / (111 * Math.cos((o[1] * Math.PI) / 180));
    return [lng, lat];
  }, [geo]);

  // Animación del coche: avanza de carStart → origen en etaSeg (compresión
  // visual del ETA real). progreso ∈ [0,1].
  const etaTotalMin = 2 + (categoria?.etaExtraMin ?? 0);
  const etaSeg = 14; // duración visual del approach
  const [progreso, setProgreso] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!geo || !carStart) return;
    const tick = (ts: number) => {
      if (startTsRef.current === null) startTsRef.current = ts;
      const elapsed = (ts - startTsRef.current) / 1000;
      const p = Math.min(1, elapsed / etaSeg);
      setProgreso(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startTsRef.current = null;
    };
  }, [geo, carStart]);

  // Avance automático al llegar: pequeña pausa y entra a /navegacion.
  useEffect(() => {
    if (progreso < 1) return;
    const t = setTimeout(() => navigate({ to: "/navegacion" }), 1200);
    return () => clearTimeout(t);
  }, [progreso, navigate]);

  const carPos: LngLat | null = useMemo(() => {
    if (!geo || !carStart) return null;
    return interp(carStart, geo.origen, progreso);
  }, [geo, carStart, progreso]);

  // Rotación: hacia el origen, descontando 90° porque el SVG cenital apunta
  // por defecto hacia la derecha (este).
  const rotacionDeg = useMemo(() => {
    if (!geo || !carPos) return 0;
    return bearingHacia(carPos, geo.origen) - 90;
  }, [geo, carPos]);

  // ETA restante visual basada en el progreso de la animación.
  const etaRestanteMin = Math.max(1, Math.ceil(etaTotalMin * (1 - progreso)));
  const distRestanteKm =
    geo && carPos ? Math.max(0.05, kmEntre(carPos, geo.origen)) : 0;

  const marcadores: MapaMarcador[] = useMemo(() => {
    if (!geo) return [];
    return [
      // Pin del punto de recogida (origen)
      { pos: geo.origen, color: "#ffffff", borde: "#7145d6", tamano: 16 },
    ];
  }, [geo]);

  // Línea morada Cabify desde el coche hasta el punto de recogida.
  const rutaRecogida: MapaRutaSegmento[] = useMemo(() => {
    if (!geo || !carPos) return [];
    return [{ coords: [carPos, geo.origen], color: "#7145d6" }];
  }, [geo, carPos]);

  if (!trip?.seleccionada || !op || !geo || !categoria || !carPos) {
    return (
      <PhoneFrame>
        <div />
      </PhoneFrame>
    );
  }

  const llegado = progreso >= 1;

  return (
    <PhoneFrame>
      <div className="absolute inset-0 flex flex-col bg-bg">
        {/* Mapa */}
        <div className="relative h-[55%] bg-bg-subdued overflow-hidden">
          <MapaMapbox
            centro={geo.origen}
            zoom={15}
            marcadores={marcadores}
            ruta={rutaRecogida}
            ubicacionActual={geo.origen}
            vehiculo={{
              pos: carPos,
              svgUrl: "icons/ic_vehicle_cenital.svg",
              rotacionDeg,
              tamano: 52,
            }}
            fitRuta={false}
          />
          <button
            aria-label="Volver"
            onClick={() => navigate({ to: "/categoria-cabify" })}
            className="absolute top-3 left-3 w-10 h-10 rounded-full bg-surface grid place-items-center z-10"
            style={{ boxShadow: "var(--shadow-rised)" }}
          >
            <ArrowLeft size={20} />
          </button>
          {/* Etiqueta ETA flotante */}
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 bg-text text-white rounded-full px-3 py-1.5 text-[13px] font-bold z-10"
            style={{ boxShadow: "var(--shadow-rised)" }}
          >
            {llegado
              ? "Tu Cabify ha llegado"
              : `Llega en ${etaRestanteMin} min · ${distRestanteKm.toFixed(1).replace(".", ",")} km`}
          </div>
        </div>

        {/* Panel inferior */}
        <div
          className="flex-1 flex flex-col bg-surface rounded-t-[24px] -mt-6 relative z-10 overflow-hidden"
          style={{ boxShadow: "var(--shadow-rised)" }}
        >
          <div className="p-5 flex flex-col gap-4 flex-1 overflow-y-auto">
            <div className="flex items-center gap-3">
              <img
                src={categoria.img}
                alt={categoria.nombre}
                className="w-[88px] h-[60px] object-contain shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">
                  {llegado ? "Conductor en el punto de recogida" : "Tu conductor está en camino"}
                </div>
                <div className="text-[18px] font-bold text-text truncate">
                  {categoria.nombre}
                </div>
                <div className="text-[13px] text-text-secondary">
                  Total {fmtEur(categoria.totalEur)}
                </div>
              </div>
            </div>

            {/* Tarjeta conductor */}
            <div className="rounded-[16px] bg-field p-3 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-cashback-bg grid place-items-center text-cashback-text font-bold text-[16px]">
                MA
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold text-text">Miguel Á.</div>
                <div className="text-[12px] text-text-secondary truncate">
                  Toyota Prius · 1234 ABC · ★ 4,9
                </div>
              </div>
              <button
                aria-label="Mensaje"
                onClick={() => setNotice("Mensaje enviado a Miguel Á.")}
                className="w-10 h-10 rounded-full bg-surface grid place-items-center"
                style={{ boxShadow: "var(--shadow-resting)" }}
              >
                <MessageSquare size={18} />
              </button>
              <button
                aria-label="Llamar"
                onClick={() => setNotice("Llamando a Miguel Á.…")}
                className="w-10 h-10 rounded-full bg-surface grid place-items-center"
                style={{ boxShadow: "var(--shadow-resting)" }}
              >
                <Phone size={18} />
              </button>
            </div>

            <button
              onClick={() => setNotice("Enlace del viaje copiado para compartir")}
              className="flex items-center gap-2 text-[13px] text-text-secondary"
            >
              <Shield size={16} className="text-brand" />
              Compartir viaje con un contacto
            </button>
            {notice && <div role="status" className="text-center text-[13px] text-text-secondary">{notice}</div>}
          </div>

          <div className="p-4 border-t border-border">
            <button
              onClick={() => navigate({ to: "/navegacion" })}
              className="w-full h-14 rounded-[8px] bg-brand text-white font-bold text-[16px]"
            >
              {llegado ? "Empezar viaje" : "Ver detalles del viaje"}
            </button>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}
