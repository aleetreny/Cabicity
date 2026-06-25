import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Search, Clock, Home } from "lucide-react";
import { PhoneFrame } from "@/components/transit/PhoneFrame";
import { setTrip } from "@/lib/transit/store";
import { MapaMapbox } from "@/components/transit/MapaMapbox";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cabify Transit · Viajar" },
      { name: "description", content: "Comparador intermodal de Cabify en Madrid." },
    ],
  }),
  component: HomePage,
});

const PREDICCIONES = [
  { tipo: "casa", titulo: "Casa", sub: "Calle de las Flores, 8, Madrid", lng: -3.7038, lat: 40.422 },
  { tipo: "reciente", titulo: "El Corte Inglés", sub: "Calle Princesa, 64", lng: -3.7155, lat: 40.4318 },
  { tipo: "reciente", titulo: "Aeropuerto Barajas - T2", sub: "Barajas, Madrid", lng: -3.5935, lat: 40.4729 },
];

// Carrusel de servicios (ilustraciones reales del Design System de Cabify).
// "Cabify City" es el nuevo producto intermodal: desde ahí arranca el flujo.
const SERVICIOS = [
  { id: "cabify", label: "Cabify", img: "illustrations/cabify.svg" },
  { id: "city", label: "Cabify City", img: "illustrations/city.svg", nuevo: true },
  { id: "moto", label: "Moto", img: "illustrations/moto.svg" },
  { id: "voltio", label: "Voltio", img: "illustrations/voltio.svg" },
  { id: "reservas", label: "Reservas", img: "illustrations/reservas.svg" },
];

// Forma cóncava de la barra de navegación (Union, fiel al diseño Cabify).
const UNION_SVG = `<svg width="100%" height="100%" viewBox="0 0 390 94" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><g filter="url(#u_dd)"><path d="M195 6C203.575 6 211.166 10.208 215.822 16.671C219.853 22.266 225.419 27.648 232.315 27.648H384C387.314 27.648 390 30.335 390 33.648V94H0V33.648C0 30.335 2.686 27.648 6 27.648H157.685C164.581 27.648 170.147 22.266 174.178 16.671C178.834 10.208 186.425 6 195 6Z" fill="white"/></g><defs><filter id="u_dd" x="-16" y="-6" width="422" height="124" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="bg"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"/><feOffset dy="-2"/><feGaussianBlur stdDeviation="6"/><feColorMatrix type="matrix" values="0 0 0 0 0.196 0 0 0 0 0.196 0 0 0 0 0.322 0 0 0 0.22 0"/><feBlend mode="normal" in2="bg" result="s2"/><feBlend mode="normal" in="SourceGraphic" in2="s2" result="shape"/></filter></defs></svg>`;

