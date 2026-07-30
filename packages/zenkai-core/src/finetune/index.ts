export { construirJsonl, estadisticasDataset, generarModelfileOllama } from "./dataset"
export type { DatasetFormat, DatasetSample, DatasetBuildOpts } from "./dataset"

export { detectarGpu, mejorBackend } from "./gpu"
export type { BackendGpu, DetalleGpu } from "./gpu"

export { correrTraining, generarScriptUnsloth } from "./runner"
export type { TrainRequest, TrainProgress, TrainResultado } from "./runner"
