import { Match, Show, Switch } from "solid-js"
import { MatrixRain } from "@/components/matrix-rain"
import { usePlatform } from "@/context/platform"

// Aviso de actualización OBLIGATORIA con la identidad original de ZENKAI: lluvia matrix
// naranja de fondo y panel pixelado (8-bit). La app es local, pero cada release se publica
// en GitHub: el updater chequea, descarga en segundo plano y este overlay BLOQUEA el uso
// hasta reiniciar e instalar. Nunca se muestra el número de versión (a nadie le importa;
// solo "hay una nueva y es obligatoria").
//
// Flujo (updater-controller): downloading -> ready -> installing. Sin "Después": es obligatoria.
export function UpdateBanner() {
  const platform = usePlatform()

  const estado = () => platform.updater?.state()
  const descargando = () => estado()?.status === "downloading"
  const lista = () => estado()?.status === "ready"
  const instalando = () => estado()?.status === "installing"
  const bloquear = () => descargando() || lista() || instalando()

  const instalar = () => void platform.updater?.install()

  // Marco pixelado: esquinas recortadas estilo 8-bit (mismo notch para frame e interior).
  const notch =
    "polygon(0 5px,5px 5px,5px 0,calc(100% - 5px) 0,calc(100% - 5px) 5px,100% 5px,100% calc(100% - 5px),calc(100% - 5px) calc(100% - 5px),calc(100% - 5px) 100%,5px 100%,5px calc(100% - 5px),0 calc(100% - 5px))"
  const mono = "'JetBrainsMono Nerd Font Mono', ui-monospace, 'Courier New', monospace"

  return (
    <Show when={bloquear()}>
      <style>{`
        @keyframes zk-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
        @keyframes zk-bar{0%{transform:translateX(-120%)}100%{transform:translateX(340%)}}
        .zk-btn{transition:transform .06s steps(2),box-shadow .06s steps(2)}
        .zk-btn:hover{transform:translate(2px,2px)}
        .zk-btn:hover{box-shadow:2px 2px 0 #6f2810 !important}
        .zk-btn:active{transform:translate(4px,4px);box-shadow:0 0 0 #6f2810 !important}
      `}</style>
      <div class="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#0a0806]">
        <MatrixRain opacity={0.22} fontSize={16} speed={90} />

        {/* Marco pixelado naranja */}
        <div
          style={{
            position: "relative",
            padding: "4px",
            background: "#EC5B2B",
            "clip-path": notch,
            "box-shadow": "0 0 0 2px #0a0806, 6px 6px 0 rgba(0,0,0,0.55)",
            width: "440px",
            "max-width": "90vw",
          }}
        >
          <div
            style={{
              background: "#12100e",
              "clip-path": notch,
              padding: "32px 30px",
              "font-family": mono,
              "text-align": "center",
            }}
          >
            {/* Wordmark ZENKAI (identidad terminal) */}
            <div
              style={{
                "font-family": mono,
                "font-weight": "700",
                "letter-spacing": "6px",
                "font-size": "26px",
                color: "#EC5B2B",
                "text-shadow": "2px 2px 0 #6f2810",
                "margin-bottom": "4px",
              }}
            >
              ZENKAI
              <span style={{ animation: "zk-blink 1s steps(1) infinite", color: "#FFB080" }}>_</span>
            </div>

            <Switch>
              {/* Descargando: sin salida. */}
              <Match when={descargando()}>
                <div style={{ color: "#FFB080", "font-size": "12px", "letter-spacing": "2px", "margin-bottom": "16px" }}>
                  &gt; ACTUALIZANDO SISTEMA
                </div>
                <p style={{ color: "#c9b9ac", "font-size": "13px", "line-height": "1.6", margin: "0 0 18px" }}>
                  Descargando la nueva versión. No cierres la app.
                </p>
                <div style={{ position: "relative", height: "12px", background: "#000", overflow: "hidden", border: "2px solid #EC5B2B" }}>
                  <div style={{ position: "absolute", top: "0", bottom: "0", width: "28%", background: "#EC5B2B", animation: "zk-bar 1.1s steps(12) infinite" }} />
                </div>
              </Match>

              {/* Instalando. */}
              <Match when={instalando()}>
                <div style={{ color: "#FFB080", "font-size": "12px", "letter-spacing": "2px", "margin-bottom": "14px" }}>
                  &gt; INSTALANDO
                </div>
                <p style={{ color: "#c9b9ac", "font-size": "13px", "line-height": "1.6", margin: "0" }}>
                  Reiniciando ZENKAI con la última versión…
                </p>
              </Match>

              {/* Lista: única acción. */}
              <Match when={lista()}>
                <div style={{ color: "#FFB080", "font-size": "12px", "letter-spacing": "2px", "margin-bottom": "12px" }}>
                  &gt; ACTUALIZACIÓN OBLIGATORIA
                </div>
                <p style={{ color: "#c9b9ac", "font-size": "13px", "line-height": "1.6", margin: "0 0 22px" }}>
                  Hay una nueva versión de ZENKAI lista en tu equipo. Para seguir usándola, reiniciá para instalarla.
                </p>
                <button
                  type="button"
                  onClick={instalar}
                  class="zk-btn"
                  style={{
                    width: "100%",
                    padding: "14px",
                    background: "#EC5B2B",
                    color: "#0a0806",
                    "font-family": mono,
                    "font-weight": "700",
                    "font-size": "14px",
                    "letter-spacing": "1px",
                    border: "none",
                    cursor: "pointer",
                    "clip-path": notch,
                    "box-shadow": "4px 4px 0 #6f2810",
                  }}
                >
                  [ ACTUALIZAR Y REINICIAR ]
                </button>
              </Match>
            </Switch>
          </div>
        </div>
      </div>
    </Show>
  )
}
