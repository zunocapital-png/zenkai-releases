import { createSignal, onCleanup, Show } from "solid-js"

type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResultList
  resultIndex: number
}

type SpeechRecognitionErrorEvent = Event & {
  error: string
}

type SpeechRecognitionInstance = EventTarget & {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as SpeechRecognitionConstructor | undefined
}

function detectLanguage(): string {
  const lang = navigator.language || "en-US"
  if (lang.startsWith("es")) return "es-ES"
  return "en-US"
}

export function VoiceInputButton(props: { onTranscript: (text: string) => void }) {
  const SpeechRecognition = getSpeechRecognition()
  const [listening, setListening] = createSignal(false)
  const [unsupported, setUnsupported] = createSignal(!SpeechRecognition)
  let recognition: SpeechRecognitionInstance | undefined

  function start() {
    if (!SpeechRecognition) {
      setUnsupported(true)
      return
    }
    if (listening()) {
      stop()
      return
    }

    recognition = new SpeechRecognition()
    recognition.lang = detectLanguage()
    recognition.interimResults = false
    recognition.continuous = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1]
      if (last?.[0]) {
        props.onTranscript(last[0].transcript)
      }
    }

    recognition.onerror = (_event: SpeechRecognitionErrorEvent) => {
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognition.start()
    setListening(true)
  }

  function stop() {
    recognition?.stop()
    setListening(false)
  }

  onCleanup(() => {
    recognition?.abort()
  })

  return (
    <Show
      when={!unsupported()}
      fallback={
        <button
          type="button"
          disabled
          class="flex size-8 shrink-0 items-center justify-center rounded-full bg-v2-background-bg-muted text-v2-text-text-disabled"
          title="Speech recognition is not supported in this browser"
        >
          <MicIcon />
        </button>
      }
    >
      <button
        type="button"
        onClick={start}
        class="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors"
        classList={{
          "bg-red-500/15 text-red-500 animate-pulse": listening(),
          "bg-v2-background-bg-muted text-v2-text-text-muted hover:bg-v2-background-bg-hover hover:text-v2-text-text-base":
            !listening(),
        }}
        aria-label={listening() ? "Stop recording" : "Start voice input"}
        title={listening() ? "Listening..." : "Voice input"}
      >
        <MicIcon />
      </button>
    </Show>
  )
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M8 1.5a2 2 0 0 0-2 2v4a2 2 0 0 0 4 0v-4a2 2 0 0 0-2-2Z"
        fill="currentColor"
      />
      <path
        d="M4.5 6.5a.5.5 0 0 0-1 0v1a4.5 4.5 0 0 0 4 4.473V13.5H6a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1H8.5v-1.527a4.5 4.5 0 0 0 4-4.473v-1a.5.5 0 0 0-1 0v1a3.5 3.5 0 0 1-7 0v-1Z"
        fill="currentColor"
      />
    </svg>
  )
}
