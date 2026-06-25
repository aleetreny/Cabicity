import {
  METRO_FEED_INFO,
  METRO_SCHEDULES,
  type MetroScheduleEntry,
  type MetroScheduleWindow,
} from "./metroGraph";

export interface HorarioProgramado {
  tipo: "programado";
  fuente: string;
  feedVersion: string;
  label?: string;
  headsign?: string;
  salidas: string[];
  frecuenciaMin?: number;
  nota: string;
}

function tipoDia(date: Date): "weekday" | "friday" | "saturday" | "sunday" {
  const day = date.getDay();
  if (day === 0) return "sunday";
  if (day === 6) return "saturday";
  if (day === 5) return "friday";
  return "weekday";
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function secondsOfDay(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

function formatHora(totalSecs: number): string {
  const daySecs = ((Math.round(totalSecs) % 86400) + 86400) % 86400;
  const h = Math.floor(daySecs / 3600);
  const m = Math.floor((daySecs % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function salidasEnVentana(
  nowAbsSecs: number,
  offsetSecs: number,
  baseDaySecs: number,
  window: MetroScheduleWindow
): { salidaSecs: number; headwaySecs: number }[] {
  const [start, end, headwaySecs] = window;
  const firstAtStop = baseDaySecs + start + offsetSecs;
  const lastAtStop = baseDaySecs + end + offsetSecs;
  if (lastAtStop < nowAbsSecs) return [];
  const n = Math.max(0, Math.ceil((nowAbsSecs - firstAtStop) / headwaySecs));
  const out: { salidaSecs: number; headwaySecs: number }[] = [];

  for (
    let salidaSecs = firstAtStop + n * headwaySecs;
    salidaSecs <= lastAtStop && out.length < 3;
    salidaSecs += headwaySecs
  ) {
    out.push({ salidaSecs, headwaySecs });
  }

  return out;
}

export function proximasSalidasMetro(
  line: string,
  fromKey: string,
  nextKey: string,
  now = new Date()
): HorarioProgramado | undefined {
  const normalizedLine = line.replace(/^L/i, "");
  const relevantes = METRO_SCHEDULES.filter(
    (entry: MetroScheduleEntry) =>
      entry[0] === normalizedLine && entry[1] === fromKey && entry[2] === nextKey
  );

  if (!relevantes.length) return undefined;

  const nowAbsSecs = secondsOfDay(now);
  const candidatos: { salidaSecs: number; headwaySecs: number; headsign: string }[] = [];

  for (const dayOffset of [0, 1]) {
    const dayType = tipoDia(addDays(now, dayOffset));
    const baseDaySecs = dayOffset * 86400;

    relevantes
      .filter((entry) => entry[5] === dayType)
      .forEach((entry) => {
        const [, , , headsign, offsetSecs, , windows] = entry;
        windows.forEach((window) => {
          salidasEnVentana(nowAbsSecs, offsetSecs, baseDaySecs, window)
            .forEach((salida) => candidatos.push({ ...salida, headsign }));
        });
      });
  }

  if (!candidatos.length) return undefined;

  candidatos.sort((a, b) => a.salidaSecs - b.salidaSecs);
  const salidas: string[] = [];
  for (const candidato of candidatos) {
    const hora = formatHora(candidato.salidaSecs);
    if (!salidas.includes(hora)) salidas.push(hora);
    if (salidas.length >= 3) break;
  }

  return {
    tipo: "programado",
    fuente: "CRTM GTFS",
    feedVersion: METRO_FEED_INFO.version,
    headsign: candidatos[0]?.headsign,
    salidas,
    frecuenciaMin: candidatos[0] ? Math.round(candidatos[0].headwaySecs / 60) : undefined,
    nota: "Horario programado oficial; no es tiempo real.",
  };
}

export function resumenHorarioMetro(horario?: HorarioProgramado): string | null {
  if (!horario?.salidas.length) return null;
  const frecuencia = horario.frecuenciaMin ? ` · frec. ${horario.frecuenciaMin} min` : "";
  return `Próximos ${horario.label ?? "trenes"} ${horario.salidas.slice(0, 2).join(", ")}${frecuencia} · ${horario.fuente} programado`;
}

export const resumenHorarioTransporte = resumenHorarioMetro;