// Icono pestaña "Viajar" (activo, morado) — fiel al DS.
const IC_VIAJAR = `<svg width="24" height="24" viewBox="48 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M66.168 1C64.862 1 63.751 1.835 63.339 3H61.668C61.116 3 60.668 3.448 60.668 4C60.668 4.552 61.116 5 61.668 5H63.339C63.479 5.398 63.702 5.757 63.985 6.058C62.101 6.382 60.668 8.024 60.668 10V17.081C60.668 18.07 61.263 18.962 62.176 19.341C62.502 19.477 62.833 19.595 63.168 19.695V16C63.168 14.343 64.511 13 66.168 13C67.825 13 69.168 14.343 69.168 16V19.695C69.503 19.595 69.834 19.477 70.16 19.341C71.073 18.962 71.668 18.07 71.668 17.081V10C71.668 8.024 70.235 6.382 68.351 6.058C68.634 5.757 68.857 5.398 68.997 5H70.668C71.22 5 71.668 4.552 71.668 4C71.668 3.448 71.22 3 70.668 3H68.997C68.585 1.835 67.474 1 66.168 1ZM65.168 4C65.168 4.552 65.616 5 66.168 5C66.72 5 67.168 4.552 67.168 4C67.168 3.448 66.72 3 66.168 3C65.616 3 65.168 3.448 65.168 4Z" fill="#7145D6"/><path d="M67.668 16V21C67.668 21.828 66.996 22.5 66.168 22.5C65.34 22.5 64.668 21.828 64.668 21V16C64.668 15.172 65.34 14.5 66.168 14.5C66.996 14.5 67.668 15.172 67.668 16Z" fill="#7145D6"/><path fill-rule="evenodd" clip-rule="evenodd" d="M54.97 3H59.376C59.242 3.306 59.168 3.644 59.168 4C59.168 4.356 59.242 4.694 59.376 5H54.97C54.324 5 53.751 5.413 53.547 6.026L52.555 9H59.259C59.199 9.324 59.168 9.659 59.168 10V17.38C59.168 17.956 59.309 18.51 59.566 19H55.168V20.5C55.168 21.328 54.496 22 53.668 22H50.668C49.84 22 49.168 21.328 49.168 20.5V19H48.668C48.116 19 47.668 18.552 47.668 18V13C47.668 11.243 48.801 9.75 50.376 9.213L51.65 5.393C52.126 3.964 53.463 3 54.97 3ZM52.668 15.5C53.496 15.5 54.168 14.828 54.168 14C54.168 13.172 53.496 12.5 52.668 12.5C51.84 12.5 51.168 13.172 51.168 14C51.168 14.828 51.84 15.5 52.668 15.5Z" fill="#7145D6"/></svg>`;

// Icono pestaña "Enviar" (gris) — fiel al DS.
const IC_ENVIAR = `<svg width="24" height="24" viewBox="48 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M69.168 4C69.996 4 70.668 4.672 70.668 5.5V20.5C70.668 21.328 69.996 22 69.168 22H50.168C49.34 22 48.668 21.328 48.668 20.5V5.5C48.668 4.672 49.34 4 50.168 4H69.168ZM50.668 20V6H55.668V11L63.668 13.5V6H68.668V20H50.668ZM61.668 6H57.668V9.53L61.668 10.78V6Z" fill="#5E6088"/></svg>`;

