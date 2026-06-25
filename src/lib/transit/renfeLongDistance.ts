import type { HorarioProgramado } from "./metroSchedule";
import {
  RENFE_LD_DESTINATIONS,
  RENFE_LD_FEED_INFO,
  RENFE_LD_SCHEDULES,
  type RenfeLdDestination,
  type RenfeLdSchedule,
} from "./renfeLongDistanceData";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function destinoRenfeLd(texto: string): RenfeLdDestination | null {
  const n = normalize(texto);
  return (
    RENFE_LD_DESTINATIONS.find((dest) =>
      dest.keywords.some((keyword) => n.includes(normalize(keyword)))
    ) ?? null
  );
}

export function proximasSalidasRenfeLd(
  destId: string,
  now = new Date(),
  limit = 3
): RenfeLdSchedule[] {
  const today = dateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const relevantes = RENFE_LD_SCHEDULES.filter((entry) => entry.destId === destId);

  const futuros = relevantes
    .filter((entry) => entry.date > today || (entry.date === today && minutesOfDay(entry.departure) >= nowMin))
    .sort((a, b) => `${a.date} ${a.departure}`.localeCompare(`${b.date} ${b.departure}`));

  if (futuros.length) return futuros.slice(0, limit);

  return relevantes
    .slice()
    .sort((a, b) => `${a.date} ${a.departure}`.localeCompare(`${b.date} ${b.departure}`))
    .slice(0, limit);
}

export function horarioRenfeLd(salidas: RenfeLdSchedule[]): HorarioProgramado | undefined {
  if (!salidas.length) return undefined;
  return {
    tipo: "programado",
    fuente: "Renfe Data GTFS AV/LD",
    feedVersion: `${RENFE_LD_FEED_INFO.validFrom}–${RENFE_LD_FEED_INFO.validTo}`,
    label: "trenes",
    headsign: salidas[0]?.toStation,
    salidas: salidas.map((s) => s.departure),
    nota: "Horario programado oficial Renfe; no es tiempo real.",
  };
}

