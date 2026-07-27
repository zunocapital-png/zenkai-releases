import { createSignal, For, Show, onMount, onCleanup, type JSX } from "solid-js"

export interface ImageAttachment {
  file: File
  preview: string
  base64: string
}

type ImageUploadProps = {
  onImagesChange: (images: ImageAttachment[]) => void
  class?: string
}

const ACCEPTED = ["image/png", "image/jpeg", "image/gif", "image/webp"]
const ACCEPT_STR = ".png,.jpg,.jpeg,.gif,.webp"

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const idx = result.indexOf(",")
      resolve(idx === -1 ? result : result.slice(idx + 1))
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fileToPreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function processFile(file: File): Promise<ImageAttachment | null> {
  if (!ACCEPTED.includes(file.type)) return null
  const [preview, base64] = await Promise.all([fileToPreview(file), fileToBase64(file)])
  return { file, preview, base64 }
}

export function ImageUpload(props: ImageUploadProps) {
  const [images, setImages] = createSignal<ImageAttachment[]>([])
  const [dragging, setDragging] = createSignal(false)
  let fileInputRef: HTMLInputElement | undefined
  let dragCounter = 0

  const updateImages = (next: ImageAttachment[]) => {
    setImages(next)
    props.onImagesChange(next)
  }

  const addFiles = async (files: FileList | File[]) => {
    const results = await Promise.all(Array.from(files).map(processFile))
    const valid = results.filter((r): r is ImageAttachment => r !== null)
    if (valid.length === 0) return
    updateImages([...images(), ...valid])
  }

  const remove = (index: number) => {
    const next = images().filter((_, i) => i !== index)
    updateImages(next)
  }

  const handlePaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind === "file" && ACCEPTED.includes(item.type)) {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      await addFiles(files)
    }
  }

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault()
    dragCounter++
    if (e.dataTransfer?.types.includes("Files")) setDragging(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    dragCounter--
    if (dragCounter <= 0) {
      dragCounter = 0
      setDragging(false)
    }
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault()
    dragCounter = 0
    setDragging(false)
    if (e.dataTransfer?.files) await addFiles(e.dataTransfer.files)
  }

  onMount(() => {
    document.addEventListener("paste", handlePaste)
  })

  onCleanup(() => {
    document.removeEventListener("paste", handlePaste)
  })

  return (
    <div
      class={`flex items-center gap-1.5 ${props.class ?? ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={(el) => (fileInputRef = el)}
        type="file"
        multiple
        accept={ACCEPT_STR}
        class="hidden"
        onChange={(e) => {
          if (e.currentTarget.files) void addFiles(e.currentTarget.files)
          e.currentTarget.value = ""
        }}
      />

      <button
        type="button"
        onClick={() => fileInputRef?.click()}
        class="flex items-center justify-center size-7 rounded-md text-[var(--v2-text-text-muted,#808080)] hover:text-[#EC5B2B] hover:bg-[#EC5B2B]/10 transition-colors"
        title="Adjuntar imagen (Ctrl+V para pegar)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
          <path
            fill-rule="evenodd"
            d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909-4.72-4.719a.75.75 0 0 0-1.06 0L2.5 11.06Zm6-3.06a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"
            clip-rule="evenodd"
          />
        </svg>
      </button>

      <Show when={images().length > 0}>
        <div class="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <For each={images()}>
            {(img, index) => (
              <div class="relative group shrink-0">
                <img
                  src={img.preview}
                  alt={img.file.name}
                  class="size-8 rounded object-cover border border-[var(--v2-border-border-base,#333)]"
                />
                <button
                  type="button"
                  onClick={() => remove(index())}
                  class="absolute -top-1 -right-1 size-3.5 rounded-full bg-[#EC5B2B] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="white" class="size-2.5">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                  </svg>
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={dragging()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pointer-events-none">
          <div class="flex flex-col items-center gap-3 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#EC5B2B" class="size-12">
              <path
                fill-rule="evenodd"
                d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-4.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-2.69 2.689-4.94-4.94a1.5 1.5 0 0 0-2.12 0L3 11.56v4.5Zm7.5-7.56a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"
                clip-rule="evenodd"
              />
            </svg>
            <span class="text-sm font-medium">Soltar imagen aqui</span>
          </div>
        </div>
      </Show>
    </div>
  )
}
