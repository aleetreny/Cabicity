import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock, Leaf, Plus } from "lucide-react";
import { PhoneFrame } from "@/components/transit/PhoneFrame";
import { getTrip, setTrip } from "@/lib/transit/store";
import { generarOpciones, ordenarOpciones, type Criterio, type Opcion } from "@/lib/transit/engine";
import { fmtEur, fmtMin, fmtCo2 } from "@/lib/transit/format";
import { ModoIcon } from "@/components/transit/ModoIcon";

export const Route = createFileRoute("/resultados")({
  component: Resultados,
});

const CHIPS: { id: Criterio; label: string }[] = [
  { id: "equilibrado", label: "⚖️ Equilibrado" },
  { id: "rapido", label: "⚡ Rápido" },
  { id: "barato", label: "💰 Barato" },
  { id: "ecologico", label: "🌿 Ecológico" },
  { id: "seguro", label: "🛡️ Más seguro" },
];

// Copy de venta de Cabify: compara el Cabify directo con la opción más barata
// para destacar el valor de pagar un poco más por ahorrar tiempo.
function fraseVentaCabify(op: Opcion, ref: Opcion | null): string | null {
  if (!ref || op.id === ref.id) return null;
  const extra = op.precioEur - ref.precioEur;
  const ahorro = Math.round(ref.etaMin - op.etaMin);
  if (extra <= 0.01 || ahorro <= 0) return null;
  const e = `${extra.toFixed(2).replace(".", ",")} €`;
  return `Con ${e} adicionales recortas ${ahorro} min de trayecto`;
}

function Resultados() {
  const navigate = useNavigate();
  const [trip, setTripLocal] = useState(() => getTrip());
  const [criterio, setCriterio] = useState<Criterio>(trip?.criterio ?? "equilibrado");

  useEffect(() => {
    if (!trip || !trip.destino) {
      navigate({ to: "/buscar" });
    }
  }, [trip, navigate]);

  const { opciones, distKm } = useMemo(() => {
    if (!trip?.destino) return { opciones: [], distKm: 0 };
    const coords =
      trip.destinoLng != null && trip.destinoLat != null
        ? ([trip.destinoLng, trip.destinoLat] as [number, number])
        : undefined;
    return generarOpciones(trip.destino, coords);
  }, [trip?.destino, trip?.destinoLng, trip?.destinoLat]);

  const ordenadas = useMemo(() => ordenarOpciones(opciones, criterio), [opciones, criterio]);
  const masBarata = useMemo(
    () => ordenadas.reduce<Opcion | null>((a, b) => (!a || b.precioEur < a.precioEur ? b : a), null),
    [ordenadas]
  );

  const elegir = (op: Opcion) => {
    setTrip({ seleccionada: op, criterio });
    navigate({ to: "/viaje" });
  };

  if (!trip) return <PhoneFrame><div /></PhoneFrame>;

  return (
    <PhoneFrame>
      <div className="absolute inset-0 flex flex-col bg-bg-subdued">
        <div className="px-4 pt-3 pb-3 bg-bg border-b border-border flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button aria-label="Volver" onClick={() => navigate({ to: "/buscar" })} className="w-10 h-10 -ml-2 grid place-items-center shrink-0">
              <ArrowLeft size={22} />
            </button>
            {/* Campos idénticos a los de la pantalla de búsqueda (mismo Route builder) */}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <button
                onClick={() => navigate({ to: "/buscar" })}
                className="flex items-center gap-2.5 bg-field rounded-[8px] h-14 pl-2 pr-4 border-2 border-transparent text-left"
              >
                <img src="icons/ic_set_address_1.svg" alt="" className="w-6 h-6 shrink-0" />
                <span className="flex-1 min-w-0 text-[16px] text-text truncate">{trip.origen}</span>
              </button>
              <button
                onClick={() => navigate({ to: "/buscar" })}
                className="flex items-center gap-2.5 bg-field rounded-[8px] h-14 pl-2 pr-4 border-2 border-transparent text-left"
              >
                <img src="icons/ic_set_address_2.svg" alt="" className="w-6 h-6 shrink-0" />
                <span className="flex-1 min-w-0 text-[16px] text-text truncate">{trip.destino}</span>
              </button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
            {CHIPS.map((c) => (
              <button
                key={c.id}
                onClick={() => { setCriterio(c.id); setTrip({ criterio: c.id }); setTripLocal(getTrip()); }}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[14px] font-medium border ${
                  criterio === c.id
                    ? "bg-text text-white border-text"
                    : "bg-bg text-text border-border"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          <div className="text-[12px] text-text-secondary px-1">
            {ordenadas.length} opciones · {distKm.toFixed(1).replace(".", ",")} km
          </div>
          {ordenadas.map((op) => (
            <button
              key={op.id}
              data-testid={`option-${op.id}`}
              onClick={() => elegir(op)}
              className="bg-surface rounded-[16px] p-4 text-left flex flex-col gap-3"
              style={{ boxShadow: "var(--shadow-resting)" }}
            >
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {op.modos.map((m, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <Plus size={12} className="text-text-secondary" />}
                      <ModoIcon tipo={m} size={m === "ave" ? 13 : 20} />
                    </span>
                  ))}
                </div>
                <div className="flex-1 font-bold text-[15px] text-text">{op.nombre}</div>
                {op.esSostenible && (
                  <Leaf size={16} className="text-eco-text" />
                )}
              </div>

              <div className="flex items-center gap-3 text-[14px]">
                <span className="flex items-center gap-1 font-bold text-text">
                  <Clock size={14} /> {fmtMin(op.etaMin)}
                </span>
                <span className="font-bold text-text">{fmtEur(op.precioEur)}</span>
                <span className="text-text-secondary">{fmtCo2(op.co2Kg)}</span>
              </div>

              {op.puntos > 0 && (
                <div className="self-start bg-cashback-bg text-cashback-text rounded-full pl-1.5 pr-3 py-1 text-[12px] font-bold flex items-center gap-1.5">
                  <img src="illustrations/club-hexagon.svg" alt="" className="w-4 h-4" />
                  +{op.puntos} puntos Cabify Club
                </div>
              )}

              {/* Mensaje de venta destacado: SOLO en la opción Cabify directa,
                  prominente, verde y sin icono a la izquierda. */}
              {op.modos.length === 1 && op.modos[0] === "cabify" && (() => {
                const v = fraseVentaCabify(op, masBarata);
                return v ? (
                  <div className="bg-eco-bg text-eco-text rounded-[10px] px-3 py-2 text-[13px] font-bold leading-snug">
                    {v}
                  </div>
                ) : null;
              })()}
            </button>
          ))}
          {ordenadas.length === 0 && (
            <div className="text-center text-text-secondary py-12 text-[14px]">
              No hay opciones de movilidad para este trayecto.
            </div>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}
