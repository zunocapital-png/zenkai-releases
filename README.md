<h1 align="center">ZENKAI</h1>

<p align="center"><b>Asistente de código local + nube · 100% gratis · sin subscription</b></p>

<p align="center">
  <a href="https://github.com/zunocapital-png/zenkai-releases/releases/latest">
    <img alt="Última release" src="https://img.shields.io/github/v/release/zunocapital-png/zenkai-releases?style=flat-square&color=EC5B2B" />
  </a>
  <img alt="Plataformas" src="https://img.shields.io/badge/Windows_·_Linux-x64-EC5B2B?style=flat-square" />
  <img alt="Licencia" src="https://img.shields.io/badge/licencia-MIT-EC5B2B?style=flat-square" />
</p>

---

## 📥 Descarga

**No necesitás compilar nada. Descargá el instalador de tu plataforma:**

### 👉 [https://github.com/zunocapital-png/zenkai-releases/releases/latest](https://github.com/zunocapital-png/zenkai-releases/releases/latest)

| Plataforma | Archivo | Peso |
|---|---|---|
| **Windows** | `zenkai-desktop-win-x64.exe` | ~128 MB |
| **Linux .deb** | `zenkai-desktop-linux-amd64.deb` | ~126 MB |
| **Linux AppImage** | `zenkai-desktop-linux-x86_64.AppImage` | ~164 MB |

Al abrir la app la primera vez, un wizard escanea tu equipo, sugiere el mejor modelo local para tu RAM, y te muestra links directos a proveedores de nube gratis. Ollama viene incluido en el instalador — se prende solo en silencio durante el setup.

---

## 🎯 Qué hace

- **Chat con IA** sobre tu código, offline o con nube gratis.
- **16 sub-agentes especializados** (reviewer, refactor, debugger, tester, security, arquitecto, y más).
- **26 herramientas MCP preinstaladas** (Git, filesystem, web, docs, imagen, terminal, browser, etc.).
- **Multi-modelo real**: elegí el mejor por tarea o dejá que el router decida.
- **Failover automático**: si un proveedor cae, salta al siguiente sin cortar tu conversación.
- **Cost tracking en USD** por proveedor y por request.
- **Auto-update**: la app te avisa cuando sale una versión nueva y actualiza sola.
- **Offline real**: con qwen3:14b local no necesitás internet.

---

## ⚡ Slash commands

Escribí `/` en el chat para ver todos. Los principales:

| Comando | Qué hace |
|---|---|
| `/setup` | Wizard de configuración en 3 pasos |
| `/estado` | Todo on/off (modelos, MCPs, agentes, proveedores) |
| `/capacidades` | Qué sabe hacer ZENKAI hoy |
| `/observability` | Motor en vivo (latencias, health, breaker) |
| `/costos` | Gasto USD por proveedor |
| `/twin` | Ficha del proyecto activo |
| `/politicas` | Reglas declarativas (privacidad, budget, tipo de tarea) |
| `/imagen` | Generador de imágenes desde el chat |
| `/computer` | Ver la pantalla mientras la IA la controla |
| `/parliament` | Debate 2 modelos en paralelo con jurado |
| `/twin` | Digital Twin del proyecto |

---

## 🧠 Modelos soportados

**Locales** (offline, privacidad total):
`qwen3:14b · qwen3:8b · qwen2.5-coder:7b · qwen2.5:7b · qwen2.5vl (vision) · llava · moondream · minicpm-v · llama3 · mistral · gemma · phi · deepseek`

**Nube gratis** (con tu API key):
OpenRouter · Groq · NVIDIA NIM · Google Gemini · Together AI · Mistral

**Pagos** (con tu key):
OpenAI · Anthropic · DeepSeek · cualquier proveedor OpenAI-compatible

---

## 🔒 Privacidad

- Todo local por default. Nube solo si vos activás tu propia API key.
- Cero telemetría, cero envío de tu código a terceros sin autorización explícita.
- Modo "solo local" desde `/politicas` para forzar que nada salga del equipo.

---

## 🚀 Novedades v1.19

**Backend `@zenkai/core` propio** con features únicas en el mercado 2026:
- Racing entre modelos (mismo prompt a N proveedores en paralelo, gana el más rápido)
- Cost tracking en USD real por request
- Adaptive timeout (aprende p95 y ajusta dinámico)
- Health scores rolling con colores verde/ámbar/rojo
- Region-aware routing (privacy-first)
- Budget-aware failover (si un proveedor agota su budget, se saltea)
- Mid-stream failover (si el stream corta, siguiente proveedor retoma)
- Heartbeat SSE cada 15s
- Backpressure real (no bufferea sin límite)

Activá el motor propio desde **Ajustes → General → "Motor @zenkai/core"**.

---

## 👤 Autor

**Zuno Company** — Maycol Velazquez · Argentina

Licencia MIT.
