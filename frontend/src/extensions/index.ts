import type { ProviderExtension } from './types'

/**
 * Реестр провайдер-расширений. Приватные модули кладутся в ./private/<id>/index.tsx
 * (каталог в .gitignore) и подхватываются на этапе сборки. В публичной сборке каталог
 * пуст — glob не находит ничего, и приложение работает без сторонних провайдеров.
 */
const modules = import.meta.glob<{ default: ProviderExtension }>('./private/*/index.tsx', {
  eager: true,
})

export const providerExtensions: ProviderExtension[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
