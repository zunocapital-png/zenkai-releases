// Catálogo curado de MCP servers (Model Context Protocol) conocidos.
// Reemplaza el marketplace hardcodeado por uno amplio y organizado.
// El usuario instala con 1 click desde el dialog /mcp.

import type { PluginEntry } from "./registry"

export type McpCatalogItem = Omit<PluginEntry, "checksum" | "installedAt" | "origin"> & {
  categoria: "web" | "filesystem" | "dev-tools" | "productivity" | "databases" | "cloud" | "comm" | "search" | "creativity" | "utilities"
  urlDocs?: string
  requiereClave?: string
  yaViene?: boolean // marca los preinstalados
}

export const MCP_CATALOG: McpCatalogItem[] = [
  // ── Web / Search ──
  { id: "@modelcontextprotocol/server-brave-search", name: "Brave Search", version: "latest", kind: "mcp", description: "Búsqueda web sin API key (endpoint público de Brave).", command: "npx", args: ["-y", "@modelcontextprotocol/server-brave-search"], categoria: "search", yaViene: true },
  { id: "@modelcontextprotocol/server-fetch", name: "Fetch", version: "latest", kind: "mcp", description: "GET/POST HTTP arbitrario para navegar la web.", command: "npx", args: ["-y", "@modelcontextprotocol/server-fetch"], categoria: "web", yaViene: true },
  { id: "@modelcontextprotocol/server-puppeteer", name: "Puppeteer", version: "latest", kind: "mcp", description: "Browser real headless — scraping + screenshots + click en pages dinámicas.", command: "npx", args: ["-y", "@modelcontextprotocol/server-puppeteer"], categoria: "web" },
  { id: "tavily", name: "Tavily Search", version: "latest", kind: "mcp", description: "Search API optimizado para LLMs con snippets curados.", command: "npx", args: ["-y", "tavily-mcp"], categoria: "search", requiereClave: "TAVILY_API_KEY" },
  { id: "exa", name: "Exa", version: "latest", kind: "mcp", description: "Neural web search — resultados semánticos, no keyword.", command: "npx", args: ["-y", "exa-mcp-server"], categoria: "search", requiereClave: "EXA_API_KEY" },
  { id: "perplexity-ask", name: "Perplexity Ask", version: "latest", kind: "mcp", description: "Consulta Perplexity Sonar directo desde el chat.", command: "npx", args: ["-y", "perplexity-ask-mcp"], categoria: "search", requiereClave: "PERPLEXITY_API_KEY" },

  // ── Filesystem ──
  { id: "@modelcontextprotocol/server-filesystem", name: "Filesystem", version: "latest", kind: "mcp", description: "Read/write/list archivos con permisos por directorio.", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"], categoria: "filesystem", yaViene: true },
  { id: "@modelcontextprotocol/server-memory", name: "Memory", version: "latest", kind: "mcp", description: "Knowledge graph persistente para memoria a largo plazo.", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], categoria: "filesystem", yaViene: true },
  { id: "@modelcontextprotocol/server-git", name: "Git", version: "latest", kind: "mcp", description: "git status/log/diff/commit/blame desde el chat.", command: "npx", args: ["-y", "@modelcontextprotocol/server-git"], categoria: "dev-tools", yaViene: true },
  { id: "@modelcontextprotocol/server-sqlite", name: "SQLite", version: "latest", kind: "mcp", description: "Query DBs SQLite locales sin salir del chat.", command: "npx", args: ["-y", "@modelcontextprotocol/server-sqlite"], categoria: "databases" },

  // ── Dev tools ──
  { id: "@modelcontextprotocol/server-github", name: "GitHub", version: "latest", kind: "mcp", description: "Issues, PRs, releases, actions desde el chat.", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], categoria: "dev-tools", requiereClave: "GITHUB_TOKEN", yaViene: true },
  { id: "@modelcontextprotocol/server-gitlab", name: "GitLab", version: "latest", kind: "mcp", description: "Análogo a GitHub pero para GitLab.", command: "npx", args: ["-y", "@modelcontextprotocol/server-gitlab"], categoria: "dev-tools", requiereClave: "GITLAB_TOKEN" },
  { id: "@modelcontextprotocol/server-postgres", name: "PostgreSQL", version: "latest", kind: "mcp", description: "Query directo a Postgres — describe schema + ejecuta SQL.", command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres"], categoria: "databases" },
  { id: "@modelcontextprotocol/server-docker", name: "Docker", version: "latest", kind: "mcp", description: "Listar containers, images, ejecutar comandos docker.", command: "npx", args: ["-y", "@modelcontextprotocol/server-docker"], categoria: "dev-tools" },
  { id: "@modelcontextprotocol/server-kubernetes", name: "Kubernetes", version: "latest", kind: "mcp", description: "kubectl-like desde el chat con permisos audit.", command: "npx", args: ["-y", "@modelcontextprotocol/server-kubernetes"], categoria: "dev-tools" },
  { id: "context7", name: "Context7 Docs", version: "latest", kind: "mcp", description: "Docs actualizados de 15k+ librerías populares.", command: "npx", args: ["-y", "@upstash/context7-mcp"], categoria: "dev-tools", yaViene: true },
  { id: "sentry", name: "Sentry", version: "latest", kind: "mcp", description: "Ver errores y issues de Sentry directo.", command: "npx", args: ["-y", "sentry-mcp"], categoria: "dev-tools", requiereClave: "SENTRY_AUTH_TOKEN" },

  // ── Cloud ──
  { id: "@modelcontextprotocol/server-aws-kb-retrieval", name: "AWS Knowledge Base", version: "latest", kind: "mcp", description: "Query AWS Bedrock Knowledge Bases (RAG).", command: "npx", args: ["-y", "@modelcontextprotocol/server-aws-kb-retrieval"], categoria: "cloud" },
  { id: "cloudflare", name: "Cloudflare", version: "latest", kind: "mcp", description: "Zonas, workers, R2, D1 desde el chat.", command: "npx", args: ["-y", "@cloudflare/mcp-server-cloudflare"], categoria: "cloud", requiereClave: "CLOUDFLARE_API_TOKEN" },
  { id: "supabase", name: "Supabase", version: "latest", kind: "mcp", description: "Query DB, gestión de auth, storage de Supabase.", command: "npx", args: ["-y", "@supabase/mcp-server-supabase"], categoria: "cloud", requiereClave: "SUPABASE_ACCESS_TOKEN" },

  // ── Productivity ──
  { id: "@modelcontextprotocol/server-slack", name: "Slack", version: "latest", kind: "mcp", description: "Leer canales, enviar mensajes, buscar en Slack.", command: "npx", args: ["-y", "@modelcontextprotocol/server-slack"], categoria: "comm", requiereClave: "SLACK_TOKEN" },
  { id: "@modelcontextprotocol/server-google-drive", name: "Google Drive", version: "latest", kind: "mcp", description: "Listar/leer archivos de Drive.", command: "npx", args: ["-y", "@modelcontextprotocol/server-google-drive"], categoria: "productivity" },
  { id: "@modelcontextprotocol/server-gmail", name: "Gmail", version: "latest", kind: "mcp", description: "Leer/enviar emails con permisos por acción.", command: "npx", args: ["-y", "@modelcontextprotocol/server-gmail"], categoria: "comm" },
  { id: "notion", name: "Notion", version: "latest", kind: "mcp", description: "Query pages, databases, agregar contenido.", command: "npx", args: ["-y", "@notionhq/notion-mcp-server"], categoria: "productivity", requiereClave: "NOTION_TOKEN" },
  { id: "linear", name: "Linear", version: "latest", kind: "mcp", description: "Issues, projects, cycles de Linear.", command: "npx", args: ["-y", "linear-mcp"], categoria: "productivity", requiereClave: "LINEAR_API_KEY" },
  { id: "obsidian", name: "Obsidian", version: "latest", kind: "mcp", description: "Vault local de Obsidian — leer notas, backlinks.", command: "npx", args: ["-y", "mcp-obsidian"], categoria: "productivity" },
  { id: "jira", name: "Jira", version: "latest", kind: "mcp", description: "Issues, sprints, epics Atlassian.", command: "npx", args: ["-y", "@atlassian/mcp-server-jira"], categoria: "productivity", requiereClave: "JIRA_TOKEN" },
  { id: "todoist", name: "Todoist", version: "latest", kind: "mcp", description: "Tareas, proyectos, filtros.", command: "npx", args: ["-y", "todoist-mcp"], categoria: "productivity", requiereClave: "TODOIST_TOKEN" },
  { id: "google-calendar", name: "Google Calendar", version: "latest", kind: "mcp", description: "Ver + crear eventos en Calendar.", command: "npx", args: ["-y", "google-calendar-mcp"], categoria: "productivity" },

  // ── Creativity ──
  { id: "@modelcontextprotocol/server-everart", name: "EverArt", version: "latest", kind: "mcp", description: "Generación de imágenes con múltiples modelos.", command: "npx", args: ["-y", "@modelcontextprotocol/server-everart"], categoria: "creativity", requiereClave: "EVERART_API_KEY" },
  { id: "zenkai-image", name: "Zenkai Image", version: "0.1.0", kind: "mcp", description: "Generación de imágenes local + nano-banana proxy (built-in).", command: "node", args: ["mcp/zenkai-image.mjs"], categoria: "creativity", yaViene: true },
  { id: "zenkai-computer", name: "Zenkai Computer Use", version: "0.1.0", kind: "mcp", description: "Screenshots + control cursor de la PC (built-in).", command: "node", args: ["mcp/zenkai-computer.mjs"], categoria: "utilities", yaViene: true },
  { id: "elevenlabs", name: "ElevenLabs TTS", version: "latest", kind: "mcp", description: "Voces AI cloud de alta calidad.", command: "npx", args: ["-y", "elevenlabs-mcp"], categoria: "creativity", requiereClave: "ELEVENLABS_API_KEY" },

  // ── Utilities ──
  { id: "@modelcontextprotocol/server-time", name: "Time", version: "latest", kind: "mcp", description: "Timezone conversion + timestamps.", command: "npx", args: ["-y", "@modelcontextprotocol/server-time"], categoria: "utilities" },
  { id: "@modelcontextprotocol/server-sequential-thinking", name: "Sequential Thinking", version: "latest", kind: "mcp", description: "Estructura razonamiento del modelo en pasos.", command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"], categoria: "utilities", yaViene: true },
  { id: "@modelcontextprotocol/server-everything", name: "Everything", version: "latest", kind: "mcp", description: "Test/demo server — todos los tipos de tools MCP.", command: "npx", args: ["-y", "@modelcontextprotocol/server-everything"], categoria: "utilities" },
  { id: "mcp-server-weather", name: "Weather", version: "latest", kind: "mcp", description: "Clima actual + forecast por ciudad.", command: "npx", args: ["-y", "mcp-server-weather"], categoria: "utilities" },
  { id: "mcp-server-youtube-transcript", name: "YouTube Transcript", version: "latest", kind: "mcp", description: "Extraer transcripciones de videos YouTube.", command: "npx", args: ["-y", "mcp-server-youtube-transcript"], categoria: "utilities" },

  // ── Databases (más) ──
  { id: "mongodb", name: "MongoDB", version: "latest", kind: "mcp", description: "Query collections MongoDB.", command: "npx", args: ["-y", "mongodb-mcp"], categoria: "databases" },
  { id: "redis", name: "Redis", version: "latest", kind: "mcp", description: "GET/SET/keys en Redis.", command: "npx", args: ["-y", "redis-mcp"], categoria: "databases" },
  { id: "clickhouse", name: "ClickHouse", version: "latest", kind: "mcp", description: "Analítica con ClickHouse desde chat.", command: "npx", args: ["-y", "clickhouse-mcp"], categoria: "databases" },

  // ── Communication (más) ──
  { id: "discord", name: "Discord", version: "latest", kind: "mcp", description: "Leer/enviar en servidores Discord.", command: "npx", args: ["-y", "discord-mcp"], categoria: "comm", requiereClave: "DISCORD_TOKEN" },
  { id: "telegram", name: "Telegram", version: "latest", kind: "mcp", description: "Bot Telegram — leer/enviar.", command: "npx", args: ["-y", "telegram-mcp"], categoria: "comm", requiereClave: "TELEGRAM_BOT_TOKEN" },
  { id: "twilio", name: "Twilio", version: "latest", kind: "mcp", description: "SMS + WhatsApp + calls.", command: "npx", args: ["-y", "twilio-mcp"], categoria: "comm", requiereClave: "TWILIO_AUTH_TOKEN" },
]

/** Categorías con count para filtros UI. */
export function categoriasMcp(): Array<{ nombre: McpCatalogItem["categoria"]; count: number }> {
  const map = new Map<string, number>()
  for (const m of MCP_CATALOG) map.set(m.categoria, (map.get(m.categoria) ?? 0) + 1)
  return Array.from(map.entries()).map(([nombre, count]) => ({ nombre: nombre as McpCatalogItem["categoria"], count }))
}

export function buscarMcp(query: string): McpCatalogItem[] {
  const q = query.toLowerCase().trim()
  if (!q) return [...MCP_CATALOG]
  return MCP_CATALOG.filter(
    (m) =>
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.categoria.includes(q),
  )
}

export function mcpsPorCategoria(cat: McpCatalogItem["categoria"]): McpCatalogItem[] {
  return MCP_CATALOG.filter((m) => m.categoria === cat)
}

export function contarMcps(): number {
  return MCP_CATALOG.length
}
