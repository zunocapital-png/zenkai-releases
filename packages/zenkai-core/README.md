# @zenkai/core

Motor propio de ZENKAI — plan de reemplazo progresivo de opencode.

## Estado por fase

- ✅ **Fase 1** — Skeleton + tipos base + SessionStore mínimo con tests
- ⏳ **Fase 2** — Tool executor (read/write/bash/grep)
- ⏳ **Fase 3** — Provider adapter propio (OpenAI-compatible)
- ⏳ **Fase 4** — Streaming pipeline SSE
- ⏳ **Fase 5** — Migración de la UI

Cada fase se merge cuando: typecheck OK + tests pasan + no rompe la app actual.

## Filosofía

- **Sin abstracciones prematuras**: solo lo mínimo que necesitamos hoy.
- **Tests desde el minuto uno**: cada pieza tiene test unitario.
- **Compatible con opencode mientras exista**: los tipos se pueden mappear.
- **Zero dependencias externas** salvo lo estrictamente necesario.
