'use strict'

const express = require('express')
const multer = require('multer')
const crypto = require('crypto')

const { callPost } = require('../appsScript')
const { verifyAccessToken } = require('../supabaseAuth')
const { buildSheetRow } = require('../buildSheetRow')
const { serializeSizeChart, normalizeStringList } = require('../serialize')

const router = express.Router()

const MAX_FILES = 8
const MAX_FILE_SIZE = 8 * 1024 * 1024 // 8 MB
const VALID_VARIATION_TYPES = new Set(['cores', 'estampas', 'variados'])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Apenas arquivos de imagem sao permitidos.'))
    }
    cb(null, true)
  },
})

function compact(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim()
}

function parseJsonField(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed == null ? fallback : parsed
  } catch {
    throw new Error('Campo JSON invalido no formulario')
  }
}

function parseCost(raw) {
  const value = Number(String(raw == null ? '' : raw).replace(',', '.'))
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Informe um custo valido para o produto.')
  }
  return value
}

function validateSizeChart(sizes, entries) {
  const selected = normalizeStringList(sizes)
  const byCount = new Map()
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const size = compact(entry.size)
    const measurement = compact(entry.measurement)
    if (!size || !measurement) continue
    byCount.set(size, (byCount.get(size) || 0) + 1)
  }
  const missing = selected.filter((size) => !byCount.get(size))
  if (missing.length > 0) {
    throw new Error(`Preencha a tabela de medidas para: ${missing.join(', ')}.`)
  }
  return selected
}

function validateVariations(type, list) {
  const clean = normalizeStringList(list)
  if (clean.length === 0) {
    if (type === 'cores') throw new Error('Selecione ao menos uma cor.')
    if (type === 'variados') throw new Error('Informe ao menos uma variacao em Variados.')
    throw new Error('Informe ao menos uma variacao de estampa.')
  }
  return clean
}

function generateRequestId() {
  return `sol_produto_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
}

async function authMiddleware(req, res, next) {
  try {
    const header = String(req.headers.authorization || '')
    const match = header.match(/^Bearer\s+(.+)$/i)
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Faca login para enviar o formulario.' })
    }
    const user = await verifyAccessToken(match[1].trim())
    req.supabaseUser = user
    next()
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message || 'Sessao invalida' })
  }
}

function handleUpload(req, res, next) {
  const runner = upload.array('images', MAX_FILES)
  runner(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ ok: false, error: 'Cada imagem precisa ter no maximo 8 MB.' })
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ ok: false, error: 'Envie no maximo 8 imagens.' })
    }
    res.status(400).json({ ok: false, error: err.message || 'Falha no upload das imagens.' })
  })
}

router.post('/', authMiddleware, handleUpload, async (req, res) => {
  try {
    const cliente = compact(req.body.cliente)
    const solicitanteNome = compact(req.body.solicitanteNome)
    const productName = compact(req.body.productName)
    const notes = compact(req.body.notes)
    const variationType = compact(req.body.variationType).toLowerCase()
    const productCost = parseCost(req.body.productCost)

    if (!cliente) throw new Error('Informe a empresa / loja.')
    if (!solicitanteNome) throw new Error('Informe seu nome de contato.')
    if (!productName) throw new Error('Informe o nome do produto.')
    if (!VALID_VARIATION_TYPES.has(variationType)) {
      throw new Error('Selecione um tipo de variacao valido (cores, estampas ou variados).')
    }

    const sizesInput = parseJsonField(req.body.sizes, [])
    const sizeChartEntries = parseJsonField(req.body.sizeChartEntries, [])
    const variationsInput = parseJsonField(req.body.variations, [])

    const sizes = validateSizeChart(sizesInput, sizeChartEntries)
    if (sizes.length === 0) throw new Error('Selecione ao menos um tamanho.')

    const variations = validateVariations(variationType, variationsInput)

    const files = req.files || []
    if (files.length === 0) throw new Error('Adicione pelo menos uma imagem do produto.')

    const requestId = generateRequestId()

    // 1) Upload para o Drive via Apps Script
    const uploadPayload = {
      parentFolderId: process.env.GOOGLE_PRODUCT_REQUESTS_UPLOAD_FOLDER_ID,
      requestId,
      rootFolderName: process.env.GOOGLE_PRODUCT_REQUESTS_DRIVE_ROOT_NAME || 'solicitacoes_produto',
      files: files.map((f) => ({
        fileName: f.originalname,
        mimeType: f.mimetype,
        base64Content: f.buffer.toString('base64'),
      })),
    }
    if (!uploadPayload.parentFolderId) {
      throw new Error('GOOGLE_PRODUCT_REQUESTS_UPLOAD_FOLDER_ID nao configurado no .env')
    }

    const uploadResult = await callPost('uploadFilesToRequestFolder', uploadPayload)
    const folderUrl = (uploadResult && uploadResult.folderUrl) || ''
    const uploadedFiles = (uploadResult && uploadResult.files) || []
    const imageLinks = uploadedFiles.map((f) => f.originalUrl).filter(Boolean)

    // 2) Append da linha na planilha
    const sheetId = process.env.GOOGLE_PRODUCT_REQUESTS_SHEET_ID
    const sheetName = process.env.GOOGLE_PRODUCT_REQUESTS_SHEET_NAME || 'solicitacoes_produto'
    if (!sheetId) throw new Error('GOOGLE_PRODUCT_REQUESTS_SHEET_ID nao configurado no .env')

    const record = {
      id: requestId,
      createdAt: new Date().toISOString(),
      cliente,
      productName,
      productCost,
      requesterName: solicitanteNome,
      requesterEmail: req.supabaseUser.email || '',
      sizes,
      sizeChart: serializeSizeChart(sizeChartEntries),
      variationType,
      variations,
      imageCount: files.length,
      folderUrl,
      imageLinks,
      notes,
    }

    await callPost('appendSheetRow', {
      spreadsheetId: sheetId,
      sheetName,
      values: buildSheetRow(record),
    })

    res.json({
      ok: true,
      data: {
        requestId,
        folderUrl,
        imageCount: files.length,
      },
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Falha ao enviar solicitacao' })
  }
})

module.exports = router
