import { supabase } from '@/api/supabase'
import { useAuthStore } from '@/store/auth'

// Toolbox settings shared by every tool, kept in the account's user_metadata so they follow
// the user across devices. Both default to off.
// auto_zero_tip_until: ISO time before which the auto-zero tip stays hidden.
type ToolSettingsPatch = { auto_zero?: boolean; auto_zero_tip_until?: string }

export function useToolSettings() {
  const meta = useAuthStore((s) => s.user?.user_metadata)
  return {
    loaded: meta !== undefined,
    autoZero: meta?.auto_zero === true,
    autoZeroTipUntil:
      typeof meta?.auto_zero_tip_until === 'string' ? meta.auto_zero_tip_until : null,
  }
}

/** Merges into user_metadata; the auth store picks up the change via USER_UPDATED. */
export async function saveToolSettings(patch: ToolSettingsPatch) {
  const { error } = await supabase.auth.updateUser({ data: patch })
  if (error) throw error
}

/** Start of next Monday, local time: "not this week" ends then. */
export function nextMonday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return d
}

/** Auto-zero: drop what the sensor sends while starting up, then average the next stretch. */
export const AUTO_ZERO = {
  settleS: 0.2,
  windowS: 0.5,
  // A larger reading at start means the circuit is already closed: don't zero against it.
  maxOffsetA: 0.005,
}
