import { onCleanup, onMount } from "solid-js"

type MatrixRainProps = {
  // Opacidad global del efecto (0-1). Sutil por defecto para usarlo de fondo.
  opacity?: number
  // Densidad de columnas: mayor = más juntas.
  fontSize?: number
  // Milisegundos entre cada avance de la lluvia. Mayor = más lento/elegante.
  // Default 110ms (~9 fps) para un movimiento calmado, no frenético.
  speed?: number
  class?: string
}

// Efecto "Matrix" en los colores de Zenkai (naranja). Lluvia de caracteres
// cayendo sobre un canvas. Pensado como fondo decorativo (login, splash, loading).
export function MatrixRain(props: MatrixRainProps) {
  let canvas: HTMLCanvasElement | undefined
  let raf = 0

  onMount(() => {
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const fontSize = props.fontSize ?? 14
    // Caracteres tipo terminal/katakana para el look Matrix.
    const glyphs = "ｱｲｳｴｵｶｷｸ0123456789ZENKAI<>/{}[]$#*+=".split("")
    let columns = 0
    let drops: number[] = []

    function resize() {
      if (!canvas) return
      const parent = canvas.parentElement
      const w = parent?.clientWidth ?? window.innerWidth
      const h = parent?.clientHeight ?? window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      columns = Math.floor(w / fontSize)
      drops = Array.from({ length: columns }, () => Math.floor((Math.random() * h) / fontSize))
    }

    resize()
    window.addEventListener("resize", resize)

    // Throttle: solo avanzamos la lluvia cada `speed` ms para un movimiento
    // calmado en vez de a 60fps. El timestamp lo da requestAnimationFrame.
    const speed = props.speed ?? 110
    let last = 0

    function draw(now: number) {
      if (!canvas || !ctx) return
      if (now - last < speed) {
        raf = requestAnimationFrame(draw)
        return
      }
      last = now

      const w = canvas.clientWidth
      const h = canvas.clientHeight

      // Rastro que se desvanece (fondo semitransparente).
      ctx.fillStyle = "rgba(0, 0, 0, 0.10)"
      ctx.fillRect(0, 0, w, h)

      ctx.font = `${fontSize}px 'JetBrainsMono Nerd Font Mono', monospace`

      for (let i = 0; i < drops.length; i++) {
        const char = glyphs[Math.floor(Math.random() * glyphs.length)]
        const x = i * fontSize
        const y = drops[i]! * fontSize

        // La cabeza de cada columna brilla más (naranja claro), la cola es tenue.
        ctx.fillStyle = Math.random() > 0.975 ? "#FFB080" : "#EC5B2B"
        ctx.fillText(char ?? "0", x, y)

        if (y > h && Math.random() > 0.975) drops[i] = 0
        drops[i]!++
      }

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    onCleanup(() => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    })
  })

  return (
    <canvas
      ref={canvas}
      class={props.class}
      style={{
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        opacity: `${props.opacity ?? 0.18}`,
        "pointer-events": "none",
      }}
    />
  )
}
