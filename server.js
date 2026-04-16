'use strict'

require('dotenv').config()

const path = require('path')
const express = require('express')

const formDataRoute = require('./src/routes/formData')
const submitRoute = require('./src/routes/submit')
const { getPublicConfig } = require('./src/supabaseAuth')

const app = express()
const PORT = Number(process.env.PORT) || 3000

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/api/config', (_req, res) => {
  try {
    const cfg = getPublicConfig()
    res.json({ ok: true, data: cfg })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Supabase nao configurado' })
  }
})

app.use('/api/form-data', formDataRoute)
app.use('/api/submit', submitRoute)

app.use(express.static(path.join(__dirname, 'public')))

app.use((err, _req, res, _next) => {
  // Fallback para erros inesperados (ex.: JSON invalido no express.json).
  res.status(500).json({ ok: false, error: err.message || 'Erro interno' })
})

app.listen(PORT, () => {
  console.log(`[formulario-produto] servindo em http://localhost:${PORT}`)
})
