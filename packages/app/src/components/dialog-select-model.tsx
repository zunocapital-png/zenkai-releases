import { Popover as Kobalte } from "@kobalte/core/popover"
import {
  Component,
  ComponentProps,
  createEffect,
  createMemo,
  For,
  JSX,
  onCleanup,
  Show,
  ValidComponent,
} from "solid-js"
import { createStore } from "solid-js/store"
import { useLocal } from "@/context/local"
import { useProviders } from "@/hooks/use-providers"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { ModelTooltip } from "./model-tooltip"
import { useLanguage } from "@/context/language"
import { decode64 } from "@/utils/base64"
import { handleDocumentSearchKeydown } from "@/utils/search-keydown"
import { createEventListener } from "@solid-primitives/event-listener"
import { matchesModelSearch } from "./dialog-select-model-search"

const isFree = (provider: string, cost: { input: number } | undefined) =>
  provider === "opencode" && (!cost || cost.input === 0)

// ─── Categorías por necesidad (se leen del prefijo [CODIGO]/[RAZON]/[VISION]/[CHAT] del nombre) ───
type CatKey = "CODIGO" | "RAZON" | "VISION" | "CHAT" | "OTROS"
const CATEGORY: Record<CatKey, { label: string; bg: string; fg: string }> = {
  CODIGO: { label: "Código", bg: "rgba(56,132,255,0.16)", fg: "#6db3f2" },
  RAZON: { label: "Razón", bg: "rgba(160,120,255,0.18)", fg: "#b79bff" },
  VISION: { label: "Visión", bg: "rgba(60,200,140,0.16)", fg: "#5fd0a0" },
  CHAT: { label: "Chat", bg: "rgba(255,170,80,0.16)", fg: "#f2b56d" },
  OTROS: { label: "Modelos", bg: "rgba(150,150,150,0.16)", fg: "#b0b0b0" },
}
const CATEGORY_ORDER: CatKey[] = ["CODIGO", "RAZON", "VISION", "CHAT", "OTROS"]
const modelCategory = (name: string): CatKey => {
  const tag = /^\s*\[([A-ZÁÉÍÓÚÑ]+)\]/.exec(name)?.[1]
  if (tag === "CODIGO" || tag === "CÓDIGO") return "CODIGO"
  if (tag === "RAZON" || tag === "RAZÓN") return "RAZON"
  if (tag === "VISION" || tag === "VISIÓN") return "VISION"
  if (tag === "CHAT") return "CHAT"
  return "OTROS"
}
const cleanModelName = (name: string) => name.replace(/^\s*\[[A-ZÁÉÍÓÚÑ]+\]\s*/, "")

// Pill de color por categoría — todos los modelos lo llevan (mismo diseño, distinto color).
const CategoryPill: Component<{ cat: CatKey }> = (p) => (
  <span
    class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none"
    style={{ "background-color": CATEGORY[p.cat].bg, color: CATEGORY[p.cat].fg }}
  >
    {CATEGORY[p.cat].label}
  </span>
)

