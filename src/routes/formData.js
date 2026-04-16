'use strict'

const express = require('express')
const { callGet } = require('../appsScript')

const router = express.Router()

const CACHE_TTL_MS = 5 * 60 * 1000
let cache = null // { expiresAt, payload }

const APPAREL_SIZE_ORDER = [
  'RN',
  'BB',
  'PPP',
  'PP',
  'P',
  'M',
  'G',
  'GG',
  'XG',
  'XGG',
  'XXG',
  'EXG',
  'EG',
  'G1',
  'G2',
  'G3',
  'G4',
  'UN',
  'U',
  'UNICO',
]

function compact(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim()
}

function normalizeCategory(value) {
  return compact(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeSizeToken(value) {
  return compact(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase()
}

function getSizeGroupId(size) {
  const category = normalizeCategory(size.category)
  const isNumericCode = /^\d+$/.test(size.code)
  if (isNumericCode || category.includes('juvenil') || category.includes('calc')) return 'sapato'
  if (category.includes('infantil')) return 'infantil'
  return 'adulto'
}

function getSizeGroupLabel(groupId) {
  if (groupId === 'sapato') return 'Calcado'
  if (groupId === 'infantil') return 'Infantil Bebe'
  return 'Adulto e Plus size'
}

function parseSizeNumber(value) {
  const match = normalizeSizeToken(value).match(/^(\d+)/)
  return match ? Number(match[1]) : Number.NaN
}

function getApparelSizeRank(value) {
  const normalized = normalizeSizeToken(value)
  const idx = APPAREL_SIZE_ORDER.indexOf(normalized)
  return idx >= 0 ? idx : Number.POSITIVE_INFINITY
}

function sortSizeOptions(items) {
  return [...items].sort((a, b) => {
    const aNum = Number(a.code)
    const bNum = Number(b.code)
    const bothPureNumeric = Number.isFinite(aNum) && Number.isFinite(bNum)
    if (bothPureNumeric) return aNum - bNum

    const aStart = parseSizeNumber(a.code || a.label)
    const bStart = parseSizeNumber(b.code || b.label)
    const bothStartNum = Number.isFinite(aStart) && Number.isFinite(bStart)
    if (bothStartNum) {
      if (aStart !== bStart) return aStart - bStart
      return a.label.localeCompare(b.label, 'pt-BR')
    }

    const aRank = getApparelSizeRank(a.code || a.label)
    const bRank = getApparelSizeRank(b.code || b.label)
    if (aRank !== bRank) return aRank - bRank
    return a.label.localeCompare(b.label, 'pt-BR')
  })
}

function buildPayload(colorRows, sizeRows) {
  const seenColors = new Set()
  const colors = []
  for (const row of colorRows) {
    const name = compact(row && row.cor_nome)
    if (!name || seenColors.has(name)) continue
    seenColors.add(name)
    colors.push(name)
  }
  colors.sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const sizeOptions = []
  for (const row of sizeRows) {
    const code = compact(row && row.tamanho_cod)
    const labelRaw = compact(row && row.tamanho_nome)
    const category = compact(row && row.categoria)
    const label = labelRaw || code
    if (!code || !label) continue
    sizeOptions.push({ code, label, category })
  }

  const grouped = new Map()
  for (const size of sizeOptions) {
    const groupId = getSizeGroupId(size)
    const bucket = grouped.get(groupId) || []
    bucket.push(size)
    grouped.set(groupId, bucket)
  }

  const sizeGroups = ['adulto', 'infantil', 'sapato']
    .map((groupId) => ({
      id: groupId,
      label: getSizeGroupLabel(groupId),
      items: sortSizeOptions(grouped.get(groupId) || []),
    }))
    .filter((group) => group.items.length > 0)

  return { colors, sizeGroups }
}

async function loadFormData() {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.payload
  }

  const spreadsheetId = process.env.GOOGLE_SOURCE_SHEET_ID
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SOURCE_SHEET_ID nao configurado no .env')
  }

  const data = await callGet('readMultipleSheetTabs', {
    spreadsheetId,
    sheetNames: 'DIC_CORES,DIC_TAMANHOS',
  })

  const colorRows = (data && data.DIC_CORES) || []
  const sizeRows = (data && data.DIC_TAMANHOS) || []

  const payload = buildPayload(colorRows, sizeRows)

  cache = { payload, expiresAt: Date.now() + CACHE_TTL_MS }
  return payload
}

router.get('/', async (_req, res) => {
  try {
    const payload = await loadFormData()
    res.json({ ok: true, data: payload })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao carregar dados do formulario' })
  }
})

module.exports = router
