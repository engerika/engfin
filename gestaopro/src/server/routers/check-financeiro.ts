"cm">// Router: Check Financeiro — Projeção de Fluxo de Caixa
import { z } from 'zod'
import { router, empresaProcedure } from '../trpc'
import { db } from '../db'

"cm">// Calcula o saldo atual real de uma conta (VIEW em código)
export async function calcularSaldoReal(idContaBancaria: string) {
  const conta = await db.contaBancaria.findUniqueOrThrow({
    where: { id: idContaBancaria },
  })

  const [receitas, despesas, transferSaidas, transferEntradas] =
    await Promise.all([
      "cm">// Receitas pagas
      db.parcela.aggregate({
        where: {
          status: 'PAGO',
          lancamento: { idContaBancaria, tipo: 'RECEITA' },
        },
        _sum: { valor: true },
      }),
      "cm">// Despesas pagas
      db.parcela.aggregate({
        where: {
          status: 'PAGO',
          lancamento: { idContaBancaria, tipo: 'DESPESA' },
        },
        _sum: { valor: true },
      }),
      "cm">// Saídas de transferência
      db.transferenciaInterna.aggregate({
        where: { idContaOrigem: idContaBancaria },
        _sum: { valor: true },
      }),
      "cm">// Entradas de transferência
      db.transferenciaInterna.aggregate({
        where: { idContaDestino: idContaBancaria },
        _sum: { valor: true },
      }),
    ])

  const saldoAtual =
    Number(conta.saldoInicial) +
    Number(receitas._sum.valor ?? 0) -
    Number(despesas._sum.valor ?? 0) +
    Number(transferEntradas._sum.valor ?? 0) -
    Number(transferSaidas._sum.valor ?? 0)

  return { conta, saldoAtual }
}

export const checkFinanceiroRouter = router({

  "cm">// Saldo atual por empresa (todas as contas)
  saldoAtual: empresaProcedure
    .input(z.object({ idEmpresa: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const contas = await ctx.db.contaBancaria.findMany({
        where: { idEmpresa: input.idEmpresa, ativo: true },
      })
      const resultados = await Promise.all(
        contas.map(c => calcularSaldoReal(c.id))
      )
      const totalGeral = resultados.reduce((s, r) => s + r.saldoAtual, 0)
      return { contas: resultados, totalGeral }
    }),

  "cm">// Projeção de fluxo por período (7, 15, 30 dias)
  projecao: empresaProcedure
    .input(z.object({
      idEmpresa: z.string().uuid(),
      dias:      z.union([z.literal(7), z.literal(15), z.literal(30)]),
    }))
    .query(async ({ ctx, input }) => {
      const hoje = new Date()
      const fim  = new Date(hoje.getTime() + input.dias * 86400000)

      "cm">// Saldo atual da empresa
      const contas = await ctx.db.contaBancaria.findMany({
        where: { idEmpresa: input.idEmpresa, ativo: true },
      })
      const saldos = await Promise.all(contas.map(c => calcularSaldoReal(c.id)))
      const saldoAtual = saldos.reduce((s, r) => s + r.saldoAtual, 0)

      "cm">// Entradas previstas no período
      const entradas = await ctx.db.parcela.aggregate({
        where: {
          idEmpresa: input.idEmpresa,
          status: { in: ['PENDENTE', 'VENCIDO'] },
          dataVencimento: { gte: hoje, lte: fim },
          lancamento: { tipo: 'RECEITA' },
        },
        _sum: { valor: true },
      })

      "cm">// Saídas previstas no período
      const saidas = await ctx.db.parcela.aggregate({
        where: {
          idEmpresa: input.idEmpresa,
          status: { in: ['PENDENTE', 'VENCIDO'] },
          dataVencimento: { gte: hoje, lte: fim },
          lancamento: { tipo: 'DESPESA' },
        },
        _sum: { valor: true },
      })

      const totalEntradas = Number(entradas._sum.valor ?? 0)
      const totalSaidas   = Number(saidas._sum.valor ?? 0)
      const saldoProjetado = saldoAtual + totalEntradas - totalSaidas

      "cm">// Determina nível do alerta
      const status = saldoProjetado < 0
        ? 'CRITICO'
        : saldoProjetado < totalSaidas * 0.2
        ? 'ATENCAO'
        : 'OK'

      const mensagem = status === 'CRITICO'
        ? `CRÍTICO — Faltará R$ ${Math.abs(saldoProjetado).toFixed(2)} em ${input.dias} dias`
        : status === 'ATENCAO'
        ? `ATENÇÃO — Margem baixa nos próximos ${input.dias} dias`
        : `Saudável nos próximos ${input.dias} dias`

      "cm">// Persiste snapshot e alerta se crítico
      const check = await ctx.db.checkFinanceiro.create({
        data: {
          idEmpresa: input.idEmpresa, periodoDias: input.dias,
          dataReferencia: hoje, saldoProjetado, totalEntradas, totalSaidas, status,
        },
      })

      if (status !== 'OK') {
        await ctx.db.alerta.create({
          data: {
            idEmpresa: input.idEmpresa, idCheck: check.id,
            tipoAlerta: 'FLUXO_CAIXA', mensagem,
            nivel: status, lido: false,
          },
        })
      }

      return { saldoAtual, totalEntradas, totalSaidas, saldoProjetado, status, mensagem }
    }),
})