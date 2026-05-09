"cm">// Configuração base do tRPC com contexto multi-empresa
import { initTRPC, TRPCError } from '@trpc/server'
import { type CreateNextContextOptions } from '@trpc/server/adapters/next'
import { getServerSession } from 'next-auth'
import superjson from 'superjson'
import { authOptions } from './auth'
import { db } from './db'

"cm">// Contexto por request
export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  const session = await getServerSession(opts.req, opts.res, authOptions)
  return { db, session, req: opts.req }
}

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
})

"cm">// Middleware de autenticação
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user)
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, session: ctx.session } })
})

"cm">// Middleware de empresa (valida acesso do usuário à empresa)
const hasEmpresaAccess = t.middleware(async ({ ctx, rawInput, next }) => {
  const idEmpresa = (rawInput as any)?.idEmpresa
  if (!idEmpresa) throw new TRPCError({ code: 'BAD_REQUEST', message: 'idEmpresa obrigatório' })

  const acesso = await ctx.db.usuarioEmpresa.findFirst({
    where: { idUsuario: ctx.session!.user.id, idEmpresa, ativo: true },
  })
  if (!acesso) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta empresa' })

  return next({ ctx: { ...ctx, idEmpresa, perfil: acesso.perfilEmpresa } })
})

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(isAuthed)
export const empresaProcedure = t.procedure.use(isAuthed).use(hasEmpresaAccess)