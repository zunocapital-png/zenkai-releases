# Fine-tuning on-device para ZENKAI (guía honesta)

**Importante:** fine-tuning NO es un botón dentro de la app — es un proceso de ML que
corre aparte, en tu GPU, y tarda. Ollama es solo *inferencia* (no entrena). Este es el
camino real para entrenar un modelo con tu código/estilo y usarlo dentro de ZENKAI.

## Requisitos
- GPU NVIDIA con **≥ 8 GB de VRAM** (para 7B con LoRA/QLoRA). Sin GPU dedicada, no es viable.
- Python 3.10+ y ~20-40 GB de disco libre.
- Un **dataset**: pares de ejemplos (instrucción → respuesta) con tu estilo/código.

## Paso 1 — Preparar el dataset
Un archivo `datos.jsonl`, una línea por ejemplo:
```json
{"instruction": "Refactorizá esta función", "input": "def f(x): return x+1", "output": "..."}
```
Cuantos más ejemplos reales de TU trabajo, mejor aprende tu estilo (apuntá a 300+).

## Paso 2 — Entrenar (LoRA con Unsloth, lo más simple)
```bash
pip install unsloth
```
Script mínimo (ajustá el modelo base y las rutas):
```python
from unsloth import FastLanguageModel
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments

model, tok = FastLanguageModel.from_pretrained("unsloth/Qwen2.5-Coder-7B", load_in_4bit=True)
model = FastLanguageModel.get_peft_model(model, r=16, lora_alpha=16)
ds = load_dataset("json", data_files="datos.jsonl", split="train")
SFTTrainer(model=model, tokenizer=tok, train_dataset=ds,
  args=TrainingArguments(per_device_train_batch_size=2, max_steps=200, output_dir="out")).train()
model.save_pretrained_gguf("zenkai-mio", tok, quantization_method="q4_k_m")
```
Esto corre minutos-horas según tu GPU y produce un `.gguf`.

## Paso 3 — Importar a Ollama
Creá un `Modelfile`:
```
FROM ./zenkai-mio/unsloth.Q4_K_M.gguf
```
Y registralo:
```bash
ollama create zenkai-mio -f Modelfile
```

## Paso 4 — Usarlo en ZENKAI
Abrí **Diagnóstico** → tu modelo `zenkai-mio` aparece en la lista de Ollama y en el
selector (ZENKAI sincroniza `/api/tags` en vivo). Listo: es tu modelo, local y privado.

---

### Por qué no está "dentro de la app" (todavía)
Meter todo esto en un botón implica: empaquetar el stack de entrenamiento (~GB), detectar
tu GPU/VRAM, armar un editor de datasets, correr el entrenamiento con progreso, y manejar
fallos de memoria. Es un mini-proyecto de ML en sí mismo. Cuando lo encaremos, se hace por
etapas y probando en tu máquina — no como un stub que finge entrenar.
