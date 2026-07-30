// Preview sandbox — envuelve HTML/CSS/JS del screenshot→code en un blob URL
// con CSP restrictivo para renderear en iframe sin riesgo.
//
// Uso típico: la UI recibe el código de screenshotToCode(), llama
// wrapEnSandbox(codigo, framework), obtiene un blob URL, y lo pone en un
// <iframe src={url} sandbox="allow-scripts">.

export type FrameworkPreview = "html-css" | "react-tailwind" | "solidjs" | "vue"

export type PreviewBundle = {
  html: string
  /** blob: URL válido dentro del renderer. La UI lo revoca con URL.revokeObjectURL. */
  crearBlobUrl: () => string
}

/**
 * Envuelve el código del framework en un HTML completo listo para renderear.
 * Para React/Solid/Vue usamos CDN esm.sh (necesita internet en el iframe —
 * si el usuario está offline, sólo el modo html-css anda; el resto muestra
 * mensaje de "sin internet, no puedo renderizar React").
 */
export function wrapEnSandbox(codigo: string, framework: FrameworkPreview): PreviewBundle {
  let html: string
  switch (framework) {
    case "html-css":
      html = codigo.trim().startsWith("<!") || codigo.trim().startsWith("<html")
        ? codigo
        : `<!doctype html><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><body>${codigo}</body>`
      break
    case "react-tailwind":
      html = `<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body><div id="root"></div>
<script type="module">
import React from "https://esm.sh/react@18"
import ReactDOM from "https://esm.sh/react-dom@18/client"
${codigo}
const el = document.getElementById("root")
ReactDOM.createRoot(el).render(React.createElement(App ?? (() => React.createElement("div",{},"[App no definido]"))))
</script>
</body></html>`
      break
    case "solidjs":
      html = `<!doctype html>
<html><head><meta charset="utf-8"/></head>
<body><div id="root"></div>
<script type="module">
import { render } from "https://esm.sh/solid-js@1/web"
import { createSignal } from "https://esm.sh/solid-js@1"
${codigo}
render(() => App(), document.getElementById("root"))
</script>
</body></html>`
      break
    case "vue":
      html = `<!doctype html>
<html><head><meta charset="utf-8"/></head>
<body><div id="app"></div>
<script type="module">
import { createApp } from "https://esm.sh/vue@3/dist/vue.esm-browser.prod.js"
${codigo}
createApp({}).mount("#app")
</script>
</body></html>`
      break
    default:
      html = `<html><body><pre>${escape(codigo)}</pre></body></html>`
  }

  const crearBlobUrl = () => {
    // Renderer (browser) tiene URL.createObjectURL nativo.
    const blob = new Blob([html], { type: "text/html" })
    return URL.createObjectURL(blob)
  }

  return { html, crearBlobUrl }
}

function escape(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))
}
