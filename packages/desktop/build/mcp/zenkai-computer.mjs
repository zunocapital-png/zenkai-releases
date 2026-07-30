#!/usr/bin/env node
// ZENKAI Computer Use — servidor MCP PROPIO (sin dependencias) que le da al modelo
// control de la PC estilo Claude: ver la pantalla y mover mouse / hacer clic / escribir.
// Protocolo MCP por stdio (JSON-RPC 2.0, mensajes delimitados por newline).
//
// FRENOS DE SEGURIDAD (importantes):
//   - Las ACCIONES (clic, teclado, scroll, mover) solo se ejecutan si el entorno
//     tiene ZENKAI_COMPUTER_USE=1. Sin eso, devuelven "bloqueado" (modo lectura).
//   - Kill-switch: si existe el archivo apuntado por ZENKAI_COMPUTER_STOP, TODO se bloquea.
//   - Solo Windows por ahora (usa PowerShell/.NET). En otros SO, informa no disponible.
//
// El screenshot es de solo-lectura y siempre está permitido (el modelo necesita ver).

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import readline from "node:readline"

const isWin = process.platform === "win32"
// El control está permitido SOLO si existe el archivo de permiso que escribe el toggle
// de ZENKAI ("Permitir control de PC"). Sin ese archivo, TODO (incluso el screenshot)
// devuelve "bloqueado" — seguro por defecto, y apagarlo bloquea al instante (= STOP).
const ALLOW_FILE = process.env.ZENKAI_COMPUTER_ALLOW_FILE

function allowed() {
  return !!ALLOW_FILE && existsSync(ALLOW_FILE)
}

// Corre un script de PowerShell y resuelve su stdout.
function powershell(script) {
  return new Promise((resolve, reject) => {
    const ps = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true },
    )
    let out = ""
    let err = ""
    ps.stdout.on("data", (d) => (out += d))
    ps.stderr.on("data", (d) => (err += d))
    ps.once("error", reject)
    ps.once("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `exit ${code}`))))
  })
}

// ── Acciones de bajo nivel (PowerShell + Win32) ──

const CURSOR_SETUP = `
Add-Type -AssemblyName System.Windows.Forms;
Add-Type -AssemblyName System.Drawing;
$sig = @'
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, System.IntPtr dwExtraInfo);
'@;
$U = Add-Type -MemberDefinition $sig -Name "Win32Zenkai" -Namespace Win32 -PassThru;
`

async function screenshot() {
  const script = `
${CURSOR_SETUP}
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen;
$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height);
$g = [System.Drawing.Graphics]::FromImage($bmp);
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size);
$ms = New-Object System.IO.MemoryStream;
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png);
[Console]::Out.Write("$($b.Width)x$($b.Height)|" + [System.Convert]::ToBase64String($ms.ToArray()));
`
  const out = (await powershell(script)).trim()
  const sep = out.indexOf("|")
  const meta = sep > 0 ? out.slice(0, sep) : ""
  const b64 = sep > 0 ? out.slice(sep + 1) : out
  return { image: b64, size: meta } // meta = "WIDTHxHEIGHT" para mapear coordenadas
}

