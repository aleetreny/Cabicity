// Motor determinista del comparador (Cabify Transit)
// Resumen aplicado de transit-model.md
import { rutaMetro, type LngLat } from "./metroRouter";
import { rutaCercanias } from "./cercaniasRouter";
import { rutaEmt } from "./emtRouter";
import { rutaBiciMad } from "./bicimad";
import { proximasSalidasMetro, type HorarioProgramado } from "./metroSchedule";
import { proximasSalidasCercanias } from "./cercaniasSchedule";
import { proximasSalidasEmt } from "./emtSchedule";

// Origen real fijo: Calle de Pradillo, 42 (Chamartín). Debe coincidir con SOL
// en routeGeo.ts para que mapa y datos estén alineados.
const ORIGEN_COORDS: LngLat = [-3.6708, 40.449];

export type ModoTipo =
  | "cabify"
  | "metro"
  | "cercanias"
  | "ave"
  | "andando"
  | "bicimad"
  | "bus";

export interface Paso {
  instruccion: string;
  duracionMin: number;
  qr?: boolean; // paso de escaneo de QR (BiciMAD): la UI abre una cámara modal
  auto?: boolean; // paso que avanza solo (p. ej. al detectar el anclaje de la bici)
}

export interface Tramo {
  tipo: ModoTipo;
  titulo: string;
  subtitulo?: string;
  horario?: HorarioProgramado;
  duracionMin: number;
  distanciaKm: number;
  pasos: Paso[];
  color: string;
  icono: string; // icons/... o "lucide:Bus"
  coords?: LngLat[]; // trazado REAL del tramo (estaciones GTFS) si está disponible
}

export interface Opcion {
  id: string;
  tipo: "simple" | "combo";
  nombre: string;
  modos: ModoTipo[];
  tramos: Tramo[];
  etaMin: number;
  precioEur: number; // 0 = Gratis
  co2Kg: number;
  puntos: number; // puntos Cabify Club (más por rutas sostenibles)
  desglose?: string;
  esSostenible: boolean;
}

