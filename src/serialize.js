'use strict'

/**
 * Recebe entradas de medidas no formato { size: string, measurement: string }
 * e retorna uma string serializada no mesmo formato do sistema principal:
 *   "P: Busto 50 cm | Comprimento 60 cm\nM: Busto 52 cm"
 * Ignora medidas vazias. Mantem a ordem em que os tamanhos apareceram.
 */
function serializeSizeChart(entries) {
  if (!Array.isArray(entries)) return ''

  const order = []
  const bySize = new Map()

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const size = String(entry.size || '').trim()
    const measurement = String(entry.measurement || '').trim()
    if (!size || !measurement) continue

    if (!bySize.has(size)) {
      bySize.set(size, [])
      order.push(size)
    }
    bySize.get(size).push(measurement)
  }

  return order.map((size) => `${size}: ${bySize.get(size).join(' | ')}`).join('\n')
}

/**
 * Normaliza uma lista: converte em array de strings, faz trim, remove vazias
 * e duplicadas (preservando a primeira ocorrencia).
 */
function normalizeStringList(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const raw of list) {
    const value = String(raw == null ? '' : raw).trim()
    if (!value) continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

module.exports = { serializeSizeChart, normalizeStringList }
