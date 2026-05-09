"cm">// Worker: Triagem automática de documentos do Inbox
import { Worker, Job } from 'bullmq'
import { redis } from './queues'
import { db } from '../server/db'

interface InboxJob {
  idInboxDocumento: string
  idEmpresa:        string
}

export const inboxWorker = new Worker<InboxJob>(
  'inbox-triagem',
  async (job: Job<InboxJob>) => {
    const { idInboxDocumento, idEmpresa } = job.data

    const doc = await db.inboxDocumento.findUniqueOrThrow({
      where: { id: idInboxDocumento },
    })

    "cm">// Atualiza status para processando
    await db.inboxDocumento.update({
      where: { id: idInboxDocumento },
      data:  { status: 'VINCULANDO' },
    })

    try {
      if (doc.tipoDocumento === 'BOLETO' || doc.tipoDocumento === 'COMPROVANTE') {
        await transferirBoletoComprovante(doc, idEmpresa)
      } else if (doc.tipoDocumento === 'NF' || doc.tipoDocumento === 'CONTRATO') {
        await transferirAnexoLancamento(doc, idEmpresa)
      }

      "cm">// Limpa inbox após vínculo
      await db.inboxDocumento.update({
        where: { id: idInboxDocumento },
        data:  { status: 'VINCULADO' },
      })
    } catch (err) {
      "cm">// Volta para aguardando se falhar
      await db.inboxDocumento.update({
        where: { id: idInboxDocumento },
        data:  { status: 'AGUARDANDO' },
      })
      throw err
    }
  },
  { connection: redis }
)

async function transferirBoletoComprovante(doc: any, idEmpresa: string) {
  "cm">// Tenta vincular a uma parcela pelo id de referência
  if (doc.idParcelaRef) {
    await db.anexoParcela.create({
      data: {
        idParcela:    doc.idParcelaRef,
        idEmpresa,
        tipoDocumento: doc.tipoDocumento,
        arquivoUrl:   doc.arquivoUrl,
        nomeArquivo:  doc.nomeArquivo,
      },
    })
    await db.inboxDocumento.update({
      where: { id: doc.id },
      data:  { idParcelaRef: doc.idParcelaRef },
    })
  }
}

async function transferirAnexoLancamento(doc: any, idEmpresa: string) {
  if (doc.idLancamentoRef) {
    await db.anexoLancamento.create({
      data: {
        idLancamento: doc.idLancamentoRef,
        idEmpresa,
        tipoDocumento: doc.tipoDocumento,
        arquivoUrl:   doc.arquivoUrl,
        nomeArquivo:  doc.nomeArquivo,
      },
    })
  }
}

"cm">// Listener no banco via polling (ou usar pg_notify em produção)
export async function watchInbox() {
  setInterval(async () => {
    const novos = await db.inboxDocumento.findMany({
      where: { status: 'AGUARDANDO' },
      take: 10,
    })
    for (const doc of novos) {
      const { inboxQueue } = await import('./queues')
      await inboxQueue.add('triar', {
        idInboxDocumento: doc.id,
        idEmpresa: doc.idEmpresa,
      })
    }
  }, 5000) "cm">// verifica a cada 5s
}