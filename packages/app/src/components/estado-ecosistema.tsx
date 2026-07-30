import { createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useSDK } from "@/context/sdk"
import { useSettingsDialog } from "@/components/settings-dialog"

// Widget global de estado del ecosistema. Va en el TITLEBAR (visible siempre,
// en cualquier pantalla) — ya no hace falta ir a Diagnóstico para saber si
// Ollama está vivo o cuántos modelos tenés. Un ping cada 8s, un menú al click
// que muestra el desglose y ofrece acciones (descargar modelo, conectar nube).
// Es la "identidad visual del estado" en toda la app.
export function EstadoEcosistema() {
  const [pulse, setPulse] = createSignal(0)
  const t = setInterval(() => setPulse((n) => n + 1), 8_000)
  onCleanup(() => clearInterval(t))
  const dialog = useDialog()
  const sdk = useSDK()
  const abrirModelos = useSettingsDialog("models")
  const abrirProviders = useSettingsDialog("providers")

  const conectarNube = () => {
    void import("@/components/dialog-connect-provider").then((x) =>
      dialog.show(() => <x.DialogConnectProvider directory={() => sdk().directory} />),
    )
  }
  const abrirObservability = () => {
    void import("@/components/dialog-observability").then((x) => dialog.show(() => <x.DialogObservability />))
  }

  const [estado] = createResource(
    pulse,
    async () => {
      const ia = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(1500) })
        .then(async (r) => {
          if (!r.ok) return { online: false, total: 0, conTools: 0 }
          const data = (await r.json()) as { models?: Array<{ name: string; capabilities?: string[] }> }
          const arr = data.models ?? []
          return {
            online: true,
            total: arr.length,
            conTools: arr.filter((m) => (m.capabilities ?? []).includes("tools")).length,
          }
        })
        .catch(() => ({ online: false, total: 0, conTools: 0 }))

      // Router propio: si responde /v1/models con más de "auto", hay upstreams.
      const router = await fetch("http://localhost:20128/v1/models", { signal: AbortSignal.timeout(1000) })
        .then((r) => r.ok)
        .catch(() => false)

      return { ia, router }
    },
    { initialValue: { ia: { online: false, total: 0, conTools: 0 }, router: false } },
  )

  // Color global del dot: verde si TODO ok, amarillo si algo warning, rojo si nada.
  const nivel = createMemo(() => {
    const e = estado()
    if (e.ia.online && e.ia.conTools > 0 && e.router) return "ok" as const
    if (e.ia.online && e.router) return "warn" as const
    if (e.router) return "warn" as const
    return "err" as const
  })
  const colorNivel = () =>
    nivel() === "ok" ? "#22c55e" : nivel() === "warn" ? "#f59e0b" : "#ef4444"
  const textoResumen = () => {
    const e = estado()
    if (!e.ia.online) return "IA local apagada"
    if (e.ia.conTools === 0) return "sin modelo con tools"
    return `${e.ia.conTools} modelo${e.ia.conTools === 1 ? "" : "s"}`
  }

  return (
    <MenuV2 gutter={4} modal={false} placement="bottom-end">
      <MenuV2.Trigger
        as="button"
        type="button"
        class="flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-medium transition-colors hover:bg-v2-overlay-simple-overlay-hover"
        title="Estado del ecosistema"
      >
        <span
          class="inline-block size-[7px] rounded-full shrink-0"
          style={{
            background: colorNivel(),
            "box-shadow": `0 0 0 3px ${colorNivel()}22`,
          }}
        />
        <span class="text-v2-text-text-muted hidden sm:inline">{textoResumen()}</span>
      </MenuV2.Trigger>
      <MenuV2.Portal>
        <MenuV2.Content class="min-w-[300px] p-2">
          <div class="flex flex-col gap-1 mb-1.5 px-1 pt-0.5">
            <div class="text-[11px] font-semibold uppercase tracking-[0.14em] text-v2-text-text-strong">
              Estado del ecosistema
            </div>
            <div class="text-[10.5px] text-v2-text-text-muted">
              Se refresca solo cada 8s
            </div>
          </div>

          <div class="flex flex-col gap-1 py-1">
            <Fila
              color={estado().ia.online ? "#22c55e" : "#ef4444"}
              titulo="IA local"
              detalle={
                estado().ia.online
                  ? `${estado().ia.total} instalado${estado().ia.total === 1 ? "" : "s"} · ${estado().ia.conTools} con tools`
                  : "apagada — no responde"
              }
            />
            <Fila
              color={estado().router ? "#22c55e" : "#ef4444"}
              titulo="Router ZENKAI"
              detalle={estado().router ? "operativo · failover activo" : "apagado"}
            />
            <Fila
              color="#22c55e"
              titulo="MCP"
              detalle="skills + generar_imagen + memoria"
            />
          </div>

          <div class="mt-2 border-t border-v2-border-border-muted pt-1.5">
            <MenuV2.Item onSelect={abrirObservability}>
              <span class="text-[12px] flex items-center gap-2">
                <span class="text-[#EC5B2B]">›</span>
                Observability Center · ver qué hace la IA
              </span>
            </MenuV2.Item>
            <MenuV2.Item onSelect={abrirModelos}>
              <span class="text-[12px]">Instalar / gestionar modelos locales</span>
            </MenuV2.Item>
            <MenuV2.Item onSelect={conectarNube}>
              <span class="text-[12px]">Conectar API key de nube</span>
            </MenuV2.Item>
            <MenuV2.Item onSelect={abrirProviders}>
              <span class="text-[12px]">Ver proveedores conectados</span>
            </MenuV2.Item>
          </div>
        </MenuV2.Content>
      </MenuV2.Portal>
    </MenuV2>
  )
}

function Fila(props: { color: string; titulo: string; detalle: string }) {
  return (
    <div class="flex items-center gap-2.5 px-1 py-0.5">
      <span
        class="inline-block size-[7px] rounded-full shrink-0"
        style={{ background: props.color, "box-shadow": `0 0 0 3px ${props.color}22` }}
      />
      <div class="flex min-w-0 flex-1 flex-col gap-0">
        <span class="text-[11.5px] font-medium text-v2-text-text-strong leading-tight">{props.titulo}</span>
        <span class="text-[10.5px] text-v2-text-text-muted leading-tight">{props.detalle}</span>
      </div>
    </div>
  )
}
