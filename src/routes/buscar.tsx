import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MapPin, Clock, Home } from "lucide-react";
import { PhoneFrame } from "@/components/transit/PhoneFrame";
import { getTrip, setTrip } from "@/lib/transit/store";
import { getMapboxToken } from "@/lib/transit/routeGeo";

export const Route = createFileRoute("/buscar")({
  component: BuscarPage,
});

const ORIGEN_DEFAULT = "Calle de Pradillo, 42, Chamartín, 28002 Madrid";
const ORIGEN_DEFAULT_COORDS: [number, number] = [-3.6708, 40.449];

type Sug = { tipo: string; titulo: string; sub: string; lng?: number; lat?: number };

const RECIENTES: Sug[] = [
  { tipo: "casa", titulo: "Casa", sub: "Calle de las Flores, 8, Madrid", lng: -3.7038, lat: 40.422 },
  { tipo: "reciente", titulo: "El Corte Inglés", sub: "Calle Princesa, 64", lng: -3.7155, lat: 40.4318 },
  { tipo: "reciente", titulo: "Aeropuerto Barajas - T2", sub: "Barajas, Madrid", lng: -3.5935, lat: 40.4729 },
  { tipo: "reciente", titulo: "AVE a Sevilla", sub: "Sevilla Santa Justa (AVE)", lng: -5.9759, lat: 37.3911 },
];

const ORIGENES_RECIENTES: Sug[] = [
  { tipo: "casa", titulo: "Origen actual", sub: ORIGEN_DEFAULT, lng: ORIGEN_DEFAULT_COORDS[0], lat: ORIGEN_DEFAULT_COORDS[1] },
  { tipo: "reciente", titulo: "Nuevos Ministerios", sub: "Paseo de la Castellana, Madrid", lng: -3.6923, lat: 40.4466 },
  { tipo: "reciente", titulo: "Atocha", sub: "Plaza del Emperador Carlos V, Madrid", lng: -3.6909, lat: 40.4064 },
];

const MADRID_PROXIMITY = "-3.6708,40.449";
const MADRID_VIEWBOX = "-3.90,40.60,-3.45,40.25";

function dedupeSugerencias(items: Sug[]): Sug[] {
  const seen = new Set<string>();
  const out: Sug[] = [];
  for (const item of items) {
    const key =
      item.lng != null && item.lat != null
        ? `${item.lng.toFixed(5)},${item.lat.toFixed(5)}`
        : `${item.titulo}|${item.sub}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function buscarMapbox(q: string, limit: number, signal?: AbortSignal): Promise<Sug[]> {
  try {
    const token = getMapboxToken();
    if (!token) return [];
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
      `?access_token=${token}&proximity=${MADRID_PROXIMITY}&country=es&language=es&limit=${limit}` +
      "&types=address,poi,place,locality,neighborhood,postcode";
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || [])
      .map((f: {
        text?: string;
        place_name?: string;
        address?: string;
        center?: [number, number];
        geometry?: { coordinates?: [number, number] };
        place_type?: string[];
      }) => {
        const c = f.center || f.geometry?.coordinates;
        const titulo = [f.text, f.address].filter(Boolean).join(" ");
        const sub = (f.place_name || "").replace(titulo, "").replace(/^,\s*/, "");
        return {
          tipo: f.place_type?.includes("address") || f.place_type?.includes("street") ? "calle" : "reciente",
          titulo: titulo || f.place_name || q,
          sub,
          lng: c?.[0],
          lat: c?.[1],
        };
      })
      .filter((x: Sug) => x.titulo && x.lng != null && x.lat != null);
  } catch {
    return [];
  }
}

async function buscarOsm(q: string, limit: number, signal?: AbortSignal): Promise<Sug[]> {
  try {
    const url =
      "https://nominatim.openstreetmap.org/search" +
      `?format=jsonv2&q=${encodeURIComponent(q)}` +
      `&countrycodes=es&limit=${limit}&addressdetails=1&accept-language=es` +
      `&bounded=1&viewbox=${MADRID_VIEWBOX}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || [])
      .map((f: {
        display_name?: string;
        lon?: string;
        lat?: string;
        type?: string;
        address?: { road?: string; house_number?: string; suburb?: string; neighbourhood?: string; city?: string; town?: string };
      }) => {
        const road = f.address?.road;
        const house = f.address?.house_number;
        const city = f.address?.city || f.address?.town || "Madrid";
        const titulo = road ? [road, house].filter(Boolean).join(", ") : (f.display_name || q).split(",")[0];
        const zona = f.address?.suburb || f.address?.neighbourhood || city;
        return {
          tipo: f.type === "house" || f.type === "residential" || road ? "calle" : "reciente",
          titulo,
          sub: [zona, city].filter((x, i, arr) => x && arr.indexOf(x) === i).join(", "),
          lng: f.lon ? Number(f.lon) : undefined,
          lat: f.lat ? Number(f.lat) : undefined,
        };
      })
      .filter((x: Sug) => x.titulo && Number.isFinite(x.lng) && Number.isFinite(x.lat));
  } catch {
    return [];
  }
}

