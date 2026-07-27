#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Zenkai — Generador de credenciales de acceso
// Solo TÚ (el dueño) usas esto para crear accesos.
//
// Uso:
//   node generar-credencial.mjs <KEY> <CODE> [YYYY-MM-DD] [tier]
//
// Ejemplos:
//   node generar-credencial.mjs JUAN-2026 clave-juan 2026-12-31 pro
//   node generar-credencial.mjs MARIA-PRO acceso-maria           (usa 1 año, tier pro)
//
// Pega el bloque resultante en:
//   packages/app/src/auth/license-data.ts  →  DEFAULT_LICENSES
// y recompila el instalador. Solo quien tenga ESE key+code podrá entrar.
// ─────────────────────────────────────────────────────────────
import { createHash } from "node:crypto"

const [, , key, code, fecha, tierArg] = process.argv

if (!key || !code) {
  console.error("\n  Falta KEY o CODE.\n  Uso: node generar-credencial.mjs <KEY> <CODE> [YYYY-MM-DD] [admin|pro|trial]\n")
  process.exit(1)
}

const tier = ["admin", "pro", "trial"].includes(tierArg ?? "") ? tierArg : "pro"

// Expiración: fecha dada, o 1 año desde hoy.
let expiresAt
if (fecha) {
  const d = new Date(`${fecha}T23:59:59.000Z`)
  if (isNaN(d.getTime())) {
    console.error(`\n  Fecha invalida: "${fecha}". Usa formato YYYY-MM-DD.\n`)
    process.exit(1)
  }
  expiresAt = d.toISOString()
} else {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  expiresAt = d.toISOString()
}

// MISMO algoritmo que hashCredentials() en license-data.ts: SHA-256 de "key:code".
const combinedHash = createHash("sha256").update(`${key}:${code}`).digest("hex")

const entry = {
  keyHash: "",
  codeHash: "",
  combinedHash,
  expiresAt,
  tier,
}

console.log("\n═══════════════════════════════════════════════════")
console.log("  CREDENCIAL GENERADA")
console.log("═══════════════════════════════════════════════════")
console.log(`  Entregar a la persona:`)
console.log(`     license_key : ${key}`)
console.log(`     access_code : ${code}`)
console.log(`     expira      : ${expiresAt.slice(0, 10)}`)
console.log(`     tier        : ${tier}`)
console.log("\n  Pega este bloque en DEFAULT_LICENSES (license-data.ts):\n")
console.log("  " + JSON.stringify(entry, null, 2).replace(/\n/g, "\n  ") + ",")
console.log("\n═══════════════════════════════════════════════════\n")
