"cm">// Root router — agrega todos os routers
import { router } from '../trpc'
import { lancamentosRouter }   from './lancamentos'
import { parcelasRouter }      from './parcelas'
import { checkFinanceiroRouter } from './check-financeiro'
import { inboxRouter }         from './inbox'
import { tarefasRouter }       from './tarefas'
import { contasRouter }        from './contas'
import { relatoriosRouter }    from './relatorios'
import { empresasRouter }      from './empresas'
import { contatosRouter }      from './contatos'

export const appRouter = router({
  lancamentos:    lancamentosRouter,
  parcelas:       parcelasRouter,
  checkFinanceiro: checkFinanceiroRouter,
  inbox:          inboxRouter,
  tarefas:        tarefasRouter,
  contas:         contasRouter,
  relatorios:     relatoriosRouter,
  empresas:       empresasRouter,
  contatos:       contatosRouter,
})

export type AppRouter = typeof appRouter