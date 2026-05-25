import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Filter,
  Search,
} from 'lucide-react';
import AdminShell from '../components/AdminShell';
import { getAdminEnrollments, type Enrollment } from '../services/api';

const ENROLLMENTS_PAGE_SIZE = 20;

const escapeCsvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const formatCpfForCsv = (cpf: unknown) => {
  const text = String(cpf ?? '').trim();
  return text ? `="${text}"` : '';
};

type SortKey = 'id' | 'nome' | 'email' | 'telefone' | 'status' | 'payment_method' | 'valor';
type SortDirection = 'asc' | 'desc';

const compareEnrollmentValues = (a: any, b: any, key: SortKey) => {
  switch (key) {
    case 'id':
      return Number(a.id || 0) - Number(b.id || 0);
    case 'nome':
      return String(a.form_data?.nome_completo || '').localeCompare(String(b.form_data?.nome_completo || ''), 'pt-BR');
    case 'email':
      return String(a.user_email || '').localeCompare(String(b.user_email || ''), 'pt-BR');
    case 'telefone':
      return String(a.form_data?.telefone || '').localeCompare(String(b.form_data?.telefone || ''), 'pt-BR');
    case 'status':
      return String(a.status || '').localeCompare(String(b.status || ''), 'pt-BR');
    case 'payment_method':
      return String(a.payment_method || '').localeCompare(String(b.payment_method || ''), 'pt-BR');
    case 'valor':
      return Number(a.final_amount || 0) - Number(b.final_amount || 0);
    default:
      return 0;
  }
};

const sortIndicator = (active: boolean, direction: SortDirection) => {
  if (!active) {
    return <ArrowUpDown className="w-3 h-3 lg:w-4 lg:h-4" />;
  }

  return direction === 'asc'
    ? <ChevronUp className="w-3 h-3 lg:w-4 lg:h-4" />
    : <ChevronDown className="w-3 h-3 lg:w-4 lg:h-4" />;
};

type EnrollmentListResponse =
  | Enrollment[]
  | {
      count: number;
      next: string | null;
      previous: string | null;
      results: Enrollment[];
    };

const RESPONSAVEL_FIXED_LABELS: Record<string, string> = {
  nome_responsavel: 'Nome do Responsável',
  email_responsavel: 'Email do Responsável',
  telefone_responsavel: 'Telefone do Responsável',
};

const formatBooleanChoice = (value?: string) => {
  if (value === 'sim') return 'Sim';
  if (value === 'nao') return 'Não';
  return '-';
};

const formatEmpire = (value?: string) => {
  const empireLabels: Record<string, string> = {
    egito: 'Egito',
    persia: 'Pérsia',
    grecia: 'Grécia',
    roma: 'Roma',
  };

  return empireLabels[value || ''] || '-';
};

