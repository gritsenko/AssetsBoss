import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/instrument-sans/wght.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import App from './App.tsx'
import { ToastProvider } from './components/Toast'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)

// Убираем загрузочный сплеш из index.html, как только React отрисовал оболочку.
// Двойной requestAnimationFrame гарантирует, что первый кадр уже на экране, —
// иначе между исчезновением сплеша и появлением UI мелькнул бы пустой фон.
function hideBootSplash() {
  const el = document.getElementById('boot-splash')
  if (!el) return
  el.classList.add('boot-hide')
  el.addEventListener('transitionend', () => el.remove(), { once: true })
  // запасной таймер на случай, если transitionend не сработает (reduced-motion и т.п.)
  setTimeout(() => el.remove(), 600)
}
requestAnimationFrame(() => requestAnimationFrame(hideBootSplash))
