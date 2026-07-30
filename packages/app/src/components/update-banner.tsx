import { createSignal, Match, Show, Switch } from "solid-js"
import { usePlatform } from "@/context/platform"

// Aviso de actualización PRO estilo ZENKAI. La app es local, pero cada release se publica
// en GitHub (zenkai-releases): el updater chequea cada 10 min, descarga en segundo plano y,
// cuando la nueva versión queda lista, este banner invita a reiniciar para instalarla.
//
// Flujo de estados (updater-controller): checking -> downloading{version} -> ready{version}.
// Mostramos "descargando" (barra indeterminada) e "instalá ahora" (CTA de reinicio).
// "Después" oculta el banner para ESA versión; vuelve a aparecer en el próximo arranque.
export function UpdateBanner() {
  const platform = usePlatform()
  const [descartada, setDescartada] = createSignal<string | undefined>(undefined)

  const estado = () => platform.updater?.state()
  const versionLista = () => {
    const s = estado()
    return s?.status === "ready" ? s.version : undefined
  }
  const mostrarLista = () => {
    const v = versionLista()
    return !!v && descartada() !== v
  }
  const descargando = () => estado()?.status === "downloading"
  const instalando = () => estado()?.status === "installing"

  const instalar = () => void platform.updater?.install()

  return (
    <Show when={mostrarLista() || descargando() || instalando()}>
      <style>{`@keyframes zenkai-slide{0%{transform:translateX(-120%)}100%{transform:translateX(240%)}}`}</style>
      <div class="pointer-events-none fixed bottom-4 right-4 z-[60] flex max-w-[92vw] justify-end">
        <Switch>
          {/* Descarga en curso: pill discreta con barra indeterminada naranja. */}
          <Match when={descargando()}>
            <div class="pointer-events-auto flex items-center gap-3 rounded-xl border border-border-base bg-surface-raised px-4 py-3 shadow-xl">
              <div class="relative h-1.5 w-24 overflow-hidden rounded-full bg-surface-base">
                <div class="absolute inset-y-0 w-1/2 animate-[zenkai-slide_1.1s_ease-in-out_infinite] rounded-full bg-orange-500" />
              </div>
              <span class="text-13-medium text-text-strong">Descargando actualización…</span>
            </div>
          </Match>

          {/* Instalando: reiniciando para aplicar. */}
          <Match when={instalando()}>
            <div class="pointer-events-auto flex items-center gap-3 rounded-xl border border-border-base bg-surface-raised px-4 py-3 shadow-xl">
              <span class="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
              <span class="text-13-medium text-text-strong">Instalando y reiniciando…</span>
            </div>
          </Match>

          {/* Lista para instalar: tarjeta con CTA de reinicio. */}
          <Match when={mostrarLista()}>
            <div class="pointer-events-auto w-[340px] max-w-[92vw] overflow-hidden rounded-2xl border border-orange-500/40 bg-surface-raised shadow-2xl">
              <div class="h-1 w-full bg-gradient-to-r from-orange-500 to-orange-400" />
              <div class="flex flex-col gap-3 p-4">
                <div class="flex items-start gap-3">
                  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-500">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 3v12" />
                      <path d="m7 10 5 5 5-5" />
                      <path d="M5 21h14" />
                    </svg>
                  </div>
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <span class="text-14-medium text-text-strong">
                      ZENKAI {versionLista()} está lista
                    </span>
                    <span class="text-12-regular text-text-muted">
                      Ya se descargó en tu equipo. Reiniciá para usar la última versión.
                    </span>
                  </div>
                </div>
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDescartada(versionLista())}
                    class="rounded-lg px-3 py-1.5 text-12-medium text-text-muted hover:bg-surface-hover hover:text-text-strong"
                  >
                    Después
                  </button>
                  <button
                    type="button"
                    onClick={instalar}
                    class="rounded-lg bg-orange-500 px-3.5 py-1.5 text-12-medium text-white shadow hover:bg-orange-600"
                  >
                    Reiniciar ahora
                  </button>
                </div>
              </div>
            </div>
          </Match>
        </Switch>
      </div>
    </Show>
  )
}