// --- hash determinista ----------------------------------------------------
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  const x = s.trim().toLowerCase();
  for (let i = 0; i < x.length; i++) {
    h ^= x.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function distanciaPara(destino: string): number {
  const d = destino.trim().toLowerCase();
  if (!d) return 0;
  if (/sevilla|barcelona|valencia|zaragoza|m[áa]laga|c[óo]rdoba/.test(d)) {
    const opts = [395, 505, 305, 295, 525, 345];
    return opts[hashStr(d) % opts.length];
  }
  if (/toledo|segovia|guadalajara|alcal[áa]/.test(d)) return 65 + (hashStr(d) % 30);
  if (/aeropuerto|barajas|t1|t2|t3|t4/.test(d)) return 14;
  // Lugares cercanos a Chamartín (el origen): trayectos cortos -> aparecen
  // "a pie" y BiciMAD entre las opciones.
  if (/bernab[eé]u|nuevos ministerios|plaza castilla|chamart[ií]n|cuzco|prosperidad|concha espina|am[eé]rica|gregorio mara|alonso mart|colombia|pradillo|alfonso xiii/.test(d)) {
    return Math.round((0.8 + (hashStr(d) % 21) / 10) * 10) / 10; // 0.8 – 2.8 km (andable)
  }
  // urbano 1.5 – 22 km
  const r = (hashStr(d) % 210) / 10 + 1.5;
  return Math.round(r * 10) / 10;
}

// --- Categorías Cabify ----------------------------------------------------
// Multiplicador sobre el precio base. La más barata (Eco) se usa al mostrar
// el precio de Cabify en /resultados y /viaje; en /categoria-cabify el usuario
// elige la concreta antes de iniciar la navegación.
export type CabifyCategoriaId = "eco" | "electric" | "estandar" | "group";
export interface CabifyCategoria {
  id: CabifyCategoriaId;
  nombre: string;
  descripcion: string;
  multiplicador: number;
  etaExtraMin: number;
  img: string;
}
export const CABIFY_CATEGORIAS: CabifyCategoria[] = [
  { id: "eco",      nombre: "Cabify Eco",      descripcion: "100% eléctrico, la opción más económica", multiplicador: 0.88, etaExtraMin: 1, img: "illustrations/cat-eco.svg" },
  { id: "electric", nombre: "Cabify Electric", descripcion: "Vehículo 100% eléctrico",                 multiplicador: 1.08, etaExtraMin: 2, img: "illustrations/cat-electric.svg" },
  { id: "estandar", nombre: "Cabify",          descripcion: "Coche estándar para hasta 4 personas",    multiplicador: 1.00, etaExtraMin: 0, img: "illustrations/cabify.svg" },
  { id: "group",    nombre: "Cabify Group",    descripcion: "Hasta 6 plazas o equipaje extra",         multiplicador: 1.45, etaExtraMin: 2, img: "illustrations/cat-group.svg" },
];
const CHEAPEST_CABIFY_MULTI = Math.min(...CABIFY_CATEGORIAS.map((c) => c.multiplicador));

export function categoriasCabifyConPrecio(precioBaseCabify: number) {
  return CABIFY_CATEGORIAS.map((c) => ({
    ...c,
    precioEur: Math.round(precioBaseCabify * (c.multiplicador / CHEAPEST_CABIFY_MULTI) * 100) / 100,
  }));
}

// --- parámetros ----------------------------------------------------------
const MODOS = {
  cabify:    { speed: 25,  price: (d: number) => (2.5 + 1.25 * d) * CHEAPEST_CABIFY_MULTI, co2: 0.15,  avail: () => true,        color: "#7145d6", icono: "icons/ic_cabify.svg" },
  metro:     { speed: 30,  price: () => 2.0,                     co2: 0.04,  avail: (d: number) => d < 20, color: "#2760c2", icono: "lucide:TramFront" },
  cercanias: { speed: 45,  price: (d: number) => 2.6 + 0.05 * d, co2: 0.035, avail: (d: number) => d >= 5 && d < 60, color: "#017251", icono: "lucide:TrainFrontTunnel" },
  ave:       { speed: 200, price: (d: number) => 25 + 0.18 * d,  co2: 0.03,  avail: (d: number) => d >= 60, color: "#5b34ac", icono: "lucide:TrainFront" },
  andando:   { speed: 5,   price: () => 0,                       co2: 0,     avail: (d: number) => d < 3,  color: "#5e6088", icono: "icons/ic_walking.svg" },
  bicimad:   { speed: 13,  price: () => 0.5,                     co2: 0,     avail: (d: number) => d < 8,  color: "#ea8c2e", icono: "icons/ic_bicycle.svg" },
  bus:       { speed: 14,  price: () => 1.5,                     co2: 0.08,  avail: (d: number) => d < 30, color: "#006eb6", icono: "lucide:Bus" },
} as const;

// Modos sostenibles: a pie, bici pública y transporte público/ferroviario.
// Todo lo que vaya en Cabify cuenta como eco (flota cada vez más electrificada
// y compensación de CO₂ de la compañía). El bus EMT NO se marca como eco.
const SOSTENIBLE: Record<ModoTipo, boolean> = {
  andando: true, bicimad: true, metro: true, cercanias: true, ave: true, bus: false, cabify: true,
};

// Puntos Cabify Club por km. Los modos sostenibles dan más; Cabify (coche con
// conductor) también suma puntos siempre, aunque en menor proporción, porque
// el viaje se hace dentro del ecosistema Cabify.
const PUNTOS_POR_KM: Record<ModoTipo, number> = {
  andando: 12, bicimad: 9, metro: 6, cercanias: 6, bus: 5, ave: 4, cabify: 3,
};

// Puntuación de "seguridad" percibida por modo (0-10). Cabify lidera: viaje
// puerta a puerta, conductor identificado y trayecto monitorizado. El transporte
// público es seguro; andar/bici de noche o el bus tienen algo más de exposición.
const SEGURIDAD: Record<ModoTipo, number> = {
  cabify: 10, ave: 9, cercanias: 8, metro: 7, bus: 6, bicimad: 4, andando: 3,
};

const NOMBRES: Record<ModoTipo, string> = {
  cabify: "Cabify",
  metro: "Metro",
  cercanias: "Cercanías",
  ave: "AVE",
  andando: "Andando",
  bicimad: "BiciMAD",
  bus: "Bus EMT",
};

const LINEAS_METRO = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10"];
const ESTACIONES = ["Sol", "Nuevos Ministerios", "Chamartín", "Atocha", "Príncipe Pío", "Goya", "Plaza España", "Bilbao", "Tribunal", "Diego de León"];
const DIR_METRO = ["Pinar de Chamartín", "Cuatro Caminos", "Aluche", "Pitis", "Laguna", "Pueblo Nuevo", "Argüelles", "Villaverde Alto"];
const CERCANIAS_LINEAS = ["C-1", "C-3", "C-4", "C-5", "C-7"];

function pick<T>(arr: readonly T[], seed: number, i = 0): T {
  return arr[(seed + i * 31) % arr.length];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function capPuntos(p: number, interurbano: boolean): number {
  return Math.min(Math.round(p), interurbano ? 600 : 250);
}

// --- generación de tramos ---------------------------------------------------
function tramoCabify(distKm: number, titulo: string, instruccion: string): Tramo {
  const duracion = Math.max(2, Math.round((distKm / MODOS.cabify.speed) * 60));
  return {
    tipo: "cabify", titulo, duracionMin: duracion, distanciaKm: distKm,
    color: MODOS.cabify.color, icono: MODOS.cabify.icono,
    // El paso de recogida se muestra en la pantalla /recogida-cabify, así que
    // aquí arrancamos directamente con el trayecto en coche para no duplicar.
    pasos: [
      { instruccion, duracionMin: duracion },
    ],
  };
}

function tramoAndando(distKm: number, hacia: string): Tramo {
  const duracion = Math.max(1, Math.round((distKm / MODOS.andando.speed) * 60));
  return {
    tipo: "andando", titulo: `Camina ${Math.round(distKm * 1000)} m hasta ${hacia}`,
    duracionMin: duracion, distanciaKm: distKm,
    color: MODOS.andando.color, icono: MODOS.andando.icono,
    pasos: [{ instruccion: `Camina ${Math.round(distKm * 1000)} m y dirígete a ${hacia}`, duracionMin: duracion }],
  };
}

function tramoMetro(distKm: number, seed: number): Tramo {
  const linea = pick(LINEAS_METRO, seed);
  const direccion = pick(DIR_METRO, seed, 1);
  const origen = pick(ESTACIONES, seed, 2);
  const destino = pick(ESTACIONES, seed, 3);
  const paradas = Math.max(2, Math.round(distKm * 1.2));
  const duracion = Math.max(4, Math.round((distKm / MODOS.metro.speed) * 60) + 2);
  return {
    tipo: "metro", titulo: `${linea} · ${origen} → ${destino}`, subtitulo: `dirección ${direccion} · ${paradas} paradas`,
    duracionMin: duracion, distanciaKm: distKm, color: MODOS.metro.color, icono: MODOS.metro.icono,
    pasos: [
      { instruccion: `Coge la ${linea} dirección ${direccion} en ${origen}`, duracionMin: 1 },
      { instruccion: `Continúa ${paradas} paradas`, duracionMin: duracion - 2 },
      { instruccion: `Baja en ${destino}`, duracionMin: 1 },
    ],
  };
}

function tramoCercanias(distKm: number, seed: number): Tramo {
  const linea = pick(CERCANIAS_LINEAS, seed);
  const origen = pick(["Atocha", "Chamartín", "Nuevos Ministerios", "Recoletos"], seed, 1);
  const destino = pick(["Aeropuerto T4", "Pinar de las Rozas", "Alcalá de Henares", "Aranjuez"], seed, 2);
  const duracion = Math.max(8, Math.round((distKm / MODOS.cercanias.speed) * 60) + 3);
  return {
    tipo: "cercanias", titulo: `${linea} · ${origen} → ${destino}`, subtitulo: "Cercanías Renfe",
    duracionMin: duracion, distanciaKm: distKm, color: MODOS.cercanias.color, icono: MODOS.cercanias.icono,
    pasos: [
      { instruccion: `Toma ${linea} en ${origen}`, duracionMin: 1 },
      { instruccion: `Trayecto en tren hasta ${destino}`, duracionMin: duracion - 2 },
      { instruccion: `Baja en ${destino}`, duracionMin: 1 },
    ],
  };
}

function tramoAVE(distKm: number, seed: number, destinoNombre?: string): Tramo {
  const destino = destinoNombre?.trim() || pick(["Sevilla Santa Justa", "Barcelona Sants", "Valencia Joaquín Sorolla", "Zaragoza Delicias", "Málaga María Zambrano", "Córdoba Central"], seed);
  const duracion = Math.max(90, Math.round((distKm / MODOS.ave.speed) * 60) + 15);
  return {
    tipo: "ave", titulo: `AVE Madrid Atocha → ${destino}`, subtitulo: "Renfe AVE",
    duracionMin: duracion, distanciaKm: distKm, color: MODOS.ave.color, icono: MODOS.ave.icono,
    pasos: [
      { instruccion: "Acude a Madrid Atocha 30 min antes", duracionMin: 30 },
      { instruccion: `Trayecto AVE hasta ${destino}`, duracionMin: duracion - 30 },
    ],
  };
}

function tramoBici(distKm: number): Tramo {
  const dur = Math.max(3, Math.round((distKm / MODOS.bicimad.speed) * 60));
  return {
    tipo: "bicimad", titulo: `BiciMAD ${distKm.toFixed(1)} km`, subtitulo: "Bici eléctrica pública",
    duracionMin: dur + 3, distanciaKm: distKm, color: MODOS.bicimad.color, icono: MODOS.bicimad.icono,
    pasos: [
      { instruccion: "Camina hasta el tótem BiciMAD más cercano", duracionMin: 2 },
      { instruccion: "Escanea el código QR para desbloquear la bici", duracionMin: 1, qr: true },
      { instruccion: `Pedalea ${distKm.toFixed(1)} km hasta el tótem de destino`, duracionMin: dur - 1 },
      { instruccion: "Ancla la bici en el tótem de destino", duracionMin: 1, auto: true },
    ],
  };
}

// Líneas EMT REALES que dan servicio al entorno del origen (Prosperidad /
// Av. de América / López de Hoyos / Chamartín). Elegimos una de forma
// determinista para que el número mostrado sea una línea que existe de verdad.
const EMT_LINEAS_ORIGEN = ["9", "29", "72", "73", "16", "51", "120", "7"];

function tramoBus(distKm: number, seed: number): Tramo {
  const linea = EMT_LINEAS_ORIGEN[seed % EMT_LINEAS_ORIGEN.length];
  // Espera realista según frecuencia de paso (5–11 min) + trayecto por distancia.
  const espera = 5 + (seed % 7);
  const viaje = Math.max(6, Math.round((distKm / MODOS.bus.speed) * 60));
  const dur = espera + viaje;
  return {
    tipo: "bus", titulo: `Bus EMT · Línea ${linea}`, subtitulo: "Empresa Municipal de Transportes",
    duracionMin: dur, distanciaKm: distKm, color: MODOS.bus.color, icono: MODOS.bus.icono,
    pasos: [
      { instruccion: `Espera la línea ${linea} en la parada (~${espera} min)`, duracionMin: espera },
      { instruccion: `Trayecto en la línea ${linea} (${viaje} min)`, duracionMin: viaje },
    ],
  };
}

// --- builders de opciones --------------------------------------------------
function opcionSimple(tipo: ModoTipo, distKm: number, seed: number, destinoNombre?: string): Opcion {
  const m = MODOS[tipo];
  const precio = round2(m.price(distKm));
  const co2 = round2(m.co2 * distKm);
  const interurbano = distKm > 60;
  const esSostenible = SOSTENIBLE[tipo];
  // Todos los modos generan puntos Cabify Club (incluido Cabify).
  const puntos = capPuntos(PUNTOS_POR_KM[tipo] * distKm, interurbano);
  let tramos: Tramo[];
  if (tipo === "cabify") {
    tramos = [tramoCabify(distKm, "Cabify directo a destino", "Trayecto en Cabify hasta tu destino")];
  } else if (tipo === "metro") {
    tramos = [tramoMetro(distKm, seed)];
  } else if (tipo === "cercanias") {
    tramos = [tramoCercanias(distKm, seed)];
  } else if (tipo === "ave") {
    tramos = [tramoAVE(distKm, seed, destinoNombre)];
  } else if (tipo === "andando") {
    tramos = [tramoAndando(distKm, "tu destino")];
  } else if (tipo === "bicimad") {
    tramos = [tramoBici(distKm)];
  } else {
    tramos = [tramoBus(distKm, seed)];
  }
  const eta = tramos.reduce((s, t) => s + t.duracionMin, 0);
  return {
    id: `simple-${tipo}`, tipo: "simple", nombre: NOMBRES[tipo], modos: [tipo], tramos,
    etaMin: eta, precioEur: precio, co2Kg: co2, puntos,
    esSostenible,
  };
}

function opcionCombo(modos: ModoTipo[], distKm: number, seed: number, idSuffix: string, destinoNombre?: string): Opcion | null {
  const interurbano = distKm > 60;
  // Cabify a estación: tramo first/last mile ajustado para que el precio total
  // del combo cuadre con el dataset real (p. ej. Cabify+Metro ≈ 9,89 €).
  const cabifyKm = 4.5;
  let principalKm: number;
  const ultimo = modos[modos.length - 1];
  const cabifyFinal = ultimo === "cabify" && modos.length > 1;
  const transbordos = modos.length - 1;

  if (cabifyFinal) principalKm = Math.max(1, distKm - cabifyKm * 2);
  else principalKm = Math.max(1, distKm - cabifyKm);

  if (principalKm < 1) return null;

  const tramos: Tramo[] = [];
  let cabifyPrecio = 0, cabifyCo2 = 0;
  let publicoPrecio = 0, publicoCo2 = 0;
  let puntos = 0;

  modos.forEach((m, i) => {
    if (m === "cabify") {
      const t = tramoCabify(cabifyKm, i === 0 ? "Cabify hasta la estación" : "Cabify hasta tu destino",
        i === 0 ? "Cabify te lleva a la estación" : "Cabify te lleva del destino");
      tramos.push(t);
      cabifyPrecio += MODOS.cabify.price(cabifyKm);
      cabifyCo2 += MODOS.cabify.co2 * cabifyKm;
      puntos += PUNTOS_POR_KM.cabify * cabifyKm;
    } else {
      let t: Tramo;
      if (m === "metro") t = tramoMetro(principalKm, seed);
      else if (m === "cercanias") t = tramoCercanias(principalKm, seed);
      else if (m === "ave") t = tramoAVE(principalKm, seed, destinoNombre);
      else if (m === "bus") t = tramoBus(principalKm, seed);
      else if (m === "andando") t = tramoAndando(principalKm, "tu destino");
      else t = tramoBici(principalKm);
      tramos.push(t);
      publicoPrecio += MODOS[m].price(principalKm);
      publicoCo2 += MODOS[m].co2 * principalKm;
      puntos += PUNTOS_POR_KM[m] * principalKm;
    }
  });

  const fee = modos.includes("ave") ? 4 : 0.5;
  const precio = round2(cabifyPrecio + publicoPrecio + fee);
  const co2 = round2(cabifyCo2 + publicoCo2);
  // Una ruta es sostenible si al menos un tramo lo es.
  const esSostenible = modos.some((m) => SOSTENIBLE[m]);
  puntos = capPuntos(puntos, interurbano);
  const eta = tramos.reduce((s, t) => s + t.duracionMin, 0) + transbordos * 8;

  // insertar tramos de transbordo a pie ligeros (representativos)
  // los dejamos en eta pero no creamos tramos extra para no romper navegación

  const desglose = [
    cabifyPrecio > 0 ? `Cabify ${cabifyPrecio.toFixed(2).replace(".", ",")} €` : null,
    publicoPrecio > 0 ? `${NOMBRES[modos.find((x) => x !== "cabify") as ModoTipo]} ${publicoPrecio.toFixed(2).replace(".", ",")} €` : null,
    `gestión ${fee.toFixed(2).replace(".", ",")} €`,
  ].filter(Boolean).join(" + ");

  const nombre = modos.map((m) => NOMBRES[m]).join(" + ");

  return {
    id: `combo-${idSuffix}`, tipo: "combo", nombre, modos, tramos,
    etaMin: eta, precioEur: precio, co2Kg: co2, puntos,
    desglose, esSostenible,
  };
}

function clonarTramo(t: Tramo): Tramo {
  return {
    ...t,
    pasos: t.pasos.map((p) => ({ ...p })),
    coords: t.coords?.map((c) => [...c] as LngLat),
    horario: t.horario ? { ...t.horario, salidas: [...t.horario.salidas] } : undefined,
  };
}

function modoPrincipalPublico(op: Opcion): ModoTipo | null {
  return op.modos.find((m) => m === "metro" || m === "cercanias" || m === "bus") ?? null;
}

function opcionComboPublicoReal(
  base: Opcion,
  idSuffix: string,
  reemplazarInicio: boolean,
  reemplazarFin: boolean
): Opcion | null {
  const modoPublico = modoPrincipalPublico(base);
  if (!modoPublico) return null;

  const tramos = base.tramos.map(clonarTramo);
  let cabifyPrecio = 0;
  let cabifyCo2 = 0;
  let cabifyPuntos = 0;

  const convertirCaminar = (idx: number, titulo: string, instruccion: string) => {
    const caminata = tramos[idx];
    if (!caminata || caminata.tipo !== "andando" || caminata.distanciaKm < 0.25) return false;
    const cabify = tramoCabify(caminata.distanciaKm, titulo, instruccion);
    tramos[idx] = cabify;
    cabifyPrecio += MODOS.cabify.price(caminata.distanciaKm);
    cabifyCo2 += MODOS.cabify.co2 * caminata.distanciaKm;
    cabifyPuntos += PUNTOS_POR_KM.cabify * caminata.distanciaKm;
    return true;
  };

  const inicioOk = !reemplazarInicio || convertirCaminar(0, "Cabify hasta la estación", "Cabify te lleva a la estación");
  const finIdx = tramos.length - 1;
  const finOk = !reemplazarFin || convertirCaminar(finIdx, "Cabify hasta tu destino", "Cabify te lleva desde la estación hasta tu destino");

  if (!inicioOk || !finOk) return null;

  const modos: ModoTipo[] = [];
  tramos.forEach((t) => {
    if (t.tipo === "andando") return;
    if (!modos.includes(t.tipo)) modos.push(t.tipo);
  });
  if (!modos.includes("cabify")) return null;

  const fee = 0.5;
  const etaMin = tramos.reduce((s, t) => s + t.duracionMin, 0);
  const precioEur = round2(base.precioEur + cabifyPrecio + fee);
  const co2Kg = round2(base.co2Kg + cabifyCo2);
  const puntos = capPuntos(base.puntos + cabifyPuntos, false);
  const nombre = modos.map((m) => NOMBRES[m]).join(" + ");
  const desglose = `${NOMBRES[modoPublico]} ${base.precioEur.toFixed(2).replace(".", ",")} € + Cabify ${cabifyPrecio.toFixed(2).replace(".", ",")} € + gestión ${fee.toFixed(2).replace(".", ",")} €`;

  return {
    id: `combo-${idSuffix}`,
    tipo: "combo",
    nombre,
    modos,
    tramos,
    etaMin,
    precioEur,
    co2Kg,
    puntos,
    desglose,
    esSostenible: true,
  };
}

function combosPublicosReales(base: Opcion): Opcion[] {
  const modo = modoPrincipalPublico(base);
  if (!modo) return [];

  const out = [
    opcionComboPublicoReal(base, `${modo}-cabify`, false, true),
    opcionComboPublicoReal(base, `cabify-${modo}`, true, false),
    opcionComboPublicoReal(base, `cabify-${modo}-cabify`, true, true),
  ].filter(Boolean) as Opcion[];

  return out;
}

// --- opciones con datos REALES (GTFS Metro / red Cercanías) ------------------
function haversineKm(a: LngLat, b: LngLat): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180, la2 = (b[1] * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function tramoCaminarA(coords: LngLat[], hacia: string): Tramo {
  let km = 0;
  for (let i = 1; i < coords.length; i++) km += haversineKm(coords[i - 1], coords[i]);
  const dur = Math.max(1, Math.round((km / MODOS.andando.speed) * 60));
  const metros = Math.round(km * 1000);
  return {
    tipo: "andando", titulo: `Camina ${metros} m hasta ${hacia}`,
    duracionMin: dur, distanciaKm: km, color: MODOS.andando.color, icono: MODOS.andando.icono,
    coords, pasos: [{ instruccion: `Camina ${metros} m hasta ${hacia}`, duracionMin: dur }],
  };
}

// Construye una opción de Metro REAL enrutando sobre el grafo GTFS oficial.
function opcionMetroReal(destino: LngLat): Opcion | null {
  const r = rutaMetro(ORIGEN_COORDS, destino);
  if (!r) return null;
  // Si origen o destino quedan lejos de cualquier boca de Metro, no es una
  // opción realista (habría que caminar demasiado): la descartamos.
  if (r.caminarOrigenM > 2500 || r.caminarDestinoM > 2500) return null;
  const tramos: Tramo[] = [];
  let distKm = 0;

  if (r.caminarOrigenM > 130) {
    tramos.push(tramoCaminarA([ORIGEN_COORDS, [r.origen.lng, r.origen.lat]], r.origen.n));
  }
  r.tramos.forEach((t, i) => {
    const dur = Math.max(1, Math.round(t.secs / 60));
    let km = 0;
    for (let j = 1; j < t.coords.length; j++) km += haversineKm(t.coords[j - 1], t.coords[j]);
    distKm += km;
    const linea = t.linea === "R" ? "R" : `L${t.linea}`;
    const horario = proximasSalidasMetro(t.linea, t.desdeKey, t.nextKey);
    const direccion = horario?.headsign ?? t.hasta;
    tramos.push({
      tipo: "metro", titulo: `${linea} · ${t.desde} → ${t.hasta}`,
      subtitulo: `${t.paradas} ${t.paradas === 1 ? "parada" : "paradas"} · dirección ${direccion}`,
      horario,
      duracionMin: dur, distanciaKm: km, color: t.color, icono: MODOS.metro.icono,
      coords: t.coords,
      pasos: [
        { instruccion: i === 0 ? `Coge la ${linea} dirección ${direccion} en ${t.desde}` : `Transbordo a ${linea} dirección ${direccion} en ${t.desde}`, duracionMin: 1 },
        { instruccion: `Continúa ${t.paradas} ${t.paradas === 1 ? "parada" : "paradas"} hasta ${t.hasta}`, duracionMin: Math.max(1, dur - 1) },
      ],
    });
  });
  if (r.caminarDestinoM > 130) {
    const dEnd: LngLat = [r.destino.lng, r.destino.lat];
    tramos.push(tramoCaminarA([dEnd, destino], "tu destino"));
  }

  distKm = Math.round(distKm * 10) / 10;
  const eta = tramos.reduce((s, t) => s + t.duracionMin, 0);
  const co2 = round2(MODOS.metro.co2 * distKm);
  const puntos = capPuntos(PUNTOS_POR_KM.metro * distKm, false);
  return {
    id: "simple-metro", tipo: "simple", nombre: "Metro", modos: ["metro"], tramos,
    etaMin: eta, precioEur: round2(MODOS.metro.price()), co2Kg: co2, puntos, esSostenible: true,
  };
}

// Construye una opción de Cercanías REAL sobre la red CRTM/Renfe modelada.
function opcionCercaniasReal(destino: LngLat): Opcion | null {
  const r = rutaCercanias(ORIGEN_COORDS, destino);
  if (!r) return null;
  // Cercanías solo tiene sentido si ambos extremos están razonablemente cerca de
  // una estación (si no, caminarías kilómetros hasta el tren).
  if (r.caminarOrigenM > 3500 || r.caminarDestinoM > 3500) return null;
  const tramos: Tramo[] = [];
  let distKm = 0;

  if (r.caminarOrigenM > 150) {
    tramos.push(tramoCaminarA([ORIGEN_COORDS, [r.origen.lng, r.origen.lat]], r.origen.n));
  }
  r.tramos.forEach((t, i) => {
    const dur = Math.max(2, Math.round(t.secs / 60));
    let km = 0;
    for (let j = 1; j < t.coords.length; j++) km += haversineKm(t.coords[j - 1], t.coords[j]);
    distKm += km;
    const linea = t.linea.replace(/^C/, "C-"); // "C1" -> "C-1" (formato del badge)
    const horario = proximasSalidasCercanias(t.linea, t.desdeKey, t.nextKey);
    const direccion = horario?.headsign ?? t.hasta;
    tramos.push({
      tipo: "cercanias", titulo: `${linea} · ${t.desde} → ${t.hasta}`,
      subtitulo: `${t.paradas} ${t.paradas === 1 ? "parada" : "paradas"} · dirección ${direccion}`,
      horario,
      duracionMin: dur, distanciaKm: km,
      color: t.color, icono: MODOS.cercanias.icono, coords: t.coords,
      pasos: [
        { instruccion: i === 0 ? `Toma ${linea} dirección ${direccion} en ${t.desde}` : `Transbordo a ${linea} dirección ${direccion} en ${t.desde}`, duracionMin: 1 },
        { instruccion: `Trayecto hasta ${t.hasta}`, duracionMin: Math.max(1, dur - 1) },
      ],
    });
  });
  if (r.caminarDestinoM > 150) {
    const dEnd: LngLat = [r.destino.lng, r.destino.lat];
    tramos.push(tramoCaminarA([dEnd, destino], "tu destino"));
  }

  // El tramo de tren debe ser sustancial; si no, Cercanías no aporta nada.
  if (distKm < 4) return null;

  distKm = Math.round(distKm * 10) / 10;
  const eta = tramos.reduce((s, t) => s + t.duracionMin, 0);
  const co2 = round2(MODOS.cercanias.co2 * distKm);
  const interurbano = distKm > 60;
  const puntos = capPuntos(PUNTOS_POR_KM.cercanias * distKm, interurbano);
  return {
    id: "simple-cercanias", tipo: "simple", nombre: "Cercanías", modos: ["cercanias"], tramos,
    etaMin: eta, precioEur: round2(MODOS.cercanias.price(distKm)), co2Kg: co2, puntos, esSostenible: true,
  };
}

// Construye una opción EMT REAL sobre el GTFS oficial de CRTM.
function opcionEmtReal(destino: LngLat): Opcion | null {
  const r = rutaEmt(ORIGEN_COORDS, destino);
  if (!r) return null;
  if (r.caminarOrigenM > 900 || r.caminarDestinoM > 900) return null;

  const tramos: Tramo[] = [];
  let distKm = 0;

  if (r.caminarOrigenM > 120) {
    tramos.push(tramoCaminarA([ORIGEN_COORDS, [r.origen.lng, r.origen.lat]], r.origen.n));
  }

  r.tramos.forEach((t, i) => {
    const horario = proximasSalidasEmt(t.linea, t.desdeKey, t.nextKey);
    const frecuencia = horario?.frecuenciaMin;
    const espera = Math.max(2, Math.min(12, frecuencia ? Math.round(frecuencia / 2) : 6));
    const viaje = Math.max(2, Math.round(t.secs / 60));
    let km = 0;
    for (let j = 1; j < t.coords.length; j++) km += haversineKm(t.coords[j - 1], t.coords[j]);
    distKm += km;
    const dur = viaje + (i === 0 ? espera : Math.min(5, espera));
    tramos.push({
      tipo: "bus",
      titulo: `EMT ${t.linea} · ${t.desde} → ${t.hasta}`,
      subtitulo: `${t.paradas} ${t.paradas === 1 ? "parada" : "paradas"} · dirección ${horario?.headsign ?? t.headsign}`,
      horario,
      duracionMin: dur,
      distanciaKm: km,
      color: t.color,
      icono: MODOS.bus.icono,
      coords: t.coords,
      pasos: [
        { instruccion: `Espera la línea ${t.linea} en ${t.desde} (~${i === 0 ? espera : Math.min(5, espera)} min)`, duracionMin: i === 0 ? espera : Math.min(5, espera) },
        { instruccion: `Trayecto EMT hasta ${t.hasta}`, duracionMin: viaje },
      ],
    });
  });

  if (r.caminarDestinoM > 120) {
    const dEnd: LngLat = [r.destino.lng, r.destino.lat];
    tramos.push(tramoCaminarA([dEnd, destino], "tu destino"));
  }

  if (!distKm) return null;
  distKm = Math.round(distKm * 10) / 10;
  const eta = tramos.reduce((s, t) => s + t.duracionMin, 0);
  return {
    id: "simple-bus",
    tipo: "simple",
    nombre: "Bus EMT",
    modos: ["bus"],
    tramos,
    etaMin: eta,
    precioEur: round2(MODOS.bus.price()),
    co2Kg: round2(MODOS.bus.co2 * distKm),
    puntos: capPuntos(PUNTOS_POR_KM.bus * distKm, false),
    esSostenible: false,
  };
}

// Construye BiciMAD con estaciones reales del mapa público EMT.
function opcionBiciMadReal(destino: LngLat): Opcion | null {
  const r = rutaBiciMad(ORIGEN_COORDS, destino);
  if (!r) return null;

  const tramos: Tramo[] = [];
  if (r.caminarOrigenM > 80) {
    tramos.push(tramoCaminarA([ORIGEN_COORDS, [r.origen.lng, r.origen.lat]], `BiciMAD ${r.origen.number}`));
  }

  const biciDur = Math.max(3, Math.round((r.biciKm / MODOS.bicimad.speed) * 60));
  tramos.push({
    tipo: "bicimad",
    titulo: `BiciMAD ${r.origen.number} → ${r.destino.number}`,
    subtitulo: `${r.origen.name} · ${r.destino.name} · disponibilidad snapshot EMT`,
    duracionMin: biciDur + 2,
    distanciaKm: r.biciKm,
    color: MODOS.bicimad.color,
    icono: MODOS.bicimad.icono,
    coords: [[r.origen.lng, r.origen.lat], [r.destino.lng, r.destino.lat]],
    pasos: [
      { instruccion: `Desbloquea una bici en ${r.origen.name} (${r.bikesSnapshot} bicis en el último snapshot)`, duracionMin: 1, qr: true },
      { instruccion: `Pedalea ${r.biciKm.toFixed(1)} km hasta ${r.destino.name}`, duracionMin: biciDur },
      { instruccion: `Ancla la bici en ${r.destino.name} (${r.freeBasesSnapshot} huecos en el último snapshot)`, duracionMin: 1, auto: true },
    ],
  });

  if (r.caminarDestinoM > 80) {
    tramos.push(tramoCaminarA([[r.destino.lng, r.destino.lat], destino], "tu destino"));
  }

  const eta = tramos.reduce((s, t) => s + t.duracionMin, 0);
  return {
    id: "simple-bicimad",
    tipo: "simple",
    nombre: "BiciMAD",
    modos: ["bicimad"],
    tramos,
    etaMin: eta,
    precioEur: round2(MODOS.bicimad.price()),
    co2Kg: 0,
    puntos: capPuntos(PUNTOS_POR_KM.bicimad * r.biciKm, false),
    esSostenible: true,
  };
}

// --- API pública -----------------------------------------------------------
export type Criterio = "equilibrado" | "rapido" | "barato" | "ecologico" | "seguro";

// Ciudades/destinos interurbanos: activan AVE aunque el geocoding devuelva una
// estación dentro de Madrid (p. ej. "AVE Madrid - Sevilla" -> Atocha).
const CIUDADES_LEJANAS =
  /sevilla|barcelona|valencia|zaragoza|m[áa]laga|c[óo]rdoba|alicante|murcia|valladolid|le[óo]n|salamanca|albacete|cuenca|ciudad real|puertollano|tarragona|lleida|girona/i;

export function generarOpciones(
  destino: string,
  coords?: [number, number]
): { distKm: number; opciones: Opcion[] } {
  const seed = hashStr(destino || "x");
  const esLejano = CIUDADES_LEJANAS.test(destino);

  // Distancia REAL del trayecto. Con coordenadas (y destino urbano) usamos la
  // distancia geográfica real ×1.3 (factor de recorrido por calle); si es un
  // destino interurbano por nombre o no hay coords, usamos el modelo por nombre.
  const distKm =
    coords && !esLejano
      ? Math.round(haversineKm(ORIGEN_COORDS, coords) * 1.3 * 10) / 10
      : distanciaPara(destino);

  const interurbano = esLejano || distKm >= 60;
  const opciones: Opcion[] = [];

  // Rutas REALES (Metro GTFS / Cercanías Renfe / EMT / BiciMAD). Solo se calculan dentro de su
  // rango razonable de uso; los propios builders descartan trayectos absurdos.
  const metroReal = coords && !interurbano && distKm >= 0.9 && distKm <= 35 ? opcionMetroReal(coords) : null;
  const cercaniasReal = coords && !interurbano && distKm >= 7 ? opcionCercaniasReal(coords) : null;
  const busReal = coords && !interurbano && distKm >= 0.8 && distKm <= 14 ? opcionEmtReal(coords) : null;
  const bicimadReal = coords && !interurbano && distKm >= 0.4 && distKm <= 7 ? opcionBiciMadReal(coords) : null;

  // Umbrales realistas por modo (Madrid). Evita ofrecer Cercanías/AVE/combos en
  // trayectos cortos donde solo tienen sentido andar, BiciMAD, Metro o Cabify.
  const incluir: Record<ModoTipo, boolean> = {
    andando: distKm <= 2.2,
    bicimad: !!bicimadReal,
    metro: !!metroReal,
    cercanias: !!cercaniasReal,
    bus: !!busReal,
    ave: interurbano,
    cabify: true,
  };

  (["cabify", "metro", "cercanias", "ave", "andando", "bicimad", "bus"] as ModoTipo[]).forEach((m) => {
    if (!incluir[m]) return;
    if (m === "metro" && metroReal) { opciones.push(metroReal); return; }
    if (m === "cercanias" && cercaniasReal) { opciones.push(cercaniasReal); return; }
    if (m === "bus" && busReal) { opciones.push(busReal); return; }
    if (m === "bicimad" && bicimadReal) { opciones.push(bicimadReal); return; }
    opciones.push(opcionSimple(m, distKm, seed, destino));
  });

  // Combos: solo cuando aportan valor real (interurbano, o trayectos largos en
  // los que un Cabify de primera/última milla a la estación ahorra tiempo).
  if (interurbano) {
    const c1 = opcionCombo(["cabify", "ave", "cabify"], distKm, seed, "cabify-ave-cabify", destino);
    const c2 = opcionCombo(["cabify", "ave"], distKm, seed, "cabify-ave", destino);
    const c3 = opcionCombo(["ave", "cabify"], distKm, seed, "ave-cabify", destino);
    [c1, c2, c3].forEach((c) => c && opciones.push(c));
  } else if (distKm >= 6) {
    if (metroReal) opciones.push(...combosPublicosReales(metroReal));
    if (cercaniasReal) opciones.push(...combosPublicosReales(cercaniasReal));
    if (busReal) opciones.push(...combosPublicosReales(busReal));
  } else if (distKm >= 2.5) {
    if (metroReal) opciones.push(...combosPublicosReales(metroReal).slice(0, 2));
    if (busReal) opciones.push(...combosPublicosReales(busReal).slice(0, 2));
  }

  // Cabify siempre debe ser la opción más rápida del listado. Si por la
  // distancia el metro u otro modo sale antes, ajustamos el etaMin del Cabify
  // simple (y la duración del tramo de viaje) para garantizarlo visualmente.
  const cabifySimple = opciones.find((o) => o.id === "simple-cabify");
  if (cabifySimple) {
    const minOtros = Math.min(
      ...opciones.filter((o) => o !== cabifySimple).map((o) => o.etaMin),
      Infinity
    );
    if (Number.isFinite(minOtros) && cabifySimple.etaMin >= minOtros) {
      const objetivo = Math.max(2, minOtros - 1);
      const delta = cabifySimple.etaMin - objetivo;
      cabifySimple.etaMin = objetivo;
      // Recortamos la duración del paso de trayecto (último) del único tramo.
      const tramo = cabifySimple.tramos[0];
      if (tramo) {
        tramo.duracionMin = Math.max(1, tramo.duracionMin - delta);
        const ultimoPaso = tramo.pasos[tramo.pasos.length - 1];
        if (ultimoPaso) ultimoPaso.duracionMin = Math.max(1, ultimoPaso.duracionMin - delta);
      }
    }
  }

  return { distKm, opciones };
}

export function ordenarOpciones(ops: Opcion[], criterio: Criterio): Opcion[] {
  const eta = ops.map((o) => o.etaMin);
  const pre = ops.map((o) => o.precioEur);
  const co2 = ops.map((o) => o.co2Kg);
  const norm = (v: number, arr: number[]) => {
    const mn = Math.min(...arr), mx = Math.max(...arr);
    return mx === mn ? 0 : (v - mn) / (mx - mn);
  };
  // Seguridad de una opción: la del modo menos seguro de la ruta (el eslabón débil).
  const seguridad = (o: Opcion) => Math.min(...o.modos.map((m) => SEGURIDAD[m]));
  const sorted = [...ops];
  sorted.sort((a, b) => {
    if (criterio === "rapido") return a.etaMin - b.etaMin || a.precioEur - b.precioEur;
    if (criterio === "barato") {
      const d = a.precioEur - b.precioEur;
      return d !== 0 ? d : a.etaMin - b.etaMin;
    }
    if (criterio === "ecologico") return a.co2Kg - b.co2Kg || a.etaMin - b.etaMin;
    if (criterio === "seguro") return seguridad(b) - seguridad(a) || a.etaMin - b.etaMin;
    const sa = 0.5 * norm(a.etaMin, eta) + 0.3 * norm(a.precioEur, pre) + 0.2 * norm(a.co2Kg, co2);
    const sb = 0.5 * norm(b.etaMin, eta) + 0.3 * norm(b.precioEur, pre) + 0.2 * norm(b.co2Kg, co2);
    return sa - sb || a.etaMin - b.etaMin;
  });
  return sorted;
}

// --- Helpers de categorías Cabify por opción --------------------------------
// Devuelve la suma de "precio Cabify" de la opción aplicando un multiplicador
// determinado. Si no hay tramos Cabify, devuelve 0.
export function precioCabifyParaOpcion(op: Opcion, multiplicador: number): number {
  return op.tramos
    .filter((t) => t.tipo === "cabify")
    .reduce((s, t) => s + (2.5 + 1.25 * t.distanciaKm) * multiplicador, 0);
}

// ¿La opción incluye algún tramo Cabify?
export function opcionTieneCabify(op: Opcion): boolean {
  return op.modos.includes("cabify");
}

// Devuelve la lista de categorías con su precio total para la opción dada.
// El total se obtiene reemplazando el coste Cabify (calculado al multiplicador
// más barato) por el coste con el multiplicador de cada categoría.
export function categoriasParaOpcion(op: Opcion) {
  const precioBaseCabify = precioCabifyParaOpcion(op, CHEAPEST_CABIFY_MULTI);
  return CABIFY_CATEGORIAS.map((c) => {
    const precioCabifyCategoria = precioCabifyParaOpcion(op, c.multiplicador);
    const totalEur = Math.round((op.precioEur - precioBaseCabify + precioCabifyCategoria) * 100) / 100;
    const precioCabifyEur = Math.round(precioCabifyCategoria * 100) / 100;
    return { ...c, precioCabifyEur, totalEur };
  });
}
