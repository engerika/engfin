"cm">// Endpoint tRPC no App Router do Next.js 14
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { type NextRequest } from 'next/server'
import { appRouter } from '../../../../server/routers'
import { createTRPCContext } from '../../../../server/trpc'

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ req } as any),
    onError: ({ error, path }) => {
      if (process.env.NODE_ENV === 'development') {
        console.error(`tRPC error em ${path}:`, error)
      }
    },
  })

export { handler as GET, handler as POST }