// ─── Acceso: todo diferenciado para no adivinar ni tener fallas de auth ───
// LOCAL = offline, sin key (Ollama/LM Studio/Jan/llama.cpp).
// SIN API = nube gratis sin key (relevo Auto/omniroute + gateway ZENKAI Nube/opencode).
// KEY GRATIS = nube gratis PERO hay que conectar una API key gratis (NVIDIA/Groq/Google/:free…).
// CON API = nube de pago, necesita key.
const LOCAL_PROVIDERS = new Set(["ollama", "lmstudio", "jan", "llamacpp", "llama-cpp"])
const KEYLESS_CLOUD = new Set(["omniroute", "opencode"])
const FREE_TIER_PROVIDERS = new Set(["groq", "google", "google-generative-ai", "cerebras", "nvidia", "github-models", "sambanova"])
type Access = "local" | "sinapi" | "keyfree" | "keypaid" | "conectado"
const modelAccess = (providerId: string, modelId: string, cost: { input: number } | undefined): Access => {
  if (LOCAL_PROVIDERS.has(providerId)) return "local"
  if (KEYLESS_CLOUD.has(providerId)) return "sinapi"
  if (/:?free/i.test(modelId) || FREE_TIER_PROVIDERS.has(providerId) || (!!cost && cost.input === 0)) return "keyfree"
  return "keypaid"
}
const ACCESS: Record<Access, { label: string; bg: string; fg: string }> = {
  local: { label: "Local", bg: "rgba(56,132,255,0.16)", fg: "#6db3f2" }, // azul: offline, sin key
  sinapi: { label: "Sin API", bg: "rgba(74,222,128,0.16)", fg: "#4ade80" }, // verde: funciona ya, sin key
  keyfree: { label: "Key gratis", bg: "rgba(255,170,80,0.18)", fg: "#f2b56d" }, // naranja: necesita conectar key gratis
  keypaid: { label: "Con API", bg: "rgba(150,150,150,0.14)", fg: "#9a9aa2" }, // gris: necesita key de pago
  conectado: { label: "Conectado", bg: "rgba(74,222,128,0.16)", fg: "#4ade80" }, // verde: key ya conectada
}
const AccessPill: Component<{ providerId: string; modelId: string; cost: { input: number } | undefined }> = (p) => {
  const local = useLocal()
  const providers = useProviders(() => decode64(local.slug()))
  // Estado reactivo: si el proveedor necesita key y YA está conectada, muestra "Conectado".
  const shown = (): Access => {
    const a = modelAccess(p.providerId, p.modelId, p.cost)
    if ((a === "keyfree" || a === "keypaid") && providers.connected().some((x) => x.id === p.providerId)) return "conectado"
    return a
  }
  return (
    <span
      class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none"
      style={{ "background-color": ACCESS[shown()].bg, color: ACCESS[shown()].fg }}
    >
      {ACCESS[shown()].label}
    </span>
  )
}

type ModelState = ReturnType<typeof useLocal>["model"]
type ModelItem = ReturnType<ModelState["list"]>[number]

const modelKey = (model: ModelItem) => `${model.provider.id}:${model.id}`
const manageKey = "action:manage"

const ModelList: Component<{
  provider?: string
  class?: string
  onSelect: () => void
  action?: JSX.Element
  model?: ModelState
}> = (props) => {
  const model = props.model ?? useLocal().model
  const language = useLanguage()

  const models = createMemo(() =>
    model
      .list()
      .filter((m) => model.visible({ modelID: m.id, providerID: m.provider.id }))
      .filter((m) => (props.provider ? m.provider.id === props.provider : true)),
  )

  return (
    <List
      class={`flex-1 px-3 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0 ${props.class ?? ""}`}
      search={{ placeholder: language.t("dialog.model.search.placeholder"), autofocus: true, action: props.action }}
      emptyMessage={language.t("dialog.model.empty")}
      key={(x) => `${x.provider.id}:${x.id}`}
      items={models}
      current={model.current()}
      filterKeys={["provider.name", "name", "id"]}
      sortBy={(a, b) => a.name.localeCompare(b.name)}
      groupBy={(x) => CATEGORY[modelCategory(x.name)].label}
      sortGroupsBy={(a, b) => {
        const ai = CATEGORY_ORDER.indexOf(modelCategory(a.items[0].name))
        const bi = CATEGORY_ORDER.indexOf(modelCategory(b.items[0].name))
        return ai - bi
      }}
      itemWrapper={(item, node) => (
        <Tooltip
          class="w-full"
          placement="right-start"
          gutter={12}
          openDelay={0}
          value={<ModelTooltip model={item} latest={item.latest} free={isFree(item.provider.id, item.cost)} />}
        >
          {node}
        </Tooltip>
      )}
      onSelect={(x) => {
        model.set(x ? { modelID: x.id, providerID: x.provider.id } : undefined, {
          recent: true,
        })
        props.onSelect()
      }}
    >
      {(i) => (
        <div class="w-full flex items-center gap-x-2 text-13-regular">
          <span class="flex-1 truncate">{cleanModelName(i.name)}</span>
          <AccessPill providerId={i.provider.id} modelId={i.id} cost={i.cost} />
          <CategoryPill cat={modelCategory(i.name)} />
        </div>
      )}
    </List>
  )
}

type ModelSelectorTriggerProps = Omit<ComponentProps<typeof Kobalte.Trigger>, "as" | "ref">
type Dismiss = "escape" | "outside" | "select" | "manage" | "provider"

