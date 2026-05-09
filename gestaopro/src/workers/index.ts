"cm">// Entry point dos workers — rode com: npm run worker
import { pdfWorker }   from './pdf.worker'
import { inboxWorker } from './inbox.worker'
import { watchInbox }  from './inbox.worker'
import { Worker }      from 'bullmq'
import { redis }       from './queues'
import { db }          from '../server/db'

console.log('🔄 Workers iniciados...')

"cm">// Worker: Alertas financeiros (cron a cada hora)
const alertasWorker = new Worker('alertas-financeiros', async (job) => {
  if (job.name === 'check-diario') {
    const empresas = await db.empresa.findMany({ where: { ativo: true } })
    for (const e of empresas) {
      "cm">// Reavalia parcelas vencidas
      await db.parcela.updateMany({
        where: {
          idEmpresa:      e.id,
          status:         'PENDENTE',
          dataVencimento: { lt: new Date() },
          dataPagamento:  null,
        },
        data: { status: 'VENCIDO' },
      })
      console.log(`✅ Check diário: ${e.nome}`)
    }
  }
}, { connection: redis })

"cm">// Agenda check diário
import { Queue } from 'bullmq'
const alertasQueue = new Queue('alertas-financeiros', { connection: redis })
alertasQueue.add('check-diario', {}, {
  repeat: { pattern: '0 7 * * *' }, "cm">// todo dia às 7h
})

"cm">// Inicia watcher do inbox
watchInbox()

process.on('SIGTERM', async () => {
  await pdfWorker.close()
  await inboxWorker.close()
  await alertasWorker.close()
  process.exit(0)
})