'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type UiContextType = {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean) => void
  toggleSidebar: () => void
  authModalOpen: boolean
  authModalTab: 'login' | 'register'
  openAuthModal: (tab?: 'login' | 'register') => void
  closeAuthModal: () => void
}

// ─── Context ─────────────────────────────────────────────────────────────────

const UiContext = createContext<UiContextType | null>(null)

// ─── Provider ────────────────────────────────────────────────────────────────

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalTab, setAuthModalTab] = useState<'login' | 'register'>('login')

  // Collapse sidebar by default on small screens
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setTimeout(() => setSidebarCollapsed(true), 0)
    }
  }, [])

  const toggleSidebar = useCallback(
    () => setSidebarCollapsed((prev) => !prev),
    [],
  )

  const openAuthModal = useCallback((tab: 'login' | 'register' = 'login') => {
    setAuthModalTab(tab)
    setAuthModalOpen(true)
  }, [])

  const closeAuthModal = useCallback(() => setAuthModalOpen(false), [])

  return (
    <UiContext.Provider
      value={{
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
        authModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
    </UiContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useUiContext(): UiContextType {
  const ctx = useContext(UiContext)
  if (!ctx) throw new Error('useUiContext must be used within UiProvider')
  return ctx
}
