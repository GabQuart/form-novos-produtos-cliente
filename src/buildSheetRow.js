'use strict'

const STATUS_VALUE = 'PENDENTE'
const ORIGIN_VALUE = 'formulario_externo'
const TYPE_VALUE = 'novo_produto'

/**
 * Monta o array de 17 posicoes exatamente na mesma ordem usada pelo
 * sistema principal (src/lib/services/product-request.service.ts:374-394).
 *
 * record shape:
 *   {
 *     id: string,
 *     createdAt: string (ISO),
 *     cliente: string,
 *     productName: string,
 *     productCost: number,
 *     requesterName: string,
 *     requesterEmail: string,
 *     sizes: string[],
 *     sizeChart: string,              // ja serializado via serializeSizeChart
 *     variationType: 'cores'|'estampas'|'variados',
 *     variations: string[],
 *     imageCount: number,
 *     folderUrl: string,
 *     imageLinks: string[],           // URLs originais
 *     notes: string,
 *   }
 */
function buildSheetRow(record) {
  return [
    record.id,
    record.createdAt,
    record.cliente,
    record.productName,
    Number(record.productCost).toFixed(2),
    `${record.requesterName} | ${record.requesterEmail}`,
    (record.sizes || []).join(' | '),
    record.sizeChart || '',
    record.variationType,
    (record.variations || []).join(' | '),
    String(record.imageCount || 0),
    record.folderUrl || '',
    (record.imageLinks || []).join('\n'),
    STATUS_VALUE,
    ORIGIN_VALUE,
    record.notes || '',
    TYPE_VALUE,
  ]
}

module.exports = { buildSheetRow, STATUS_VALUE, ORIGIN_VALUE, TYPE_VALUE }
