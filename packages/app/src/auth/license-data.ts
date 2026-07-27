export async function hashCredentials(key: string, code: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${key}:${code}`)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

export type LicenseTier = "admin" | "pro" | "trial"

export interface LicenseEntry {
  keyHash: string
  codeHash: string
  combinedHash: string
  expiresAt: string
  tier: LicenseTier
}

export const DEFAULT_LICENSES: LicenseEntry[] = [
  {
    keyHash: "",
    codeHash: "",
    combinedHash: "9b13f821bf58f11a8e6b045505b3cb0ed58769b2f4f87e05d3bd1739f07dea52",
    expiresAt: "2027-12-31T23:59:59.000Z",
    tier: "admin",
  },
]
