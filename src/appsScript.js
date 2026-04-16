'use strict'

const fetch = require('node-fetch')

const DEFAULT_TIMEOUT_MS = 30000

function getWebAppUrl() {
  const url = process.env.APPS_SCRIPT_WEB_APP_URL
  if (!url) {
    throw new Error('APPS_SCRIPT_WEB_APP_URL nao configurado no .env')
  }
  return url
}

function getToken() {
  return process.env.APPS_SCRIPT_TOKEN || ''
}

function buildUrl(action, query) {
  const url = new URL(getWebAppUrl())
  url.searchParams.set('action', action)

  const token = getToken()
  if (token) {
    url.searchParams.set('token', token)
  }

  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }

  return url
}

async function request(action, { method = 'GET', query, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = buildUrl(action, method === 'GET' ? query : undefined)
  const token = getToken()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetch(url.toString(), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:
        method === 'POST'
          ? JSON.stringify({
              ...(body || {}),
              ...(token ? { token } : {}),
            })
          : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err && err.name === 'AbortError') {
      throw new Error(`Apps Script nao respondeu em ${timeoutMs}ms`)
    }
    throw new Error(`Falha ao contatar Apps Script: ${err.message || err}`)
  }
  clearTimeout(timer)

  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('Resposta invalida do Apps Script (nao era JSON)')
  }

  if (!response.ok || !payload || payload.ok !== true) {
    const message = (payload && payload.error) || `Falha na comunicacao com o Apps Script (HTTP ${response.status})`
    throw new Error(message)
  }

  return payload.data
}

function callGet(action, params) {
  return request(action, { method: 'GET', query: params })
}

function callPost(action, body) {
  return request(action, { method: 'POST', body })
}

module.exports = { callGet, callPost }
