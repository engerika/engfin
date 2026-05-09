"cm">// Definição das filas BullMQ
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

export const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
})

"cm">// Fila: geração de PDF
export const pdfQueue = new Queue('pdf-generation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
})

"cm">// Fila: triagem de documentos do inbox
export const inboxQueue = new Queue('inbox-triagem', {
  connection: redis,
  defaultJobOptions: { attempts: 3 },
})

"cm">// Fila: alertas e check financeiro (cron)
export const alertasQueue = new Queue('alertas-financeiros', {
  connection: redis,
})