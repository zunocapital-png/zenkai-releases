// Key compartida de equipo: permite que ZENKAI use modelos de nube (OpenRouter, Groq,
// DeepSeek, Gemini) SIN que cada amigo ponga su propia API key. El dueño publica una
// key gratis en un Gist y la app la inyecta como variable de entorno al arrancar, de modo
// que models.dev auto-detecta el proveedor. La key del propio usuario (si la tiene) SIEMPRE
// tiene prioridad. Si no hay red o el Gist no existe, no pasa nada (arranque normal).

// Mismo Gist que las licencias; el dueño agrega un archivo "zenkai-team-keys.json" con forma:
//   { "OPENROUTER_API_KEY": "sk-or-...", "GROQ_API_KEY": "gsk_...", "DEEPSEEK_API_KEY": "..." }
// Los nombres deben coincidir con las env vars que espera cada proveedor en models.dev.
const TEAM_KEYS_URL =
  "https://gist.githubusercontent.com/zunocapital-png/4f1c6f69eba1ff5e20f7a9a0e272c4fe/raw/zenkai-team-keys.json"

// Solo se aceptan nombres de env var conocidos de proveedores (evita inyectar basura arbitraria).
const ALLOWED_ENV = new Set([
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "DEEPSEEK_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "TOGETHER_API_KEY",
  "CEREBRAS_API_KEY",
  "MISTRAL_API_KEY",
  "NVIDIA_API_KEY",
])

export async function injectTeamKeys(): Promise<string[]> {
  try {
    const res = await fetch(TEAM_KEYS_URL, {
      signal: AbortSignal.timeout(4000),
      headers: { "cache-control": "no-cache" },
    })
    if (!res.ok) return []
    const data = (await res.json()) as Record<string, unknown>
    const injected: string[] = []
    for (const [name, value] of Object.entries(data)) {
      if (!ALLOWED_ENV.has(name)) continue
      if (typeof value !== "string" || !value.trim()) continue
      if (process.env[name]) continue // la key propia del usuario gana
      process.env[name] = value.trim()
      injected.push(name)
    }
    return injected
  } catch {
    return [] // sin red / Gist ausente / timeout -> arranque normal, nunca bloquea
  }
}