const formatCurrency = (value: string | number | undefined) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatResponsibleFieldLabel = (key: string) => {
  if (RESPONSAVEL_FIXED_LABELS[key]) {
    return RESPONSAVEL_FIXED_LABELS[key];
  }

  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export default function AdminEnrollments() {
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [enrollmentCount, setEnrollmentCount] = useState(0);
  const [enrollmentPage, setEnrollmentPage] = useState(1);
  const [enrollmentPageCount, setEnrollmentPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');
  const [socialQuotaFilter, setSocialQuotaFilter] = useState('');
  const [empireFilter, setEmpireFilter] = useState('');
  const [selectedEnrollment, setSelectedEnrollment] = useState<any>(null);
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searching, setSearching] = useState(false);
  const hasMountedRef = useRef(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildEnrollmentParams = (page: number) => ({
    search: searchTerm.trim() || undefined,
    status: statusFilter || undefined,
    payment_method: paymentMethodFilter || undefined,
    social_quota: socialQuotaFilter || undefined,
    empire: empireFilter || undefined,
    page,
    page_size: ENROLLMENTS_PAGE_SIZE,
  });

  const clearSearchDebounce = () => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
  };

  const applyEnrollmentResponse = (data: EnrollmentListResponse, page: number) => {
    const results = Array.isArray(data) ? data : data.results || [];
    const count = Array.isArray(data) ? results.length : data.count || results.length;

    setEnrollments(results);
    setEnrollmentCount(count);
    setEnrollmentPage(page);
    setEnrollmentPageCount(Math.max(1, Math.ceil(count / ENROLLMENTS_PAGE_SIZE)));
  };

  const loadData = async () => {
    try {
      const response = await getAdminEnrollments(buildEnrollmentParams(1));
      applyEnrollmentResponse(response.data, 1);
    } catch (error) {
      console.error('Error loading enrollments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSearch = async () => {
    clearSearchDebounce();
    setSearching(true);

    try {
      const res = await getAdminEnrollments(buildEnrollmentParams(1));
      applyEnrollmentResponse(res.data, 1);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setSearching(false);
    }
  };

  const handlePageChange = async (page: number) => {
    if (page < 1 || page > enrollmentPageCount) {
      return;
    }

    setSearching(true);

    try {
      const res = await getAdminEnrollments(buildEnrollmentParams(page));
      applyEnrollmentResponse(res.data, page);
    } catch (error) {
      console.error('Error loading page:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(key);
    setSortDirection('asc');
  };

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    clearSearchDebounce();
    searchDebounceRef.current = setTimeout(() => {
      void handleSearch();
    }, 300);

    return clearSearchDebounce;
  }, [searchTerm, statusFilter, paymentMethodFilter, socialQuotaFilter, empireFilter]);

  const visibleEnrollments = [...enrollments].sort((a, b) => {
    const comparison = compareEnrollmentValues(a, b, sortKey);
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const isBusy = loading || searching;

  const exportToCSV = async () => {
    setExporting(true);

    try {
      const filters = buildEnrollmentParams(1);
      let page = 1;
      let allEnrollments: Enrollment[] = [];

      while (true) {
        const response = await getAdminEnrollments({
          ...filters,
          page,
          page_size: 100,
        });

        const data = response.data;
        const results = Array.isArray(data) ? data : data.results || [];
        allEnrollments = allEnrollments.concat(results);

        if (Array.isArray(data) || !data.next || results.length === 0) {
          break;
        }

        page += 1;
      }

      const headers = [
        'ID', 'Nome Completo', 'Email', 'Telefone', 'CPF', 'RG',
        'Data Nascimento', 'Membro Batista Capital',
        'Igreja', 'Líder PG', 'Já Participou do ZION', 'Império',
        'Nome do Responsável', 'Email do Responsável', 'Telefone do Responsável',
        'Produto', 'Lote', 'Status',
        'Método Pagamento', 'Parcelas', 'Valor Total', 'Desconto',
        'Valor Final', 'Observações', 'Data Inscrição', 'Data Pagamento'
      ];
      const rows = allEnrollments.map(e => [
        e.id,
        e.form_data?.nome_completo || '',
        e.user_email,
        e.form_data?.telefone || '',
        formatCpfForCsv(e.form_data?.cpf),
        e.form_data?.rg || '',
        e.form_data?.data_nascimento || '',
        e.form_data?.membro_batista_capital || '',
        e.form_data?.igreja || '',
        e.form_data?.lider_pg || '',
        e.form_data?.ja_participou_zion || '',
        e.form_data?.imperio_zion || '',
        e.form_data?.responsavel?.nome_responsavel || '',
        e.form_data?.responsavel?.email_responsavel || '',
        e.form_data?.responsavel?.telefone_responsavel || '',
        e.product?.name || '',
        e.batch?.name || '',
        e.status,
        e.payment_method === 'PIX_CASH' ? 'PIX à Vista' :
        e.payment_method === 'PIX_INSTALLMENT' ? 'PIX Parcelado' :
        e.payment_method === 'CREDIT_CARD' ? 'Cartão de Crédito' : '',
        e.installments || '',
        e.total_amount || '',
        e.discount_amount || '',
        e.final_amount,
        e.form_data?.observacoes || '',
        new Date(e.created_at).toLocaleDateString('pt-BR'),
        e.paid_at ? new Date(e.paid_at).toLocaleDateString('pt-BR') : ''
      ]);

      const csvContent = [
        headers.map(escapeCsvCell).join(','),
        ...rows.map(row => row.map(escapeCsvCell).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `inscricoes_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } catch (error) {
      console.error('Error exporting CSV:', error);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <AdminShell>
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'rgb(165, 44, 240)' }}></div>
            <p className="mt-4 text-gray-600">Carregando inscrições...</p>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="min-h-screen">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Inscritos</h1>
            <p className="mt-1 text-sm text-gray-600">Lista completa de inscrições, com filtros, exportação e detalhes.</p>
          </div>
          <button
            onClick={exportToCSV}
            disabled={exporting}
            className="flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm sm:text-base disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{exporting ? 'Exportando CSV' : 'Exportar CSV'}</span>
            <span className="sm:hidden">{exporting ? '...' : 'CSV'}</span>
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-3 sm:p-6">
          <div className="flex flex-col gap-4 mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
              <h2 className="text-lg sm:text-2xl font-bold">Inscrições</h2>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <p>{enrollmentCount} inscrições no total</p>
                {isBusy && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-purple/10 px-2 py-1 text-xs font-medium text-purple">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-purple" />
                    Buscando...
                  </span>
                )}
              </div>
            </div>

            <form
              className="flex flex-col sm:flex-row gap-2 sm:gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSearch();
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  disabled={isBusy}
                  className="w-full pl-9 sm:pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple text-sm sm:text-base text-gray-900 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-4">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  disabled={isBusy}
                  className="min-w-0 w-full px-2 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple text-sm sm:text-base text-gray-900 bg-white"
                >
                  <option value="">Status</option>
                  <option value="PENDING_PAYMENT">Pendente</option>
                  <option value="PAID">Pago</option>
                  <option value="CANCELLED">Cancelado</option>
                </select>

                <select
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value)}
                  disabled={isBusy}
                  className="min-w-0 w-full px-2 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple text-sm sm:text-base text-gray-900 bg-white"
                >
                  <option value="">Forma</option>
                  <option value="PIX_CASH">PIX</option>
                  <option value="PIX_INSTALLMENT">PIX Parc.</option>
                  <option value="CREDIT_CARD">Cartão</option>
                </select>

                <select
                  value={socialQuotaFilter}
                  onChange={(e) => setSocialQuotaFilter(e.target.value)}
                  disabled={isBusy}
                  className="min-w-0 w-full px-2 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple text-sm sm:text-base text-gray-900 bg-white"
                >
                  <option value="">Todos</option>
                  <option value="true">Só cota social</option>
                  <option value="false">Sem cota social</option>
                </select>

                <select
                  value={empireFilter}
                  onChange={(e) => setEmpireFilter(e.target.value)}
                  disabled={isBusy}
                  className="min-w-0 w-full px-2 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple text-sm sm:text-base text-gray-900 bg-white"
                >
                  <option value="">Império</option>
                  <option value="egito">Egito</option>
                  <option value="persia">Pérsia</option>
                  <option value="grecia">Grécia</option>
                  <option value="roma">Roma</option>
                  <option value="none">Sem império</option>
                </select>

                <button
                  type="submit"
                  disabled={isBusy}
                  className="btn-primary col-span-2 flex items-center justify-center gap-1 px-3 sm:col-auto sm:gap-2 sm:px-4"
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">{isBusy ? 'Buscando...' : 'Filtrar'}</span>
                </button>
              </div>
            </form>
          </div>

          <div className="sm:hidden space-y-3">
            {visibleEnrollments.map((enrollment) => (
              <div
                key={enrollment.id}
                className="border rounded-lg p-3 hover:bg-gray-50"
                onClick={() => setSelectedEnrollment(enrollment)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm">{enrollment.form_data?.nome_completo || '-'}</p>
                    <p className="text-xs text-gray-500">#{enrollment.id}</p>
                    {enrollment.is_social_quota && (
                      <span className="mt-1 inline-flex rounded-full bg-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                        Cota social
                      </span>
                    )}
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: enrollment.status === 'PAID'
                        ? 'rgba(34, 197, 94, 0.2)'
                        : enrollment.status === 'PENDING_PAYMENT'
                        ? 'rgba(234, 179, 8, 0.2)'
                        : 'rgba(239, 68, 68, 0.2)',
                      color: enrollment.status === 'PAID'
                        ? 'rgb(22, 163, 74)'
                        : enrollment.status === 'PENDING_PAYMENT'
                        ? 'rgb(161, 98, 7)'
                        : 'rgb(220, 38, 38)'
                    }}
                  >
                    {enrollment.status === 'PAID' ? '✓ Pago' :
                     enrollment.status === 'PENDING_PAYMENT' ? '⏳ Pend.' :
                     enrollment.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{enrollment.form_data?.telefone || enrollment.user_email}</span>
                  <span className="font-semibold text-gray-900">R$ {enrollment.final_amount}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 lg:px-4 font-semibold text-sm">
                    <button type="button" onClick={() => handleSort('id')} className="inline-flex items-center gap-1">
                      ID
                      {sortIndicator(sortKey === 'id', sortDirection)}
                    </button>
                  </th>
                  <th className="text-left py-3 px-2 lg:px-4 font-semibold text-sm">
                    <button type="button" onClick={() => handleSort('nome')} className="inline-flex items-center gap-1">
                      Nome
                      {sortIndicator(sortKey === 'nome', sortDirection)}
                    </button>
                  </th>
                  <th className="text-left py-3 px-2 lg:px-4 font-semibold text-sm hidden lg:table-cell">
                    <button type="button" onClick={() => handleSort('email')} className="inline-flex items-center gap-1">
                      Email
                      {sortIndicator(sortKey === 'email', sortDirection)}
                    </button>
                  </th>
                  <th className="text-left py-3 px-2 lg:px-4 font-semibold text-sm hidden xl:table-cell">
                    <button type="button" onClick={() => handleSort('telefone')} className="inline-flex items-center gap-1">
                      Telefone
                      {sortIndicator(sortKey === 'telefone', sortDirection)}
                    </button>
                  </th>
                  <th className="text-left py-3 px-2 lg:px-4 font-semibold text-sm">
                    <button type="button" onClick={() => handleSort('status')} className="inline-flex items-center gap-1">
                      Status
                      {sortIndicator(sortKey === 'status', sortDirection)}
                    </button>
                  </th>
                  <th className="text-left py-3 px-2 lg:px-4 font-semibold text-sm hidden lg:table-cell">
                    <button type="button" onClick={() => handleSort('payment_method')} className="inline-flex items-center gap-1">
                      Pagamento
                      {sortIndicator(sortKey === 'payment_method', sortDirection)}
                    </button>
                  </th>
                  <th className="text-left py-3 px-2 lg:px-4 font-semibold text-sm">
                    <button type="button" onClick={() => handleSort('valor')} className="inline-flex items-center gap-1">
                      Valor
                      {sortIndicator(sortKey === 'valor', sortDirection)}
                    </button>
                  </th>
                  <th className="text-left py-3 px-2 lg:px-4 font-semibold text-sm">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleEnrollments.map((enrollment) => (
                  <tr key={enrollment.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-2 lg:px-4 text-sm">#{enrollment.id}</td>
                    <td className="py-3 px-2 lg:px-4 font-medium text-sm">
                      <div className="flex items-center gap-2">
                        <span>{enrollment.form_data?.nome_completo || '-'}</span>
                        {enrollment.is_social_quota && (
                          <span className="rounded-full bg-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                            Cota
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2 lg:px-4 text-sm hidden lg:table-cell">{enrollment.user_email}</td>
                    <td className="py-3 px-2 lg:px-4 text-sm hidden xl:table-cell">{enrollment.form_data?.telefone || '-'}</td>
                    <td className="py-3 px-2 lg:px-4">
                      <span
                        className="px-2 lg:px-3 py-1 rounded-full text-xs lg:text-sm font-medium whitespace-nowrap"
                        style={{
                          backgroundColor: enrollment.status === 'PAID'
                            ? 'rgba(34, 197, 94, 0.2)'
                            : enrollment.status === 'PENDING_PAYMENT'
                            ? 'rgba(234, 179, 8, 0.2)'
                            : 'rgba(239, 68, 68, 0.2)',
                          color: enrollment.status === 'PAID'
                            ? 'rgb(22, 163, 74)'
                            : enrollment.status === 'PENDING_PAYMENT'
                            ? 'rgb(161, 98, 7)'
                            : 'rgb(220, 38, 38)'
                        }}
                      >
                        {enrollment.status === 'PAID' ? '✓ Pago' :
                         enrollment.status === 'PENDING_PAYMENT' ? '⏳ Pend.' :
                         enrollment.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 lg:px-4 hidden lg:table-cell">
                      {enrollment.payment_method === 'PIX_INSTALLMENT' && enrollment.payments ? (
                        <div className="text-sm">
                          <span className="font-medium">
                            {enrollment.payments.filter((p: any) => p.status === 'CONFIRMED' || p.status === 'RECEIVED').length}/{enrollment.payments.length}
                          </span>
                          <span className="text-gray-500 ml-1">parc.</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">
                          {enrollment.payment_method === 'PIX_CASH' ? 'PIX' :
                           enrollment.payment_method === 'CREDIT_CARD' ? 'Cartão' : '-'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 lg:px-4 font-medium text-sm">R$ {enrollment.final_amount}</td>
                    <td className="py-3 px-2 lg:px-4">
                      <button
                        onClick={() => setSelectedEnrollment(enrollment)}
                        className="flex items-center gap-1 px-2 lg:px-3 py-1 text-xs lg:text-sm rounded-lg transition-colors"
                        style={{
                          backgroundColor: 'rgba(165, 44, 240, 0.1)',
                          color: 'rgb(165, 44, 240)'
                        }}
                      >
                        <Eye className="w-3 h-3 lg:w-4 lg:h-4" />
                        <span className="hidden lg:inline">Ver</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {enrollmentCount > 0 && (
            <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-gray-600">
                Página {enrollmentPage} de {enrollmentPageCount}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handlePageChange(enrollmentPage - 1)}
                  disabled={enrollmentPage <= 1}
                  className="px-3 py-2 rounded-lg border text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => void handlePageChange(enrollmentPage + 1)}
                  disabled={enrollmentPage >= enrollmentPageCount}
                  className="px-3 py-2 rounded-lg border text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>

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
                  {selectedEnrollment.is_social_quota && (
                    <div>
                      <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3" style={{ color: 'rgb(165, 44, 240)' }}>
                        Cota Social
                      </h3>
                      <div className="grid grid-cols-2 gap-2 sm:gap-4">
                        <div>
                          <label className="text-xs sm:text-sm text-gray-600">Arrecadado</label>
                          <p className="font-medium text-sm sm:text-base">
                            {formatCurrency(selectedEnrollment.social_raised_amount)}
                          </p>
                        </div>
                        <div>
                          <label className="text-xs sm:text-sm text-gray-600">Pago no sistema</label>
                          <p className="font-medium text-sm sm:text-base">
                            {formatCurrency(selectedEnrollment.social_paid_amount)}
                          </p>
                        </div>
                        <div>
                          <label className="text-xs sm:text-sm text-gray-600">Progresso total</label>
                          <p className="font-medium text-sm sm:text-base">
                            {formatCurrency(selectedEnrollment.social_total_progress)}
                          </p>
                        </div>
                        <div>
                          <label className="text-xs sm:text-sm text-gray-600">Faltante</label>
                          <p className="font-medium text-sm sm:text-base">
                            {formatCurrency(selectedEnrollment.social_remaining_amount)}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs sm:text-sm text-gray-600">Status</label>
                          <p className="font-medium text-sm sm:text-base">
                            {selectedEnrollment.social_is_completed ? 'Fechou valor' : 'Pendente'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

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
                        <p className="font-medium text-sm sm:text-base break-all">{selectedEnrollment.form_data?.email || selectedEnrollment.user_email || '-'}</p>
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

                  <div>
                    <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3" style={{ color: 'rgb(165, 44, 240)' }}>
                      Responsável
                    </h3>
                    <div className="grid grid-cols-2 gap-2 sm:gap-4">
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Nome do Responsável</label>
                        <p className="font-medium text-sm sm:text-base">{selectedEnrollment.form_data?.responsavel?.nome_responsavel || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Email do Responsável</label>
                        <p className="font-medium text-sm sm:text-base break-all">{selectedEnrollment.form_data?.responsavel?.email_responsavel || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Telefone do Responsável</label>
                        <p className="font-medium text-sm sm:text-base">{selectedEnrollment.form_data?.responsavel?.telefone_responsavel || '-'}</p>
                      </div>
                      {Object.entries(selectedEnrollment.form_data?.responsavel || {})
                        .filter(([key, value]) => !RESPONSAVEL_FIXED_LABELS[key] && value !== '' && value !== null && value !== false)
                        .map(([key, value]) => (
                          <div key={key}>
                            <label className="text-xs sm:text-sm text-gray-600">{formatResponsibleFieldLabel(key)}</label>
                            <p className="font-medium text-sm sm:text-base">{typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : String(value)}</p>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3" style={{ color: 'rgb(165, 44, 240)' }}>
                      Informações do Evento
                    </h3>
                    <div className="grid grid-cols-2 gap-2 sm:gap-4">
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Membro BC</label>
                        <p className="font-medium text-sm sm:text-base">{formatBooleanChoice(selectedEnrollment.form_data?.membro_batista_capital)}</p>
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
                      <div>
                        <label className="text-xs sm:text-sm text-gray-600">Já participou do ZION?</label>
                        <p className="font-medium text-sm sm:text-base">{formatBooleanChoice(selectedEnrollment.form_data?.ja_participou_zion)}</p>
                      </div>
                      {selectedEnrollment.form_data?.ja_participou_zion === 'sim' && (
                        <div>
                          <label className="text-xs sm:text-sm text-gray-600">Império</label>
                          <p className="font-medium text-sm sm:text-base">{formatEmpire(selectedEnrollment.form_data?.imperio_zion)}</p>
                        </div>
                      )}
                      <div className="col-span-2">
                        <label className="text-xs sm:text-sm text-gray-600">Observações</label>
                        <p className="font-medium text-sm sm:text-base whitespace-pre-wrap">{selectedEnrollment.form_data?.observacoes || '-'}</p>
                      </div>
                    </div>
                  </div>

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
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
