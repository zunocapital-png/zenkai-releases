import { hashCredentials, DEFAULT_LICENSES, type LicenseEntry, type LicenseTier } from "./license-data"

const LICENSES_KEY = "zenkai-licenses"
const AUTH_KEY = "zenkai-auth"

// ─────────────────────────────────────────────────────────────
// Servidor de licencias remoto (SIN recompilar).
// Sube un archivo JSON con tus credenciales a una URL publica (ej. un Gist
// "raw" de GitHub, o cualquier hosting) y pega esa URL aqui. La app lo
// consulta al validar, asi puedes dar/quitar accesos actualizando ese JSON
// sin volver a compilar el instalador.
//
// Formato del JSON (array): [{ "combinedHash": "...", "expiresAt": "2026-12-31T23:59:59.000Z", "tier": "pro" }]
// Deja "" para usar solo las credenciales locales.
// ─────────────────────────────────────────────────────────────
const LICENSE_SERVER_URL = "https://gist.githubusercontent.com/mvlazqueez2000-max/160ab771e40b1b04aaab20a77063a9a6/raw/zenkai-licenses.json"

async function fetchRemoteLicenses(): Promise<LicenseEntry[]> {
  if (!LICENSE_SERVER_URL) return []
  try {
    const res = await fetch(LICENSE_SERVER_URL, { cache: "no-store", signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data.filter(
      (e): e is LicenseEntry =>
        e && typeof e.combinedHash === "string" && typeof e.expiresAt === "string" && typeof e.tier === "string",
    )
  } catch {
    // Sin internet o URL caida → usar solo las locales.
    return []
  }
}

interface AuthState {
  combinedHash: string
  expiresAt: string
  loginTime: number
  tier: LicenseTier
}

interface ValidationResult {
  valid: boolean
  expiresAt?: string
  tier?: LicenseTier
}

function loadLicenses(): LicenseEntry[] {
  try {
    const stored = localStorage.getItem(LICENSES_KEY)
    if (stored) return JSON.parse(stored) as LicenseEntry[]
  } catch {}
  localStorage.setItem(LICENSES_KEY, JSON.stringify(DEFAULT_LICENSES))
  return [...DEFAULT_LICENSES]
}

function saveLicenses(licenses: LicenseEntry[]) {
  localStorage.setItem(LICENSES_KEY, JSON.stringify(licenses))
}

export async function validateCredentials(key: string, code: string): Promise<ValidationResult> {
  const combined = await hashCredentials(key, code)
  // Locales (compiladas) + remotas (URL que actualizas sin recompilar).
  const remote = await fetchRemoteLicenses()
  const licenses = [...loadLicenses(), ...remote]

  for (const license of licenses) {
    if (license.combinedHash === combined) {
      const now = new Date()
      const expiry = new Date(license.expiresAt)
      if (now > expiry) {
        return { valid: false }
      }
      return { valid: true, expiresAt: license.expiresAt, tier: license.tier }
    }
  }

  return { valid: false }
}

export function isAuthenticated(): boolean {
  try {
    const stored = localStorage.getItem(AUTH_KEY)
    if (!stored) return false
    const auth: AuthState = JSON.parse(stored)
    const now = new Date()
    const expiry = new Date(auth.expiresAt)
    return now < expiry
  } catch {
    return false
  }
}

export function isExpired(): boolean {
  try {
    const stored = localStorage.getItem(AUTH_KEY)
    if (!stored) return false
    const auth: AuthState = JSON.parse(stored)
    const now = new Date()
    const expiry = new Date(auth.expiresAt)
    return now >= expiry
  } catch {
    return false
  }
}

export function saveAuth(combinedHash: string, expiresAt: string, tier: LicenseTier) {
  const auth: AuthState = {
    combinedHash,
    expiresAt,
    loginTime: Date.now(),
    tier,
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
}

export function logout() {
  localStorage.removeItem(AUTH_KEY)
}

export function getAuthInfo(): AuthState | null {
  try {
    const stored = localStorage.getItem(AUTH_KEY)
    if (!stored) return null
    return JSON.parse(stored) as AuthState
  } catch {
    return null
  }
}

export async function addLicense(key: string, code: string, expiresAt: string, tier: LicenseTier) {
  const combined = await hashCredentials(key, code)
  const licenses = loadLicenses()
  licenses.push({
    keyHash: "",
    codeHash: "",
    combinedHash: combined,
    expiresAt,
    tier,
  })
  saveLicenses(licenses)
}

export function removeLicense(combinedHash: string) {
  const licenses = loadLicenses()
  const filtered = licenses.filter((l) => l.combinedHash !== combinedHash)
  saveLicenses(filtered)
}