function HomePage() {
  const navigate = useNavigate();
  const [servicio, setServicio] = useState("cabify");
  const [notice, setNotice] = useState("");
  // Medimos la altura real de la hoja inferior para (1) centrar la ubicación en
  // el área visible del mapa y (2) colocar el botón "centrar mi ubicación"
  // SIEMPRE por encima de la hoja, sin pisarla, pase lo que pase con el contenido.
  // Hoja inferior ARRASTRABLE con dos posiciones (colapsada / expandida). En
  // colapsada queda más baja y el último elemento ("Aeropuerto Barajas") se corta
  // bajo la barra de pestañas, dejando claro que se puede arrastrar.
  const sheetRef = useRef<HTMLDivElement>(null);
  const [contH, setContH] = useState(800);
  useEffect(() => {
    const measure = () => {
      const parent = sheetRef.current?.offsetParent as HTMLElement | null;
      setContH(parent?.clientHeight ?? window.innerHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const COLLAPSED = Math.round(contH * 0.42);
  const EXPANDED = Math.round(contH * 0.12);
  const [expanded, setExpanded] = useState(false);
  const [dragTop, setDragTop] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startTop: number } | null>(null);
  const sheetTop = dragTop ?? (expanded ? EXPANDED : COLLAPSED);
  const obscuredBottom = contH - sheetTop;
  const clampTop = (v: number) => Math.max(EXPANDED, Math.min(COLLAPSED, v));
  const onDragStart = (e: ReactPointerEvent) => {
    dragRef.current = { startY: e.clientY, startTop: sheetTop };
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };
  const onDragMove = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    setDragTop(clampTop(dragRef.current.startTop + (e.clientY - dragRef.current.startY)));
  };
  const onDragEnd = () => {
    if (!dragRef.current) return;
    if (dragTop == null) {
      // No hubo arrastre: lo tratamos como toque para alternar expandir/colapsar.
      setExpanded((v) => !v);
    } else {
      setExpanded(dragTop < (EXPANDED + COLLAPSED) / 2);
      setDragTop(null);
    }
    dragRef.current = null;
  };

  const goSearch = (destino?: string, coords?: [number, number]) => {
    setTrip({
      origen: "Calle de Pradillo, 42, Chamartín, 28002 Madrid",
      origenLng: -3.6708,
      origenLat: 40.449,
      destino: destino ?? "",
      destinoLng: coords?.[0],
      destinoLat: coords?.[1],
      criterio: "equilibrado",
    });
    navigate({ to: "/buscar" });
  };

  const elegirServicio = (id: string) => {
    setServicio(id);
    goSearch();
  };

  return (
    <PhoneFrame transparentStatusBar>
      <div className="absolute inset-0">
        <MapaMapbox centro={[-3.6708, 40.449]} zoom={14} fitRuta={false} interactive ubicacionActual={[-3.6708, 40.449]} paddingBottom={obscuredBottom} />
      </div>

      {/* avatar */}
      <img src="illustrations/avatar-daniel.svg" alt="Daniel Sáez" className="absolute top-11 left-4 w-12 h-12 rounded-full object-cover z-10" style={{ boxShadow: "var(--shadow-rised)" }} />


      {/* bottom sheet ARRASTRABLE */}
      <div
        ref={sheetRef}
        className="absolute left-0 right-0 bottom-0 bg-surface rounded-t-[24px] flex flex-col z-20 overflow-hidden"
        style={{ top: sheetTop, transition: dragTop == null ? "top 0.34s cubic-bezier(0.32,0.72,0,1)" : "none", boxShadow: "var(--shadow-rised)" }}
      >
        {/* zona arrastrable: tirador + cabecera */}
        <div
          className="pt-2.5 px-4 cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="mx-auto h-1.5 w-10 rounded-full" style={{ background: "var(--sheet-handle)" }} />
          <p className="mt-3 text-[15px] font-medium text-text-secondary leading-5">Hola, Daniel Sáez</p>
          <h1 className="text-[22px] font-bold text-text leading-7">Viaja a tu manera</h1>
        </div>

        {/* contenido desplazable (se corta bajo la barra de pestañas) */}
        <div className="flex-1 overflow-y-auto pb-28 flex flex-col gap-3 pt-2">
        {/* carrusel de servicios */}
        <div className="shrink-0 flex gap-2 overflow-x-auto px-4 pt-2.5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SERVICIOS.map((s) => {
            const active = servicio === s.id;
            return (
              <button
                key={s.id}
                aria-label={s.label}
                data-testid={`service-${s.id}`}
                onClick={() => elegirServicio(s.id)}
                className="relative shrink-0 w-[92px] h-[92px] rounded-[8px] flex flex-col items-center justify-end pb-2 transition-colors"
                style={{
                  background: active ? "#F5F1FC" : "var(--field-bg)",
                  border: active ? "2px solid #7145D6" : "1px solid transparent",
                }}
              >
                {s.nuevo && (
                  // Badge "NUEVO" del DS: centrado en el borde superior, morado
                  // oscuro #4A2B8D, radio 4, 11px bold blanco.
                  <span
                    className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center text-[11px] font-bold leading-none px-2 py-1 rounded-[4px] text-white"
                    style={{ background: "#4A2B8D" }}
                  >
                    NUEVO
                  </span>
                )}
                <img src={s.img} alt={s.label} className="w-[74px] h-[46px] object-contain" />
                <span className="text-[12px] font-medium text-text leading-tight mt-0.5">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* buscador */}
        <button
          onClick={() => goSearch()}
          className="shrink-0 mx-4 bg-field rounded-[8px] px-4 py-3.5 flex items-center gap-3 text-left"
        >
          <Search size={20} className="text-text-secondary" />
          <span className="text-text-secondary text-[16px]">Introduce tu ruta</span>
        </button>

        {/* predicciones */}
        <ul className="shrink-0 px-2 flex flex-col gap-0.5">
          {PREDICCIONES.map((p, i) => (
            <li key={i}>
              <button
                onClick={() => goSearch(p.sub, p.lng != null && p.lat != null ? [p.lng, p.lat] : undefined)}
                className="w-full p-2 rounded-[8px] flex items-center gap-4 text-left hover:bg-field active:bg-field"
              >
                <span className="w-8 h-8 rounded-[8px] grid place-items-center flex-shrink-0" style={{
                  background: p.tipo === "casa" ? "#ecf4fd" : "var(--field-bg)",
                  color: p.tipo === "casa" ? "#2760c2" : "var(--text-secondary)",
                }}>
                  {p.tipo === "casa" ? <Home size={18} /> : <Clock size={18} />}
                </span>
                <span className="flex-1 min-w-0">
                  <div className="text-[16px] text-text font-medium truncate">{p.titulo}</div>
                  <div className="text-[14px] text-text-secondary truncate">{p.sub}</div>
                </span>
              </button>
            </li>
          ))}
        </ul>
        </div>
      </div>

      {/* bottom nav con muesca (Union) + medalla central. Reserva el área segura
          inferior del móvil (gesture/back bar) con env(safe-area-inset-bottom)
          para que las pestañas no queden pisadas por la barra del sistema. */}
      <div
        className="absolute left-0 right-0 bottom-0 z-30"
        style={{ height: "calc(100px + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* forma blanca con muesca central; llena toda la barra (incl. área segura) */}
        <div className="absolute inset-0" dangerouslySetInnerHTML={{ __html: UNION_SVG }} />

        {/* medalla central elevada (sobre el bump) con punto de aviso rojo */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-3 w-12 h-12"
          style={{ filter: "drop-shadow(var(--shadow-rised))" }}
        >
          <img src="icons/ic_medal_multi_cabify_club.svg" alt="" className="w-12 h-12" />
          <span
            className="absolute top-1 right-1 w-2 h-2 rounded-full border-2 border-white"
            style={{ background: "#BF2721" }}
          />
        </div>

        {/* pestañas: ancladas abajo con padding = área segura + holgura */}
        <div
          className="absolute inset-x-0 bottom-0 flex items-end justify-between px-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          <NavTab label="Viajar" active svg={IC_VIAJAR} onClick={() => setExpanded(false)} />
          <div className="flex-1 flex justify-center">
            <button
              onClick={() => setNotice("Cabify Club estará disponible muy pronto")}
              className="text-[12px] font-medium text-text-secondary"
            >
              Cabify Club
            </button>
          </div>
          <NavTab
            label="Enviar"
            svg={IC_ENVIAR}
            onClick={() => setNotice("El servicio de envíos estará disponible muy pronto")}
          />
        </div>

        {/* home indicator del móvil, justo por encima del área segura */}
        <div
          className="absolute left-1/2 -translate-x-1/2 h-1 w-32 rounded-full bg-black/80"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 5px)" }}
        />
      </div>

      {notice && (
        <div
          role="status"
          className="absolute left-4 right-4 bottom-28 z-40 rounded-[12px] bg-text px-4 py-3 text-center text-[13px] font-medium text-white"
          style={{ boxShadow: "var(--shadow-rised)" }}
        >
          {notice}
        </div>
      )}
    </PhoneFrame>
  );
}

function NavTab({
  label,
  svg,
  active,
  onClick,
}: {
  label: string;
  svg: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex-1 flex flex-col items-center gap-1">
      <span className="w-6 h-6" dangerouslySetInnerHTML={{ __html: svg }} />
      <span className={`text-[12px] font-medium ${active ? "text-brand" : "text-text-secondary"}`}>{label}</span>
    </button>
  );
}