async function moveMouse(x, y) {
  await powershell(`${CURSOR_SETUP} [void]$U::SetCursorPos(${x | 0}, ${y | 0});`)
}
async function click(x, y, button = "left") {
  // 0x02/0x04 left down/up ; 0x08/0x10 right down/up
  const down = button === "right" ? "0x08" : "0x02"
  const up = button === "right" ? "0x10" : "0x04"
  await powershell(
    `${CURSOR_SETUP} [void]$U::SetCursorPos(${x | 0}, ${y | 0}); $U::mouse_event(${down},0,0,0,[System.IntPtr]::Zero); Start-Sleep -Milliseconds 40; $U::mouse_event(${up},0,0,0,[System.IntPtr]::Zero);`,
  )
}
async function scroll(amount) {
  await powershell(`${CURSOR_SETUP} $U::mouse_event(0x0800,0,0,${amount | 0},[System.IntPtr]::Zero);`)
}
async function doubleClick(x, y) {
  await powershell(
    `${CURSOR_SETUP} [void]$U::SetCursorPos(${x | 0}, ${y | 0}); $U::mouse_event(0x02,0,0,0,[System.IntPtr]::Zero); $U::mouse_event(0x04,0,0,0,[System.IntPtr]::Zero); Start-Sleep -Milliseconds 60; $U::mouse_event(0x02,0,0,0,[System.IntPtr]::Zero); $U::mouse_event(0x04,0,0,0,[System.IntPtr]::Zero);`,
  )
}
async function drag(x1, y1, x2, y2) {
  await powershell(
    `${CURSOR_SETUP} [void]$U::SetCursorPos(${x1 | 0}, ${y1 | 0}); $U::mouse_event(0x02,0,0,0,[System.IntPtr]::Zero); Start-Sleep -Milliseconds 80; [void]$U::SetCursorPos(${x2 | 0}, ${y2 | 0}); Start-Sleep -Milliseconds 80; $U::mouse_event(0x04,0,0,0,[System.IntPtr]::Zero);`,
  )
}
async function typeText(text) {
  const esc = String(text).replace(/[+^%~(){}[\]]/g, "{$&}").replace(/'/g, "''")
  await powershell(`${CURSOR_SETUP} [System.Windows.Forms.SendKeys]::SendWait('${esc}');`)
}
async function pressKey(key) {
  await powershell(`${CURSOR_SETUP} [System.Windows.Forms.SendKeys]::SendWait('${String(key).replace(/'/g, "''")}');`)
}

// ── Definición de herramientas MCP ──

const TOOLS = [
  {
    name: "screenshot",
    description: "Captura la pantalla completa y la devuelve como imagen. Úsalo para ver antes de actuar.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mouse_move",
    description: "Mueve el cursor a (x, y) en píxeles de pantalla.",
    inputSchema: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
  },
  {
    name: "mouse_click",
    description: "Clic en (x, y). button: 'left' (default) o 'right'.",
    inputSchema: {
      type: "object",
      properties: { x: { type: "number" }, y: { type: "number" }, button: { type: "string" } },
      required: ["x", "y"],
    },
  },
  {
    name: "type_text",
    description: "Escribe texto en donde esté el foco.",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "key_press",
    description: "Envía teclas especiales estilo SendKeys, ej: {ENTER}, {TAB}, ^c (Ctrl+C).",
    inputSchema: { type: "object", properties: { keys: { type: "string" } }, required: ["keys"] },
  },
  {
    name: "scroll",
    description: "Scroll vertical. amount positivo = arriba, negativo = abajo (ej 120 por 'tic').",
    inputSchema: { type: "object", properties: { amount: { type: "number" } }, required: ["amount"] },
  },
  {
    name: "double_click",
    description: "Doble clic en (x, y). Para abrir archivos, seleccionar palabras, etc.",
    inputSchema: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
  },
  {
    name: "drag",
    description: "Arrastra desde (x1, y1) hasta (x2, y2). Para mover, seleccionar, deslizar.",
    inputSchema: {
      type: "object",
      properties: { x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" } },
      required: ["x1", "y1", "x2", "y2"],
    },
  },
  {
    name: "wait",
    description: "Espera N segundos para que la pantalla reaccione antes del próximo paso.",
    inputSchema: { type: "object", properties: { seconds: { type: "number" } }, required: ["seconds"] },
  },
]

async function runTool(name, args) {
  if (!isWin) return { text: "Control de PC solo disponible en Windows por ahora." }
  // Freno maestro: sin permiso, NADA se ejecuta (ni ver la pantalla).
  if (!allowed()) {
    return {
      text: "🔒 El control de la PC está apagado. Prendé el toggle 'Permitir control de PC' en ZENKAI (Diagnóstico) para habilitarlo.",
    }
  }

  if (name === "screenshot") {
    const { image } = await screenshot()
    return { image }
  }

  switch (name) {
    case "mouse_move":
      await moveMouse(args.x, args.y)
      return { text: `Cursor en (${args.x | 0}, ${args.y | 0}).` }
    case "mouse_click":
      await click(args.x, args.y, args.button)
      return { text: `Clic ${args.button ?? "left"} en (${args.x | 0}, ${args.y | 0}).` }
    case "type_text":
      await typeText(args.text ?? "")
      return { text: `Escrito: ${String(args.text ?? "").slice(0, 40)}…` }
    case "key_press":
      await pressKey(args.keys ?? "")
      return { text: `Teclas: ${args.keys}` }
    case "scroll":
      await scroll(args.amount ?? 0)
      return { text: `Scroll ${args.amount}.` }
    case "double_click":
      await doubleClick(args.x, args.y)
      return { text: `Doble clic en (${args.x | 0}, ${args.y | 0}).` }
    case "drag":
      await drag(args.x1, args.y1, args.x2, args.y2)
      return { text: `Arrastre de (${args.x1 | 0}, ${args.y1 | 0}) a (${args.x2 | 0}, ${args.y2 | 0}).` }
    case "wait":
      await new Promise((r) => setTimeout(r, Math.min(30, Math.max(0, args.seconds || 1)) * 1000))
      return { text: `Esperé ${args.seconds}s.` }
    default:
      throw new Error(`Herramienta desconocida: ${name}`)
  }
}

// ── Transporte MCP (JSON-RPC 2.0 por stdio, newline-delimited) ──

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n")
}

async function handle(msg) {
  const { id, method, params } = msg
  if (method === "initialize") {
    return send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "zenkai-computer", version: "1.0.0" },
      },
    })
  }
  if (method === "notifications/initialized" || method === "initialized") return // sin respuesta
  if (method === "tools/list") {
    return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } })
  }
  if (method === "tools/call") {
    try {
      const out = await runTool(params?.name, params?.arguments ?? {})
      const content = out.image
        ? [
            { type: "text", text: `Pantalla ${out.size || "?"} px. Las coordenadas de clic son en estos píxeles.` },
            { type: "image", data: out.image, mimeType: "image/png" },
          ]
        : [{ type: "text", text: out.text ?? "ok" }]
      return send({ jsonrpc: "2.0", id, result: { content } })
    } catch (e) {
      return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true } })
    }
  }
  if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Método no soportado: ${method}` } })
}

const rl = readline.createInterface({ input: process.stdin })
rl.on("line", (line) => {
  const t = line.trim()
  if (!t) return
  let msg
  try {
    msg = JSON.parse(t)
  } catch {
    return
  }
  void handle(msg)
})
