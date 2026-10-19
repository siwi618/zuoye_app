import { create } from 'zustand'

// Drives the red "content taken down / rejected" warning dialog.
interface ModerationAlertState {
  open: boolean
  show: () => void
  hide: () => void
}

export const useModerationAlert = create<ModerationAlertState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))
