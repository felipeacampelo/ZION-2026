import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Layers3,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  getAdminDashboard,
  getAdminOverdueEnrollments,
  type OverdueEnrollmentSummary,
} from '../services/api';
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
  empires: {
    egito: number;
    persia: number;
    grecia: number;
    roma: number;
    none: number;
  };
  payment_methods: Array<{
    payment_method: string;
    count: number;
  }>;
  batches: BatchStats[];
  social_quota: {
    total: number;
    completed: number;
    raised_total: number;
    remaining_total: number;
  };
}

type OverdueSummaryResponse = {
  count: number;
  total_overdue_payments: number;
  total_overdue_amount: string;
  results: OverdueEnrollmentSummary[];
};

const brandPurple = 'rgb(165, 44, 240)';
const brandPurpleSoft = 'rgba(165, 44, 240, 0.08)';
const brandLimeSoft = 'rgba(220, 253, 97, 0.34)';

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatPaymentMethod = (method: string) => {
  if (method === 'PIX_CASH') return 'PIX à vista';
  if (method === 'PIX_INSTALLMENT') return 'PIX parcelado';
  if (method === 'CREDIT_CARD') return 'Cartão de crédito';
  if (method === 'PIX à Vista') return 'PIX à vista';
  if (method === 'PIX Parcelado') return 'PIX parcelado';
  if (method === 'Cartão de Crédito') return 'Cartão de crédito';
  return method || '-';
};

const getBatchStatusLabel = (status: string) => {
  if (status === 'ACTIVE') return 'Ativo';
  if (status === 'FULL') return 'Esgotado';
  if (status === 'SCHEDULED') return 'Agendado';
  if (status === 'ENDED') return 'Encerrado';
  return status;
};

const getBatchStatusStyle = (status: string) => {
  if (status === 'ACTIVE') {
    return {
      backgroundColor: 'rgba(165, 44, 240, 0.14)',
      color: brandPurple,
      borderColor: 'rgba(165, 44, 240, 0.12)',
    };
  }
  if (status === 'FULL') {
    return {
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      color: 'rgb(220, 38, 38)',
      borderColor: 'rgba(239, 68, 68, 0.12)',
    };
  }
  return {
    backgroundColor: 'rgba(148, 163, 184, 0.14)',
    color: 'rgb(71, 85, 105)',
    borderColor: 'rgba(148, 163, 184, 0.12)',
  };
};

const getPaymentMethodLabel = (method?: string) => {
  if (method === 'PIX_CASH') return 'PIX';
  if (method === 'PIX_INSTALLMENT') return 'PIX Parcelado';
  if (method === 'CREDIT_CARD') return 'Cartão';
  return '-';
};

const getEnrollmentStatusLabel = (status?: string) => {
  if (status === 'PAID') return 'Pago';
  if (status === 'PENDING_PAYMENT') return 'Pendente';
  return status || '-';
};

const formatEmpireLabel = (empire: string) => {
  if (empire === 'egito') return 'Egito';
  if (empire === 'persia') return 'Pérsia';
  if (empire === 'grecia') return 'Grécia';
  if (empire === 'roma') return 'Roma';
  if (empire === 'none') return 'Sem Império';
  return empire;
};

const sectionCardClass =
  'rounded-[28px] border border-white/80 bg-white/92 shadow-[0_20px_50px_rgba(15,23,42,0.07)]';

