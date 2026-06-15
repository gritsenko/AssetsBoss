import type { ComponentType } from 'react'
import type { Source } from '../api/types'

/** Сервисы хоста, доступные секции расширения в модалке настроек. */
export interface ExtensionContext {
  sources: Source[] | undefined
  removeSource: (id: number) => void
  renameSource: (id: number, name: string) => Promise<string | null>
  showToast: (message: string) => void
}

/**
 * Дескриптор провайдер-расширения фронтенда. Каждое расширение — это модуль
 * <c>extensions/private/&lt;id&gt;/index.tsx</c> с default-экспортом этого типа.
 * Каталог private/ в .gitignore: в публичной сборке расширений нет.
 */
export interface ProviderExtension {
  id: string
  /** Секция настроек этого провайдера (управление его источниками). */
  SettingsSection: ComponentType<{ ctx: ExtensionContext }>
}
