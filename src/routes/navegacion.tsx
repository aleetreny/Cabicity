import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Volume2, VolumeX, ChevronRight, X, QrCode, Loader2 } from "lucide-react";
import { PhoneFrame } from "@/components/transit/PhoneFrame";
import { clearTrip, getTrip, type TripState } from "@/lib/transit/store";
import { fmtEur, fmtMin, fmtCo2 } from "@/lib/transit/format";
import { ModoChip } from "@/components/transit/ModoIcon";
import { MetroLineBadge, extractMetroLinea, CercaniasLineBadge, extractCercaniasLinea } from "@/components/transit/MetroLineBadge";
import type { Paso, Tramo } from "@/lib/transit/engine";
import { buildRouteGeo, snapRouteGeoToRoads, type LngLat, type RouteGeo } from "@/lib/transit/routeGeo";
import { MapaMapbox, type MapaRutaSegmento, type MapaMarcador } from "@/components/transit/MapaMapbox";
import { speakText, stopSpeech } from "@/lib/tts";

export const Route = createFileRoute("/navegacion")({
  component: Nav,
});

interface PasoPlano {
  tramoIdx: number;
  pasoIdx: number;
  paso: Paso;
  tramo: Tramo;
}

function aplanar(tramos: Tramo[]): PasoPlano[] {
  const out: PasoPlano[] = [];
  tramos.forEach((t, ti) => t.pasos.forEach((p, pi) => out.push({ tramoIdx: ti, pasoIdx: pi, paso: p, tramo: t })));
  return out;
}

// Distancia aproximada (en grados corregidos por latitud) y rumbo entre dos
// puntos, para mover y orientar el coche a lo largo de la polilínea.
function distAprox(a: LngLat, b: LngLat): number {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const dy = b[1] - a[1];
  return Math.hypot(dx, dy);
}
function rumboDeg(a: LngLat, b: LngLat): number {
  const dLng = b[0] - a[0], dLat = b[1] - a[1];
  if (!dLng && !dLat) return 0;
  return (Math.atan2(dLng, dLat) * 180) / Math.PI - 90;
}

