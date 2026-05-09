"cm">// Router: Lançamentos + geração automática de parcelas
import { z } from 'zod'
import { router, empresaProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { addMonths } from 'date-fns'
import { inboxQueue } from '../../workers/queues'

const lancamentoSchema = z.object({
  idEmpresa:       z.string().uuid(),
  idContaBancaria: z.string().uuid(),
  idContato:       z.string().uuid().optional(),
  idPlanoConta:    z.string().uuid(),
  idFormaPgto:     z.string().uuid().optional(),
  tipo:            z.enum(['RECEITA', 'DESPESA']),
  descricao:       z.string().min(1),
  valorTotal:      z.number().positive(),
  numParcelas:     z.number().min(1).max(360),
  dataLancamento:  z.string(), "cm">// ISO date
  observacao:      z.string().optional(),
})

export const lancamentosRouter = router({

  "cm">// Listar lançamentos da empresa
  list: empresaProcedure
    .input(z.object({
      idEmpresa: z.string().uuid(),
      tipo:      z.enum(['RECEITA', 'DESPESA', 'TODOS']).default('TODOS'),
      pagina:    z.number().default(1),
      limite:    z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const where = {
        idEmpresa: input.idEmpresa,
        ...(input.tipo !== 'TODOS' && { tipo: input.tipo }),
      }
      const [total, items] = await Promise.all([
        ctx.db.lancamento.count({ where }),
        ctx.db.lancamento.findMany({
          where,
          include: {
            contato:    { select: { nome: true } },
            parcelas:   { select: { status: true, valor: true } },
            planoConta: { select: { descricao: true } },
          },
          orderBy: { dataLancamento: 'desc' },
          skip:  (input.pagina - 1) * input.limite,
          take:  input.limite,
        }),
      ])
      return { total, items }
    }),

  "cm">// Criar lançamento + parcelas automaticamente
  create: empresaProcedure
    .input(lancamentoSchema)
    .mutation(async ({ ctx, input }) => {
      const dataBase = new Date(input.dataLancamento)
      const valorParcela = parseFloat(
        (input.valorTotal / input.numParcelas).toFixed(2)
      )
      "cm">// Ajusta diferença de centavos na última parcela
      const diferenca = parseFloat(
        (input.valorTotal - valorParcela * input.numParcelas).toFixed(2)
      )

      const lancamento = await ctx.db.lancamento.create({
        data: {
          ...input,
          valorTotal:     input.valorTotal,
          dataLancamento: dataBase,
          parcelas: {
            create: Array.from({ length: input.numParcelas }, (_, i) => ({
              idEmpresa:      input.idEmpresa,
              numeroParcela:  i + 1,
              valor:          i === input.numParcelas - 1
                                ? valorParcela + diferenca
                                : valorParcela,
              dataVencimento: addMonths(dataBase, i),
              status:         'PENDENTE',
            })),
          },
        },
        include: { parcelas: true },
      })

      "cm">// Log de auditoria
      await ctx.db.logAuditoria.create({
        data: {
          idEmpresa: input.idEmpresa,
          idUsuario: ctx.session.user.id,
          tabela:    'lancamentos',
          operacao:  'INSERT',
          dadosNovos: lancamento as any,
        },
      })

      return lancamento
    }),

  "cm">// Buscar por ID
  byId: empresaProcedure
    .input(z.object({ idEmpresa: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const lancamento = await ctx.db.lancamento.findFirst({
        where: { id: input.id, idEmpresa: input.idEmpresa },
        include: {
          parcelas:     { orderBy: { numeroParcela: 'asc' } },
          anexos:       true,
          contato:      true,
          planoConta:   true,
          centroCustos: { include: { centroCusto: true } },
          tags:         { include: { tag: true } },
        },
      })
      if (!lancamento)
        throw new TRPCError({ code: 'NOT_FOUND' })
      return lancamento
    }),
})