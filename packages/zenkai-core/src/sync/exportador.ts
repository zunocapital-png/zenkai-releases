import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"

// Cloud sync mínimo — export/import de sesiones + skills + config como JSON.
// El usuario elige DÓNDE sincronizar (Dropbox, iCloud, Google Drive, USB) —
// nosotros solo damos el formato serializable + encryption opcional.
//
// Diseño consciente: no montamos un backend propio ni cobramos por sync.
// El JSON es agnóstico al transport — funciona por USB / servicio nube /
// email / lo que sea.
//
// Encryption: AES-256-GCM con key derivada por scrypt desde passphrase del
// usuario. El passphrase NO se guarda — el usuario lo escribe cada vez.

export type BundleZenkai = {
  version: 1
  exportedAt: number
  sesiones?: Array<{ id: string; title?: string; createdAt: number; updatedAt: number; meta?: Record<string, unknown> }>
  mensajes?: Record<string, Array<{ id: string; role: string; parts: unknown[]; createdAt: number }>>
  skills?: Array<Record<string, unknown>>
  plugins?: Array<Record<string, unknown>>
  presetsCustom?: Record<string, unknown>
  digitalTwin?: Record<string, unknown>
}

export type ExportarOpts = {
  bundle: Omit<BundleZenkai, "version" | "exportedAt">
  passphrase?: string
}

export type ArchivoExportado = {
  encrypted: boolean
  data: string
  hint?: string
}

/**
 * Serializa un bundle a texto JSON (o encrypted si viene passphrase).
 * El resultado es UN string — lo guardás donde quieras.
 */
export function exportarBundle(opts: ExportarOpts): ArchivoExportado {
  const bundle: BundleZenkai = {
    version: 1,
    exportedAt: Date.now(),
    ...opts.bundle,
  }
  const json = JSON.stringify(bundle)
  if (!opts.passphrase) return { encrypted: false, data: json }

  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = scryptSync(opts.passphrase, salt, 32)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = {
    _zenkai: "bundle-encrypted-v1",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  }
  return { encrypted: true, data: JSON.stringify(payload), hint: "AES-256-GCM · scrypt KDF" }
}

/**
 * Deserializa. Si el bundle está encrypted, requiere passphrase.
 * Devuelve error legible si la passphrase es incorrecta.
 */
export function importarBundle(data: string, passphrase?: string): BundleZenkai {
  let parsed: unknown
  try { parsed = JSON.parse(data) } catch { throw new Error("archivo inválido — no es JSON") }
  const obj = parsed as { _zenkai?: string; version?: number }
  // Bundle plano.
  if (obj.version === 1) return obj as unknown as BundleZenkai
  // Bundle encrypted.
  if (obj._zenkai === "bundle-encrypted-v1") {
    if (!passphrase) throw new Error("bundle está encriptado — necesitás la passphrase")
    const e = parsed as { salt: string; iv: string; tag: string; data: string }
    const salt = Buffer.from(e.salt, "base64")
    const iv = Buffer.from(e.iv, "base64")
    const tag = Buffer.from(e.tag, "base64")
    const encrypted = Buffer.from(e.data, "base64")
    const key = scryptSync(passphrase, salt, 32)
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv)
      decipher.setAuthTag(tag)
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
      const inner = JSON.parse(decrypted.toString("utf8")) as BundleZenkai
      if (inner.version !== 1) throw new Error("bundle interno versión desconocida")
      return inner
    } catch {
      throw new Error("passphrase incorrecta o bundle corrupto")
    }
  }
  throw new Error("bundle versión desconocida")
}

/**
 * Chequea rápido si un archivo es bundle Zenkai — sin desencriptar.
 * Útil para file picker: "sí, este parece bundle".
 */
export function esBundleZenkai(data: string): { ok: boolean; encrypted: boolean } {
  try {
    const p = JSON.parse(data) as { _zenkai?: string; version?: number }
    if (p._zenkai === "bundle-encrypted-v1") return { ok: true, encrypted: true }
    if (p.version === 1) return { ok: true, encrypted: false }
    return { ok: false, encrypted: false }
  } catch {
    return { ok: false, encrypted: false }
  }
}
