import { QueryClient } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { routeTree } from "../src/routeTree.gen";
import { generarOpciones } from "../src/lib/transit/engine";
import { METRO_NODOS, METRO_ROUTES } from "../src/lib/transit/metroGraph";
import { EMT_FEED_INFO, EMT_NODOS, EMT_ROUTES } from "../src/lib/transit/emtGraph";
import { CERCANIAS_FEED_INFO, CERCANIAS_NODOS, CERCANIAS_ROUTES } from "../src/lib/transit/cercaniasGraph";
import { BICIMAD_FEED_INFO, BICIMAD_STATIONS } from "../src/lib/transit/bicimadData";

vi.mock("@/components/transit/MapaMapbox", () => ({
  MapaMapbox: ({ interactive }: { interactive?: boolean }) => (
    <div data-testid="map">
      {interactive ? <button aria-label="Centrar mi ubicación">Centrar</button> : null}
    </div>
  ),
}));

vi.mock("mapbox-gl", () => {
  class MapMock {
    on(event: string, callback: () => void) {
      if (event === "load") queueMicrotask(callback);
      return this;
    }
    remove() {}
    setPadding() {}
    jumpTo() {}
    getStyle() { return { layers: [] }; }
    setPaintProperty() {}
    getSource() { return undefined; }
    addSource() {}
    getLayer() { return undefined; }
    addLayer() {}
    removeLayer() {}
    removeSource() {}
    fitBounds() {}
    easeTo() {}
    getZoom() { return 14; }
    setCenter() {}
  }
  class MarkerMock {
    setLngLat() { return this; }
    addTo() { return this; }
  }
  class LngLatBoundsMock {
    extend() { return this; }
  }
  return {
    default: {
      accessToken: "",
      Map: MapMock,
      Marker: MarkerMock,
      LngLatBounds: LngLatBoundsMock,
    },
  };
});

class SpeechSynthesisUtteranceMock {
  lang = "";
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

async function renderApp(path = "/") {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: new QueryClient() },
  });
  const user = userEvent.setup();
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(router.state.status).toBe("idle"));
  return { router, user };
}

function routeOptionButton() {
  const button = screen
    .getAllByRole("button")
    .find((candidate) =>
      Array.from(candidate.querySelectorAll("div")).some((node) => node.textContent === "Cabify"),
    );
  if (!button) throw new Error("No se encontró la opción Cabify en resultados.");
  return button;
}

