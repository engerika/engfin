"cm">// Router: Parcelas — incluindo "Informar Pagamento"
import { z } from 'zod'
import { router, empresaProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

export const parcelasRouter = router({

  "cm">// Listar parcelas com filtros
  list: empresaProcedure
    .input(z.object({
      idEmpresa: z.string().uuid(),
      status:    z.enum(['PENDENTE', 'PAGO', 'VENCIDO', 'TODOS']).default('TODOS'),
      dias:      z.number().optional(), "cm">// 7 | 15 | 30
    }))
    .query(async ({ ctx, input }) => {
      const hoje = new Date()
      const limite = input.dias
        ? new Date(hoje.getTime() + input.dias * 86400000)
        : undefined

      return ctx.db.parcela.findMany({
        where: {
          idEmpresa: input.idEmpresa,
          ...(input.status !== 'TODOS' && { status: input.status }),
          ...(limite && { dataVencimento: { lte: limite } }),
        },
        include: {
          lancamento: {
            select: { descricao: true, tipo: true, contato: { select: { nome: true } } },
          },
        },
        orderBy: { dataVencimento: 'asc' },
      })
    }),

  "cm">// ✅ Informar Pagamento — Ação Composta
  informarPagamento: empresaProcedure
    .input(z.object({
      idEmpresa:    z.string().uuid(),
      idParcela:    z.string().uuid(),
      dataPagamento: z.string(), "cm">// ISO date
      juros:         z.number().optional(),
      desconto:      z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const parcela = await ctx.db.parcela.findFirst({
        where: { id: input.idParcela, idEmpresa: input.idEmpresa },
      })
      if (!parcela) throw new TRPCError({ code: 'NOT_FOUND' })
      if (parcela.status === 'PAGO')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Parcela já paga' })

      "cm">// Ação composta: registra pagamento + muda status em uma transação
      const atualizada = await ctx.db.$transaction(async (tx) => {
        const p = await tx.parcela.update({
          where: { id: input.idParcela },
          data: {
            dataPagamento: new Date(input.dataPagamento),
            status:        'PAGO',
            juros:         input.juros,
            desconto:      input.desconto,
          },
        })
        await tx.logAuditoria.create({
          data: {
            idEmpresa:      input.idEmpresa,
            idUsuario:      ctx.session.user.id,
            tabela:         'parcelas',
            operacao:       'UPDATE',
            dadosAnteriores: parcela as any,
            dadosNovos:      p as any,
          },
        })
        return p
      })

      return atualizada
    }),

  "cm">// Reavalia status de parcelas vencidas (chamado pelo cron)
  reavaliarVencidas: empresaProcedure
    .input(z.object({ idEmpresa: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const hoje = new Date()
      const { count } = await ctx.db.parcela.updateMany({
        where: {
          idEmpresa:    input.idEmpresa,
          status:       'PENDENTE',
          dataVencimento: { lt: hoje },
          dataPagamento:  null,
        },
        data: { status: 'VENCIDO' },
      })
      return { atualizadas: count }
    }),
})