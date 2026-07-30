import { createMemo, createSignal, For, Show, type JSX } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@/utils/toast"
import { PLANTILLAS_DISENO, type LayoutDiseno, type PlantillaDiseno } from "@/utils/design-prompts"
import { DISENOS_HTML, type DisenoHtml } from "@/utils/design-html"

// Galería de diseño: DESTACADOS con HTML real renderizado en un mini-visor (iframe sandbox,
// sin scripts = seguro) para ver la plantilla tal cual, y un CATÁLOGO grande de prompts con
// miniatura wireframe por tipo de layout. "Usar" manda el material al chat para que ZENKAI lo
// genere/adapte (así lo "aplica" la IA: el diseño lo produce el modelo en el momento).

const B = (w: string, h = "8px", c = "var(--v2-background-bg-layer-03, #333)") => (
  <div style={{ width: w, height: h, "border-radius": "3px", background: c, "flex-shrink": "0" }} />
)
const O = (w: string, h = "8px") => B(w, h, "#EC5B2B")
const marco = (children: JSX.Element) => (
  <div style={{ width: "100%", height: "108px", "border-radius": "8px", overflow: "hidden", border: "1px solid var(--v2-border-border-muted, #2a2a2a)", background: "var(--v2-background-bg-layer-01, #141414)", padding: "8px", display: "flex", "flex-direction": "column", gap: "5px" }}>
    {children}
  </div>
)

const WIREFRAMES: Record<LayoutDiseno, () => JSX.Element> = {
  hero: () => marco(<><div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>{O("28px", "10px")}{B("40px")}</div><div style={{ display: "flex", "flex-direction": "column", gap: "4px", "align-items": "center", margin: "6px 0" }}>{B("70%", "10px")}{B("50%", "6px")}{O("34px", "12px")}</div><div style={{ display: "flex", gap: "5px" }}>{B("33%", "20px")}{B("33%", "20px")}{B("33%", "20px")}</div></>),
  dashboard: () => marco(<div style={{ display: "flex", gap: "5px", flex: "1" }}><div style={{ width: "22%", display: "flex", "flex-direction": "column", gap: "4px" }}>{O("100%", "7px")}{B("100%", "6px")}{B("80%", "6px")}{B("90%", "6px")}</div><div style={{ flex: "1", display: "flex", "flex-direction": "column", gap: "5px" }}><div style={{ display: "flex", gap: "4px" }}>{B("25%", "16px")}{B("25%", "16px")}{B("25%", "16px")}{B("25%", "16px")}</div>{B("100%", "38px")}</div></div>),
  mobile: () => (<div style={{ width: "100%", height: "108px", display: "flex", "justify-content": "center", "align-items": "center", "border-radius": "8px", border: "1px solid var(--v2-border-border-muted, #2a2a2a)", background: "var(--v2-background-bg-layer-01, #141414)" }}><div style={{ width: "58px", height: "96px", "border-radius": "12px", border: "2px solid var(--v2-border-border-muted, #2a2a2a)", padding: "6px", display: "flex", "flex-direction": "column", gap: "4px" }}><div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>{O("16px", "6px")}<div style={{ width: "9px", height: "9px", "border-radius": "50%", background: "#EC5B2B" }} /></div>{B("100%", "8px")}{B("100%", "15px")}{B("100%", "15px")}<div style={{ "margin-top": "auto", display: "flex", "justify-content": "space-between" }}>{B("7px", "7px")}{B("7px", "7px")}{B("7px", "7px")}{B("7px", "7px")}</div></div></div>),
  cards3: () => marco(<div style={{ display: "flex", gap: "5px", flex: "1", "align-items": "center" }}><div style={{ flex: "1", height: "72px", "border-radius": "5px", background: "var(--v2-background-bg-layer-03, #333)" }} /><div style={{ flex: "1", height: "90px", "border-radius": "5px", border: "2px solid #EC5B2B", background: "var(--v2-background-bg-layer-02, #1c1c1c)" }} /><div style={{ flex: "1", height: "72px", "border-radius": "5px", background: "var(--v2-background-bg-layer-03, #333)" }} /></div>),
  grid: () => marco(<><div style={{ display: "flex", "flex-direction": "column", gap: "3px", margin: "2px 0 4px" }}>{B("45%", "9px")}{B("30%", "6px")}</div><div style={{ display: "grid", "grid-template-columns": "1fr 1fr 1fr", gap: "4px", flex: "1" }}>{B("100%", "24px")}{B("100%", "24px")}{B("100%", "24px")}{B("100%", "24px")}{B("100%", "24px")}{B("100%", "24px")}</div></>),
  split: () => marco(<div style={{ display: "flex", gap: "6px", flex: "1" }}><div style={{ width: "45%", "border-radius": "5px", background: "linear-gradient(135deg,#EC5B2B,#7a2d12)" }} /><div style={{ flex: "1", display: "flex", "flex-direction": "column", gap: "5px", "justify-content": "center" }}>{B("70%", "9px")}{B("90%", "6px")}{B("50%", "6px")}{O("40px", "12px")}</div></div>),
  form: () => marco(<div style={{ display: "flex", "flex-direction": "column", gap: "5px", "justify-content": "center", flex: "1", padding: "0 14px" }}>{B("40%", "9px")}{B("100%", "13px")}{B("100%", "13px")}{B("100%", "13px")}{O("100%", "13px")}</div>),
  list: () => marco(<>{O("40%", "9px")}<div style={{ display: "flex", "flex-direction": "column", gap: "4px", flex: "1" }}>{B("100%", "14px")}{B("100%", "14px")}{B("100%", "14px")}{B("100%", "14px")}</div></>),
  chat: () => marco(<><div style={{ display: "flex", "flex-direction": "column", gap: "5px", flex: "1" }}><div style={{ display: "flex" }}>{B("55%", "14px")}</div><div style={{ display: "flex", "justify-content": "flex-end" }}>{O("50%", "14px")}</div><div style={{ display: "flex" }}>{B("45%", "14px")}</div></div>{B("100%", "12px")}</>),
  scene3d: () => (<div style={{ width: "100%", height: "108px", "border-radius": "8px", overflow: "hidden", border: "1px solid var(--v2-border-border-muted, #2a2a2a)", background: "radial-gradient(circle at 50% 45%, #3a1a0e, #0a0806)", display: "flex", "align-items": "center", "justify-content": "center", position: "relative" }}><div style={{ width: "44px", height: "44px", "border-radius": "12px", background: "linear-gradient(135deg,#EC5B2B,#8a3a1a)", transform: "rotate(12deg)", "box-shadow": "0 8px 24px rgba(236,91,43,0.4)" }} /><div style={{ position: "absolute", bottom: "10px", left: "10px" }}>{O("40px", "8px")}</div></div>),
}
const wireframe = (layout: LayoutDiseno) => (WIREFRAMES[layout] ?? WIREFRAMES.grid)()