export function ModelSelectorPopover(props: {
  provider?: string
  model?: ModelState
  children?: JSX.Element
  triggerAs?: ValidComponent
  triggerProps?: ModelSelectorTriggerProps
  onClose?: (cause: "escape" | "select") => void
}) {
  const [store, setStore] = createStore<{
    open: boolean
    dismiss: Dismiss | null
  }>({
    open: false,
    dismiss: null,
  })
  const dialog = useDialog()
  const local = useLocal()
  const directory = () => decode64(local.slug())

  const close = (dismiss: Dismiss) => {
    setStore("dismiss", dismiss)
    setStore("open", false)
  }

  const handleManage = () => {
    close("manage")
    void import("./dialog-manage-models").then((x) => {
      dialog.show(() => <x.DialogManageModels />)
    })
  }

  const handleConnectProvider = () => {
    close("provider")
    void import("./dialog-connect-provider").then((x) => {
      void dialog.show(() => <x.DialogConnectProvider directory={directory} />)
    })
  }
  const language = useLanguage()

  return (
    <Kobalte
      open={store.open}
      onOpenChange={(next) => {
        if (next) setStore("dismiss", null)
        setStore("open", next)
      }}
      modal={false}
      placement="top-start"
      gutter={4}
    >
      <Kobalte.Trigger as={props.triggerAs ?? "div"} {...props.triggerProps}>
        {props.children}
      </Kobalte.Trigger>
      <Kobalte.Portal>
        <Kobalte.Content
          class="w-72 h-80 flex flex-col p-2 rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-50 outline-none overflow-hidden"
          onEscapeKeyDown={(event) => {
            close("escape")
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerDownOutside={() => close("outside")}
          onFocusOutside={() => close("outside")}
          onCloseAutoFocus={(event) => {
            const dismiss = store.dismiss
            if (dismiss === "outside") event.preventDefault()
            if (dismiss === "escape" || dismiss === "select") {
              event.preventDefault()
              props.onClose?.(dismiss)
            }
            setStore("dismiss", null)
          }}
        >
          <Kobalte.Title class="sr-only">{language.t("dialog.model.select.title")}</Kobalte.Title>
          <ModelList
            provider={props.provider}
            model={props.model}
            onSelect={() => close("select")}
            class="p-1"
            action={
              <div class="flex items-center gap-1">
                <Tooltip placement="top" value={language.t("command.provider.connect")}>
                  <IconButton
                    icon="plus-small"
                    variant="ghost"
                    iconSize="normal"
                    class="size-6"
                    aria-label={language.t("command.provider.connect")}
                    onClick={handleConnectProvider}
                  />
                </Tooltip>
                <Tooltip placement="top" value={language.t("dialog.model.manage")}>
                  <IconButton
                    icon="sliders"
                    variant="ghost"
                    iconSize="normal"
                    class="size-6"
                    aria-label={language.t("dialog.model.manage")}
                    onClick={handleManage}
                  />
                </Tooltip>
              </div>
            }
          />
        </Kobalte.Content>
      </Kobalte.Portal>
    </Kobalte>
  )
}

export function ModelSelectorPopoverV2(props: {
  provider?: string
  model?: ModelState
  children?: JSX.Element
  triggerAs?: ValidComponent
  triggerProps?: ModelSelectorTriggerProps
  onClose?: () => void
}) {
  const model = props.model ?? useLocal().model
  const language = useLanguage()
  const dialog = useDialog()
  const [store, setStore] = createStore({ open: false, search: "", active: "" })
  let searchRef: HTMLInputElement | undefined
  let contentRef: HTMLDivElement | undefined
  let restoreTrigger = true

  const allModels = createMemo(() =>
    model
      .list()
      .filter((item) => model.visible({ modelID: item.id, providerID: item.provider.id }))
      .filter((item) => (props.provider ? item.provider.id === props.provider : true)),
  )
  const models = createMemo(() => {
    const search = store.search.trim()
    const filtered = search
      ? allModels().filter((item) => matchesModelSearch(search, [item.name, item.id, item.provider.name]))
      : allModels()

    return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  })
  const groups = createMemo(() => {
    const byCat = new Map<CatKey, ModelItem[]>()
    for (const item of models()) {
      const cat = modelCategory(item.name)
      byCat.set(cat, [...(byCat.get(cat) ?? []), item])
    }
    return Array.from(byCat, ([category, items]) => ({ category, items })).sort(
      (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
    )
  })
  const keys = () => [...models().map(modelKey), manageKey]
  const current = () => {
    const value = model.current()
    return value ? `${value.provider.id}:${value.id}` : undefined
  }
  const initialActive = () => {
    const selected = current()
    const options = keys()
    if (selected && options.includes(selected)) return selected
    return options[0] ?? ""
  }
  const activeItem = () =>
    store.active ? contentRef?.querySelector<HTMLElement>(`[data-option-key="${CSS.escape(store.active)}"]`) : undefined
  const afterClose = (callback: () => void) => {
    const complete = () => {
      if (contentRef?.isConnected) {
        requestAnimationFrame(complete)
        return
      }
      requestAnimationFrame(() => requestAnimationFrame(callback))
    }
    requestAnimationFrame(complete)
  }
  const setOpen = (open: boolean) => {
    if (open) {
      restoreTrigger = true
      setStore({ open: true, active: initialActive() })
      setTimeout(() =>
        requestAnimationFrame(() => {
          searchRef?.focus()
          activeItem()?.scrollIntoView({ block: "nearest" })
        }),
      )
      return
    }
    setStore({ open: false, search: "", active: "" })
  }
  const select = (item: ModelItem) => {
    model.set({ modelID: item.id, providerID: item.provider.id }, { recent: true })
    props.onClose?.()
  }
  const selectModel = (item: ModelItem) => {
    restoreTrigger = false
    setOpen(false)
    afterClose(() => select(item))
  }
  const manage = () => {
    restoreTrigger = false
    setOpen(false)
    afterClose(() => {
      void import("./dialog-manage-models").then((x) => {
        dialog.show(() => <x.DialogManageModelsV2 />)
      })
    })
  }
  const selectActive = () => {
    const item = models().find((item) => modelKey(item) === store.active)
    if (item) {
      selectModel(item)
      return
    }
    if (store.active === manageKey) manage()
  }
  const moveActive = (delta: number) => {
    const options = keys()
    if (options.length === 0) return
    const index = options.indexOf(store.active)
    const start = index === -1 ? 0 : index
    setStore("active", options[(start + delta + options.length) % options.length])
    queueMicrotask(() => activeItem()?.scrollIntoView({ block: "nearest" }))
  }
  const setSearch = (value: string) => {
    const search = value.trim()
    const first = [...allModels()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .find((item) => matchesModelSearch(search, [item.name, item.id, item.provider.name]))
    setStore({ search: value, active: first ? modelKey(first) : manageKey })
  }

  createEffect(() => {
    if (!store.open) return
    createEventListener(
      document,
      "keydown",
      (event: KeyboardEvent) => handleDocumentSearchKeydown(searchRef, event, store.search, setSearch),
      true,
    )
  })

  return (
    <MenuV2 open={store.open} modal={false} placement="top-start" gutter={6} onOpenChange={setOpen}>
      <MenuV2.Trigger as={props.triggerAs ?? "div"} {...props.triggerProps}>
        {props.children}
      </MenuV2.Trigger>
      <MenuV2.Portal>
        <MenuV2.Content
          ref={(el: HTMLDivElement) => (contentRef = el)}
          class="w-[284px] overflow-hidden rounded-md border-0 bg-v2-background-bg-layer-01 !p-0 shadow-[var(--v2-elevation-floating)] focus:outline-none"
          onPointerDownOutside={() => (restoreTrigger = false)}
          onFocusOutside={() => (restoreTrigger = false)}
          onCloseAutoFocus={(event) => {
            if (!restoreTrigger) event.preventDefault()
          }}
        >
          <div class="flex flex-col p-0.5">
            <div class="flex h-7 items-center gap-2 rounded-sm pl-3 pr-2.5 text-v2-icon-icon-muted">
              <Icon name="magnifying-glass" size="small" class="shrink-0" />
              <input
                ref={(el) => (searchRef = el)}
                value={store.search}
                placeholder={language.t("dialog.model.search.placeholder")}
                class="h-7 min-w-0 flex-1 border-0 bg-transparent text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
                spellcheck={false}
                autocorrect="off"
                autocomplete="off"
                autocapitalize="off"
                onInput={(event) => setSearch(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Tab") return
                  event.stopPropagation()
                  if (event.key === "Escape") {
                    event.preventDefault()
                    restoreTrigger = false
                    setOpen(false)
                    afterClose(() => props.onClose?.())
                    return
                  }
                  if (event.altKey || event.metaKey) return
                  if (event.key === "ArrowDown") {
                    event.preventDefault()
                    moveActive(1)
                    return
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault()
                    moveActive(-1)
                    return
                  }
                  if (event.key === "Enter" && !event.isComposing) {
                    event.preventDefault()
                    selectActive()
                  }
                }}
              />
              <Show when={store.search.trim()}>
                <button
                  type="button"
                  class="flex size-5 items-center justify-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setSearch("")}
                  aria-label={language.t("common.clear")}
                >
                  <Icon name="close" size="small" />
                </button>
              </Show>
            </div>
          </div>
          <div class="h-px bg-v2-border-border-muted" />
          <ScrollView data-slot="model-selector-scroll" class="max-h-[220px] min-h-0">
            <div class="flex flex-col p-0.5 pt-0">
              <Show
                when={models().length > 0}
                fallback={
                  <div class="flex h-12 items-center px-3 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-faint">
                    {language.t("dialog.model.empty")}
                  </div>
                }
              >
                <For each={groups()}>
                  {(group) => (
                    <MenuV2.Group>
                      <MenuV2.GroupLabel class="gap-2 px-3">
                        <span class="min-w-0 truncate font-semibold" style={{ color: CATEGORY[group.category].fg }}>
                          {CATEGORY[group.category].label}
                        </span>
                      </MenuV2.GroupLabel>
                      <MenuV2.RadioGroup value={current()}>
                        <For each={group.items}>
                          {(item) => (
                            <TooltipV2
                              class="w-full"
                              placement="right-start"
                              gutter={6}
                              openDelay={0}
                              value={
                                <ModelTooltip
                                  model={item}
                                  latest={item.latest}
                                  free={isFree(item.provider.id, item.cost)}
                                  v2
                                />
                              }
                            >
                              <MenuV2.RadioItem
                                value={modelKey(item)}
                                data-option-key={modelKey(item)}
                                data-selected-model={current() === modelKey(item) ? true : undefined}
                                class="scroll-my-6 w-full"
                                classList={{ "!bg-v2-overlay-simple-overlay-hover": store.active === modelKey(item) }}
                                onMouseEnter={() => {
                                  setStore("active", modelKey(item))
                                  setTimeout(() => searchRef?.focus())
                                }}
                                onSelect={() => selectModel(item)}
                              >
                                <span class="min-w-0 flex-1 truncate leading-5">{cleanModelName(item.name)}</span>
                                <AccessPill providerId={item.provider.id} modelId={item.id} cost={item.cost} />
                                <CategoryPill cat={modelCategory(item.name)} />
                              </MenuV2.RadioItem>
                            </TooltipV2>
                          )}
                        </For>
                      </MenuV2.RadioGroup>
                    </MenuV2.Group>
                  )}
                </For>
              </Show>
            </div>
          </ScrollView>
          <div class="h-px bg-v2-border-border-muted" />
          <div class="flex flex-col p-0.5">
            <MenuV2.Item
              data-option-key={manageKey}
              classList={{ "!bg-v2-overlay-simple-overlay-hover": store.active === manageKey }}
              onMouseEnter={() => {
                setStore("active", manageKey)
                setTimeout(() => searchRef?.focus())
              }}
              onSelect={manage}
            >
              <Icon name="outline-sliders" size="small" />
              <span class="min-w-0 flex-1 truncate leading-5">{language.t("dialog.model.manage")}</span>
            </MenuV2.Item>
          </div>
        </MenuV2.Content>
      </MenuV2.Portal>
    </MenuV2>
  )
}

export const DialogSelectModel: Component<{ provider?: string; model?: ModelState }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const local = useLocal()
  const directory = () => decode64(local.slug())

  const provider = () => {
    void import("./dialog-connect-provider").then((x) => {
      void dialog.show(() => <x.DialogConnectProvider directory={directory} />)
    })
  }

  const manage = () => {
    void import("./dialog-manage-models").then((x) => {
      dialog.show(() => <x.DialogManageModels />)
    })
  }

  return (
    <Dialog
      title={language.t("dialog.model.select.title")}
      action={
        <Button class="h-7 -my-1 text-14-medium" icon="plus-small" tabIndex={-1} onClick={provider}>
          {language.t("command.provider.connect")}
        </Button>
      }
    >
      <ModelList provider={props.provider} model={props.model} onSelect={() => dialog.close()} />
      <Button variant="ghost" class="ml-3 mt-5 mb-6 text-text-base self-start" onClick={manage}>
        {language.t("dialog.model.manage")}
      </Button>
    </Dialog>
  )
}
