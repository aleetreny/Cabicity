# Cabicity

Prototipo web de movilidad intermodal en Madrid. Compara trayectos que combinan
Cabify, Metro, Cercanías, EMT, BiciMAD y recorridos a pie.

## Desarrollo local

Requiere Node.js 24 y npm.

```bash
npm ci
npm run dev
```

Comprobaciones antes de publicar:

```bash
npm run lint
npm run build
```

## Despliegue

La aplicación es una SPA estática y se publica automáticamente con GitHub
Actions en:

<https://aleetreny.github.io/cabicity/>

Las rutas internas usan historial hash para funcionar en un hosting estático sin
reglas de reescritura. Cada actualización de `main` genera y despliega `dist/`.
