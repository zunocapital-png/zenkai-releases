#!/usr/bin/env node
import("../src/index.ts").catch((e) => {
  console.error("Zenkai CLI failed to load:", e)
  process.exit(1)
})
