import type { ChatFn } from "../harness/reflector"
import type { Message } from "../types/index"
import { normalizarImagen } from "./normalizador"

// Screenshot → Code (v0.dev style). Toma una imagen (path/URL/data-URI),
// se la manda a un modelo VISION, y devuelve el código del componente.
//
// Frameworks soportados out-of-the-box:
//   - "react-tailwind": React function component con Tailwind classes
//   - "html-css": HTML + CSS puros, listos para copiar
//   - "solidjs": Solid function component con CSS inline
//   - "vue": Vue 3 SFC
//
// El motor es agnóstico al provider — cualquier modelo con capability "vision"
// funciona (Qwen 2.5 VL, GPT-4V, Claude 3.5 Sonnet, Gemini, Pixtral).

export type S2CFramework = "react-tailwind" | "html-css" | "solidjs" | "vue"

export type S2CInput = {
  imagen: string // path local, http URL o data:image/...
  framework: S2CFramework
  modelo: string
  candidateProviders?: string[]
  /** Instrucciones extras (ej. "usá colores azules"). */
  hint?: string
}

export type S2CResultado = {
  ok: boolean
  codigo: string
  lenguaje: string
  notas?: string
  error?: string
  latencyMs: number
}

const PROMPT_BASE: Record<S2CFramework, { system: string; lang: string }> = {
  "react-tailwind": {
    system: `Sos un experto en React + Tailwind. Recibís un screenshot de una UI y devolvés un componente funcional listo para copiar.
Reglas:
- Un solo bloque de código, sin explicación previa.
- Componente default export, TypeScript, sin props.
- Usá Tailwind classes (no CSS custom).
- Responsive por default (mobile-first).
- Estructura semántica (h1/nav/main/section, no divitis).`,
    lang: "tsx",
  },
  "html-css": {
    system: `Recibís un screenshot y devolvés HTML + CSS en un solo archivo listo para abrir en el browser.
Reglas:
- Un solo bloque de código HTML con <style> inline.
- Sin JS a menos que sea imprescindible.
- Responsive por default.
- Semántico.`,
    lang: "html",
  },
  "solidjs": {
    system: `Recibís un screenshot y devolvés un componente Solid.js.
Reglas:
- Function component, default export, TypeScript.
- CSS via style prop inline u objeto CSS.
- Sin dependencias externas (Tailwind no).`,
    lang: "tsx",
  },
  "vue": {
    system: `Recibís un screenshot y devolvés un Single File Component Vue 3 (<script setup lang="ts"> + <template> + <style scoped>).
Reglas:
- Composition API.
- Semántico + responsive.`,
    lang: "vue",
  },
}

export async function screenshotToCode(input: S2CInput, chat: ChatFn): Promise<S2CResultado> {
  const t0 = Date.now()
  try {
    const imgNorm = normalizarImagen(input.imagen)
    const cfg = PROMPT_BASE[input.framework]
    const userText = input.hint ? `Screenshot adjunto.\nInstrucciones extra: ${input.hint}` : "Screenshot adjunto."
    const messages: Message[] = [
      { id: "s", role: "system", parts: [{ type: "text", text: cfg.system }], createdAt: 0 },
      {
        id: "u",
        role: "user",
        parts: [
          { type: "text", text: userText },
          { type: "image", url: imgNorm.url, mimeType: imgNorm.mimeType },
        ],
        createdAt: 0,
      },
    ]
    const res = await chat({ model: input.modelo, messages, temperature: 0.2, cacheable: false }, input.candidateProviders)
    const codigo = extraerCodigoDeMarkdown(res.content, cfg.lang) ?? res.content.trim()
    return {
      ok: !!codigo,
      codigo,
      lenguaje: cfg.lang,
      latencyMs: Date.now() - t0,
    }
  } catch (e) {
    return {
      ok: false,
      codigo: "",
      lenguaje: PROMPT_BASE[input.framework].lang,
      error: String((e as Error).message),
      latencyMs: Date.now() - t0,
    }
  }
}

/** Extrae el primer bloque ```lang ... ``` del texto. Si no matchea, devuelve undefined. */
export function extraerCodigoDeMarkdown(texto: string, langPreferido?: string): string | undefined {
  // Primero probamos fence con lang.
  if (langPreferido) {
    const re = new RegExp("```" + langPreferido + "\\s*([\\s\\S]*?)```", "i")
    const m = re.exec(texto)
    if (m?.[1]) return m[1].trim()
  }
  // Fence genérico.
  const generic = /```(?:[a-z]+)?\s*([\s\S]*?)```/i.exec(texto)
  if (generic?.[1]) return generic[1].trim()
  return undefined
}
