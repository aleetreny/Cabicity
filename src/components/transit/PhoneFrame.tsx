import type { ReactNode } from "react";

// Iconos de barra de estado al estilo iOS (cobertura, wifi y batería). Usan
// currentColor para heredar el color del texto (oscuro sobre fondo claro,
// blanco sobre fondo oscuro).
function IosCellular() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true">
      <rect x="0" y="8" width="3" height="4" rx="1" />
      <rect x="5" y="6" width="3" height="6" rx="1" />
      <rect x="10" y="3" width="3" height="9" rx="1" />
      <rect x="15" y="0" width="3" height="12" rx="1" />
    </svg>
  );
}
function IosWifi() {
  return (
    <svg width="17" height="13" viewBox="0 0 17 13" fill="none" aria-hidden="true">
      <path d="M1 4.4C5.2 0.7 11.8 0.7 16 4.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M3.7 7.1C6.4 4.8 10.6 4.8 13.3 7.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="8.5" cy="10.4" r="1.6" fill="currentColor" />
    </svg>
  );
}
function IosBattery() {
  return (
    <svg width="27" height="13" viewBox="0 0 27 13" fill="none" aria-hidden="true">
      <rect x="0.6" y="0.6" width="22.8" height="11.8" rx="3.2" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />
      <rect x="2" y="2" width="17" height="9" rx="1.8" fill="currentColor" />
      <path d="M25 4.6c1 .3 1 3.5 0 3.8V4.6z" fill="currentColor" fillOpacity="0.5" />
    </svg>
  );
}

interface Props {
  children: ReactNode;
  statusBarDark?: boolean;
  // Cuando true, la status bar flota transparente sobre el contenido (p. ej.
  // home, donde el mapa debe verse pegado al borde superior). Por defecto la
  // status bar ocupa su propio hueco para no pisar los controles de la página.
  transparentStatusBar?: boolean;
}

export function PhoneFrame({ children, statusBarDark = true, transparentStatusBar = false }: Props) {
  const statusBar = (
    <div
      className={`flex items-center justify-between px-6 pt-3 pb-1 text-[14px] font-bold pointer-events-none ${
        transparentStatusBar ? "absolute top-0 left-0 right-0 z-20" : "relative shrink-0"
      } ${statusBarDark ? "text-text" : "text-white"}`}
      style={{ height: 32 }}
    >
      <span className="text-[15px] font-semibold tracking-tight">9:41</span>
      <div className="flex items-center gap-1.5">
        <IosCellular />
        <IosWifi />
        <IosBattery />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full flex items-stretch sm:items-center justify-center bg-bg-subdued sm:p-4">
      <div
        className="relative w-full sm:w-[390px] bg-bg overflow-hidden sm:rounded-[40px] sm:shadow-over flex flex-col sm:h-[min(844px,calc(100vh-2rem))]"
        style={{ maxWidth: 390 }}
      >
        {!transparentStatusBar && statusBar}
        <div className="flex-1 relative overflow-hidden">{children}</div>
        {transparentStatusBar && statusBar}
      </div>
    </div>
  );
}
