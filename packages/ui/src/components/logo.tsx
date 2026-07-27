import { type ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-logo-mark-shadow" d="M4 4L4 16L14 10Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-logo-mark-chevron" d="M2 2L2 18L16 10Z M2 6L2 14L10 10Z" fill="var(--icon-strong-base)" fill-rule="evenodd" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M20 20L20 80L70 50Z" fill="var(--icon-weak-base)" />
      <path d="M10 10L10 90L80 50Z M10 30L10 70L50 50Z" fill="var(--icon-strong-base)" fill-rule="evenodd" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <path d="M4 8L4 34L28 21Z" fill="var(--icon-strong-base)" />
      <text x="40" y="30" font-family="'JetBrains Mono', 'Consolas', monospace" font-size="26" font-weight="700" letter-spacing="1">
        <tspan fill="var(--icon-weak-base)">ZEN</tspan><tspan fill="var(--icon-base)">KAI</tspan>
      </text>
    </svg>
  )
}
