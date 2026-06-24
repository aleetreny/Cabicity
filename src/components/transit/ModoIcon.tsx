import type { ModoTipo } from "@/lib/transit/engine";

interface Props {
  tipo: ModoTipo;
  size?: number;
  className?: string;
}

const COLOR: Record<ModoTipo, string> = {
  cabify: "#7145d6",
  metro: "#2760c2",
  cercanias: "#017251",
  ave: "#6b2c91",
  andando: "#5e6088",
  bicimad: "#ea8c2e",
  bus: "#006eb6",
};

// Color de MARCA de cada logo (para teñir los fondos de los chips en consonancia
// con la identidad real: Metro rojo, EMT azul, Renfe morado, etc.).
const BRAND: Record<ModoTipo, string> = {
  cabify: "#7145d6",
  metro: "#e8112d",
  cercanias: "#ef2c30",
  ave: "#6b2c91",
  andando: "#5e6088",
  bicimad: "#ea8c2e",
  bus: "#006eb6",
};

// Logos/iconos reales por modo (SVG en /public). Metro/Cercanías/EMT/Renfe usan
// los logotipos oficiales; andando/bici usan iconos del Design System.
const SRC: Partial<Record<ModoTipo, string>> = {
  metro: "logos/metro.svg",
  cercanias: "logos/cercanias.svg",
  bus: "logos/emt.svg",
  ave: "logos/renfe.svg",
  andando: "icons/ic_walking.svg",
  bicimad: "icons/ic_bicycle.svg",
};

function CabifyLogo({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: size, height: size, flex: "0 0 auto" }}
      aria-label="cabify"
      role="img"
    >
      <rect width="512" height="512" rx="96" fill="#7145D6" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M220 256V185.286H238V221.978C244.594 217.484 252.561 214.857 261.143 214.857C283.865 214.857 302.286 233.277 302.286 256C302.286 278.723 283.865 297.143 261.143 297.143C238.42 297.143 220 278.723 220 256ZM261.143 279.143C248.361 279.143 238 268.781 238 256C238 243.219 248.361 232.857 261.143 232.857C273.924 232.857 284.286 243.219 284.286 256C284.286 268.781 273.924 279.143 261.143 279.143Z"
        fill="white"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M193 290.022V295.857H211V256C211 233.277 192.58 214.857 169.857 214.857C147.135 214.857 128.714 233.277 128.714 256C128.714 278.723 147.135 297.143 169.857 297.143C178.439 297.143 186.406 294.516 193 290.022ZM146.714 256C146.714 243.219 157.076 232.857 169.857 232.857C182.639 232.857 193 243.219 193 256C193 268.781 182.639 279.143 169.857 279.143C157.076 279.143 146.714 268.781 146.714 256Z"
        fill="white"
      />
      <path
        d="M81.1429 232.857C68.3614 232.857 58 243.219 58 256C58 268.781 68.3614 279.143 81.1429 279.143C90.7321 279.143 98.9592 273.311 102.471 265H121.298C117.194 283.394 100.774 297.143 81.1429 297.143C58.4203 297.143 40 278.723 40 256C40 233.277 58.4203 214.857 81.1429 214.857C100.774 214.857 117.194 228.606 121.298 247H102.471C98.9592 238.689 90.7321 232.857 81.1429 232.857Z"
        fill="white"
      />
      <path d="M312.571 216.143V295.857H330.571V216.143H312.571Z" fill="white" />
      <path
        d="M395.839 186.661C392.004 184.951 387.756 184 383.286 184C366.244 184 352.429 197.815 352.429 214.857V216.146L340.857 216.147V234.147H352.429V295.857H370.429V234.147H393.571L418.928 291.098L413.911 302.366C411.023 308.853 403.423 311.771 396.936 308.882L389.615 325.326C405.183 332.258 423.423 325.256 430.355 309.688L472.004 216.143H452.3L428.78 268.971L410.015 226.826C407.032 220.127 400.46 216.147 393.571 216.143L370.429 216.145V214.857C370.429 207.756 376.185 202 383.286 202C385.148 202 386.918 202.396 388.516 203.108L395.839 186.661Z"
        fill="white"
      />
      <path
        d="M331.857 194.286C331.857 199.966 327.252 204.571 321.571 204.571C315.891 204.571 311.286 199.966 311.286 194.286C311.286 188.605 315.891 184 321.571 184C327.252 184 331.857 188.605 331.857 194.286Z"
        fill="white"
      />
    </svg>
  );
}

export function ModoIcon({ tipo, size = 20, className }: Props) {
  if (tipo === "cabify") {
    return <CabifyLogo size={size} className={className} />;
  }
  const src = SRC[tipo];
  // Logos apaisados (Metro, Renfe): mantenemos su proporción con height fijo.
  // El de Renfe es más ancho, así que le damos algo más de margen.
  const maxW = tipo === "ave" ? size * 2.8 : size * 1.9;
  return (
    <img
      src={src}
      alt={tipo}
      className={className}
      style={{ height: size, width: "auto", maxWidth: maxW, objectFit: "contain" }}
    />
  );
}

export function modoColor(tipo: ModoTipo): string {
  return COLOR[tipo];
}

// Fondo tenue del chip, en el color de marca del logo (Metro rojo, EMT azul…).
export function modoBrandBg(tipo: ModoTipo): string {
  return `${BRAND[tipo]}1f`;
}

// Chip con fondo de marca que contiene el logo del modo. AVE usa el wordmark
// ancho de Renfe, así que su chip es una "pastilla" (no un círculo) para que
// el logo quepa centrado sin desbordarse.
export function ModoChip({ tipo, size = 40, className }: { tipo: ModoTipo; size?: number; className?: string }) {
  const bg = modoBrandBg(tipo);
  // AVE usa el wordmark ancho de Renfe: lo encajamos pequeño y centrado dentro
  // del círculo para que no se desborde (manteniendo el chip circular como el resto).
  const iconSize = tipo === "ave" ? Math.round(size * 0.32) : Math.round(size * 0.55);
  return (
    <div
      className={`grid place-items-center rounded-full shrink-0 overflow-hidden ${className ?? ""}`}
      style={{ width: size, height: size, background: bg }}
    >
      <ModoIcon tipo={tipo} size={iconSize} />
    </div>
  );
}
