import { Show } from "solid-js"
import { useSettings } from "@/context/settings"

// Toggle "Omitir permisos" — cuando esta activo, la IA no pide confirmacion
// para cada accion (modo autonomo). Por defecto DESACTIVADO (mas seguro).
export function SkipPermissionsToggle() {
  const settings = useSettings()
  const active = () => settings.permissions.autoApprove()

  return (
    <button
      type="button"
      title={
        active()
          ? "Modo autonomo ACTIVO — la IA actua sin pedir permiso (click para exigir permisos)"
          : "Omitir permisos — dejar que la IA actue sin confirmar cada paso"
      }
      aria-label="Alternar omitir permisos"
      onClick={() => settings.permissions.setAutoApprove(!active())}
      class="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[11px] font-medium transition-colors"
      style={{
        color: active() ? "#EC5B2B" : "var(--v2-text-text-muted, #808080)",
        background: active() ? "rgba(236,91,43,0.12)" : "transparent",
        border: `1px solid ${active() ? "rgba(236,91,43,0.4)" : "transparent"}`,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <Show when={active()}>
          <path d="m9 12 2 2 4-4" />
        </Show>
      </svg>
      <span>Omitir permisos</span>
    </button>
  )
}
