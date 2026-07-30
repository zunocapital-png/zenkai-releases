import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs"
import { platform, arch } from "node:os"
import { join } from "node:path"
import { downloadGguf } from "./gguf-downloader"

// Bootstrap del binario llama-server — descarga automática desde el release
// oficial de github.com/ggerganov/llama.cpp. Elimina el requisito de "instalá
// llama.cpp primero" que hoy tiene el usuario.
//
// Flujo:
//   1. Detectar plataforma (win-x64, macos-arm64, linux-x64...)
//   2. Consultar GitHub API el último release de llama.cpp
//   3. Descargar el asset .zip / .tar.gz que matchea
//   4. Descomprimir en <binDir>/llama-cpp/
//   5. Verificar que llama-server está adentro y darle exec bits (unix)
//   6. Devolver path absoluto al binario
//
// Estrategia honesta:
//   - Es un DOWNLOAD de assets públicos oficiales — no compilamos ni bundleamos.
//   - Si GitHub cae, fallamos claro (el user puede instalar manual y setear
//     ZENKAI_LLAMA_SERVER como fallback).
//   - Idempotente: si ya existe el binario, no re-descarga.

export type BootstrapProgress = {
  fase: "detectar" | "buscar-release" | "descargando" | "descomprimiendo" | "verificando" | "listo" | "error"
  mensaje: string
  percent?: number
}

export type BootstrapOptions = {
  binDir: string
  onProgress?: (p: BootstrapProgress) => void
  /** Fuerza re-descarga aunque exista. */
  forzar?: boolean
  /** Override URL — para testing o mirrors. */
  urlOverride?: string
}

export type BootstrapResultado = {
  ok: boolean
  binaryPath?: string
  version?: string
  mensajeError?: string
}

const NOMBRE_BIN = platform() === "win32" ? "llama-server.exe" : "llama-server"

/**
 * Descarga y prepara llama-server si no existe. Idempotente.
 */
export async function bootstrapLlamaBinary(opts: BootstrapOptions): Promise<BootstrapResultado> {
  const p = opts.onProgress ?? (() => {})
  const binDir = opts.binDir
  const targetSubdir = join(binDir, "llama-cpp")
  const targetBin = join(targetSubdir, NOMBRE_BIN)

  if (!opts.forzar && existsSync(targetBin) && statSync(targetBin).size > 0) {
    p({ fase: "listo", mensaje: "ya instalado" })
    return { ok: true, binaryPath: targetBin }
  }

  p({ fase: "detectar", mensaje: `detectando plataforma...` })
  const asset = elegirAssetPattern()
  if (!asset) {
    return { ok: false, mensajeError: `plataforma no soportada: ${platform()}/${arch()}` }
  }

  p({ fase: "buscar-release", mensaje: "consultando último release de llama.cpp" })
  let downloadUrl: string
  let version = "unknown"
  if (opts.urlOverride) {
    downloadUrl = opts.urlOverride
  } else {
    try {
      const release = await fetchLatestRelease()
      version = release.tag_name
      const match = release.assets.find((a) => asset.regex.test(a.name))
      if (!match) {
        return { ok: false, mensajeError: `no encontré asset para ${asset.label} en release ${version}` }
      }
      downloadUrl = match.browser_download_url
    } catch (e) {
      return { ok: false, mensajeError: `no pude consultar GitHub: ${(e as Error).message}` }
    }
  }

  if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true })
  if (!existsSync(targetSubdir)) mkdirSync(targetSubdir, { recursive: true })

  const zipPath = join(binDir, `llama-cpp-${asset.label}.zip`)
  p({ fase: "descargando", mensaje: `bajando ${asset.label} ${version}` })
  try {
    await downloadGguf({
      url: downloadUrl,
      destPath: zipPath,
      onProgress: (info) => p({ fase: "descargando", mensaje: `${info.percent.toFixed(1)}%`, percent: info.percent }),
    })
  } catch (e) {
    return { ok: false, mensajeError: `descarga falló: ${(e as Error).message}` }
  }

  p({ fase: "descomprimiendo", mensaje: "extrayendo binario" })
  try {
    await descomprimirZip(zipPath, targetSubdir)
  } catch (e) {
    return { ok: false, mensajeError: `unzip falló: ${(e as Error).message}` }
  }

  p({ fase: "verificando", mensaje: "verificando binario" })
  // El release puede tener el binario en subdirs (bin/, build/) — buscamos.
  const finalPath = buscarBinarioEnDir(targetSubdir, NOMBRE_BIN)
  if (!finalPath) {
    return { ok: false, mensajeError: `binario ${NOMBRE_BIN} no encontrado tras descomprimir` }
  }
  if (platform() !== "win32") {
    try { chmodSync(finalPath, 0o755) } catch { /* noop */ }
  }

  p({ fase: "listo", mensaje: `ok: ${finalPath}` })
  return { ok: true, binaryPath: finalPath, version }
}