async function buscarDirecciones(q: string, limit: number, signal?: AbortSignal): Promise<Sug[]> {
  const query = /madrid/i.test(q) ? q : `${q}, Madrid`;
  const mapbox = await buscarMapbox(query, limit, signal);
  const osm = mapbox.length >= 3 ? [] : await buscarOsm(query, limit, signal);
  return dedupeSugerencias([...mapbox, ...osm]).slice(0, limit);
}

function textoDestino(p: Sug): string {
  if (p.tipo === "casa") return p.sub || p.titulo;
  return [p.titulo, p.sub].filter(Boolean).join(", ");
}

// Geocodifica una consulta y devuelve sus coordenadas (o undefined). Se usa al
// enviar si el usuario tecleó libremente sin elegir una sugerencia.
async function geocodeUno(q: string): Promise<[number, number] | undefined> {
  const first = (await buscarDirecciones(q, 1))[0];
  return first?.lng != null && first?.lat != null ? [first.lng, first.lat] : undefined;
}

function BuscarPage() {
  const navigate = useNavigate();
  const destinoRef = useRef<HTMLInputElement>(null);
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [sugerencias, setSugerencias] = useState<Sug[]>(RECIENTES);
  const [eligiendo, setEligiendo] = useState(false);
  const [campoActivo, setCampoActivo] = useState<"origen" | "destino">("destino");
  const [origenCoords, setOrigenCoords] = useState<[number, number] | undefined>(ORIGEN_DEFAULT_COORDS);
  const [destCoords, setDestCoords] = useState<[number, number] | undefined>(undefined);

  // Autocompletado real en ambos campos: origen y destino usan el mismo
  // geocoder, para poder salir de cualquier calle/punto de Madrid.
  useEffect(() => {
    if (eligiendo) { setEligiendo(false); return; }
    const q = (campoActivo === "origen" ? origen : destino).trim();
    if (q.length < 2) {
      setSugerencias(campoActivo === "origen" ? ORIGENES_RECIENTES : RECIENTES);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const feats = await buscarDirecciones(q, 6, ctrl.signal);
        if (feats.length) setSugerencias(feats);
      } catch { /* abortado o sin red: mantenemos lo que haya */ }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origen, destino, campoActivo]);

  useEffect(() => {
    const t = getTrip();
    if (t) {
      setOrigen(t.origen || ORIGEN_DEFAULT);
      setDestino(t.destino || "");
      setOrigenCoords(
        t.origenLng != null && t.origenLat != null ? [t.origenLng, t.origenLat] : ORIGEN_DEFAULT_COORDS
      );
      setDestCoords(
        t.destinoLng != null && t.destinoLat != null ? [t.destinoLng, t.destinoLat] : undefined
      );
    } else {
      setOrigen(ORIGEN_DEFAULT);
      setOrigenCoords(ORIGEN_DEFAULT_COORDS);
    }
  }, []);

  const submit = async (destOverride?: string, coordsOverride?: [number, number]) => {
    const dest = (destOverride ?? destino).trim();
    if (!origen.trim() || !dest) return;
    // Coordenadas reales del destino: las de la sugerencia elegida o, si el
    // usuario tecleó libremente, geocodificamos al vuelo para enrutar de verdad.
    const coords = coordsOverride ?? destCoords ?? (await geocodeUno(dest));
    const salidaCoords =
      origenCoords ??
      (origen.trim() === ORIGEN_DEFAULT ? ORIGEN_DEFAULT_COORDS : await geocodeUno(origen));
    setTrip({
      origen, destino: dest, criterio: "equilibrado", seleccionada: undefined,
      origenLng: salidaCoords?.[0], origenLat: salidaCoords?.[1],
      destinoLng: coords?.[0], destinoLat: coords?.[1],
    });
    navigate({ to: "/resultados" });
  };

  const elegirSugerencia = (p: Sug) => {
    const texto = textoDestino(p);
    const coords = p.lng != null && p.lat != null ? ([p.lng, p.lat] as [number, number]) : undefined;
    setEligiendo(true);
    if (campoActivo === "origen") {
      setOrigen(texto);
      setOrigenCoords(coords);
      setCampoActivo("destino");
      setSugerencias(RECIENTES);
      setTimeout(() => destinoRef.current?.focus(), 0);
      return;
    }
    submit(texto, coords);
  };

  return (
    <PhoneFrame>
      <div className="absolute inset-0 flex flex-col bg-bg">
        <div className="px-4 pt-3 pb-4 flex items-center gap-3 border-b border-border">
          <button aria-label="Volver" onClick={() => navigate({ to: "/" })} className="w-10 h-10 -ml-2 grid place-items-center shrink-0">
            <ArrowLeft size={22} />
          </button>
          {/* Mismos campos que en resultados: icono numerado DENTRO del campo,
              misma altura, padding, radio y tipografía (Route builder del DS). */}
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center gap-2.5 bg-field rounded-[8px] h-14 pl-2 pr-4 border-2 border-transparent focus-within:border-[#5B34AC]">
              <img src="icons/ic_set_address_1.svg" alt="" className="w-6 h-6 shrink-0" />
              <input
                value={origen}
                onFocus={() => setCampoActivo("origen")}
                onChange={(e) => {
                  setOrigen(e.target.value);
                  setOrigenCoords(undefined);
                  setCampoActivo("origen");
                }}
                placeholder="¿Desde dónde sales?"
                className="flex-1 min-w-0 bg-transparent text-[16px] text-text placeholder:text-text-secondary outline-none"
              />
            </div>
            <div className="flex items-center gap-2.5 bg-field rounded-[8px] h-14 pl-2 pr-4 border-2 border-transparent focus-within:border-[#5B34AC]">
              <img src="icons/ic_set_address_2.svg" alt="" className="w-6 h-6 shrink-0" />
              <input
                ref={destinoRef}
                autoFocus
                value={destino}
                onFocus={() => setCampoActivo("destino")}
                onChange={(e) => {
                  setDestino(e.target.value);
                  setDestCoords(undefined);
                  setCampoActivo("destino");
                }}
                placeholder="¿A dónde vas?"
                className="flex-1 min-w-0 bg-transparent text-[16px] text-text placeholder:text-text-secondary outline-none"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto p-2">
          {sugerencias.map((p, i) => (
            <li key={i}>
              <button
                onClick={() => elegirSugerencia(p)}
                className="w-full p-3 rounded-[8px] flex items-center gap-4 text-left hover:bg-field"
              >
                <span className="w-9 h-9 rounded-[8px] grid place-items-center" style={{
                  background: p.tipo === "casa" ? "#ecf4fd" : "var(--field-bg)",
                  color: p.tipo === "casa" ? "#2760c2" : "var(--text-secondary)",
                }}>
                  {p.tipo === "casa" ? <Home size={18} /> : p.tipo === "calle" ? <MapPin size={18} /> : <Clock size={18} />}
                </span>
                <span className="flex-1 min-w-0">
                  <div className="text-[16px] text-text font-medium truncate">{p.titulo}</div>
                  <div className="text-[14px] text-text-secondary truncate">{p.sub}</div>
                </span>
                <MapPin size={16} className="text-text-secondary" />
              </button>
            </li>
          ))}
        </ul>

        <div className="p-4 bg-bg border-t border-border">
          <button
            disabled={!origen.trim() || !destino.trim()}
            onClick={() => submit()}
            className="w-full h-14 rounded-[8px] bg-brand text-white font-bold text-[16px] disabled:opacity-40"
          >
            Ver opciones
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}
