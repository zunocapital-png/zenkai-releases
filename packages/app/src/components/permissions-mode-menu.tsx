import { createEffect, createSignal, For, Show } from "solid-js"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { useSettings } from "@/context/settings"

// Modos de permisos, estilo Claude Code (Shift+Tab cycles).
// Se persiste en localStorage el modo elegido; el settings.permissions.autoApprove
// (el switch histórico) se deriva desde el modo: solo "omitir" activa el auto-approve.
// El resto de los modos son visuales y sirven al usuario para saber cómo se está
// comportando la IA — la lógica fina de "aceptar solo edits triviales" o "modo plan"
// es del backend del agente, y por ahora la respetamos como preferencia declarada.
type ModoPermiso = "manual" | "aceptar" | "plan" | "omitir"

const STORAGE_KEY = "zenkai.permissions.mode"
const MIGRACION_KEY = "zenkai.permissions.mode.migrated_omitir_default"

function leerModo(): ModoPermiso {
  try {
    // Migración one-shot: si el usuario tenía "manual" o "plan" guardado con
    // el default viejo, lo forzamos a "omitir" UNA sola vez. Después respetamos
    // lo que él elija.
    if (localStorage.getItem(MIGRACION_KEY) !== "1") {
      const anterior = localStorage.getItem(STORAGE_KEY)
      if (anterior === "manual" || anterior === "plan" || anterior === "aceptar") {
        localStorage.setItem(STORAGE_KEY, "omitir")
      }
      localStorage.setItem(MIGRACION_KEY, "1")
    }
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === "manual" || v === "aceptar" || v === "plan" || v === "omitir") return v
  } catch {
    /* ignore */
  }
  return "omitir"
}

// Íconos PIXEL 8-bit (rects en grilla 12×12) para que el menú se lea con el
// mismo lenguaje visual que el logo ZENKAI y el footer del sidebar. Se dibujan
// con celdas discretas y shape-rendering:crispEdges — nada de curvas.
type Celda = [number, number]
function IcoPix(props: { celdas: Celda[]; color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" shape-rendering="crispEdges" fill={props.color} aria-hidden="true">
      {props.celdas.map(([x, y]) => (
        <rect x={x} y={y} width="1" height="1" />
      ))}
    </svg>
  )
}