// Preview REAL: renderiza el HTML en un iframe sandbox (sin scripts) escalado a miniatura.
function PreviewHtml(props: { html: string; alto?: string; escala?: number }) {
  const esc = props.escala ?? 0.26
  return (
    <div style={{ width: "100%", height: props.alto ?? "150px", overflow: "hidden", "border-radius": "8px", border: "1px solid var(--v2-border-border-muted, #2a2a2a)", background: "#fff", position: "relative" }}>
      <iframe
        sandbox=""
        srcdoc={props.html}
        scrolling="no"
        style={{ width: `${Math.round(100 / esc)}%`, height: `${Math.round((parseInt(props.alto ?? "150") / esc))}px`, border: "0", transform: `scale(${esc})`, "transform-origin": "top left", "pointer-events": "none" }}
      />
    </div>
  )
}

export function DialogGaleriaDiseno() {
  const dialog = useDialog()
  const [sector, setSector] = createSignal("Todos")
  const [ver, setVer] = createSignal<DisenoHtml | undefined>(undefined)

  const sectores = createMemo(() => {
    const s = new Set<string>()
    DISENOS_HTML.forEach((d) => s.add(d.sector))
    PLANTILLAS_DISENO.forEach((p) => s.add(p.sector))
    return Array.from(s)
  })
  const destacados = createMemo(() => (sector() === "Todos" ? DISENOS_HTML : DISENOS_HTML.filter((d) => d.sector === sector())))
  const catalogo = createMemo(() => (sector() === "Todos" ? PLANTILLAS_DISENO : PLANTILLAS_DISENO.filter((p) => p.sector === sector())))

  async function copiar(texto: string, nombre: string) {
    try {
      await navigator.clipboard.writeText(texto)
      showToast({ variant: "success", icon: "circle-check", title: "Copiado", description: `Pegalo (Ctrl+V) en el chat y enviá para generar "${nombre}".` })
    } catch {
      showToast({ variant: "error", title: "No se pudo copiar", description: "Copiá manualmente." })
    }
  }
  const usarPrompt = (p: PlantillaDiseno) => void copiar(p.prompt, p.nombre)
  const usarHtml = (d: DisenoHtml) =>
    void copiar(
      `Usá este diseño HTML como base y adaptalo/mejoralo según lo que te pida. Devolvé el HTML final.\n\n${d.html}`,
      d.nombre,
    )

  const total = DISENOS_HTML.length + PLANTILLAS_DISENO.length

  return (
    <Dialog
      size="large"
      title="Galería de diseño"
      class="w-[min(calc(100vw-40px),860px)] h-[min(calc(100vh-40px),720px)] min-h-0 overflow-hidden"
    >
      <div class="relative flex flex-col gap-4 overflow-y-auto p-6 text-14-regular text-text-base">
        <p class="text-13-regular text-text-muted">
          {total} diseños (web, app, 3D, componentes y más). Los <b class="text-text-strong">destacados</b> muestran el
          diseño real; el resto son prompts listos. Tocá "Usar" y el material va al chat para que ZENKAI lo genere o
          lo adapte.
        </p>

        <div class="flex flex-wrap gap-2">
          <For each={["Todos", ...sectores()]}>
            {(s) => (
              <button
                type="button"
                onClick={() => setSector(s)}
                class="rounded-full border px-3 py-1 text-12-medium transition-colors"
                classList={{ "border-orange-500 bg-orange-500/10 text-orange-500": sector() === s, "border-border-base bg-surface-base text-text-strong hover:bg-surface-hover": sector() !== s }}
              >
                {s}
              </button>
            )}
          </For>
        </div>

        {/* Destacados con preview real */}
        <Show when={destacados().length > 0}>
          <div class="flex flex-col gap-2">
            <span class="text-12-medium uppercase tracking-wider text-orange-500">Destacados (vista real)</span>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <For each={destacados()}>
                {(d) => (
                  <div class="flex flex-col gap-2 rounded-lg border border-border-base bg-surface-raised p-2.5">
                    <button type="button" class="text-left" onClick={() => setVer(d)} title="Ver en grande">
                      <PreviewHtml html={d.html} />
                    </button>
                    <div class="flex items-end justify-between gap-2">
                      <div class="flex min-w-0 flex-col">
                        <span class="truncate text-13-medium text-text-strong">{d.nombre}</span>
                        <span class="truncate text-11-regular text-text-muted">{d.descripcion}</span>
                      </div>
                      <div class="flex shrink-0 gap-1">
                        <button type="button" onClick={() => setVer(d)} class="rounded-md border border-border-base px-2.5 py-1.5 text-12-medium text-text-strong hover:bg-surface-hover">Ver</button>
                        <button type="button" onClick={() => usarHtml(d)} class="rounded-md bg-orange-500 px-3 py-1.5 text-12-medium text-white hover:bg-orange-600">Usar</button>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Catálogo de prompts */}
        <Show when={catalogo().length > 0}>
          <div class="flex flex-col gap-2">
            <span class="text-12-medium uppercase tracking-wider text-text-muted">Catálogo de prompts</span>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <For each={catalogo()}>
                {(p) => (
                  <div class="flex flex-col gap-2 rounded-lg border border-border-base bg-surface-raised p-2.5">
                    {wireframe(p.layout)}
                    <div class="flex items-end justify-between gap-2">
                      <div class="flex min-w-0 flex-col">
                        <span class="truncate text-13-medium text-text-strong">{p.nombre}</span>
                        <span class="truncate text-11-regular text-text-muted">{p.descripcion}</span>
                      </div>
                      <button type="button" onClick={() => usarPrompt(p)} class="shrink-0 rounded-md bg-orange-500 px-3 py-1.5 text-12-medium text-white hover:bg-orange-600">Usar</button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <div class="mt-1 flex items-center justify-end">
          <button type="button" onClick={() => dialog.close()} class="rounded-lg border border-border-base bg-surface-raised px-4 py-2 text-13-medium text-text-strong hover:bg-surface-hover">Listo</button>
        </div>

        {/* Overlay de vista grande del diseño real */}
        <Show when={ver()}>
          {(d) => (
            <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6" onClick={() => setVer(undefined)}>
              <div class="flex w-[min(92vw,1000px)] flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                <div class="flex items-center justify-between">
                  <span class="text-14-medium text-white">{d().nombre}</span>
                  <div class="flex gap-2">
                    <button type="button" onClick={() => usarHtml(d())} class="rounded-md bg-orange-500 px-3 py-1.5 text-12-medium text-white hover:bg-orange-600">Usar</button>
                    <button type="button" onClick={() => setVer(undefined)} class="rounded-md border border-white/30 px-3 py-1.5 text-12-medium text-white hover:bg-white/10">Cerrar</button>
                  </div>
                </div>
                <iframe sandbox="" srcdoc={d().html} class="h-[70vh] w-full rounded-lg border border-white/20 bg-white" />
              </div>
            </div>
          )}
        </Show>
      </div>
    </Dialog>
  )
}
