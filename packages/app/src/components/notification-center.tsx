import { Component, createSignal, createEffect, onCleanup, For, Show } from "solid-js"

type NotificationType = "info" | "success" | "warning" | "error"

interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  timestamp: number
  read: boolean
  contextAction?: () => void
}

const TYPE_CONFIG: Record<NotificationType, { icon: string; border: string; bg: string; fg: string }> = {
  info: {
    icon: "ℹ️",
    border: "var(--v2-state-border-info)",
    bg: "var(--v2-state-bg-info)",
    fg: "var(--v2-state-fg-info)",
  },
  success: {
    icon: "✅",
    border: "var(--v2-state-border-success)",
    bg: "var(--v2-state-bg-success)",
    fg: "var(--v2-state-fg-success)",
  },
  warning: {
    icon: "⚠️",
    border: "var(--v2-state-border-warning)",
    bg: "var(--v2-state-bg-warning)",
    fg: "var(--v2-state-fg-warning)",
  },
  error: {
    icon: "❌",
    border: "var(--v2-state-border-danger)",
    bg: "var(--v2-state-bg-danger)",
    fg: "var(--v2-state-fg-danger)",
  },
}

interface ToastData {
  id: string
  notification: Notification
  removing: boolean
}

export const NotificationCenter: Component<{
  onNavigate?: (notification: Notification) => void
}> = (props) => {
  const [notifications, setNotifications] = createSignal<Notification[]>([])
  const [panelOpen, setPanelOpen] = createSignal(false)
  const [toasts, setToasts] = createSignal<ToastData[]>([])
  const [soundEnabled, setSoundEnabled] = createSignal(true)

  const unreadCount = () => notifications().filter((n) => !n.read).length

  const addNotification = (type: NotificationType, title: string, message?: string, contextAction?: () => void) => {
    const notification: Notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      title,
      message,
      timestamp: Date.now(),
      read: false,
      contextAction,
    }
    setNotifications((prev) => [notification, ...prev])

    const toast: ToastData = { id: notification.id, notification, removing: false }
    setToasts((prev) => [...prev, toast])

    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === notification.id ? { ...t, removing: true } : t))
      )
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== notification.id))
      }, 300)
    }, 5000)

    return notification
  }

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const clearAll = () => {
    setNotifications([])
  }

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, removing: true } : t)))
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 300)
  }

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts
    if (diff < 60000) return "Just now"
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  ;(window as any).__zenkai_notify = addNotification

  return (
    <>
      <div class="fixed right-4 top-4 z-50 flex flex-col gap-2">
        <For each={toasts()}>
          {(toast) => {
            const config = TYPE_CONFIG[toast.notification.type]
            return (
              <div
                class="flex items-start gap-2 rounded-xl border px-4 py-3 shadow-[var(--v2-elevation-floating)] transition-all duration-300"
                classList={{
                  "animate-in slide-in-from-right": !toast.removing,
                  "opacity-0 translate-x-4": toast.removing,
                }}
                style={{
                  "border-color": config.border,
                  background: "var(--v2-background-bg-layer-01)",
                  "min-width": "300px",
                  "max-width": "420px",
                }}
              >
                <span class="mt-0.5">{config.icon}</span>
                <div class="flex flex-1 flex-col gap-0.5">
                  <span class="text-sm font-medium text-[var(--v2-text-text-base)]">
                    {toast.notification.title}
                  </span>
                  <Show when={toast.notification.message}>
                    <span class="text-xs text-[var(--v2-text-text-muted)]">{toast.notification.message}</span>
                  </Show>
                </div>
                <button
                  class="shrink-0 rounded p-0.5 text-[var(--v2-icon-icon-muted)] transition-colors hover:text-[var(--v2-icon-icon-base)]"
                  onClick={() => removeToast(toast.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M10.5 3.5L3.5 10.5M3.5 3.5l7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
            )
          }}
        </For>
      </div>

      <div class="relative">
        <button
          class="relative rounded-lg p-2 text-[var(--v2-icon-icon-muted)] transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)] hover:text-[#EC5B2B]"
          onClick={() => setPanelOpen((v) => !v)}
          title="Notifications"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M13.5 6.75a4.5 4.5 0 10-9 0c0 4.5-2.25 5.625-2.25 5.625h13.5S13.5 11.25 13.5 6.75z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M10.295 14.625a1.5 1.5 0 01-2.59 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <Show when={unreadCount() > 0}>
            <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EC5B2B] px-1 text-[10px] font-medium text-white">
              {unreadCount()}
            </span>
          </Show>
        </button>

        <Show when={panelOpen()}>
          <div class="absolute right-0 top-full z-50 mt-2 w-[380px] rounded-xl border border-[var(--v2-border-border-muted)] bg-[var(--v2-background-bg-layer-01)] shadow-[var(--v2-elevation-overlay)]">
            <div class="flex items-center justify-between border-b border-[var(--v2-border-border-muted)] px-4 py-3">
              <span class="text-sm font-semibold text-[var(--v2-text-text-base)]">Notifications</span>
              <div class="flex items-center gap-2">
                <button
                  class="rounded p-1 text-[var(--v2-icon-icon-muted)] transition-colors hover:text-[var(--v2-icon-icon-base)]"
                  onClick={() => setSoundEnabled((v) => !v)}
                  title={soundEnabled() ? "Mute notifications" : "Unmute notifications"}
                >
                  <Show when={soundEnabled()} fallback={
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 2L4 5H1v4h3l3 3V2zM12.5 5L9.5 8M9.5 5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  }>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 2L4 5H1v4h3l3 3V2zM10.5 4.5a4 4 0 010 5M12 3a6.5 6.5 0 010 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </Show>
                </button>
              </div>
            </div>

            <div class="max-h-[400px] overflow-y-auto">
              <Show when={notifications().length === 0}>
                <div class="py-8 text-center text-sm text-[var(--v2-text-text-muted)]">
                  No notifications
                </div>
              </Show>
              <For each={notifications()}>
                {(notification) => {
                  const config = TYPE_CONFIG[notification.type]
                  return (
                    <button
                      class="flex w-full items-start gap-3 border-b border-[var(--v2-border-border-muted)] px-4 py-3 text-left transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)]"
                      classList={{ "bg-[var(--v2-overlay-simple-overlay-hover)]/50": !notification.read }}
                      onClick={() => {
                        markRead(notification.id)
                        notification.contextAction?.()
                        props.onNavigate?.(notification)
                      }}
                    >
                      <span class="mt-0.5">{config.icon}</span>
                      <div class="flex flex-1 flex-col gap-0.5">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-medium text-[var(--v2-text-text-base)]">
                            {notification.title}
                          </span>
                          <Show when={!notification.read}>
                            <div class="h-1.5 w-1.5 rounded-full bg-[#EC5B2B]" />
                          </Show>
                        </div>
                        <Show when={notification.message}>
                          <span class="text-xs text-[var(--v2-text-text-muted)]">{notification.message}</span>
                        </Show>
                        <span class="text-[11px] text-[var(--v2-text-text-faint)]">
                          {formatTime(notification.timestamp)}
                        </span>
                      </div>
                    </button>
                  )
                }}
              </For>
            </div>

            <Show when={notifications().length > 0}>
              <div class="flex items-center justify-between border-t border-[var(--v2-border-border-muted)] px-4 py-2">
                <button
                  class="text-xs text-[var(--v2-text-text-muted)] transition-colors hover:text-[#EC5B2B]"
                  onClick={markAllRead}
                >
                  Mark all read
                </button>
                <button
                  class="text-xs text-[var(--v2-text-text-muted)] transition-colors hover:text-[var(--v2-state-fg-danger)]"
                  onClick={clearAll}
                >
                  Clear all
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </>
  )
}