export default function AdminDashboard() {
  const navigate = useNavigate();
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

  const loadData = async () => {
    try {
      const [statsRes, overdueRes] = await Promise.all([
        getAdminDashboard(),
        getAdminOverdueEnrollments(),
      ]);
      setStats(statsRes.data);
      setOverdueSummary(overdueRes.data);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const overdueEnrollments = overdueSummary.results;
  const overduePaymentsCount = overdueSummary.total_overdue_payments;
  const overdueTotalAmount = Number(overdueSummary.total_overdue_amount || 0);

  const totalMembers = stats
    ? stats.members.yes + stats.members.no
    : 0;
  const confirmedRate =
    stats && stats.enrollments.total > 0
      ? Math.round((stats.enrollments.confirmed / stats.enrollments.total) * 100)
      : 0;

  if (loading) {
    return (
      <AdminShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="rounded-[32px] border border-white/80 bg-white/90 px-10 py-12 text-center shadow-[0_30px_80px_rgba(15,23,42,0.08)]">
            <div
              className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-transparent border-t-current"
              style={{ color: brandPurple }}
            />
            <p className="mt-5 text-sm font-medium text-gray-600">Carregando painel...</p>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="space-y-5 lg:space-y-6">
        <section
          className={`${sectionCardClass} overflow-hidden p-5 lg:p-6`}
          style={{
            background:
              'linear-gradient(135deg, rgba(165, 44, 240, 0.08) 0%, rgba(255,255,255,0.96) 42%, rgba(220,253,97,0.18) 100%)',
          }}
        >
          <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">
                Visão geral
              </div>
              <h1 className="mt-3 text-[2rem] font-bold tracking-tight text-gray-950 lg:text-[2.35rem]">
                Painel Admin
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 lg:text-[15px]">
                Leitura rápida de inscrições, receita, atrasos e ocupação dos lotes.
              </p>

              {stats && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div
                    className="rounded-2xl border px-4 py-3 shadow-sm"
                    style={{
                      background: 'linear-gradient(135deg, rgba(165, 44, 240, 0.12) 0%, rgba(255,255,255,0.98) 100%)',
                      borderColor: 'rgba(165, 44, 240, 0.12)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-700">
                        Receita líquida
                      </p>
                      <TrendingUp className="h-4 w-4" style={{ color: brandPurple }} />
                    </div>
                    <p className="mt-2 text-2xl font-bold text-gray-950">
                      R$ {stats ? formatCurrency(stats.revenue.net) : '0,00'}
                    </p>
                    <p className="text-sm text-gray-600">
                      Taxas: - R$ {stats ? formatCurrency(stats.revenue.fees) : '0,00'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">
                        Em aberto
                      </p>
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    </div>
                    <p className="mt-2 text-2xl font-bold text-amber-700">
                      R$ {stats ? formatCurrency(stats.revenue.pending) : '0,00'}
                    </p>
                    <p className="text-sm text-amber-900/80">
                      Vencido: R$ {stats ? formatCurrency(stats.revenue.overdue) : '0,00'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/85 px-4 py-3 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Ritmo semanal
                    </p>
                    <p className="mt-2 text-2xl font-bold text-gray-950">+{stats.enrollments.recent}</p>
                    <p className="text-sm text-gray-600">novas inscrições na semana</p>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/85 px-4 py-3 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Conversão
                    </p>
                    <p className="mt-2 text-2xl font-bold text-gray-950">{confirmedRate}%</p>
                    <p className="text-sm text-gray-600">inscrições já confirmadas</p>
                  </div>
                </div>
              )}
          </div>
        </section>

        {stats && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className={`${sectionCardClass} p-5`}>
                <div className="flex items-start justify-between">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: brandPurpleSoft }}
                  >
                    <Users className="h-6 w-6" style={{ color: brandPurple }} />
                  </div>
                  <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                    +{stats.enrollments.recent} semana
                  </span>
                </div>
                <p className="mt-5 text-3xl font-bold text-gray-950">{stats.enrollments.total}</p>
                <p className="mt-1 text-sm text-gray-600">Inscrições totais</p>
                <div className="mt-5 flex gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-green-50 px-2.5 py-1 text-green-700">
                    {stats.enrollments.confirmed} confirmadas
                  </span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    {stats.enrollments.pending} pendentes
                  </span>
                </div>
              </article>

              <article className={`${sectionCardClass} p-5`}>
                <div className="flex items-start justify-between">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: brandLimeSoft }}
                  >
                    <CheckCircle className="h-6 w-6 text-lime-700" />
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    +{stats.payments.recent} semana
                  </span>
                </div>
                <p className="mt-5 text-3xl font-bold text-gray-950">{stats.payments.confirmed}</p>
                <p className="mt-1 text-sm text-gray-600">Pagamentos confirmados</p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${stats.payments.total > 0 ? (stats.payments.confirmed / stats.payments.total) * 100 : 0}%`,
                      backgroundColor: brandPurple,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">{stats.payments.pending} pagamentos ainda pendentes</p>
              </article>

              <article
                className={`${sectionCardClass} cursor-pointer p-5 transition-transform hover:-translate-y-0.5`}
                onClick={() => navigate('/admin/social-quotas')}
              >
                <div className="flex items-start justify-between">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: brandPurpleSoft }}
                  >
                    <Layers3 className="h-6 w-6" style={{ color: brandPurple }} />
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    Cota social
                  </span>
                </div>
                <p className="mt-5 text-3xl font-bold text-gray-950">{stats.social_quota.total}</p>
                <p className="mt-1 text-sm text-gray-600">adolescentes acompanhados</p>
                <div className="mt-5 flex gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-green-50 px-2.5 py-1 text-green-700">
                    {stats.social_quota.completed} fecharam valor
                  </span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    R$ {formatCurrency(stats.social_quota.remaining_total)} faltando
                  </span>
                </div>
              </article>

              <div className={`${sectionCardClass} p-5 lg:p-6`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Perfil do público
                    </p>
                    <h2 className="mt-2 text-xl font-bold text-gray-950">Membros x visitantes</h2>
                  </div>
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: brandPurpleSoft }}
                  >
                    <Users className="h-5 w-5" style={{ color: brandPurple }} />
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {[
                    { label: 'Membros', value: stats.members.yes, color: brandPurple },
                    { label: 'Não membros', value: stats.members.no, color: '#111827' },
                  ].map((item) => {
                    const width = totalMembers > 0 ? (item.value / totalMembers) * 100 : 0;
                    return (
                      <div key={item.label}>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="text-gray-600">{item.label}</span>
                          <span className="font-semibold text-gray-950">{item.value}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${width}%`, backgroundColor: item.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={`${sectionCardClass} p-5 lg:p-6`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Impérios
                    </p>
                    <h2 className="mt-2 text-xl font-bold text-gray-950">Inscritos por império</h2>
                  </div>
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: brandPurpleSoft }}
                  >
                    <Layers3 className="h-5 w-5" style={{ color: brandPurple }} />
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {Object.entries(stats.empires).map(([empire, value]) => {
                    const totalEmpires = Object.values(stats.empires).reduce((sum, current) => sum + current, 0);
                    const width = totalEmpires > 0 ? (value / totalEmpires) * 100 : 0;
                    return (
                      <div key={empire}>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="text-gray-600">{formatEmpireLabel(empire)}</span>
                          <span className="font-semibold text-gray-950">{value}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${width}%`, backgroundColor: brandPurple }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={`${sectionCardClass} p-5 lg:p-6`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Meios de pagamento
                    </p>
                    <h2 className="mt-2 text-xl font-bold text-gray-950">Distribuição atual</h2>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lime-100">
                    <FileText className="h-5 w-5 text-lime-700" />
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {stats.payment_methods
                    .filter((method) => method.payment_method)
                    .map((method) => {
                      const width =
                        stats.payments.total > 0 ? (method.count / stats.payments.total) * 100 : 0;
                      return (
                        <div key={method.payment_method}>
                          <div className="mb-2 flex items-center justify-between text-sm">
                            <span className="text-gray-600">{formatPaymentMethod(method.payment_method)}</span>
                            <span className="font-semibold text-gray-950">{method.count}</span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${width}%`,
                                backgroundColor: brandPurple,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </section>

            <section>
              <div className={`${sectionCardClass} p-5 lg:p-5`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-950">Pagamentos em atraso</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
                      {overdueEnrollments.length} inscrições
                    </span>
                    <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
                      {overduePaymentsCount} parcelas
                    </span>
                    <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
                      R$ {formatCurrency(overdueTotalAmount)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowOverduePayments((value) => !value)}
                  className="mt-5 flex w-full items-center justify-between rounded-[24px] border border-red-100 bg-gradient-to-r from-red-50 to-white px-5 py-4 text-left transition-colors hover:border-red-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-950">Expandir lista de inscrições atrasadas</p>
                      <p className="text-sm text-gray-600">Detalhamento por inscrição e parcela.</p>
                    </div>
                  </div>
                  {showOverduePayments ? (
                    <ChevronUp className="h-5 w-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  )}
                </button>

                {showOverduePayments && (
                  <div className="mt-5 max-h-[38rem] overflow-y-auto pr-1 sm:pr-2">
                    <div className="grid gap-4 2xl:grid-cols-2">
                    {overdueEnrollments.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-green-200 bg-green-50 px-5 py-8 text-green-800 xl:col-span-2">
                        Nenhum pagamento está em atraso no momento.
                      </div>
                    ) : (
                      overdueEnrollments.map((item) => {
                        const name = item.form_data?.nome_completo || item.user_email || 'Sem nome';
                        return (
                          <article
                            key={item.id}
                            className="min-w-0 rounded-[24px] border border-red-100 bg-red-50/60 p-4 lg:p-5"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="break-words text-base font-semibold text-gray-950 lg:text-lg">{name}</p>
                                <p className="break-all text-sm text-gray-600">
                                  {item.user_email} • {item.product?.name || item.product_name || 'Produto'}
                                </p>
                                <p className="mt-1 break-words text-sm text-gray-600">
                                  Lote: {item.batch?.name || item.batch_name || 'N/A'}
                                </p>
                              </div>
                              <button
                                onClick={() => setSelectedEnrollment(item)}
                                className="w-full rounded-2xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
                                style={{ backgroundColor: brandPurple }}
                              >
                                Ver inscrição
                              </button>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                              <div className="rounded-2xl border border-white bg-white px-3 py-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                                  Parcelas
                                </p>
                                <p className="mt-2 break-words text-base font-bold text-gray-950 lg:text-lg">{item.overdue_payments_count}</p>
                              </div>
                              <div className="rounded-2xl border border-white bg-white px-3 py-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                                  Total
                                </p>
                                <p className="mt-2 break-words text-base font-bold text-gray-950 lg:text-lg">
                                  R$ {formatCurrency(Number(item.total_overdue_amount || 0))}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white bg-white px-3 py-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                                  Mais antiga
                                </p>
                                <p className="mt-2 break-words text-base font-bold text-gray-950 lg:text-lg">
                                  {item.oldest_due_date
                                    ? parseLocalDate(item.oldest_due_date).toLocaleDateString('pt-BR')
                                    : '-'}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 space-y-2">
                              {item.overdue_payments.map((payment) => (
                                <div
                                  key={payment.id}
                                  className="flex flex-col gap-2 rounded-2xl border border-white bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div>
                                    <p className="font-semibold text-gray-950">
                                      Parcela {payment.installment_number}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                      Venceu em {parseLocalDate(payment.due_date).toLocaleDateString('pt-BR')}
                                    </p>
                                  </div>
                                  <div className="min-w-0 text-left sm:text-right">
                                    <p className="break-words font-semibold text-gray-950">R$ {payment.amount}</p>
                                    <p className="text-sm text-red-700">
                                      {payment.days_overdue} {payment.days_overdue === 1 ? 'dia' : 'dias'} em atraso
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </article>
                        );
                      })
                    )}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {stats.batches && stats.batches.length > 0 && (
              <section className={`${sectionCardClass} p-5 lg:p-6`}>
                <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Acompanhamento de lotes
                    </p>
                    <h2 className="mt-2 text-2xl font-bold text-gray-950">Inscrições por lote</h2>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
                    <Layers3 className="h-4 w-4" />
                    {stats.batches.length} lotes monitorados
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {stats.batches.map((batch) => {
                    const progress = batch.max_enrollments
                      ? Math.min((batch.current_enrollments / batch.max_enrollments) * 100, 100)
                      : 0;

                    return (
                      <article
                        key={batch.id}
                        className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-semibold text-gray-950">{batch.name}</h3>
                            <p className="mt-1 text-sm text-gray-500">{batch.product_name}</p>
                          </div>
                          <span
                            className="rounded-full border px-3 py-1 text-xs font-semibold"
                            style={getBatchStatusStyle(batch.status)}
                          >
                            {getBatchStatusLabel(batch.status)}
                          </span>
                        </div>

                        <div className="mt-5">
                          <div className="mb-2 flex items-center justify-between text-sm">
                            <span className="text-gray-600">Ocupação</span>
                            <span className="font-semibold text-gray-950">
                              {batch.current_enrollments}
                              {batch.max_enrollments ? `/${batch.max_enrollments}` : ''}
                            </span>
                          </div>
                          {batch.max_enrollments ? (
                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${progress}%`,
                                  backgroundColor:
                                    batch.current_enrollments >= batch.max_enrollments
                                      ? 'rgb(239, 68, 68)'
                                      : brandPurple,
                                }}
                              />
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-500">
                              Lote sem limite definido.
                            </div>
                          )}
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-2xl bg-white px-3 py-3">
                            <p className="text-gray-500">Pagos</p>
                            <p className="mt-1 font-semibold text-green-700">{batch.paid}</p>
                          </div>
                          <div className="rounded-2xl bg-white px-3 py-3">
                            <p className="text-gray-500">Pendentes</p>
                            <p className="mt-1 font-semibold text-amber-700">{batch.pending}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {selectedEnrollment && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4">
            <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:max-w-3xl sm:rounded-[32px]">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Detalhes da inscrição
                    </p>
                    <h2 className="mt-2 text-2xl font-bold text-gray-950">
                      Inscrição #{selectedEnrollment.id}
                    </h2>
                  </div>
                  <button
                    onClick={() => setSelectedEnrollment(null)}
                    className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-slate-50"
                  >
                    Fechar
                  </button>
                </div>
              </div>

              <div className="space-y-6 px-5 py-5 sm:px-8 sm:py-7">
                <section className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-5">
                  <h3 className="text-lg font-semibold" style={{ color: brandPurple }}>
                    Dados pessoais
                  </h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm text-gray-500">Nome completo</label>
                      <p className="font-medium text-gray-950">
                        {selectedEnrollment.form_data?.nome_completo || '-'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Email</label>
                      <p className="break-all font-medium text-gray-950">{selectedEnrollment.user_email}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Telefone</label>
                      <p className="font-medium text-gray-950">{selectedEnrollment.form_data?.telefone || '-'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Nascimento</label>
                      <p className="font-medium text-gray-950">
                        {selectedEnrollment.form_data?.data_nascimento || '-'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">CPF</label>
                      <p className="font-medium text-gray-950">{selectedEnrollment.form_data?.cpf || '-'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">RG</label>
                      <p className="font-medium text-gray-950">{selectedEnrollment.form_data?.rg || '-'}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-5">
                  <h3 className="text-lg font-semibold" style={{ color: brandPurple }}>
                    Acampamento
                  </h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm text-gray-500">Camiseta</label>
                      <p className="font-medium text-gray-950">
                        {selectedEnrollment.form_data?.tamanho_camiseta || '-'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Membro BC</label>
                      <p className="font-medium text-gray-950">
                        {selectedEnrollment.form_data?.membro_batista_capital === 'sim'
                          ? 'Sim'
                          : selectedEnrollment.form_data?.membro_batista_capital === 'nao'
                            ? 'Não'
                            : '-'}
                      </p>
                    </div>
                    {selectedEnrollment.form_data?.membro_batista_capital === 'nao' && (
                      <div>
                        <label className="text-sm text-gray-500">Igreja</label>
                        <p className="font-medium text-gray-950">{selectedEnrollment.form_data?.igreja || '-'}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm text-gray-500">Líder PG</label>
                      <p className="font-medium text-gray-950">{selectedEnrollment.form_data?.lider_pg || '-'}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-5">
                  <h3 className="text-lg font-semibold" style={{ color: brandPurple }}>
                    Pagamento
                  </h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm text-gray-500">Produto</label>
                      <p className="font-medium text-gray-950">{selectedEnrollment.product?.name || '-'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Lote</label>
                      <p className="font-medium text-gray-950">{selectedEnrollment.batch?.name || '-'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Método</label>
                      <p className="font-medium text-gray-950">
                        {getPaymentMethodLabel(selectedEnrollment.payment_method)}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Parcelas</label>
                      <p className="font-medium text-gray-950">
                        {selectedEnrollment.payment_method === 'PIX_INSTALLMENT' &&
                        selectedEnrollment.payments
                          ? `${selectedEnrollment.payments.filter(
                              (payment: any) =>
                                payment.status === 'CONFIRMED' || payment.status === 'RECEIVED'
                            ).length}/${selectedEnrollment.payments.length}`
                          : `${selectedEnrollment.installments || 1}x`}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Total</label>
                      <p className="font-medium text-gray-950">R$ {selectedEnrollment.total_amount}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Desconto</label>
                      <p className="font-medium text-gray-950">R$ {selectedEnrollment.discount_amount}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Valor final</label>
                      <p className="text-lg font-semibold" style={{ color: brandPurple }}>
                        R$ {selectedEnrollment.final_amount}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Status</label>
                      <p className="font-medium text-gray-950">
                        {getEnrollmentStatusLabel(selectedEnrollment.status)}
                      </p>
                    </div>
                  </div>
                </section>

                {selectedEnrollment.form_data?.observacoes && (
                  <section className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-5">
                    <h3 className="text-lg font-semibold" style={{ color: brandPurple }}>
                      Observações
                    </h3>
                    <p className="mt-3 text-gray-700">{selectedEnrollment.form_data.observacoes}</p>
                  </section>
                )}

                {selectedEnrollment.payment_method === 'PIX_INSTALLMENT' &&
                  selectedEnrollment.payments &&
                  selectedEnrollment.payments.length > 0 && (
                    <section className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-5">
                      <h3 className="text-lg font-semibold" style={{ color: brandPurple }}>
                        Parcelas
                      </h3>
                      <div className="mt-4 space-y-2">
                        {selectedEnrollment.payments.map((payment: any) => {
                          const isConfirmed =
                            payment.status === 'CONFIRMED' || payment.status === 'RECEIVED';

                          return (
                            <div
                              key={payment.id}
                              className="flex items-center justify-between rounded-2xl border px-4 py-3"
                              style={{
                                backgroundColor: isConfirmed
                                  ? 'rgba(34, 197, 94, 0.08)'
                                  : 'rgba(234, 179, 8, 0.08)',
                                borderColor: isConfirmed
                                  ? 'rgba(34, 197, 94, 0.22)'
                                  : 'rgba(234, 179, 8, 0.22)',
                              }}
                            >
                              <div>
                                <p className="font-medium text-gray-950">Parcela {payment.installment_number}</p>
                                <p className="text-sm text-gray-600">
                                  {new Date(payment.due_date).toLocaleDateString('pt-BR')}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-medium text-gray-950">R$ {payment.amount}</p>
                                <p className="text-sm font-medium">
                                  {isConfirmed ? (
                                    <span className="text-green-600">Paga</span>
                                  ) : (
                                    <span className="text-amber-600">Pendente</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                <section className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-5">
                  <h3 className="text-lg font-semibold" style={{ color: brandPurple }}>
                    Datas
                  </h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm text-gray-500">Inscrição</label>
                      <p className="font-medium text-gray-950">
                        {new Date(selectedEnrollment.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    {selectedEnrollment.paid_at && (
                      <div>
                        <label className="text-sm text-gray-500">Pagamento</label>
                        <p className="font-medium text-gray-950">
                          {new Date(selectedEnrollment.paid_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
