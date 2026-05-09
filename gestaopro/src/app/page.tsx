"cm">// Página de Lançamentos — Server Component + Client Query
'use client'
import { useState } from 'react'
import { trpc } from '../../../lib/trpc'
import { useSession } from 'next-auth/react'

export default function LancamentosPage() {
  const { data: session } = useSession()
  const [idEmpresa] = useState(session?.user?.idEmpresaAtual ?? '')
  const [tipo, setTipo] = useState<'RECEITA' | 'DESPESA' | 'TODOS'>('TODOS')
  const [pagina, setPagina] = useState(1)

  const { data, isLoading } = trpc.lancamentos.list.useQuery(
    { idEmpresa, tipo, pagina },
    { enabled: !!idEmpresa }
  )

  const utils = trpc.useUtils()
  const criar  = trpc.lancamentos.create.useMutation({
    onSuccess: () => utils.lancamentos.list.invalidate(),
  })

  if (isLoading) return <div className="p-6">Carregando...</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Lançamentos</h1>
        <select value={tipo} onChange={e => setTipo(e.target.value as any)}
          className="border rounded px-3 py-1.5 text-sm">
          <option value="TODOS">Todos</option>
          <option value="RECEITA">Receitas</option>
          <option value="DESPESA">Despesas</option>
        </select>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3 font-medium">Descrição</th>
              <th className="text-left p-3 font-medium">Contato</th>
              <th className="text-left p-3 font-medium">Parcelas</th>
              <th className="text-right p-3 font-medium">Valor</th>
              <th className="text-left p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map(l => (
              <tr key={l.id} className="border-t hover:bg-gray-50 cursor-pointer">
                <td className="p-3">{l.descricao}</td>
                <td className="p-3 text-gray-500">{l.contato?.nome ?? '—'}</td>
                <td className="p-3 text-gray-500">
                  {l.parcelas.filter(p => p.status === 'PAGO').length}/{l.parcelas.length}
                </td>
                <td className={`p-3 text-right font-medium ${l.tipo === 'RECEITA' ? 'text-green-600' : 'text-red-600'}`}>
                  {l.tipo === 'RECEITA' ? '+' : '-'}R$ {Number(l.valorTotal).toFixed(2)}
                </td>
                <td className="p-3">
                  <StatusBadge parcelas={l.parcelas} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4 text-sm text-gray-500">
        <span>Total: {data?.total} lançamentos</span>
        <div className="flex gap-2">
          <button onClick={() => setPagina(p => Math.max(1, p-1))}
            disabled={pagina === 1} className="px-3 py-1 border rounded disabled:opacity-40">
            ← Anterior
          </button>
          <span className="px-3 py-1">Página {pagina}</span>
          <button onClick={() => setPagina(p => p+1)}
            disabled={!data || data.total <= pagina * 20}
            className="px-3 py-1 border rounded disabled:opacity-40">
            Próxima →
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ parcelas }: { parcelas: { status: string }[] }) {
  const pagas = parcelas.filter(p => p.status === 'PAGO').length
  const total = parcelas.length
  const temVencida = parcelas.some(p => p.status === 'VENCIDO')

  if (pagas === total) return <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs">Pago</span>
  if (temVencida)      return <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">Vencido</span>
  if (pagas > 0)       return <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs">Parcial</span>
  return <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">Pendente</span>
}