"cm">// Cliente tRPC para uso nos componentes React
// Cliente tRPC para uso nos componentes React
import { createTRPCReact } from '@trpc/react-query'
import { type AppRouter } from '../server/routers'

export npm install @trpc/react-query install @trpc/react-query install @trpc/react-query install @trpc/react-query
import { createTRPCReact } from '@trpc/react-query'
import { type AppRouter } from '../server/routers'

export const trpc = createTRPCReact<AppRouter>()

// Em _app.tsx ou layout.tsx, envolva com:
// <trpc.Provider client={trpcClient} queryClient={queryClient}>
//   <QueryClientProvider client={queryClient}>
//     {children}
//   </QueryClientProvider>
// </trpc.Provider>