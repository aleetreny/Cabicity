# Cabicity · Modelo de datos del comparador

El motor compara Cabify con transporte público real de Madrid y combinaciones de
first/last mile. La prioridad del producto es aportar algo que Google Maps no
empuja con tanta claridad: rutas híbridas donde Cabify reduce caminatas,
transbordos incómodos o últimos kilómetros, manteniendo coste/CO₂ visibles.

## Fuentes actuales

| Modo | Fuente | Uso en app |
|---|---|---|
| Metro | CRTM GTFS Red de Metro | estaciones, líneas, aristas y próximos trenes programados |
| EMT | CRTM GTFS Red de EMT | 236 líneas, 4.924 paradas, aristas y próximos buses programados |
| Cercanías | Renfe Data GTFS Cercanías, núcleo Madrid `10T` | 93 estaciones, líneas, aristas y salidas programadas |
| BiciMAD | snapshot del mapa público EMT OpenAPI | 650 estaciones, capacidad y disponibilidad snapshot |
| Cabify | modelo determinista local | precio/ETA estimados y categorías Cabify |
| Andando | cálculo geográfico local | first/last mile y tramos de conexión |
| AVE | modelo determinista local | interurbanos por nombre de destino |

Los horarios mostrados son programados oficiales, no tiempo real. La app no
incluye tokens EMT ni backend; por eso BiciMAD se muestra como snapshot y las
llegadas en vivo quedan preparadas para una futura API/proxy.

## Combinaciones

Las combinaciones se generan desde rutas públicas reales cuando aportan valor:

- Cabify + Metro / Metro + Cabify / Cabify + Metro + Cabify
- Cabify + Cercanías / Cercanías + Cabify / Cabify + Cercanías + Cabify
- Cabify + EMT / EMT + Cabify / Cabify + EMT + Cabify
- Cabify + AVE + Cabify para destinos interurbanos

La regla base reemplaza caminatas de primera/última milla por Cabify cuando la
caminata es suficientemente relevante. Así se mantienen las paradas reales y se
evita inventar tramos públicos.

## Ordenación

- Equilibrado: `0.5·ETA + 0.3·precio + 0.2·CO₂`
- Rápido: ETA ascendente
- Barato: precio ascendente
- Ecológico: CO₂ ascendente
- Seguro: pondera el modo menos seguro de la ruta

Cabify directo se mantiene como referencia de rapidez y seguridad. Las rutas
integradas compiten por coste, sostenibilidad y comodidad de primera/última
milla.