type GhRelease = { tag_name: string; assets: Array<{ name: string; browser_download_url: string }> }

async function fetchLatestRelease(): Promise<GhRelease> {
  const url = "https://api.github.com/repos/ggerganov/llama.cpp/releases/latest"
  const res = await fetch(url, {
    headers: { "user-agent": "zenkai-bootstrap/1.0", accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`)
  return (await res.json()) as GhRelease
}

/** Match del asset del release oficial de llama.cpp según plataforma. */
function elegirAssetPattern(): { label: string; regex: RegExp } | undefined {
  const p = platform()
  const a = arch()
  if (p === "win32" && a === "x64") return { label: "win-x64", regex: /win.*x64.*\.zip$/i }
  if (p === "win32" && a === "arm64") return { label: "win-arm64", regex: /win.*arm64.*\.zip$/i }
  if (p === "darwin" && a === "arm64") return { label: "macos-arm64", regex: /macos.*arm64.*\.zip$/i }
  if (p === "darwin" && a === "x64") return { label: "macos-x64", regex: /macos.*x64.*\.zip$/i }
  if (p === "linux" && a === "x64") return { label: "linux-x64", regex: /ubuntu.*x64.*\.zip$/i }
  if (p === "linux" && a === "arm64") return { label: "linux-arm64", regex: /(linux|ubuntu).*arm64.*\.zip$/i }
  return undefined
}

/**
 * Descomprime un .zip. Usa Bun's native ZIP support cuando está disponible,
 * si no cae a spawn de unzip/tar/powershell según OS.
 */
async function descomprimirZip(zipPath: string, destDir: string): Promise<void> {
  const { spawnSync } = await import("node:child_process")
  if (platform() === "win32") {
    // PowerShell Expand-Archive es nativo desde Win10.
    const r = spawnSync("powershell", ["-Command", `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`], {
      windowsHide: true,
    })
    if (r.status !== 0) throw new Error(`powershell exit ${r.status}: ${r.stderr?.toString()}`)
    return
  }
  // unix: unzip suele estar; si no, tar -xf funciona con ZIPs modernos.
  const r = spawnSync("unzip", ["-o", zipPath, "-d", destDir])
  if (r.status !== 0) {
    const r2 = spawnSync("tar", ["-xf", zipPath, "-C", destDir])
    if (r2.status !== 0) throw new Error(`unzip y tar fallaron: ${r.stderr?.toString()}`)
  }
}

/** Busca el binario recursivamente hasta 3 niveles adentro. */
function buscarBinarioEnDir(dir: string, nombre: string): string | undefined {
  const { readdirSync } = require("node:fs") as typeof import("node:fs")
  const cola: Array<{ path: string; depth: number }> = [{ path: dir, depth: 0 }]
  while (cola.length > 0) {
    const { path, depth } = cola.shift()!
    if (depth > 3) continue
    let entries: string[] = []
    try { entries = readdirSync(path) } catch { continue }
    for (const e of entries) {
      const full = join(path, e)
      try {
        const s = statSync(full)
        if (s.isDirectory()) cola.push({ path: full, depth: depth + 1 })
        else if (e === nombre) return full
      } catch { /* skip */ }
    }
  }
  return undefined
}
