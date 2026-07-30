import { Component, For } from "solid-js"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { useServerSync } from "@/context/server-sync"
import { useSettings } from "@/context/settings"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

// Permisos granulares estilo Claude: por cada acción de la IA elegís si te la PREGUNTA,
// la PERMITE siempre o la DENIEGA. Se guarda en config.permission (lo mismo que respeta el
// motor). Arriba, el "modo autónomo" (autoApprove) saltea TODAS las confirmaciones.

type Accion = "ask" | "allow" | "deny"
type OpcionAccion = { value: Accion; label: string }

const OPCIONES: OpcionAccion[] = [
  { value: "ask", label: "Preguntar" },
  { value: "allow", label: "Permitir" },
  { value: "deny", label: "Denegar" },
]

// Herramientas que le importan al usuario, con nombres claros (no jerga).
const HERRAMIENTAS: { key: string; titulo: string; desc: string }[] = [
  { key: "edit", titulo: "Editar archivos", desc: "Crear, modificar o borrar archivos en tu equipo" },
  { key: "bash", titulo: "Ejecutar comandos", desc: "Correr comandos en la terminal (instalar, git, scripts)" },
  { key: "webfetch", titulo: "Abrir enlaces", desc: "Descargar el contenido de una URL" },
  { key: "websearch", titulo: "Buscar en la web", desc: "Hacer búsquedas en internet" },
  { key: "read", titulo: "Leer archivos", desc: "Ver el contenido de tus archivos" },
  { key: "task", titulo: "Lanzar subagentes", desc: "Delegar trabajo a agentes que corren en paralelo" },
]

export const SettingsPermisosV2: Component = () => {
  const serverSync = useServerSync()
  const settings = useSettings()

  const permisos = () => (serverSync().data.config.permission ?? {}) as Record<string, unknown>
  const valor = (key: string): Accion => {
    const v = permisos()[key]
    return v === "allow" || v === "deny" ? v : "ask"
  }
  const autonomo = () => settings.permissions.autoApprove()

  async function setPermiso(key: string, accion: Accion) {
    const actual = { ...permisos(), [key]: accion }
    await serverSync().updateConfig({ permission: actual as never })
  }

  return (
    <div class="flex flex-col gap-5">
      <div class="flex flex-col gap-1">
        <h2 class="text-16-medium text-v2-text-text-strong">Permisos</h2>
        <p class="text-13-regular text-v2-text-text-muted">
          Controlá qué puede hacer la IA sin pedirte confirmación. Por defecto, todo lo que toca tu equipo te lo
          pregunta primero.
        </p>
      </div>

      <SettingsListV2>
        <SettingsRowV2
          title="Modo autónomo"
          description="Si está activo, la IA actúa sin pedir permiso para nada. Rápido, pero úsalo solo si confiás en la tarea."
        >
          <Switch checked={autonomo()} onChange={(v) => settings.permissions.setAutoApprove(v)} />
        </SettingsRowV2>
      </SettingsListV2>

      <div class="flex flex-col gap-1">
        <span class="text-13-medium text-v2-text-text-strong">Por acción</span>
        <p class="text-12-regular text-v2-text-text-faint">
          {autonomo() ? "El modo autónomo está activo: estas reglas se ignoran hasta que lo apagues." : "Elegí cómo responde ZENKAI a cada acción."}
        </p>
      </div>

      <SettingsListV2>
        <For each={HERRAMIENTAS}>
          {(h) => (
            <SettingsRowV2 title={h.titulo} description={h.desc}>
              <SelectV2
                appearance="inline"
                options={OPCIONES}
                placement="bottom-end"
                gutter={6}
                current={OPCIONES.find((o) => o.value === valor(h.key))}
                value={(o) => o.value}
                label={(o) => o.label}
                onSelect={(o) => o && void setPermiso(h.key, o.value)}
              />
            </SettingsRowV2>
          )}
        </For>
      </SettingsListV2>
    </div>
  )
}
