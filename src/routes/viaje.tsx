import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Leaf } from "lucide-react";
import { PhoneFrame } from "@/components/transit/PhoneFrame";
import { getTrip, type TripState } from "@/lib/transit/store";
import { fmtEur, fmtMin, fmtCo2 } from "@/lib/transit/format";
import { ModoChip } from "@/components/transit/ModoIcon";

export const Route = createFileRoute("/viaje")({
  component: Viaje,
});

function Viaje() {
  const navigate = useNavigate();
  const [trip, setT] = useState<TripState | null>(null);

  useEffect(() => {
    const t = getTrip();
    if (!t?.seleccionada) navigate({ to: "/resultados" });
    else setT(t);
  }, [navigate]);

  if (!trip?.seleccionada) return <PhoneFrame><div /></PhoneFrame>;
  const op = trip.seleccionada;

  return (
    <PhoneFrame>
      <div className="absolute inset-0 flex flex-col bg-bg-subdued">
        <div className="px-4 pt-3 pb-3 bg-bg border-b border-border flex items-center gap-3">
          <button
            aria-label="Volver"
            onClick={() => navigate({ to: "/resultados" })}
            className="w-10 h-10 -ml-2 shrink-0 grid place-items-center rounded-full"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0 pr-1">
            <div className="text-[12px] text-text-secondary truncate">{trip.origen} → {trip.destino}</div>
            <div className="text-[16px] font-bold text-text truncate">{op.nombre}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <div className="bg-surface rounded-[16px] p-4 flex flex-col gap-3" style={{ boxShadow: "var(--shadow-resting)" }}>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-[12px] text-text-secondary">Duración</div>
                <div className="text-[20px] font-bold flex items-center gap-1.5"><Clock size={18} />{fmtMin(op.etaMin)}</div>
              </div>
              <div className="flex-1">
                <div className="text-[12px] text-text-secondary">Precio</div>
                <div className="text-[20px] font-bold">{fmtEur(op.precioEur)}</div>
              </div>
              <div className="flex-1">
                <div className="text-[12px] text-text-secondary">CO₂</div>
                <div className="text-[16px] font-bold flex items-center gap-1 text-eco-text"><Leaf size={14} />{fmtCo2(op.co2Kg)}</div>
              </div>
            </div>

            {op.desglose && (
              <div className="text-[13px] text-text-secondary border-t border-border pt-3">
                <span className="font-bold text-text">Desglose:</span> {op.desglose}
              </div>
            )}

            {op.puntos > 0 && (
              <div className="bg-cashback-bg text-cashback-text rounded-[12px] px-3 py-2.5 text-[14px] font-bold flex items-center gap-2">
                <img src="illustrations/club-hexagon.svg" alt="" className="w-5 h-5" />
                Ganarás +{op.puntos} puntos Cabify Club
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-[14px] font-bold text-text-secondary uppercase tracking-wide px-1">Tu ruta</h2>
            <ol className="flex flex-col gap-2">
              {op.tramos.map((t, i) => (
                <li key={i} className="bg-surface rounded-[12px] p-3 flex items-center gap-3" style={{ boxShadow: "var(--shadow-resting)" }}>
                  <ModoChip tipo={t.tipo} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-text truncate">{t.titulo}</div>
                    {t.subtitulo && <div className="text-[13px] text-text-secondary truncate">{t.subtitulo}</div>}
                  </div>
                  <div className="text-[13px] font-bold text-text-secondary">{fmtMin(t.duracionMin)}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="p-4 bg-bg border-t border-border">
          <button
            onClick={() => navigate({ to: op.modos.includes("cabify") ? "/categoria-cabify" : "/navegacion" })}
            className="w-full h-14 rounded-[8px] bg-brand text-white font-bold text-[16px]"
          >
            Comenzar viaje
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}