// Escudo cerrado (Manual): "la IA no pasa sin pedir permiso".
const CELDAS_MANUAL: Celda[] = [
  [4, 1], [5, 1], [6, 1], [7, 1],
  [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2],
  [3, 3], [8, 3],
  [3, 4], [8, 4],
  [3, 5], [5, 5], [6, 5], [8, 5],
  [3, 6], [4, 6], [7, 6], [8, 6],
  [3, 7], [8, 7],
  [4, 8], [5, 8], [6, 8], [7, 8],
  [5, 9], [6, 9],
]
// Check en marco cuadrado (Aceptar): aprobación implícita a ediciones.
const CELDAS_ACEPTAR: Celda[] = [
  [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2],
  [2, 3], [9, 3],
  [2, 4], [8, 4], [9, 4],
  [2, 5], [3, 5], [7, 5], [8, 5], [9, 5],
  [2, 6], [3, 6], [4, 6], [7, 6], [9, 6],
  [2, 7], [4, 7], [5, 7], [6, 7], [9, 7],
  [2, 8], [5, 8], [6, 8], [9, 8],
  [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [7, 9], [8, 9], [9, 9],
]
// Plano/blueprint (Plan): grid con reglas — solo lectura.
const CELDAS_PLAN: Celda[] = [
  [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2],
  [2, 3], [5, 3], [8, 3], [9, 3],
  [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4],
  [2, 5], [5, 5], [8, 5], [9, 5],
  [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6],
  [2, 7], [5, 7], [8, 7], [9, 7],
  [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8],
  [2, 9], [5, 9], [9, 9],
]
// Rayo (Omitir): velocidad, sin frenos.
const CELDAS_OMITIR: Celda[] = [
  [6, 1], [7, 1], [8, 1],
  [5, 2], [6, 2], [7, 2],
  [4, 3], [5, 3], [6, 3],
  [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4],
  [4, 5], [5, 5], [6, 5], [7, 5], [8, 5],
  [5, 6], [6, 6], [7, 6],
  [4, 7], [5, 7], [6, 7],
  [3, 8], [4, 8], [5, 8],
  [3, 9], [4, 9],
  [3, 10],
]

const OPCIONES: {
  id: ModoPermiso
  titulo: string
  descripcion: string
  color: string
  celdas: Celda[]
}[] = [
  {
    id: "manual",
    titulo: "Modo manual",
    descripcion: "Confirma cada acción de la IA (más seguro).",
    color: "#94a3b8",
    celdas: CELDAS_MANUAL,
  },
  {
    id: "aceptar",
    titulo: "Aceptar ediciones",
    descripcion: "Aprueba lecturas y edits triviales; pregunta lo destructivo.",
    color: "#22c55e",
    celdas: CELDAS_ACEPTAR,
  },
  {
    id: "plan",
    titulo: "Modo plan",
    descripcion: "Solo lectura. Planea sin ejecutar cambios.",
    color: "#3b82f6",
    celdas: CELDAS_PLAN,
  },
  {
    id: "omitir",
    titulo: "Omitir permisos",
    descripcion: "La IA actúa sin pedir permiso. Rápido pero riesgoso.",
    color: "#EC5B2B",
    celdas: CELDAS_OMITIR,
  },
]

export function PermissionsModeMenu() {
  const settings = useSettings()
  const [modo, setModo] = createSignal<ModoPermiso>(leerModo())

  // Al cambiar el modo, sincronizamos el flag global autoApprove.
  createEffect(() => {
    const m = modo()
    settings.permissions.setAutoApprove(m === "omitir")
    try {
      localStorage.setItem(STORAGE_KEY, m)
    } catch {
      /* ignore */
    }
  })

  const opcionActual = () => OPCIONES.find((o) => o.id === modo()) ?? OPCIONES[0]

  // Convierte "#RRGGBB" a rgba(r,g,b, alpha) para tintar borde y fondo con el
  // color del modo activo. Le da al pill del compositor la misma identidad
  // visual que el ítem del menú desplegado (background suave + borde + texto
  // en el color del modo).
  const rgba = (hex: string, a: number) => {
    const h = hex.replace("#", "")
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }
  return (
    <MenuV2 gutter={6} modal={false} placement="top-end">
      <MenuV2.Trigger
        as="button"
        type="button"
        class="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[11px] font-medium transition-colors"
        style={{
          color: opcionActual().color,
          background: rgba(opcionActual().color, 0.1),
          border: `1px solid ${rgba(opcionActual().color, 0.35)}`,
        }}
        aria-label="Modo de permisos"
        title={`Modo actual: ${opcionActual().titulo}`}
      >
        <IcoPix celdas={opcionActual().celdas} color={opcionActual().color} />
        <span>{opcionActual().titulo}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </MenuV2.Trigger>
      <MenuV2.Portal>
        <MenuV2.Content class="min-w-[280px] p-1">
          <For each={OPCIONES}>
            {(op) => {
              const activo = () => modo() === op.id
              return (
                <MenuV2.Item onSelect={() => setModo(op.id)}>
                  <div class="flex items-start gap-3 py-1">
                    <div
                      class="flex size-6 shrink-0 items-center justify-center rounded-md mt-0.5"
                      style={{ background: activo() ? "rgba(236,91,43,0.15)" : "transparent" }}
                    >
                      <IcoPix celdas={op.celdas} color={activo() ? "#EC5B2B" : op.color} />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5 text-[13px] font-medium text-v2-text-text-strong">
                        {op.titulo}
                        <Show when={activo()}>
                          <span class="text-[10px] text-[#EC5B2B]">● activo</span>
                        </Show>
                      </div>
                      <div class="text-[11px] text-v2-text-text-muted leading-snug mt-0.5">{op.descripcion}</div>
                    </div>
                  </div>
                </MenuV2.Item>
              )
            }}
          </For>
        </MenuV2.Content>
      </MenuV2.Portal>
    </MenuV2>
  )
}