describe("Cabicity interactive flow", () => {
  const directCabify = generarOpciones("Casa", [-3.7038, 40.422]).opciones.find(
    (option) => option.modos.length === 1 && option.modos[0] === "cabify",
  );

  if (!directCabify) throw new Error("No se pudo preparar la opción Cabify de prueba.");

  const baseTrip = {
    origen: "Calle de Pradillo, 42, Madrid",
    destino: "Calle de las Flores, 8, Madrid",
    criterio: "equilibrado" as const,
    destinoLng: -3.7038,
    destinoLat: 40.422,
  };

  function seedTrip(withSelection: boolean) {
    sessionStorage.setItem(
      "cabify-transit-trip",
      JSON.stringify({
        ...baseTrip,
        seleccionada: withSelection ? directCabify : undefined,
        categoriaCabify: withSelection ? "eco" : undefined,
      }),
    );
  }

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.stubGlobal("SpeechSynthesisUtterance", SpeechSynthesisUtteranceMock);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel: vi.fn(),
        getVoices: vi.fn(() => []),
        speak: vi.fn(),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ features: [], routes: [] }),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("completes the primary trip flow through every screen", async () => {
    const { router, user } = await renderApp();

    await expect(screen.findByRole("heading", { name: "Viaja a tu manera" })).resolves.toBeVisible();
    await user.click(screen.getByRole("button", { name: /Introduce tu ruta/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/buscar"));

    await user.click(screen.getByRole("button", { name: /Casa Calle de las Flores/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/resultados"));

    for (const label of ["Rápido", "Barato", "Ecológico", "Más seguro", "Equilibrado"]) {
      await user.click(screen.getByRole("button", { name: new RegExp(label, "i") }));
    }

    await user.click(routeOptionButton());
    await waitFor(() => expect(router.state.location.pathname).toBe("/viaje"));
    expect(screen.getByRole("heading", { name: "Tu ruta" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Comenzar viaje" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/categoria-cabify"));

    await user.click(screen.getByRole("button", { name: /7892/ }));
    await user.click(screen.getByRole("button", { name: /Cabify Electric/i }));
    await user.click(screen.getByRole("button", { name: "Programar" }));
    await user.click(screen.getByRole("button", { name: "Pedir ahora" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/recogida-cabify"));

    await user.click(screen.getByRole("button", { name: "Mensaje" }));
    await user.click(screen.getByRole("button", { name: "Llamar" }));
    await user.click(screen.getByRole("button", { name: /Compartir viaje/i }));
    await user.click(screen.getByRole("button", { name: /Ver detalles del viaje/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/navegacion"));

    await user.click(screen.getByRole("button", { name: /Activar guía por voz/i }));
    const next = screen.queryByRole("button", { name: /Siguiente paso/i });
    if (next) await user.click(next);

    expect(router.state.location.pathname).toBe("/navegacion");
  });

  test("every service card opens the trip search", async () => {
    for (const name of ["Cabify", "Cabify City", "Moto", "Voltio", "Reservas"]) {
      cleanup();
      sessionStorage.clear();
      const { router, user } = await renderApp();
      await screen.findByRole("heading", { name: "Viaja a tu manera" });
      await user.click(screen.getByRole("button", { name }));
      await waitFor(() => expect(router.state.location.pathname).toBe("/buscar"));
    }
  });

  test("home navigation and quick destination buttons respond", async () => {
    const { router, user } = await renderApp();
    await screen.findByRole("heading", { name: "Viaja a tu manera" });

    await user.click(screen.getByRole("button", { name: "Viajar" }));
    expect(router.state.location.pathname).toBe("/");

    await user.click(screen.getByRole("button", { name: "Cabify Club" }));
    expect(screen.getByRole("status")).toHaveTextContent("Cabify Club");

    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(screen.getByRole("status")).toHaveTextContent("envíos");

    cleanup();
    sessionStorage.clear();
    const quick = await renderApp();
    await screen.findByRole("heading", { name: "Viaja a tu manera" });
    await quick.user.click(screen.getByRole("button", { name: /Casa Calle de las Flores/i }));
    await waitFor(() => expect(quick.router.state.location.pathname).toBe("/buscar"));
    expect(screen.getByPlaceholderText("¿A dónde vas?")).toHaveValue("Calle de las Flores, 8, Madrid");
  });

  test("every enabled button on every trip screen accepts interaction", async () => {
    const screens = [
      { path: "/buscar", selected: false },
      { path: "/resultados", selected: false },
      { path: "/viaje", selected: true },
      { path: "/categoria-cabify", selected: true },
      { path: "/recogida-cabify", selected: true },
      { path: "/navegacion", selected: true },
    ];

    for (const current of screens) {
      cleanup();
      sessionStorage.clear();
      seedTrip(current.selected);
      await renderApp(current.path);
      const count = screen.getAllByRole("button").length;

      for (let index = 0; index < count; index += 1) {
        cleanup();
        sessionStorage.clear();
        seedTrip(current.selected);
        const { user } = await renderApp(current.path);
        const buttons = screen.getAllByRole("button");
        const button = buttons[index];
        if (!button || button.hasAttribute("disabled")) continue;
        await user.click(button);
        expect(document.body).toHaveTextContent("9:41");
      }
    }
  }, 30_000);

  test("the QR journey opens and closes its scanner", async () => {
    const qrOption = generarOpciones("Casa", [-3.7038, 40.422]).opciones.find((option) =>
      option.tramos.some((segment) => segment.pasos.some((step) => step.qr)),
    );
    if (!qrOption) return;

    sessionStorage.setItem(
      "cabify-transit-trip",
      JSON.stringify({ ...baseTrip, seleccionada: qrOption }),
    );
    const { user } = await renderApp("/navegacion");

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const qrButton = screen.queryByRole("button", { name: /Escanear QR/i });
      if (qrButton) {
        await user.click(qrButton);
        expect(screen.getByText("Escanea la bici")).toBeVisible();
        await user.click(screen.getByRole("button", { name: "Cerrar" }));
        expect(screen.queryByText("Escanea la bici")).not.toBeInTheDocument();
        return;
      }
      const nextButton = screen.queryByRole("button", { name: /Siguiente paso/i });
      if (!nextButton) break;
      await user.click(nextButton);
    }
  });
});

describe("real Madrid Metro data", () => {
  test("uses the official CRTM line inventory and active extension stations", () => {
    expect(METRO_ROUTES.map((route) => route.line)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "R",
    ]);
    expect(METRO_ROUTES.find((route) => route.line === "3")?.active).toBe(false);

    const stationKeys = new Set(METRO_NODOS.map((node) => node.k));
    expect(stationKeys).toContain("HOSPITAL INFANTA SOFIA");
    expect(stationKeys).toContain("HOSPITAL DEL HENARES");
    expect(stationKeys).toContain("ARGANDA DEL REY");
  });

  test("simulates several real Metro trips with stops and scheduled departures", () => {
    const cases: [string, [number, number]][] = [
      ["Sol", [-3.70326, 40.41687]],
      ["Aeropuerto T4", [-3.59325, 40.49177]],
      ["Hospital del Henares", [-3.53453, 40.41761]],
      ["Arganda del Rey", [-3.44752, 40.30367]],
    ];

    for (const [destino, coords] of cases) {
      const opciones = generarOpciones(destino, coords).opciones;
      const metro = opciones.find((option) => option.id === "simple-metro");
      expect(metro, `Metro option for ${destino}`).toBeTruthy();
      const metroTramos = metro!.tramos.filter((tramo) => tramo.tipo === "metro");
      expect(metroTramos.length, `Metro segments for ${destino}`).toBeGreaterThan(0);
      expect(metroTramos.every((tramo) => /^(L\d{1,2}|R) · .+ → .+/.test(tramo.titulo))).toBe(true);
      expect(metroTramos.every((tramo) => tramo.subtitulo?.includes("dirección"))).toBe(true);
      expect(metroTramos.some((tramo) => (tramo.horario?.salidas.length ?? 0) > 0)).toBe(true);
      expect(
        opciones
          .flatMap((option) => option.tramos)
          .filter((tramo) => tramo.tipo === "metro")
          .every((tramo) => (tramo.horario?.salidas.length ?? 0) > 0),
      ).toBe(true);
    }
  });
});

describe("real Madrid multimodal data", () => {
  test("loads official/snapshot inventories for EMT, Cercanías and BiciMAD", () => {
    expect(EMT_FEED_INFO.routes).toBeGreaterThanOrEqual(200);
    expect(EMT_NODOS.length).toBeGreaterThanOrEqual(4_000);
    expect(EMT_ROUTES.some((route) => route.line === "9")).toBe(true);

    expect(CERCANIAS_FEED_INFO.stops).toBeGreaterThanOrEqual(90);
    expect(CERCANIAS_ROUTES.some((route) => route.line === "C1")).toBe(true);
    expect(CERCANIAS_NODOS.some((node) => /AEROPUERTO|Aeropuerto/i.test(node.n))).toBe(true);

    expect(BICIMAD_FEED_INFO.stations).toBeGreaterThanOrEqual(600);
    expect(BICIMAD_STATIONS.some((station) => station.name.includes("Fuencarral"))).toBe(true);
  });

  test("simulates EMT, Cercanías, BiciMAD and Cabify combinations with real stops", () => {
    const airport = generarOpciones("Aeropuerto T4", [-3.59325, 40.49177]).opciones;
    const cercanias = airport.find((option) => option.id === "simple-cercanias");
    expect(cercanias, "Cercanías to airport").toBeTruthy();
    expect(cercanias!.tramos.some((tramo) => tramo.tipo === "cercanias" && (tramo.horario?.salidas.length ?? 0) > 0)).toBe(true);
    expect(airport.some((option) => option.tipo === "combo" && option.modos.includes("cabify") && option.modos.includes("cercanias"))).toBe(true);

    const plazaCastilla = generarOpciones("Plaza de Castilla", [-3.6887, 40.4669]).opciones;
    const bus = plazaCastilla.find((option) => option.id === "simple-bus");
    expect(bus, "EMT to Plaza de Castilla").toBeTruthy();
    expect(bus!.tramos.some((tramo) => tramo.tipo === "bus" && /EMT \S+ · .+ → .+/.test(tramo.titulo))).toBe(true);
    expect(bus!.tramos.some((tramo) => tramo.tipo === "bus" && (tramo.horario?.salidas.length ?? 0) > 0)).toBe(true);

    const sol = generarOpciones("Sol", [-3.70326, 40.41687]).opciones;
    const bici = sol.find((option) => option.id === "simple-bicimad");
    expect(bici, "BiciMAD to Sol").toBeTruthy();
    expect(bici!.tramos.some((tramo) => tramo.tipo === "bicimad" && tramo.titulo.includes("BiciMAD"))).toBe(true);

    const combos = [...airport, ...plazaCastilla, ...sol].filter((option) => option.tipo === "combo");
    expect(combos.length).toBeGreaterThan(0);
    expect(
      combos
        .flatMap((option) => option.tramos)
        .filter((tramo) => tramo.tipo === "metro" || tramo.tipo === "cercanias" || tramo.tipo === "bus")
        .every((tramo) => tramo.horario || tramo.tipo !== "bus"),
    ).toBe(true);
  });
});
