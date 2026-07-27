import { createUniqueId, type ComponentProps } from "solid-js"

export function WordmarkV2(props: Pick<ComponentProps<"svg">, "class">) {
  const filter = createUniqueId()
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 522 129"
      fill="none"
      preserveAspectRatio="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g opacity="0.16" filter={`url(#${filter})`} mask={`url(#${mask})`}>
        <path
          opacity="0.7"
          d="M0 18H72V54H54V72H36V90H72V108H0V72H18V54H36V36H0Z"
          fill="currentColor"
        />
        <path
          opacity="0.7"
          d="M90 18H162V36H108V54H144V72H108V90H162V108H90Z"
          fill="currentColor"
        />
        <path
          opacity="0.7"
          d="M180 18H216V72H198V108H180Z M234 18H252V108H216V54H234Z"
          fill="currentColor"
        />
        <path
          opacity="0.7"
          d="M270 18H288V108H270Z M306 18H342V36H324V54H306V72H324V90H342V108H306V90H288V36H306Z"
          fill="currentColor"
        />
        <path
          opacity="0.7"
          d="M378 18H414V36H432V108H414V72H378V108H360V36H378Z M414 36H378V54H414Z"
          fill="currentColor"
        />
        <path
          opacity="0.7"
          d="M450 18H522V36H504V90H522V108H450V90H468V36H450Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="522" height="129">
          <rect width="522" height="129" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="261" y1="0" x2="261" y2="112" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
        <filter
          id={filter}
          x="0"
          y="0"
          width="522"
          height="130"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="1" />
          <feGaussianBlur stdDeviation="1" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" />
          <feBlend mode="normal" in2="shape" result="effect1_innerShadow" />
        </filter>
      </defs>
    </svg>
  )
}
