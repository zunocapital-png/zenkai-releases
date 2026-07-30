import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

// App scaffold generator (Bolt.new/Replit style) — genera estructura básica
// de una app funcional lista para correr, sin depender de plantillas online.
//
// Diseñado como "primer commit" reproducible: el usuario dice qué quiere
// ("landing", "dashboard", "api") + framework, y Zenkai escribe los archivos.
//
// Kits soportados:
//   - vite-react-ts: SPA React con Vite + TS
//   - vite-vanilla: HTML+TS puro con Vite
//   - node-express: API Node con Express
//   - bun-elysia: API con Bun + Elysia (más rápido)
//   - static-html: HTML+CSS+JS estáticos (sin build)
//
// El generator NO instala deps ni corre nada — solo escribe archivos.
// El caller decide si npm install / bun install después.

export type AppKit = "vite-react-ts" | "vite-vanilla" | "node-express" | "bun-elysia" | "static-html"

export type ScaffoldInput = {
  kit: AppKit
  destino: string
  nombre: string
  descripcion?: string
  /** Prompt del usuario para customizar (ej. "landing minimalista naranja"). */
  hint?: string
}

export type ScaffoldResultado = {
  ok: boolean
  archivosCreados: string[]
  siguientesPasos: string[]
  error?: string
}

export function scaffold(input: ScaffoldInput): ScaffoldResultado {
  try {
    if (!input.nombre) throw new Error("nombre requerido")
    mkdirSync(input.destino, { recursive: true })
    const generator = GENERATORS[input.kit]
    if (!generator) throw new Error(`kit desconocido: ${input.kit}`)
    const archivos = generator(input)
    for (const [rel, contenido] of Object.entries(archivos)) {
      const full = join(input.destino, rel)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, contenido, "utf8")
    }
    return {
      ok: true,
      archivosCreados: Object.keys(archivos),
      siguientesPasos: SIGUIENTES_PASOS[input.kit],
    }
  } catch (e) {
    return { ok: false, archivosCreados: [], siguientesPasos: [], error: String((e as Error).message) }
  }
}

const SIGUIENTES_PASOS: Record<AppKit, string[]> = {
  "vite-react-ts": ["cd <dir>", "bun install", "bun run dev"],
  "vite-vanilla": ["cd <dir>", "bun install", "bun run dev"],
  "node-express": ["cd <dir>", "npm install", "npm start"],
  "bun-elysia": ["cd <dir>", "bun install", "bun run dev"],
  "static-html": ["Abrí index.html en el browser (o servilo con `bunx serve .`)"],
}

const GENERATORS: Record<AppKit, (input: ScaffoldInput) => Record<string, string>> = {
  "vite-react-ts": (i) => ({
    "package.json": JSON.stringify({
      name: i.nombre,
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
      dependencies: { react: "^18.3.0", "react-dom": "^18.3.0" },
      devDependencies: {
        "@vitejs/plugin-react": "^4.3.0",
        "@types/react": "^18.3.0",
        "@types/react-dom": "^18.3.0",
        typescript: "~5.6.0",
        vite: "^5.4.0",
      },
    }, null, 2),
    "index.html": `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${i.nombre}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    "vite.config.ts": `import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({ plugins: [react()] })
`,
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "ES2022", useDefineForClassFields: true, lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext", skipLibCheck: true, moduleResolution: "bundler",
        allowImportingTsExtensions: true, resolveJsonModule: true, isolatedModules: true,
        noEmit: true, jsx: "react-jsx", strict: true, noUnusedLocals: true, noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
      },
      include: ["src"],
    }, null, 2),
    "src/main.tsx": `import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>)
`,
    "src/App.tsx": `export default function App() {
  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>${i.nombre}</h1>
      <p>${i.descripcion ?? "Generado con Zenkai · " + (i.hint ?? "")}</p>
    </main>
  )
}
`,
    "src/index.css": `* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0a0a; color: #e4e4e4; }
`,
    ".gitignore": `node_modules
dist
.env
`,
  }),

  "vite-vanilla": (i) => ({
    "package.json": JSON.stringify({
      name: i.nombre, private: true, version: "0.1.0", type: "module",
      scripts: { dev: "vite", build: "vite build" },
      devDependencies: { vite: "^5.4.0", typescript: "~5.6.0" },
    }, null, 2),
    "index.html": `<!doctype html>
<html><head><title>${i.nombre}</title></head><body>
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
</body></html>`,
    "src/main.ts": `const app = document.getElementById("app")!
app.innerHTML = '<h1>${i.nombre}</h1><p>${i.descripcion ?? "hola"}</p>'
`,
    ".gitignore": "node_modules\ndist\n",
  }),

  "node-express": (i) => ({
    "package.json": JSON.stringify({
      name: i.nombre, version: "0.1.0", main: "server.js", type: "module",
      scripts: { start: "node server.js", dev: "node --watch server.js" },
      dependencies: { express: "^4.19.0" },
    }, null, 2),
    "server.js": `import express from "express"
const app = express()
const PORT = process.env.PORT ?? 3000

app.get("/", (req, res) => res.json({ app: "${i.nombre}", ok: true }))
app.listen(PORT, () => console.log("listo en :" + PORT))
`,
    ".gitignore": "node_modules\n.env\n",
  }),

  "bun-elysia": (i) => ({
    "package.json": JSON.stringify({
      name: i.nombre, version: "0.1.0", type: "module",
      scripts: { dev: "bun --watch server.ts", start: "bun server.ts" },
      dependencies: { elysia: "^1.1.0" },
    }, null, 2),
    "server.ts": `import { Elysia } from "elysia"

new Elysia()
  .get("/", () => ({ app: "${i.nombre}", ok: true }))
  .listen(3000, ({ hostname, port }) => console.log("listo en http://" + hostname + ":" + port))
`,
    ".gitignore": "node_modules\n.env\n",
  }),

  "static-html": (i) => ({
    "index.html": `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${i.nombre}</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <h1>${i.nombre}</h1>
    <p>${i.descripcion ?? "Generado con Zenkai."}</p>
  </main>
  <script src="app.js"></script>
</body>
</html>
`,
    "style.css": `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #e4e4e4; padding: 40px; }
h1 { color: #ff6b35; margin-bottom: 12px; }
`,
    "app.js": `console.log("${i.nombre} listo")\n`,
  }),
}
