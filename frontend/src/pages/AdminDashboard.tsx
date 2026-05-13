import { useState, useEffect } from 'react';
import { 
  Users, 
  DollarSign, 
  FileText, 
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getAdminDashboard, getAdminOverdueEnrollments, type OverdueEnrollmentSummary } from '../services/api';
import AdminShell from '../components/AdminShell';

interface BatchStats {
  id: number;
  name: string;
  product_name: string;
  max_enrollments: number | null;
  current_enrollments: number;
  pending: number;
  paid: number;
  status: string;
}

interface DashboardStats {
  enrollments: {
    total: number;
    pending: number;
    confirmed: number;
    recent: number;
  };
  payments: {
    total: number;
    confirmed: number;
    pending: number;
    recent: number;
  };
  revenue: {
    total: number;
    pending: number;
    overdue: number;
    fees: number;
    net: number;
  };
  members: {
    yes: number;
    no: number;
    unknown: number;
  };
  payment_methods: Array<{
    payment_method: string;
    count: number;
  }>;
  batches: BatchStats[];
}

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type OverdueSummaryResponse = {
  count: number;
  total_overdue_payments: number;
  total_overdue_amount: string;
  results: OverdueEnrollmentSummary[];
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [overdueSummary, setOverdueSummary] = useState<OverdueSummaryResponse>({
    count: 0,
    total_overdue_payments: 0,
    total_overdue_amount: '0.00',
    results: [],
  });
  const [loading, setLoading] = useState(true);
  const [showOverduePayments, setShowOverduePayments] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const overdueEnrollments = overdueSummary.results;
  const overduePaymentsCount = overdueSummary.total_overdue_payments;
  const overdueTotalAmount = Number(overdueSummary.total_overdue_amount || 0);

  const loadData = async () => {
    try {
      const [statsRes, overdueRes] = await Promise.all([
        getAdminDashboard(),
        getAdminOverdueEnrollments()
      ]);
      setStats(statsRes.data);
      setOverdueSummary(overdueRes.data);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminShell>
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'rgb(165, 44, 240)' }}></div>
            <p className="mt-4 text-gray-600">Carregando...</p>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="min-h-screen">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Painel Admin</h1>
          <p className="mt-1 text-sm text-gray-600">Resumo executivo de inscrições, receita, atrasos e lotes.</p>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-6 sm:mb-8">
            {/* Total Inscrições */}
            <div className="bg-white rounded-xl shadow-lg p-3 sm:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className="p-2 sm:p-3 rounded-full" style={{ backgroundColor: 'rgba(165, 44, 240, 0.1)' }}>
                  <Users className="w-4 h-4 sm:w-6 sm:h-6" style={{ color: 'rgb(165, 44, 240)' }} />
                </div>
                <span className="text-xs sm:text-sm text-gray-500 hidden sm:block">+{stats.enrollments.recent} esta semana</span>
              </div>
              <h3 className="text-lg sm:text-2xl font-bold mb-1">{stats.enrollments.total}</h3>
              <p className="text-xs sm:text-base text-gray-600">Inscrições</p>
              <div className="mt-2 sm:mt-4 flex flex-col sm:flex-row gap-1 sm:gap-4 text-xs sm:text-sm">
                <span className="text-green-600">✓ {stats.enrollments.confirmed}</span>
                <span className="text-yellow-600">⏳ {stats.enrollments.pending}</span>
              </div>
            </div>

            {/* Pagamentos */}
            <div className="bg-white rounded-xl shadow-lg p-3 sm:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className="p-2 sm:p-3 rounded-full" style={{ backgroundColor: 'rgba(220, 253, 97, 0.2)' }}>
                  <CheckCircle className="w-4 h-4 sm:w-6 sm:h-6" style={{ color: 'rgb(210, 243, 67)' }} />
                </div>
                <span className="text-xs sm:text-sm text-gray-500 hidden sm:block">+{stats.payments.recent} esta semana</span>
              </div>
              <h3 className="text-lg sm:text-2xl font-bold mb-1">{stats.payments.confirmed}</h3>
              <p className="text-xs sm:text-base text-gray-600">Confirmados</p>
              <div className="mt-2 sm:mt-4 text-xs sm:text-sm text-gray-500">
                {stats.payments.pending} pendentes
              </div>
            </div>

            {/* Receita Líquida */}
            <div className="bg-white rounded-xl shadow-lg p-3 sm:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className="p-2 sm:p-3 rounded-full" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                  <DollarSign className="w-4 h-4 sm:w-6 sm:h-6" style={{ color: 'rgb(34, 197, 94)' }} />
                </div>
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
              </div>
              <h3 className="text-sm sm:text-2xl font-bold mb-1 text-green-600">
                <span className="hidden sm:inline">R$ </span>{stats.revenue.net.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <p className="text-xs sm:text-base text-gray-600">Receita Líquida</p>
              <div className="mt-2 sm:mt-4 space-y-1 text-xs sm:text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Bruta:</span>
                  <span>R$ {stats.revenue.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>Taxas:</span>
                  <span>- R$ {stats.revenue.fees.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Métodos de Pagamento */}
            <div className="bg-white rounded-xl shadow-lg p-3 sm:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className="p-2 sm:p-3 rounded-full" style={{ backgroundColor: 'rgba(220, 253, 97, 0.2)' }}>
                  <FileText className="w-4 h-4 sm:w-6 sm:h-6" style={{ color: 'rgb(210, 243, 67)' }} />
                </div>
              </div>
              <h3 className="text-xs sm:text-lg font-bold mb-2 sm:mb-3">Métodos</h3>
              <div className="space-y-1 sm:space-y-2">
                {stats.payment_methods.filter((method) => method.payment_method).map((method) => (
                  <div key={method.payment_method} className="flex justify-between text-xs sm:text-sm">
                    <span className="text-gray-600 truncate">{(method.payment_method || '').replace('PIX à Vista', 'PIX').replace('PIX Parcelado', 'PIX Parc.').replace('Cartão de Crédito', 'Cartão')}</span>
                    <span className="font-semibold ml-1">{method.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Membros / Não membros */}
            <div className="bg-white rounded-xl shadow-lg p-3 sm:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className="p-2 sm:p-3 rounded-full" style={{ backgroundColor: 'rgba(165, 44, 240, 0.1)' }}>
                  <Users className="w-4 h-4 sm:w-6 sm:h-6" style={{ color: 'rgb(165, 44, 240)' }} />
                </div>
              </div>
              <h3 className="text-xs sm:text-lg font-bold mb-2 sm:mb-3">Membros</h3>
              <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Sim</span>
                  <span className="font-semibold">{stats.members.yes}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Não</span>
                  <span className="font-semibold">{stats.members.no}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Sem resposta</span>
                  <span className="font-semibold">{stats.members.unknown}</span>
                </div>
              </div>
            </div>

            {/* Total em aberto */}
            <div className="bg-white rounded-xl shadow-lg p-3 sm:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className="p-2 sm:p-3 rounded-full" style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)' }}>
                  <AlertTriangle className="w-4 h-4 sm:w-6 sm:h-6 text-amber-600" />
                </div>
              </div>
              <h3 className="text-sm sm:text-2xl font-bold mb-1 text-amber-700">
                <span className="hidden sm:inline">R$ </span>{stats.revenue.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <p className="text-xs sm:text-base text-gray-600">Total em aberto</p>
              <div className="mt-2 sm:mt-4 space-y-1 text-xs sm:text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Pendente + criado:</span>
                  <span>em aberto</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>Vencido:</span>
                  <span>R$ {stats.revenue.overdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pagamentos em atraso */}
        <div className="bg-white rounded-xl shadow-lg mb-6 sm:mb-8 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowOverduePayments((value) => !value)}
            className="w-full px-3 sm:px-6 py-4 flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div className="min-w-0">
                <h2 className="text-sm sm:text-xl font-bold leading-tight whitespace-normal">
                  Pagamentos em atraso
                </h2>
                <p className="text-sm text-gray-600 hidden sm:block">
                  Clique na seta para ver as inscrições e parcelas atrasadas.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 font-medium text-sm whitespace-nowrap">
                {overduePaymentsCount} parcelas
              </span>
              {showOverduePayments ? (
                <ChevronUp className="w-5 h-5 text-gray-500 flex-shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
              )}
            </div>
          </button>

          {showOverduePayments && (
            <div className="border-t px-3 sm:px-6 py-4 sm:py-6">
              <div className="flex flex-wrap gap-2 sm:gap-3 text-sm mb-4">
                <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 font-medium">
                  {overdueEnrollments.length} inscrições
                </span>
                <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 font-medium">
                  R$ {formatCurrency(overdueTotalAmount)}
                </span>
                <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 font-medium">
                  {overduePaymentsCount} parcelas em aberto
                </span>
              </div>

              {overdueEnrollments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-green-200 bg-green-50 px-4 py-6 text-green-800">
                  Nenhum pagamento está em atraso no momento.
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {overdueEnrollments.map((item) => {
                    const name = item.form_data?.nome_completo || item.user_email || 'Sem nome';
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-red-200 bg-red-50/50 p-4 sm:p-5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-base sm:text-lg truncate">{name}</p>
                            <p className="text-sm text-gray-600">
                              {item.user_email} • {item.product?.name || item.product_name || 'Produto'}
                            </p>
                            <p className="text-sm text-gray-600">
                              Lote: {item.batch?.name || item.batch_name || 'N/A'}
                            </p>
                          </div>

                          <button
                            onClick={() => setSelectedEnrollment(item)}
                            className="px-3 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors"
                            style={{ backgroundColor: 'rgb(165, 44, 240)', color: 'white' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(145, 24, 220)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(165, 44, 240)'}
                          >
                            Ver inscrição
                          </button>
                        </div>

                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div className="rounded-lg bg-white p-3 border">
                        <p className="text-gray-500">Parcelas atrasadas</p>
                        <p className="font-semibold">{item.overdue_payments_count}</p>
                      </div>
                      <div className="rounded-lg bg-white p-3 border">
                        <p className="text-gray-500">Total em atraso</p>
                        <p className="font-semibold">R$ {formatCurrency(Number(item.total_overdue_amount || 0))}</p>
                      </div>
                      <div className="rounded-lg bg-white p-3 border col-span-2 sm:col-span-1">
                        <p className="text-gray-500">Mais antiga</p>
                        <p className="font-semibold">
                          {item.oldest_due_date ? parseLocalDate(item.oldest_due_date).toLocaleDateString('pt-BR') : '-'}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          {item.overdue_payments.map((payment) => (
                            <div
                              key={payment.id}
                              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg bg-white border px-3 py-2"
                            >
                              <div>
                                <p className="font-medium">
                                  Parcela {payment.installment_number}
                                </p>
                                <p className="text-sm text-gray-600">
                                  Venceu em {parseLocalDate(payment.due_date).toLocaleDateString('pt-BR')}
                                </p>
                              </div>
                              <div className="text-left sm:text-right">
                                <p className="font-semibold">R$ {payment.amount}</p>
                                <p className="text-sm text-red-700">
                                  {payment.days_overdue} {payment.days_overdue === 1 ? 'dia' : 'dias'} em atraso
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Inscrições por Lote */}
        {stats && stats.batches && stats.batches.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-3 sm:p-6 mb-6 sm:mb-8">
            <h2 className="text-lg sm:text-xl font-bold mb-4">Inscrições por Lote</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {stats.batches.map((batch) => (
                <div 
                  key={batch.id} 
                  className="border rounded-lg p-3 sm:p-4"
                  style={{
                    borderColor: batch.status === 'ACTIVE' ? 'rgb(165, 44, 240)' : '#e5e7eb',
                    backgroundColor: batch.status === 'ACTIVE' ? 'rgba(165, 44, 240, 0.05)' : 'white'
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm sm:text-base">{batch.name}</h3>
                    <span 
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: batch.status === 'ACTIVE' ? 'rgba(165, 44, 240, 0.2)' : 
                                        batch.status === 'FULL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(156, 163, 175, 0.2)',
                        color: batch.status === 'ACTIVE' ? 'rgb(165, 44, 240)' : 
                               batch.status === 'FULL' ? 'rgb(220, 38, 38)' : 'rgb(107, 114, 128)'
                      }}
                    >
                      {batch.status === 'ACTIVE' ? 'Ativo' : 
                       batch.status === 'FULL' ? 'Esgotado' : 
                       batch.status === 'SCHEDULED' ? 'Agendado' : 
                       batch.status === 'ENDED' ? 'Encerrado' : batch.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{batch.product_name}</p>
                  
                  {/* Barra de progresso */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600">Vagas</span>
                      <span className="font-medium">
                        {batch.current_enrollments}{batch.max_enrollments ? `/${batch.max_enrollments}` : ''}
                      </span>
                    </div>
                    {batch.max_enrollments && (
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="h-2 rounded-full transition-all"
                          style={{ 
                            width: `${Math.min((batch.current_enrollments / batch.max_enrollments) * 100, 100)}%`,
                            backgroundColor: batch.current_enrollments >= batch.max_enrollments ? 'rgb(239, 68, 68)' : 'rgb(165, 44, 240)'
                          }}
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Detalhes */}
                  <div className="flex gap-3 text-xs">
                    <span className="text-green-600">✓ {batch.paid} pagos</span>
                    <span className="text-yellow-600">⏳ {batch.pending} pend.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal de Detalhes */}
        {selectedEnrollment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-white rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
              <div className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                  <h2 className="text-lg sm:text-2xl font-bold">Inscrição #{selectedEnrollment.id}</h2>
                  <button
                    onClick={() => setSelectedEnrollment(null)}
                    className="text-gray-500 hover:text-gray-700 p-1"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4 sm:space-y-6">
                  {/* Dados Pessoais */}
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3" style={{ color: 'rgb(165, 44, 240)' }}>
                      Dados Pessoais
                    </h3>
                    <div className="grid grid-cols-2 gap-2 sm:gap-4">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="text-xs sm:text-sm text-gray-600">Nome Completo</label>
                        <p className="font-medium text-sm sm:text-base">{selectedEnrollment.form_data?.nome_completo || '-'}</p>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label className="text-xs sm:text-sm text-gray-600">Email</label>
                        <p className="font-medium text-sm sm:text-base break-all">{selectedEnrollment.user_email}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Telefone</label>
                        <p className="font-medium text-sm sm:text-base">{selectedEnrollment.form_data?.telefone || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Nascimento</label>
                        <p className="font-medium text-sm sm:text-base">{selectedEnrollment.form_data?.data_nascimento || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">CPF</label>
                        <p className="font-medium text-sm sm:text-base">{selectedEnrollment.form_data?.cpf || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">RG</label>
                        <p className="font-medium text-sm sm:text-base">{selectedEnrollment.form_data?.rg || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Dados do Acampamento */}
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3" style={{ color: 'rgb(165, 44, 240)' }}>
                      Acampamento
                    </h3>
                    <div className="grid grid-cols-2 gap-2 sm:gap-4">
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Camiseta</label>
                        <p className="font-medium text-sm sm:text-base">{selectedEnrollment.form_data?.tamanho_camiseta || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Membro BC</label>
                        <p className="font-medium text-sm sm:text-base">{selectedEnrollment.form_data?.membro_batista_capital === 'sim' ? 'Sim' : selectedEnrollment.form_data?.membro_batista_capital === 'nao' ? 'Não' : '-'}</p>
                      </div>
                      {selectedEnrollment.form_data?.membro_batista_capital === 'nao' && (
                        <div>
                          <label className="text-xs sm:text-sm text-gray-600">Igreja</label>
                          <p className="font-medium text-sm sm:text-base">{selectedEnrollment.form_data?.igreja || '-'}</p>
                        </div>
                      )}
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Líder PG</label>
                        <p className="font-medium text-sm sm:text-base">{selectedEnrollment.form_data?.lider_pg || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Inscrição */}
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3" style={{ color: 'rgb(165, 44, 240)' }}>
                      Pagamento
                    </h3>
                    <div className="grid grid-cols-2 gap-2 sm:gap-4">
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Produto</label>
                        <p className="font-medium text-sm sm:text-base">{selectedEnrollment.product?.name || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Lote</label>
                        <p className="font-medium text-sm sm:text-base">{selectedEnrollment.batch?.name || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Método</label>
                        <p className="font-medium text-sm sm:text-base">
                          {selectedEnrollment.payment_method === 'PIX_CASH' && 'PIX'}
                          {selectedEnrollment.payment_method === 'PIX_INSTALLMENT' && 'PIX Parc.'}
                          {selectedEnrollment.payment_method === 'CREDIT_CARD' && 'Cartão'}
                          {!selectedEnrollment.payment_method && '-'}
                        </p>
                      </div>
                      {selectedEnrollment.payment_method === 'PIX_INSTALLMENT' && selectedEnrollment.payments ? (
                        <div>
                          <label className="text-xs sm:text-sm text-gray-600">Parcelas</label>
                          <p className="font-medium text-sm sm:text-base">
                            {selectedEnrollment.payments.filter((p: any) => p.status === 'CONFIRMED' || p.status === 'RECEIVED').length}/{selectedEnrollment.payments.length}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs sm:text-sm text-gray-600">Parcelas</label>
                          <p className="font-medium text-sm sm:text-base">{selectedEnrollment.installments || 1}x</p>
                        </div>
                      )}
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Total</label>
                        <p className="font-medium text-sm sm:text-base">R$ {selectedEnrollment.total_amount}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Desconto</label>
                        <p className="font-medium text-sm sm:text-base">R$ {selectedEnrollment.discount_amount}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Valor Final</label>
                        <p className="font-medium text-base sm:text-lg" style={{ color: 'rgb(165, 44, 240)' }}>
                          R$ {selectedEnrollment.final_amount}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Status</label>
                        <p className="font-medium text-sm sm:text-base">
                          {selectedEnrollment.status === 'PAID' ? '✓ Pago' : 
                           selectedEnrollment.status === 'PENDING_PAYMENT' ? '⏳ Pendente' : 
                           selectedEnrollment.status}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Observações */}
                  {selectedEnrollment.form_data?.observacoes && (
                    <div>
                      <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3" style={{ color: 'rgb(165, 44, 240)' }}>
                        Observações
                      </h3>
                      <p className="text-sm sm:text-base text-gray-700">{selectedEnrollment.form_data.observacoes}</p>
                    </div>
                  )}

                  {/* Detalhes das Parcelas - PIX Parcelado */}
                  {selectedEnrollment.payment_method === 'PIX_INSTALLMENT' && selectedEnrollment.payments && selectedEnrollment.payments.length > 0 && (
                    <div>
                      <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3" style={{ color: 'rgb(165, 44, 240)' }}>
                        Parcelas
                      </h3>
                      <div className="space-y-2">
                        {selectedEnrollment.payments.map((payment: any) => (
                          <div 
                            key={payment.id} 
                            className="flex items-center justify-between p-2 sm:p-3 rounded-lg border"
                            style={{
                              backgroundColor: payment.status === 'CONFIRMED' || payment.status === 'RECEIVED' 
                                ? 'rgba(34, 197, 94, 0.1)' 
                                : 'rgba(234, 179, 8, 0.1)',
                              borderColor: payment.status === 'CONFIRMED' || payment.status === 'RECEIVED'
                                ? 'rgba(34, 197, 94, 0.3)'
                                : 'rgba(234, 179, 8, 0.3)'
                            }}
                          >
                            <div>
                              <p className="font-medium text-sm sm:text-base">Parcela {payment.installment_number}</p>
                              <p className="text-xs sm:text-sm text-gray-600">
                                {new Date(payment.due_date).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium text-sm sm:text-base">R$ {payment.amount}</p>
                              <p className="text-xs sm:text-sm">
                                {payment.status === 'CONFIRMED' || payment.status === 'RECEIVED' ? (
                                  <span className="text-green-600 font-medium">✓ Paga</span>
                                ) : (
                                  <span className="text-yellow-600 font-medium">⏳ Pend.</span>
                                )}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Datas */}
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3" style={{ color: 'rgb(165, 44, 240)' }}>
                      Datas
                    </h3>
                    <div className="grid grid-cols-2 gap-2 sm:gap-4">
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Inscrição</label>
                        <p className="font-medium text-sm sm:text-base">
                          {new Date(selectedEnrollment.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      {selectedEnrollment.paid_at && (
                        <div>
                          <label className="text-xs sm:text-sm text-gray-600">Pagamento</label>
                          <p className="font-medium text-sm sm:text-base">
                            {new Date(selectedEnrollment.paid_at).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 sm:mt-6 flex justify-end">
                  <button
                    onClick={() => setSelectedEnrollment(null)}
                    className="w-full sm:w-auto px-6 py-2 rounded-lg text-sm sm:text-base"
                    style={{ backgroundColor: 'rgb(165, 44, 240)', color: 'white' }}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
