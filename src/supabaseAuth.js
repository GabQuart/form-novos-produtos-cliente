'use strict'

const fetch = require('node-fetch')

function getConfig() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY precisam estar no .env')
  }
  return { url: url.replace(/\/+$/, ''), key }
}

/**
 * Valida o access_token consultando o endpoint /auth/v1/user do Supabase.
 * Retorna { id, email } quando o token e valido.
 * Lanca Error quando o token e invalido, expirado ou a rede falhou.
 */
async function verifyAccessToken(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('Token ausente')
  }

  const { url, key } = getConfig()

  const response = await fetch(`${url}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (response.status === 401) {
    throw new Error('Sessao invalida ou expirada')
  }

  if (!response.ok) {
    throw new Error(`Falha ao verificar sessao Supabase (HTTP ${response.status})`)
  }

  const data = await response.json()
  if (!data || !data.id) {
    throw new Error('Resposta do Supabase sem usuario')
  }

  return {
    id: data.id,
    email: data.email || '',
  }
}

function getPublicConfig() {
  const { url, key } = getConfig()
  return { supabaseUrl: url, supabasePublishableKey: key }
}

module.exports = { verifyAccessToken, getPublicConfig }
