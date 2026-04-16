/* global window, fetch, supabase */
(function () {
  'use strict'

  const state = {
    client: null,
    configPromise: null,
  }

  async function loadConfig() {
    const res = await fetch('/api/config')
    if (!res.ok) throw new Error('Falha ao carregar configuracao do servidor')
    const payload = await res.json()
    if (!payload || !payload.ok || !payload.data) {
      throw new Error((payload && payload.error) || 'Configuracao invalida')
    }
    return payload.data
  }

  async function getClient() {
    if (state.client) return state.client
    if (!state.configPromise) {
      state.configPromise = loadConfig()
    }
    const { supabaseUrl, supabasePublishableKey } = await state.configPromise
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('SDK do Supabase nao carregou. Verifique a conexao.')
    }
    state.client = window.supabase.createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'form-novos-produtos.auth',
      },
    })
    return state.client
  }

  window.SupabaseClient = { getClient }
})()
