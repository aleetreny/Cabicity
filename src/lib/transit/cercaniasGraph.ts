// Red real de Cercanías Madrid (núcleo CRTM/Renfe). Datos reales: estaciones con
// coordenadas, líneas que las sirven y colores oficiales de cada línea. Modelamos
// el tronco central (Chamartín–Atocha) y las ramas principales, suficiente para
// enrutar de forma realista los destinos urbanos e interurbanos cercanos.
export interface CercaniasNodo {
  k: string;
  n: string;
  lng: number;
  lat: number;
  l: string[]; // líneas que paran (sin prefijo C)
}

// edges: [aKey, bKey, segundos] — bidireccional. La línea se deduce de la
// intersección de líneas de ambos nodos al construir el tramo.
export type CercaniasEdge = [string, string, number];

// Colores oficiales de las líneas de Cercanías Madrid.
export const CERCANIAS_COLORS: Record<string, string> = {
  C1: "#52c2e6",
  C2: "#008f3a",
  C3: "#7b3d92",
  C3a: "#7b3d92",
  C4: "#004a99",
  C5: "#f9b000",
  C7: "#d9272d",
  C8: "#7f7f7f",
  C8a: "#7f7f7f",
  C9: "#f08a00",
  C10: "#b1d34b",
};

export const CERCANIAS_NODOS: CercaniasNodo[] = [
  { k: "CHAMARTIN", n: "Chamartín", lng: -3.68259, lat: 40.47207, l: ["1", "2", "3", "4", "7", "8", "10"] },
  { k: "FUENTE_MORA", n: "Fuente de la Mora", lng: -3.65713, lat: 40.4738, l: ["1", "7", "10"] },
  { k: "NUEVOS_MINISTERIOS", n: "Nuevos Ministerios", lng: -3.69202, lat: 40.44582, l: ["1", "2", "3", "4", "7", "8", "10"] },
  { k: "RECOLETOS", n: "Recoletos", lng: -3.69188, lat: 40.42339, l: ["1", "2", "7", "8", "10"] },
  { k: "SOL", n: "Sol", lng: -3.70379, lat: 40.41693, l: ["3", "4"] },
  { k: "ATOCHA", n: "Atocha Cercanías", lng: -3.69069, lat: 40.40666, l: ["1", "2", "3", "4", "5", "7", "8", "10"] },
  { k: "MENDEZ_ALVARO", n: "Méndez Álvaro", lng: -3.67746, lat: 40.39866, l: ["1", "5", "7", "10"] },
  { k: "DELICIAS", n: "Delicias", lng: -3.69364, lat: 40.40012, l: ["5"] },
  { k: "PRINCIPE_PIO", n: "Príncipe Pío", lng: -3.71966, lat: 40.42032, l: ["1", "7", "10"] },
  { k: "PIRAMIDES", n: "Pirámides", lng: -3.71341, lat: 40.40335, l: ["5"] },
  { k: "EMBAJADORES", n: "Embajadores", lng: -3.70218, lat: 40.40417, l: ["5"] },
  // Rama noreste / aeropuerto (C-1)
  { k: "CHAMARTIN_AENA", n: "Aeropuerto T4", lng: -3.59353, lat: 40.49155, l: ["1"] },
  // Rama Henares (C-2/C-7) hacia Alcalá / Guadalajara
  { k: "VICALVARO", n: "Vicálvaro", lng: -3.61, lat: 40.4042, l: ["2", "7"] },
  { k: "COSLADA", n: "Coslada", lng: -3.5612, lat: 40.4239, l: ["2", "7"] },
  { k: "ALCALA_HENARES", n: "Alcalá de Henares", lng: -3.36406, lat: 40.48107, l: ["2", "7"] },
  { k: "GUADALAJARA", n: "Guadalajara", lng: -3.16693, lat: 40.6427, l: ["2"] },
  // Rama suroeste (C-5) hacia Móstoles / Fuenlabrada
  { k: "ALUCHE", n: "Aluche", lng: -3.75486, lat: 40.3853, l: ["5"] },
  { k: "MOSTOLES", n: "Móstoles", lng: -3.86472, lat: 40.32226, l: ["5"] },
  // Rama noroeste (C-3/C-8) hacia El Escorial / Pinar
  { k: "PITIS", n: "Pitis", lng: -3.71861, lat: 40.49156, l: ["3", "7"] },
  { k: "LAS_ROZAS", n: "Las Rozas", lng: -3.87375, lat: 40.49231, l: ["8", "10"] },
  { k: "POZUELO", n: "Pozuelo", lng: -3.81243, lat: 40.43757, l: ["10"] },
  { k: "VILLALBA", n: "Collado Villalba", lng: -4.00408, lat: 40.63354, l: ["8", "10"] },
  // Rama sur (C-3/C-4) hacia Aranjuez / Parla
  { k: "ATOCHA_SUR", n: "Atocha (sur)", lng: -3.6829, lat: 40.39, l: ["3", "4"] },
  { k: "GETAFE", n: "Getafe Centro", lng: -3.73282, lat: 40.30571, l: ["3", "4"] },
  { k: "ARANJUEZ", n: "Aranjuez", lng: -3.60567, lat: 40.03435, l: ["3"] },
  { k: "PARLA", n: "Parla", lng: -3.76791, lat: 40.23715, l: ["4"] },
];

export const CERCANIAS_EDGES: CercaniasEdge[] = [
  // Tronco central
  ["FUENTE_MORA", "CHAMARTIN", 240],
  ["CHAMARTIN", "NUEVOS_MINISTERIOS", 300],
  ["NUEVOS_MINISTERIOS", "RECOLETOS", 180],
  ["RECOLETOS", "SOL", 180],
  ["SOL", "ATOCHA", 180],
  ["RECOLETOS", "ATOCHA", 240],
  ["ATOCHA", "MENDEZ_ALVARO", 180],
  ["ATOCHA", "DELICIAS", 180],
  ["DELICIAS", "EMBAJADORES", 120],
  ["EMBAJADORES", "PIRAMIDES", 120],
  ["PIRAMIDES", "PRINCIPE_PIO", 240],
  ["NUEVOS_MINISTERIOS", "PRINCIPE_PIO", 360],
  // Rama aeropuerto (C-1)
  ["CHAMARTIN", "CHAMARTIN_AENA", 900],
  // Rama Henares (C-2/C-7)
  ["ATOCHA", "VICALVARO", 480],
  ["VICALVARO", "COSLADA", 420],
  ["COSLADA", "ALCALA_HENARES", 900],
  ["ALCALA_HENARES", "GUADALAJARA", 1200],
  // Rama suroeste (C-5)
  ["PRINCIPE_PIO", "ALUCHE", 540],
  ["ALUCHE", "MOSTOLES", 720],
  // Rama noroeste (C-3/C-7/C-8/C-10)
  ["CHAMARTIN", "PITIS", 600],
  ["PRINCIPE_PIO", "POZUELO", 540],
  ["POZUELO", "LAS_ROZAS", 480],
  ["LAS_ROZAS", "VILLALBA", 900],
  // Rama sur (C-3/C-4)
  ["ATOCHA", "ATOCHA_SUR", 120],
  ["ATOCHA_SUR", "GETAFE", 600],
  ["GETAFE", "PARLA", 720],
  ["GETAFE", "ARANJUEZ", 1500],
];
