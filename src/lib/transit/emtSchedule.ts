import {
  EMT_CALENDAR,
  EMT_CALENDAR_DATES,
  EMT_FEED_INFO,
  EMT_PATTERNS,
  type EmtCalendarEntry,
  type EmtPattern,
  type EmtScheduleWindow,
} from "./emtGraph";
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

function secondsOfDay(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

function formatHora(totalSecs: number): string {
  const daySecs = ((Math.round(totalSecs) % 86400) + 86400) % 86400;
  const h = Math.floor(daySecs / 3600);
  const m = Math.floor((daySecs % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function calendarActive(entry: EmtCalendarEntry, date: Date): boolean {
  const [, mon, tue, wed, thu, fri, sat, sun, start, end] = entry;
  const dateKey = ymd(date);
  if (dateKey < start || dateKey > end) return false;
  const flags = [sun, mon, tue, wed, thu, fri, sat];
  return flags[date.getDay()] === 1;
}

function activeServices(date: Date): Set<string> {
  const dateKey = ymd(date);
  const active = new Set(
    EMT_CALENDAR.filter((entry) => calendarActive(entry, date)).map((entry) => entry[0])
  );

  EMT_CALENDAR_DATES.forEach(([serviceId, exceptionDate, exceptionType]) => {
    if (exceptionDate !== dateKey) return;
    if (exceptionType === 1) active.add(serviceId);
    if (exceptionType === 2) active.delete(serviceId);
  });

  return active;
}

function salidasEnVentana(
  nowAbsSecs: number,
  offsetSecs: number,
  baseDaySecs: number,
  window: EmtScheduleWindow
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

export function proximasSalidasEmt(
  line: string,
  fromKey: string,
  nextKey: string,
  now = new Date()
): HorarioProgramado | undefined {
  const normalizedLine = line.trim();
  const candidates: { salidaSecs: number; headwaySecs: number; headsign: string }[] = [];

  for (const dayOffset of [0, 1]) {
    const date = addDays(now, dayOffset);
    const services = activeServices(date);
    const baseDaySecs = dayOffset * 86400;
    const nowAbsSecs = secondsOfDay(now);

    EMT_PATTERNS.forEach((pattern: EmtPattern) => {
      const [patternLine, , serviceId, , headsign, , stops, offsets, windows] = pattern;
      if (patternLine !== normalizedLine || !services.has(serviceId)) return;

      for (let i = 0; i < stops.length - 1; i += 1) {
        if (stops[i] !== fromKey || stops[i + 1] !== nextKey) continue;
        const offsetSecs = offsets[i] ?? 0;
        windows.forEach((window) => {
          salidasEnVentana(nowAbsSecs, offsetSecs, baseDaySecs, window).forEach((salida) => {
            candidates.push({ ...salida, headsign });
          });
        });
      }
    });
  }

  if (!candidates.length) return undefined;
  candidates.sort((a, b) => a.salidaSecs - b.salidaSecs);

  const salidas: string[] = [];
  for (const candidate of candidates) {
    const hora = formatHora(candidate.salidaSecs);
    if (!salidas.includes(hora)) salidas.push(hora);
    if (salidas.length >= 3) break;
  }

  return {
    tipo: "programado",
    fuente: "CRTM GTFS EMT",
    feedVersion: EMT_FEED_INFO.version,
    label: "buses",
    headsign: candidates[0]?.headsign,
    salidas,
    frecuenciaMin: candidates[0] ? Math.round(candidates[0].headwaySecs / 60) : undefined,
    nota: "Horario programado oficial; no es tiempo real.",
  };
}