function Nav() {
  const navigate = useNavigate();
  const [trip, setT] = useState<TripState | null>(null);
  const [idx, setIdx] = useState(0);
  const [llegado, setLlegado] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [voz, setVoz] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ct-voz") === "1";
  });

  useEffect(() => {
    const t = getTrip();
    if (!t?.seleccionada) navigate({ to: "/" });
    else setT(t);
  }, [navigate]);

  const pasos: PasoPlano[] = useMemo(
    () => (trip?.seleccionada ? aplanar(trip.seleccionada.tramos) : []),
    [trip]
  );

  const actual = pasos[idx];

  // Asistente de voz local mediante la síntesis de voz disponible en el navegador.
  const decir = (texto: string) => {
    if (!voz || typeof window === "undefined") return;
    speakText(texto);
  };

  useEffect(() => () => stopSpeech(), []);

  useEffect(() => {
    if (!actual || llegado) return;
    // Narra el paso actual al cambiar. El avance es MANUAL ("Siguiente paso"),
    // para seguir el viaje en vivo, sin completarlo en segundos.
    decir(actual.paso.instruccion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, llegado, voz]);

  const next = () => {
    if (llegado) return; // evita que el temporizador y el botón disparen la llegada dos veces
    if (idx >= pasos.length - 1) {
      setLlegado(true);
      decir("Has llegado a tu destino");
    } else {
      setIdx((i) => i + 1);
    }
  };

  // Cámara QR (BiciMAD): al abrir la modal, "lee" el código automáticamente y
  // avanza al siguiente paso (bici desbloqueada). El usuario puede cerrarla.
  useEffect(() => {
    if (!qrOpen) return;
    decir("Escaneando el código QR");
    const t = setTimeout(() => {
      decir("Bici desbloqueada. ¡A pedalear!");
      setQrOpen(false);
      next();
    }, 2300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrOpen]);

  // Pasos que avanzan solos: p. ej. al detectar que la bici se ancló en el tótem.
  useEffect(() => {
    if (llegado || !actual?.paso.auto) return;
    const t = setTimeout(() => next(), 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, llegado]);

  const op = trip?.seleccionada;
  const destinoReal: LngLat | undefined =
    trip?.destinoLng != null && trip?.destinoLat != null ? [trip.destinoLng, trip.destinoLat] : undefined;
  const baseGeo = useMemo(
    () => (op ? buildRouteGeo(op, trip?.destino || op.id, destinoReal) : null),
    [op, trip?.destino, destinoReal?.[0], destinoReal?.[1]]
  );

  // Ajuste de la ruta a las CALLES reales (Mapbox Directions) para los tramos
  // que circulan por viario (Cabify, bus, a pie, BiciMAD). Mientras llega, se
  // muestra la línea recta; al resolverse, la polilínea sigue las calles.
  const [snapped, setSnapped] = useState<RouteGeo | null>(null);
  useEffect(() => {
    setSnapped(null);
    if (!baseGeo || !op) return;
    let cancelled = false;
    const ctrl = new AbortController();
    snapRouteGeoToRoads(baseGeo, op, ctrl.signal)
      .then((s) => { if (!cancelled) setSnapped(s); })
      .catch(() => { /* sin red: mantenemos la recta */ });
    return () => { cancelled = true; ctrl.abort(); };
  }, [baseGeo, op]);

  const geo = snapped ?? baseGeo;

  const rutaSegmentos: MapaRutaSegmento[] = useMemo(
    () =>
      geo
        ? geo.segments.map((s) => ({
            coords: s.coords,
            color: s.color,
            dashed: s.tipo === "andando",
          }))
        : [],
    [geo]
  );

  const marcadores: MapaMarcador[] = useMemo(() => {
    if (!geo) return [];
    return geo.stops.map((pos, i) => ({
      pos,
      tamano: i === 0 || i === geo.stops.length - 1 ? 16 : 12,
    }));
  }, [geo]);

  // Posiciones actual y siguiente, y rotación del coche. Calculados ANTES de
  // cualquier early-return para no violar las Rules of Hooks (de lo contrario,
  // el número de hooks cambia entre renders cuando el viaje aún no está cargado
  // o cuando se llega al destino, provocando un error de React).
  const currentPos: LngLat = geo?.stepPositions[idx] ?? geo?.destino ?? [0, 0];
  const siguientePos: LngLat = geo?.stepPositions[idx + 1] ?? geo?.destino ?? [0, 0];
  const rotCoche = useMemo(() => {
    const dLng = siguientePos[0] - currentPos[0];
    const dLat = siguientePos[1] - currentPos[1];
    if (dLng === 0 && dLat === 0) return 0;
    return (Math.atan2(dLng, dLat) * 180) / Math.PI - 90;
  }, [currentPos, siguientePos]);

  // Coche en marcha: durante un tramo en Cabify, el coche AVANZA por la
  // polilínea (ya ajustada a las calles) de inicio a fin, y el mapa lo sigue.
  // Al terminar el tramo, avanza al siguiente paso (o llega al destino).
  const [carPos, setCarPos] = useState<LngLat | null>(null);
  const carRotRef = useRef(0);
  useEffect(() => {
    if (!geo || llegado || actual?.tramo.tipo !== "cabify") { setCarPos(null); return; }
    const seg = geo.segments[actual.tramoIdx];
    if (!seg || seg.coords.length < 2) return;
    const pts = seg.coords as LngLat[];
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distAprox(pts[i - 1], pts[i]));
    const total = cum[cum.length - 1];
    if (total <= 0) return;

    // Posición sobre la polilínea a una distancia dada (interpolación lineal).
    const posAtDist = (d: number): LngLat => {
      const dd = Math.max(0, Math.min(total, d));
      let i = 0;
      while (i < cum.length - 2 && cum[i + 1] < dd) i++;
      const segLen = cum[i + 1] - cum[i] || 1;
      const f = (dd - cum[i]) / segLen;
      const a = pts[i], b = pts[i + 1] ?? pts[i];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    };

    // Ritmo realista y calmado: recorre el tramo en 16–40 s según su duración.
    const durMs = Math.min(40000, Math.max(16000, (actual.paso.duracionMin || 10) * 1700));
    const LOOKAHEAD = Math.max(total * 0.06, 0.0006); // mirar ~adelante para suavizar el rumbo
    const t0 = performance.now();
    setCarPos(pts[0]);
    carRotRef.current = rumboDeg(posAtDist(0), posAtDist(LOOKAHEAD));
    let rot = carRotRef.current;

    const id = setInterval(() => {
      const t = Math.min(1, (performance.now() - t0) / durMs);
      const d = t * total;
      const pos = posAtDist(d);
      setCarPos(pos);
      // Rumbo suavizado: hacia un punto por delante (no al vértice inmediato),
      // y con filtro de paso bajo + camino angular más corto (sin giros bruscos).
      const target = rumboDeg(pos, posAtDist(d + LOOKAHEAD));
      const delta = ((target - rot + 540) % 360) - 180;
      rot += delta * 0.18;
      carRotRef.current = rot;
      if (t >= 1) {
        clearInterval(id);
        if (idx >= pasos.length - 1) { setLlegado(true); decir("Has llegado a tu destino"); }
        else setIdx((x) => x + 1);
      }
    }, 40);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, geo, llegado]);

  if (!trip?.seleccionada || !actual || !op || !geo) return <PhoneFrame><div /></PhoneFrame>;

  const enCabify = actual.tramo.tipo === "cabify";

  // CO2 ahorrado vs cabify total
  const cabifyTotalCo2 = 0.15 * (op.tramos.reduce((s, t) => s + t.distanciaKm, 0));
  const ahorroCo2 = Math.max(0, cabifyTotalCo2 - op.co2Kg);

  // ETA restante (suma duraciones de pasos pendientes)
  const restante = pasos.slice(idx).reduce((s, p) => s + p.paso.duracionMin, 0);
  const progreso = Math.round((idx / Math.max(1, pasos.length - 1)) * 100);

  if (llegado) {
    return (
      <PhoneFrame>
        <div className="absolute inset-0 flex flex-col bg-bg p-5 gap-4 overflow-y-auto">
          <div className="flex items-center justify-center pt-6">
            <img src="illustrations/arrival-thumbsup.svg" alt="" className="w-44 h-auto" />
          </div>
          <h1 className="text-[24px] font-bold text-center">Has llegado a tu destino</h1>
          <p className="text-center text-text-secondary text-[15px]">{trip.destino}</p>

          {op.puntos > 0 && (
            <div className="bg-cashback-bg text-cashback-text rounded-[24px] p-5 flex flex-col items-center gap-1 mt-2">
              <div className="text-[13px] font-bold uppercase tracking-wide flex items-center gap-1.5">
                <img src="illustrations/club-hexagon.svg" alt="" className="w-4 h-4" /> Cabify Club
              </div>
              <div className="text-[40px] font-bold leading-none">+{op.puntos}</div>
              <div className="text-[13px]">puntos para canjear en la app</div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mt-2">
            <Stat label="Tiempo" value={fmtMin(op.etaMin)} />
            <Stat label="Pagado" value={fmtEur(op.precioEur)} />
            <Stat label="CO₂ ahorrado" value={fmtCo2(ahorroCo2)} highlight />
          </div>

          <button
            onClick={() => { clearTrip(); navigate({ to: "/" }); }}
            className="mt-auto w-full h-14 rounded-[8px] bg-brand text-white font-bold text-[16px]"
          >
            Volver al inicio
          </button>
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      <div className="absolute inset-0 flex flex-col bg-bg">
        {/* mapa */}
        <div className="relative h-[40%] bg-bg-subdued overflow-hidden">
          <MapaMapbox
            centro={geo.origen}
            zoom={13}
            ruta={rutaSegmentos}
            marcadores={marcadores}
            marcadorActivo={enCabify ? undefined : currentPos}
            vehiculo={
              enCabify
                ? { pos: carPos ?? currentPos, svgUrl: "icons/ic_vehicle_cenital.svg", rotacionDeg: carRotRef.current, tamano: 48, seguir: true }
                : undefined
            }
            fitRuta
          />

          <button
            aria-label="Volver"
            onClick={() => navigate({ to: "/viaje" })}
            className="absolute top-3 left-3 w-10 h-10 rounded-full bg-surface grid place-items-center z-10"
            style={{ boxShadow: "var(--shadow-rised)" }}
          >
            <ArrowLeft size={20} />
          </button>
          <button
            onClick={() => {
              const nv = !voz;
              setVoz(nv);
              localStorage.setItem("ct-voz", nv ? "1" : "0");
              if (!nv) {
                stopSpeech();
              }
            }}
            className="absolute top-3 right-3 w-10 h-10 rounded-full bg-surface grid place-items-center z-10"
            style={{ boxShadow: "var(--shadow-rised)" }}
            aria-label={voz ? "Silenciar guía por voz" : "Activar guía por voz"}
          >
            {voz
              ? <Volume2 size={20} style={{ color: "var(--brand)" }} />
              : <VolumeX size={20} style={{ color: "var(--danger, #e2342d)" }} />}
          </button>
        </div>

        {/* instrucción actual + lista */}
        <div className="flex-1 flex flex-col bg-surface rounded-t-[24px] -mt-6 relative z-10 overflow-hidden" style={{ boxShadow: "var(--shadow-rised)" }}>
          <div className="p-4 flex gap-3 items-start border-b border-border">
            {actual.tramo.tipo === "metro" && extractMetroLinea(actual.tramo.titulo) ? (
              <MetroLineBadge linea={extractMetroLinea(actual.tramo.titulo)!} size={48} />
            ) : actual.tramo.tipo === "cercanias" && extractCercaniasLinea(actual.tramo.titulo) ? (
              <CercaniasLineBadge linea={extractCercaniasLinea(actual.tramo.titulo)!} size={48} />
            ) : (
              <ModoChip tipo={actual.tramo.tipo} size={48} />
            )}
            <div className="flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">Paso {idx + 1} de {pasos.length}</div>
              <div className="text-[19px] font-bold leading-tight">{actual.paso.instruccion}</div>
            </div>
          </div>

          <div className="px-4 py-3 flex items-center gap-3 border-b border-border">
            <div className="flex-1 h-1.5 rounded-full bg-field overflow-hidden">
              <div className="h-full bg-brand transition-all" style={{ width: `${progreso}%` }} />
            </div>
            <div className="text-[13px] font-bold">{fmtMin(restante)} restantes</div>
          </div>

          <ul className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {pasos.slice(idx + 1, idx + 5).map((p, i) => {
              const metroLinea = p.tramo.tipo === "metro" ? extractMetroLinea(p.tramo.titulo) : null;
              const cercaniasLinea = p.tramo.tipo === "cercanias" ? extractCercaniasLinea(p.tramo.titulo) : null;
              return (
                <li key={i} className="flex items-center gap-3 p-2 rounded-[8px]">
                  {metroLinea ? (
                    <MetroLineBadge linea={metroLinea} size={32} />
                  ) : cercaniasLinea ? (
                    <CercaniasLineBadge linea={cercaniasLinea} size={32} />
                  ) : (
                    <ModoChip tipo={p.tramo.tipo} size={32} />
                  )}
                  <div className="flex-1 text-[14px] text-text-secondary truncate">{p.paso.instruccion}</div>
                  <span className="text-[15px] font-bold text-text">{fmtMin(p.paso.duracionMin)}</span>
                </li>
              );
            })}
          </ul>


          <div className="p-4 border-t border-border space-y-3">
            {op.puntos > 0 && (
              <div className="rounded-[16px] bg-cashback-bg text-cashback-text px-3.5 py-2.5 flex items-center gap-2.5">
                <img src="illustrations/club-hexagon.svg" alt="" className="w-5 h-5 flex-shrink-0" />
                <div className="text-[13px] leading-tight">
                  Ganarás <span className="font-bold">+{op.puntos} puntos</span> Cabify Club al completar este viaje
                </div>
              </div>
            )}
            {actual.paso.qr ? (
              <button
                onClick={() => setQrOpen(true)}
                className="w-full h-14 rounded-[8px] bg-brand text-white font-bold text-[16px] flex items-center justify-center gap-2"
              >
                <QrCode size={20} /> Escanear QR
              </button>
            ) : actual.paso.auto ? (
              <div className="w-full h-14 rounded-[8px] bg-field text-text-secondary font-bold text-[15px] flex items-center justify-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                Detectando anclaje de la bici…
              </div>
            ) : (
              <button
                onClick={next}
                className="w-full h-14 rounded-[8px] bg-brand text-white font-bold text-[16px] flex items-center justify-center gap-2"
              >
                Siguiente paso <ChevronRight size={18} />
              </button>
            )}
          </div>

        </div>

        {qrOpen && <QrCameraModal onClose={() => setQrOpen(false)} />}
      </div>
    </PhoneFrame>
  );
}

// Cámara de escaneo de QR a pantalla completa (BiciMAD). Tiene botón de cierre
// y "lee" el código automáticamente (lo gestiona el efecto de la pantalla, que
// avanza al siguiente paso). Simula el visor de cámara con un QR y una línea
// de escaneo animada.
function QrCameraModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col"
      style={{ background: "linear-gradient(160deg,#15131f 0%,#241a44 100%)" }}
    >
      <style>{`@keyframes ct-scan{0%{top:8%}50%{top:86%}100%{top:8%}}`}</style>
      {/* cabecera con cierre */}
      <div className="flex items-center justify-between px-4 pt-12 pb-4">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="w-10 h-10 rounded-full bg-white/15 grid place-items-center text-white"
        >
          <X size={22} />
        </button>
        <span className="text-white font-bold text-[16px]">Escanea la bici</span>
        <span className="w-10" />
      </div>

      {/* visor */}
      <div className="flex-1 grid place-items-center px-8">
        <div className="relative w-full max-w-[300px] aspect-square">
          <div className="absolute inset-0 grid place-items-center">
            <div className="w-[62%] aspect-square rounded-[12px] bg-white p-3">
              <svg viewBox="0 0 100 100" className="w-full h-full" shapeRendering="crispEdges" aria-label="Código QR BiciMAD">
                <rect width="100" height="100" fill="#fff" />
                <path fill="#111" d="M10 10h25v25H10zM15 15v15h15V15zM65 10h25v25H65zM70 15v15h15V15zM10 65h25v25H10zM15 70v15h15V70z" />
                <path fill="#111" d="M45 10h6v6h-6zM55 16h6v6h-6zM45 22h6v6h-6zM62 40h6v6h-6zM40 45h6v6h-6zM50 50h6v6h-6zM70 55h6v6h-6zM45 62h6v6h-6zM58 66h6v6h-6zM66 72h6v6h-6zM50 78h6v6h-6zM78 45h6v6h-6zM84 60h6v6h-6zM40 84h6v6h-6z" />
              </svg>
            </div>
          </div>
          {/* esquinas del visor */}
          <div className="absolute inset-0 rounded-[20px]" style={{ boxShadow: "inset 0 0 0 3px rgba(255,255,255,0.85)" }} />
          {/* línea de escaneo */}
          <div
            className="absolute left-3 right-3 h-0.5 rounded-full"
            style={{ background: "var(--brand)", boxShadow: "0 0 16px 3px var(--brand)", animation: "ct-scan 1.1s linear infinite", top: "8%" }}
          />
        </div>
      </div>

      <div className="text-center text-white/90 text-[15px] font-medium pb-16 px-8">
        Apunta al código QR del manillar de la BiciMAD…
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-[12px] p-3 ${highlight ? "bg-eco-bg" : "bg-field"}`}>
      <div className="text-[11px] text-text-secondary">{label}</div>
      <div className={`text-[14px] font-bold ${highlight ? "text-eco-text" : "text-text"}`}>{value}</div>
    </div>
  );
}

