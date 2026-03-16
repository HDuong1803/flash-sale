import { create } from 'zustand'
import type { UiState } from '@/types'

export const useUiStore = create<UiState>()((set) => ({
  authModalOpen: false,
  authModalTab: 'login',
  sidebarCollapsed: false,

  openAuthModal: (tab = 'login') => set({ authModalOpen: true, authModalTab: tab }),
  closeAuthModal: () => set({ authModalOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}))
