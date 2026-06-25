import {
  CERCANIAS_CALENDAR,
  CERCANIAS_FEED_INFO,
  CERCANIAS_SCHEDULES,
  type CercaniasCalendarEntry,
  type CercaniasScheduleEntry,
} from "./cercaniasGraph";
import type { HorarioProgramado } from "./metroSchedule";

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function formatHora(totalMins: number): string {
  const dayMins = ((Math.round(totalMins) % 1440) + 1440) % 1440;
  const h = Math.floor(dayMins / 60);
  const m = dayMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function calendarActive(entry: CercaniasCalendarEntry, date: Date): boolean {
  const [, mon, tue, wed, thu, fri, sat, sun, start, end] = entry;
  const dateKey = ymd(date);
  if (dateKey < start || dateKey > end) return false;
  const flags = [sun, mon, tue, wed, thu, fri, sat];
  return flags[date.getDay()] === 1;
}

function activeServices(date: Date): Set<string> {
  return new Set(
    CERCANIAS_CALENDAR.filter((entry) => calendarActive(entry, date)).map((entry) => entry[0])
  );
}

export function proximasSalidasCercanias(
  line: string,
  fromKey: string,
  nextKey: string,
  now = new Date()
): HorarioProgramado | undefined {
  const candidates: { salidaMins: number; headsign: string }[] = [];
  const nowAbsMins = minutesOfDay(now);

  for (const dayOffset of [0, 1]) {
    const date = addDays(now, dayOffset);
    const services = activeServices(date);
    const baseDayMins = dayOffset * 1440;

    CERCANIAS_SCHEDULES.forEach((entry: CercaniasScheduleEntry) => {
      const [entryLine, entryFrom, entryNext, serviceId, headsign, departures] = entry;
      if (entryLine !== line || entryFrom !== fromKey || entryNext !== nextKey) return;
      if (!services.has(serviceId)) return;

      departures.forEach((departure) => {
        const salidaMins = baseDayMins + departure;
        if (salidaMins >= nowAbsMins) candidates.push({ salidaMins, headsign });
      });
    });
  }

  if (!candidates.length) return undefined;
  candidates.sort((a, b) => a.salidaMins - b.salidaMins);

  const salidas: string[] = [];
  for (const candidate of candidates) {
    const hora = formatHora(candidate.salidaMins);
    if (!salidas.includes(hora)) salidas.push(hora);
    if (salidas.length >= 3) break;
  }

  const first = candidates[0];
  const second = candidates.find((candidate) => candidate.salidaMins > first.salidaMins);

  return {
    tipo: "programado",
    fuente: "Renfe Data GTFS",
    feedVersion: CERCANIAS_FEED_INFO.version,
    label: "trenes",
    headsign: first.headsign,
    salidas,
    frecuenciaMin: second ? Math.max(1, Math.round(second.salidaMins - first.salidaMins)) : undefined,
    nota: "Horario programado oficial; no es tiempo real.",
  };
}
