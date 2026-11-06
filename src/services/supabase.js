import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

function initializeClient() {
  if (!url && !publicKey) return { client: null, status: 'unconfigured' }
  if (!url || !publicKey) return { client: null, status: 'invalid' }

  try {
    return { client: createClient(url, publicKey), status: 'configured' }
  } catch {
    return { client: null, status: 'invalid' }
  }
}

export const { client: supabase, status: supabaseStatus } = initializeClient()
