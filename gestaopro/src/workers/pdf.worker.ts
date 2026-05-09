"cm">// Worker: Geração de PDF com Puppeteer → upload S3
import { Worker, Job } from 'bullmq'
import puppeteer from 'puppeteer'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { redis } from './queues'
import { db } from '../server/db'

const s3 = new S3Client({ region: process.env.AWS_REGION! })

interface PdfJob {
  idRelatorio: string
  idEmpresa:   string
  nomeEmpresa: string
}

export const pdfWorker = new Worker<PdfJob>(
  'pdf-generation',
  async (job: Job<PdfJob>) => {
    const { idRelatorio, idEmpresa, nomeEmpresa } = job.data

    "cm">// 1. Busca dados do relatório
    const relatorio = await db.relatorio.findUniqueOrThrow({
      where: { id: idRelatorio },
      include: {
        parcelas: {
          include: {
            parcela: {
              include: { lancamento: { include: { contato: true } } },
            },
          },
        },
      },
    })

    "cm">// 2. Gera HTML do relatório
    const html = gerarHtmlRelatorio(relatorio, nomeEmpresa)

    "cm">// 3. Renderiza PDF com Puppeteer
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
    const page    = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } })
    await browser.close()

    "cm">// 4. Nomenclatura padronizada: EmpresaNome_relatorio_ID.pdf
    const nomeArquivo = `${nomeEmpresa.replace(/\s+/g, '_')}_relatorio_${idRelatorio}.pdf`
    const s3Key = `relatorios/${idEmpresa}/${nomeArquivo}`

    "cm">// 5. Upload para S3
    await s3.send(new PutObjectCommand({
      Bucket:      process.env.AWS_S3_BUCKET!,
      Key:         s3Key,
      Body:        pdfBuffer,
      ContentType: 'application/pdf',
    }))

    const arquivoUrl = `https:"cm">//${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`

    "cm">// 6. Salva URL no banco e muda status para GERADO
    await db.relatorio.update({
      where: { id: idRelatorio },
      data:  { status: 'GERADO', arquivoUrl },
    })

    console.log(`✅ PDF gerado: ${nomeArquivo}`)
  },
  { connection: redis }
)

function gerarHtmlRelatorio(relatorio: any, nomeEmpresa: string): string {
  const parcelas = relatorio.parcelas.map((rp: any) => rp.parcela)
  const total = parcelas.reduce((s: number, p: any) => s + Number(p.valor), 0)

  return `<!DOCTYPE html><html><head><style>
    body{font-family:Arial,sans-serif;font-size:12px;padding:20px}
    h1{font-size:18px;margin-bottom:4px} h2{font-size:13px;color:#666;font-weight:normal}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th{background:#f0f0f0;padding:8px;text-align:left;border-bottom:2px solid #ddd}
    td{padding:8px;border-bottom:1px solid #eee}
    .total{font-weight:bold;font-size:14px;text-align:right;margin-top:12px}
  </style></head><body>
    <h1>${nomeEmpresa}</h1>
    <h2>${relatorio.titulo} · ${relatorio.periodoInicio.toLocaleDateString('pt-BR')} a ${relatorio.periodoFim.toLocaleDateString('pt-BR')}</h2>
    <table>
      <thead><tr><th>Vencimento</th><th>Descrição</th><th>Contato</th><th>Status</th><th>Valor</th></tr></thead>
      <tbody>${parcelas.map((p: any) => `
        <tr>
          <td>${p.dataVencimento.toLocaleDateString('pt-BR')}</td>
          <td>${p.lancamento.descricao}</td>
          <td>${p.lancamento.contato?.nome ?? '—'}</td>
          <td>${p.status}</td>
          <td>R$ ${Number(p.valor).toFixed(2)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="total">Total: R$ ${total.toFixed(2)}</div>
  </body></html>`
}