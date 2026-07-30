// App Catalog (Pinokio style) — registry curado de "apps IA" con instalación
// en 1 click. Cada app es un bundle de: MCPs + skills + ZenkaiFile + modelos
// recomendados. El usuario elige "Diseñador web" y Zenkai instala todo el kit.
//
// Diferencia vs Pinokio: no descargamos apps arbitrarias con scripts;
// declaramos bundles de PRIMITIVAS que ya sabemos ejecutar (nuestros MCPs,
// nuestro engine, nuestro skill store). Es sandbox por diseño.

export type AppBundle = {
  id: string
  nombre: string
  descripcion: string
  categoria: "coding" | "diseno" | "escritura" | "datos" | "productividad" | "audio-video" | "investigacion"
  emoji?: string
  /** MCP servers a instalar (ids del PluginRegistry). */
  mcps?: string[]
  /** Skills a instalar (ids del SkillStore). */
  skills?: string[]
  /** Modelo GGUF recomendado (id del catálogo Zenkai). */
  modeloRecomendado?: string
  /** Persona (system prompt) que se activa al abrir la app. */
  persona?: string
  /** Slashes que la app expone en el compositor. */
  slashes?: string[]
}

export const APP_CATALOG: AppBundle[] = [
  {
    id: "diseñador-web",
    nombre: "Diseñador Web",
    emoji: "🎨",
    descripcion: "Genera UIs con screenshot→code, exporta React/HTML, indexa refs",
    categoria: "diseno",
    skills: ["ui-generator", "design-critic"],
    modeloRecomendado: "qwen2.5-vl-7b",
    persona: "Sos un diseñador web senior. Priorizás claridad visual, jerarquía y accesibilidad. Cuando das código, es limpio y responsive.",
    slashes: ["/disenos", "/imagen"],
  },
  {
    id: "programador-fullstack",
    nombre: "Programador Fullstack",
    emoji: "⚡",
    descripcion: "Indexa codebase, refactor con reflector, auto-repair de tests",
    categoria: "coding",
    modeloRecomendado: "qwen2.5-coder-7b",
    skills: ["code-reviewer", "test-writer"],
    persona: "Sos un programador fullstack senior. Escribís código idiomático, tipado estricto, con tests. Priorizás legibilidad y mantenibilidad.",
    slashes: ["/reflexionar", "/reparar", "/sandbox"],
  },
  {
    id: "escritor",
    nombre: "Escritor / Copywriter",
    emoji: "✍️",
    descripcion: "Borradores + parliament de estilos + reflector de tono",
    categoria: "escritura",
    modeloRecomendado: "qwen2.5-7b",
    skills: ["copy-critic", "translator"],
    persona: "Sos un editor senior. Priorizás claridad, ritmo y cadencia. Preferís frases cortas activas. Sacás cliché y muletillas.",
    slashes: ["/reflexionar", "/parliament"],
  },
  {
    id: "analista-datos",
    nombre: "Analista de Datos",
    emoji: "📊",
    descripcion: "Pandas/SQL en sandbox + graficos + vector store para docs",
    categoria: "datos",
    modeloRecomendado: "qwen2.5-coder-7b",
    skills: ["sql-writer", "chart-suggester"],
    persona: "Sos un analista de datos. Sabés pandas, SQL, seaborn/matplotlib. Cuando explicás resultados, priorizás la lectura de negocio antes que la técnica.",
    slashes: ["/sandbox"],
  },
  {
    id: "asistente-personal",
    nombre: "Asistente Personal",
    emoji: "🧠",
    descripcion: "Memoria persistente + calendario + web search + notas",
    categoria: "productividad",
    mcps: ["@zenkai/web-search", "@zenkai/filesystem"],
    persona: "Sos un asistente personal atento. Preguntás antes de asumir, mantenés contexto entre conversaciones, sos conciso.",
    slashes: ["/estado"],
  },
  {
    id: "estudiante",
    nombre: "Compañero de Estudio",
    emoji: "📚",
    descripcion: "Explica temas, arma flashcards, resume PDFs con RAG",
    categoria: "productividad",
    modeloRecomendado: "qwen2.5-7b",
    persona: "Sos un tutor paciente. Explicás desde intuición → formalismo. Chequeás comprensión con preguntas. Si el estudiante se pierde, retrocedés.",
    slashes: ["/reflexionar"],
  },
  {
    id: "investigador",
    nombre: "Investigador",
    emoji: "🔬",
    descripcion: "Web search + parliament de fuentes + citas + resumen",
    categoria: "investigacion",
    mcps: ["@zenkai/web-search"],
    skills: ["citation-checker"],
    persona: "Sos un investigador riguroso. Citás fuentes, distinguís evidencia de opinión, marcás incerteza cuando existe. No inventás referencias.",
    slashes: ["/parliament"],
  },
  {
    id: "editor-audio",
    nombre: "Editor Audio/Video",
    emoji: "🎙️",
    descripcion: "TTS Piper, voz duplex, transcripción",
    categoria: "audio-video",
    persona: "Ayudás a editar audio y video. Sabés ffmpeg, corrección de nivel, cortes por silencio.",
    slashes: [],
  },
  {
    id: "code-reviewer-riguroso",
    nombre: "Code Reviewer Riguroso",
    emoji: "🕵️",
    descripcion: "Parliament de reviewers + análisis de seguridad",
    categoria: "coding",
    modeloRecomendado: "qwen2.5-coder-7b",
    persona: "Sos un reviewer senior. Buscás bugs, race conditions, memory leaks, problemas de seguridad. No aprobás código con TODOs vagos.",
    slashes: ["/parliament", "/reflexionar"],
  },
  {
    id: "prompt-engineer",
    nombre: "Prompt Engineer",
    emoji: "🎯",
    descripcion: "Optimiza prompts, arma templates, tests A/B contra parliament",
    categoria: "productividad",
    persona: "Sos un ingeniero de prompts. Sabés lo que rompe cada tipo de modelo, distinguís few-shot vs zero-shot, medís con métricas claras.",
    slashes: ["/reflexionar", "/parliament"],
  },
]

export type AppBundleFiltro = {
  categoria?: AppBundle["categoria"]
  query?: string
}

export function listarAppCatalog(filtro?: AppBundleFiltro): AppBundle[] {
  let list = [...APP_CATALOG]
  if (filtro?.categoria) list = list.filter((a) => a.categoria === filtro.categoria)
  if (filtro?.query) {
    const q = filtro.query.toLowerCase()
    list = list.filter((a) =>
      a.nombre.toLowerCase().includes(q) ||
      a.descripcion.toLowerCase().includes(q) ||
      a.id.includes(q),
    )
  }
  return list
}

export function getAppBundle(id: string): AppBundle | undefined {
  return APP_CATALOG.find((a) => a.id === id)
}

/** Categorías únicas del catálogo — útil para filtros UI. */
export function categoriasApp(): Array<AppBundle["categoria"]> {
  return Array.from(new Set(APP_CATALOG.map((a) => a.categoria)))
}
