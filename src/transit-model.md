# Cabify Transit · Modelo de datos del comparador

Brain del prototipo. Números **core** derivados del dataset real (Madrid, 25–31 may 2026,
150k búsquedas). Modos **complementarios** simulados de forma realista. Todo tuneable.

Posicionamiento: **Cabify como first/last mile del transporte ferroviario.**
Sin coche privado/por minutos (favorecemos Cabify). Bici = **BiciMAD** (pública).

---

## 1. Modos

| Modo | Origen | Icono | Color | Eco |
|---|---|---|---|---|
| Cabify | datos | `icons/ic_cabify.svg` | brand morado | no |
| Metro | datos | lucide `TramFront` | #2760C2 azul | sí |
| Cercanías | datos | lucide `TrainFrontTunnel` | #017251 verde | sí |
| AVE / Tren | datos | lucide `TrainFront` | #5b34ac morado osc. | sí |
| Andando | simulado | `icons/ic_walking.svg` | text-secondary | sí (0) |
| BiciMAD | simulado | `icons/ic_bicycle.svg` | #ea8c2e naranja BiciMAD | sí (0) |
| Bus (EMT) | simulado | lucide `Bus` | #bf2721 rojo EMT | sí |

Las **combinaciones intermodales** se componen como `Cabify → [transporte] → (Cabify)`:
Cabify+Metro, Metro+Cabify, Cabify+Cercanías, Cercanías+Cabify, Cabify+Metro+Cabify,
Cabify+AVE+Cabify, AVE+Cabify, Cabify+AVE.

---

## 2. Números reales del dataset (medias) — para anclar el motor

| Combo | Dur. | Transbordo | Precio total | desglose |
|---|---|---|---|---|
| Cabify solo | 20 min | – | 15,05 € | solo Cabify |
| Metro solo | 21 min | – | 2,00 € | tp 2,00 |
| Cercanías solo | 20 min | – | 3,10 € | tp 3,10 |
| Cabify+Metro | 35 min | 8 min | 9,89 € | cabify 7,39 + tp 2,00 + fee 0,50 |
| Cabify+Cercanías | 35 min | 8 min | 10,97 € | cabify 7,37 + tp 3,09 + fee 0,50 |
| Cabify+Metro+Cabify | 49 min | 16 min | 17,41 € | cabify 14,75 + tp 2,00 + fee 0,67 |
| Cabify+AVE+Cabify | 234 min | 32 min | 139,58 € | cabify 52,5 + tp 82,6 + fee 4,42 |

Regla de precio: **precio_total = precio_cabify + precio_transporte_público + convenience_fee**.
`convenience_fee` = **0,50 €** (combos urbanos) · ~4 € (combos con AVE). Es la monetización.

---

## 3. Parámetros por modo (motor de simulación)

```ts
// velocidad media (km/h), tarifa, CO2 (kg/km), disponibilidad (km)
const MODES = {
  andando:   { speedKmh: 5,   price: () => 0,                co2: 0,    avail: d => d < 3 },
  bicimad:   { speedKmh: 13,  price: () => 0.50,             co2: 0,    avail: d => d < 8 },
  bus:       { speedKmh: 14,  price: () => 1.50,             co2: 0.08, avail: d => d < 30 },
  metro:     { speedKmh: 30,  price: () => 2.00,             co2: 0.04, avail: d => d < 20 },
  cercanias: { speedKmh: 45,  price: d => 2.60 + 0.05*d,     co2: 0.035,avail: d => d >= 5 && d < 60 },
  ave:       { speedKmh: 200, price: d => 25 + 0.18*d,       co2: 0.03, avail: d => d >= 60 },
  cabify:    { speedKmh: 25,  price: d => 2.50 + 1.25*d,     co2: 0.15, avail: () => true },
};
// El tramo Cabify en combos urbanos sale ~7,4€ para ~4km (cuadra con el dataset).
```

**Combos intermodales:** Cabify hace el first/last mile (~3–4 km a/desde la estación),
el transporte público hace el grueso. Añade `convenience_fee` 0,50 € (4 € si hay AVE)
y `tiempo_transbordo` 8 min por transbordo.

---

## 4. CO₂ y Cashback (los ganchos del producto)

**CO₂ (kg):** `co2Kg = Σ tramos (co2[modo] * km_tramo)`. Andando/BiciMAD = 0.

**Cashback Cabify** (saldo € para futuros viajes; premia lo sostenible — sube conversión
en las combinaciones, que hoy convierten 12 pp menos que los viajes simples):

```ts
const CASHBACK_RATE = {  // €/km sobre el tramo sostenible
  andando: 0.25,   // incentivo máximo (idea "camina y gana saldo")
  bicimad: 0.15,
  metro: 0.10, cercanias: 0.10, bus: 0.10,
  ave: 0.05,
  cabify: 0,       // usar Cabify no genera cashback
};
// cashback = Σ tramos sostenibles (rate * km), tope 3 € urbano / 6 € interurbano
```

En combos: el cashback sale del **tramo de transporte público**, no del de Cabify.

---

## 5. Disponibilidad (filtrado) y orden

No muestres un modo si su `avail(distanciaKm)` es false. Cabify siempre.
Las combinaciones se muestran cuando hay una estación de Metro/Cercanías/AVE "razonable"
en la ruta (en simulado: para distancias medias-largas urbanas o interurbanas).

**Orden de la lista:**
- **Equilibrado (default):** score = 0.5·norm(ETA) + 0.3·norm(precio) + 0.2·norm(CO₂), asc.
- **Más rápido:** ETA asc · **Más barato:** precio asc (Gratis primero) · **Más ecológico:** CO₂ asc.
- Desempate siempre por ETA.

---

## 6. Datos para el pitch (vienen del dataset)
- 28% de las búsquedas son **Cabify+Metro**; 17% Cabify+Cercanías → la intermodalidad es real.
- Funnel: **67% comprado**, 9,8% abandonado en checkout. Combos convierten **62%** vs 74% los simples.
- Doble pico de demanda: **7–9h y 17–20h** (máx 18:00). Útil para "saturación/predicción".
- Monetización ya presente: `convenience_fee` por vender el viaje integrado.
