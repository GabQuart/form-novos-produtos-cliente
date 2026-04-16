/* global window, document, SupabaseClient */
(function () {
  'use strict'

  const listeners = new Set()
  let currentSession = null
  let clientPromise = null

  function emit() {
    listeners.forEach((fn) => {
      try {
        fn(currentSession)
      } catch (err) {
        console.error(err)
      }
    })
  }

  async function getClient() {
    if (!clientPromise) {
      clientPromise = SupabaseClient.getClient()
    }
    return clientPromise
  }

  async function init() {
    const client = await getClient()
    const { data } = await client.auth.getSession()
    currentSession = data && data.session ? data.session : null
    client.auth.onAuthStateChange((_event, session) => {
      currentSession = session
      emit()
    })
    return currentSession
  }

  async function signIn(email, password) {
    const client = await getClient()
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error) {
      throw new Error(mapAuthError(error.message))
    }
    currentSession = data.session
    emit()
    return currentSession
  }

  async function signOut() {
    const client = await getClient()
    await client.auth.signOut()
    currentSession = null
    emit()
  }

  function onChange(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  function getSession() {
    return currentSession
  }

  function mapAuthError(message) {
    const text = String(message || '').toLowerCase()
    if (text.includes('invalid login credentials')) return 'E-mail ou senha invalidos.'
    if (text.includes('email not confirmed')) return 'Seu e-mail ainda nao foi confirmado.'
    return message || 'Falha no login'
  }

  window.Auth = { init, signIn, signOut, onChange, getSession }
})()
