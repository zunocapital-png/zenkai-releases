import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Diálogo de confirmación estándar del sistema (reemplaza window.confirm nativo
// que rompía el estilo dark). Uso:
//   const dialog = useDialog()
//   const ok = await confirmarDialog(dialog, { titulo, mensaje, peligro })
export type ConfirmarOpts = {
  titulo: string
  mensaje: string
  confirmTexto?: string
  cancelTexto?: string
  peligro?: boolean
}

// Como useDialog().show devuelve una Promise que resuelve al cerrar, la
// convención es: promesa true si confirmó, false si canceló.
export function confirmarDialog(
  dialog: ReturnType<typeof useDialog>,
  opts: ConfirmarOpts,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    void dialog.show(() => (
      <DialogConfirmar
        opts={opts}
        onResolve={(v) => {
          resolve(v)
          dialog.close()
        }}
      />
    ))
  })
}

function DialogConfirmar(props: { opts: ConfirmarOpts; onResolve: (v: boolean) => void }) {
  const color = () => (props.opts.peligro ? "#ef4444" : "#EC5B2B")
  return (
    <Dialog
      size="normal"
      title={props.opts.titulo}
      class="w-[min(calc(100vw-40px),440px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-4 p-6">
        <p class="text-[13px] text-v2-text-text-base leading-relaxed">{props.opts.mensaje}</p>
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => props.onResolve(false)}
            class="rounded-md border border-v2-border-border-muted px-3 py-1.5 text-[12px] font-medium text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover"
          >
            {props.opts.cancelTexto ?? "Cancelar"}
          </button>
          <button
            type="button"
            onClick={() => props.onResolve(true)}
            class="rounded-md px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
            style={{ background: color() }}
          >
            {props.opts.confirmTexto ?? "Confirmar"}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
