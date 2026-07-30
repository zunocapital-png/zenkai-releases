export {
  normalizarImagen,
  normalizarPartsImagen,
  detectarMimeMagic,
  DEFAULT_MAX_BYTES,
  MIME_MAGIC_BYTES,
} from "./normalizador"
export type { ImagenNormalizada, NormalizarOpts } from "./normalizador"

export { screenshotToCode, extraerCodigoDeMarkdown } from "./screenshot-to-code"
export type { S2CInput, S2CResultado, S2CFramework } from "./screenshot-to-code"

export { wrapEnSandbox } from "./preview-sandbox"
export type { FrameworkPreview, PreviewBundle } from "./preview-sandbox"
