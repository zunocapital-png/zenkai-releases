export { LlamaServer, detectarBinario, nombreBinario, plataformaAsset, ensureDir } from "./llama-server"
export type { LlamaServerOptions, LlamaServerStatus } from "./llama-server"

export { downloadGguf, MODELOS_RECOMENDADOS } from "./gguf-downloader"
export type { DownloadOptions, DownloadProgress, DownloadResultado, ModeloRecomendado } from "./gguf-downloader"

export { diagnosticar, evaluarModelos, elegirMejorPorTipo, resumenRecomendacion } from "./recomendador"
export type { DiagnosticoHw, Recomendacion } from "./recomendador"

export { ModelRegistry, inferirCapabilities } from "./model-registry"
export type { ModelEntry, ModelRegistrySnapshot, ModelRegistryOptions } from "./model-registry"

export { ZenkaiEngine } from "./engine"
export type { EngineOptions, EngineEvent } from "./engine"

export { benchmark, benchmarkYPersistir, leerBenchmarks } from "./bench"
export type { BenchmarkResultado, BenchmarkOptions } from "./bench"

export { HwMonitor } from "./hw-monitor"
export type { HwSnapshot, HwMonitorOptions } from "./hw-monitor"

export {
  descubrirModelosOllama,
  importarOllamaAlRegistry,
  ollamaEstaInstalado,
  ollamaModelsDir,
  normalizarIdOllama,
  prettyOllamaName,
} from "./ollama-import"
export type { ModeloImportado, OllamaManifest } from "./ollama-import"

export { buscarModelosHf, listarGgufsDeModelo, extraerQuant, limpiarCacheHf } from "./hf-search"
export type { HfModel, HfGgufFile } from "./hf-search"

export { bootstrapLlamaBinary } from "./binary-bootstrap"
export type { BootstrapProgress, BootstrapOptions, BootstrapResultado } from "./binary-bootstrap"

export {
  parseZenkaiFile,
  parseZenkaiFileFromDisk,
  crearModeloDesdeZenkaiFile,
  serializarZenkaiFile,
} from "./zenkaifile"
export type { ZenkaiFileParsed, ZenkaiFileDirective } from "./zenkaifile"
