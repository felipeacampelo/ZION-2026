import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, Clock3, Trash2 } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import {
  createFinanceSupplier,
  createFinanceSupplierPayment,
  deleteFinanceSupplierPayment,
  getFinanceRubrics,
  getFinanceSupplierEligibleRequests,
  getFinanceSupplierPayments,
  getFinanceSuppliers,
  markFinanceSupplierPaymentPaid,
  updateFinanceSupplier,
  type FinanceRubric,
  type FinanceSupplier,
  type FinanceSupplierEligibleRequest,
  type FinanceSupplierPayment,
} from '../services/api';

const cardClass = 'rounded-3xl border border-white/80 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.07)]';
const inputClass = 'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-dark';
const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const formatCurrency = (value?: string) =>
  Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value?: string | null) => {
  if (!value) return 'Sem data';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
};

const getTodayMonth = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
};

const getTodayDate = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const getErrorMessage = (error: any) => {
  const payload = error?.response?.data;
  if (!payload) return error?.message || 'Não foi possível concluir a operação.';
  if (typeof payload === 'string') return payload;
  if (payload.detail) return payload.detail;
  const firstEntry = Object.entries(payload)[0];
  if (!firstEntry) return 'Não foi possível concluir a operação.';
  const [, value] = firstEntry;
  if (Array.isArray(value)) return value.join(' ');
  return String(value);
};

type CalendarDay = {
  key: string;
  dayNumber: number;
  isoDate: string;
  inCurrentMonth: boolean;
};

const buildCalendar = (month: string): CalendarDay[] => {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const startOffset = firstDay.getDay();
  const firstVisible = new Date(year, monthNumber - 1, 1 - startOffset);
  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(firstVisible);
    date.setDate(firstVisible.getDate() + index);
    const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return {
      key: isoDate,
      dayNumber: date.getDate(),
      isoDate,
      inCurrentMonth: date.getMonth() === monthNumber - 1,
    };
  });
};

export default function AdminFinanceSupplierCalendar() {
  const [month, setMonth] = useState(getTodayMonth());
  const [payments, setPayments] = useState<FinanceSupplierPayment[]>([]);
  const [suppliers, setSuppliers] = useState<FinanceSupplier[]>([]);
  const [rubrics, setRubrics] = useState<FinanceRubric[]>([]);
  const [eligibleRequests, setEligibleRequests] = useState<FinanceSupplierEligibleRequest[]>([]);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [rubricFilter, setRubricFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'PAID' | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [supplierForm, setSupplierForm] = useState({ name: '', notes: '' });
  const [paymentForm, setPaymentForm] = useState({
    supplier: '',
    expense_request: '',
    amount: '',
    scheduled_date: `${getTodayMonth()}-01`,
    notes: '',
  });

  const loadData = async (selectedMonth = month) => {
    setError('');
    try {
      const [paymentsRes, suppliersRes, rubricsRes, eligibleRequestsRes] = await Promise.all([
        getFinanceSupplierPayments({ month: selectedMonth }),
        getFinanceSuppliers(),
        getFinanceRubrics(),
        getFinanceSupplierEligibleRequests(),
      ]);
      setPayments(paymentsRes.data);
      setSuppliers(suppliersRes.data);
      setRubrics(rubricsRes.data);
      setEligibleRequests(eligibleRequestsRes.data);
    } catch (loadError: any) {
      setError('Não foi possível carregar o calendário de fornecedores.');
      console.error(loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(month);
  }, [month]);

  useEffect(() => {
    setPaymentForm((current) => ({
      ...current,
      scheduled_date: `${month}-01`,
    }));
  }, [month]);

  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.is_active),
    [suppliers],
  );

  const selectedRequest = useMemo(
    () => eligibleRequests.find((item) => String(item.id) === paymentForm.expense_request) || null,
    [eligibleRequests, paymentForm.expense_request],
  );

  const visiblePayments = useMemo(() => (
    payments.filter((payment) => {
      if (supplierFilter && String(payment.supplier) !== supplierFilter) return false;
      if (rubricFilter && String(payment.rubric) !== rubricFilter) return false;
      if (statusFilter && payment.status !== statusFilter) return false;
      return true;
    })
  ), [payments, supplierFilter, rubricFilter, statusFilter]);

  const paymentCountByDay = useMemo(() => {
    const map = new Map<string, FinanceSupplierPayment[]>();
    visiblePayments.forEach((payment) => {
      const bucket = map.get(payment.scheduled_date) || [];
      bucket.push(payment);
      map.set(payment.scheduled_date, bucket);
    });
    return map;
  }, [visiblePayments]);

  const calendarDays = useMemo(() => buildCalendar(month), [month]);

  const todayIso = getTodayDate();

  const navigateMonth = (direction: -1 | 1) => {
    const [year, monthNum] = month.split('-').map(Number);
    const date = new Date(year, monthNum - 1 + direction, 1);
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const [calYear, calMonthNum] = month.split('-').map(Number);
  const monthLabel = `${monthNames[calMonthNum - 1]} ${calYear}`;

  const summary = useMemo(() => {
    const pending = visiblePayments.filter((payment) => payment.status === 'PENDING');
    const paid = visiblePayments.filter((payment) => payment.status === 'PAID');
    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((acc, payment) => acc + Number(payment.amount || 0), 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((acc, payment) => acc + Number(payment.amount || 0), 0),
    };
  }, [visiblePayments]);

  const handleCreateSupplier = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await createFinanceSupplier(supplierForm);
      setSupplierForm({ name: '', notes: '' });
      setSuccessMessage('Fornecedor criado.');
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const handleToggleSupplier = async (supplier: FinanceSupplier) => {
    setError('');
    try {
      await updateFinanceSupplier(supplier.id, { is_active: !supplier.is_active });
      setSuccessMessage(`Fornecedor ${supplier.is_active ? 'desativado' : 'ativado'}.`);
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const handleCreatePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await createFinanceSupplierPayment({
        supplier: Number(paymentForm.supplier),
        expense_request: Number(paymentForm.expense_request),
        amount: paymentForm.amount,
        scheduled_date: paymentForm.scheduled_date,
        notes: paymentForm.notes || undefined,
      });
      setPaymentForm({
        supplier: '',
        expense_request: '',
        amount: '',
        scheduled_date: `${month}-01`,
        notes: '',
      });
      setSuccessMessage('Pagamento agendado no calendário.');
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const handleSelectRequest = (requestId: string) => {
    const requestSummary = eligibleRequests.find((item) => String(item.id) === requestId);
    setPaymentForm((current) => ({
      ...current,
      expense_request: requestId,
      amount: requestSummary?.remaining_amount || current.amount,
    }));
  };

  const handleMarkPaid = async (paymentId: number) => {
    setError('');
    try {
      await markFinanceSupplierPaymentPaid(paymentId, { paid_on: getTodayDate() });
      setSuccessMessage('Pagamento marcado como pago.');
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    setError('');
    try {
      await deleteFinanceSupplierPayment(paymentId);
      setSuccessMessage('Lançamento removido do calendário.');
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <section className={cardClass}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-dark/70">Financeiro</p>
              <h1 className="mt-2 text-3xl font-black text-gray-950">Calendário de fornecedores</h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-500">
                Controle os pagamentos previstos e pagos dos contratos, sempre vinculados a uma solicitação financeira já aprovada.
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => navigateMonth(-1)}
                className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-white hover:text-gray-900 hover:shadow-sm"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[148px] text-center text-sm font-bold text-gray-950">{monthLabel}</span>
              <button
                type="button"
                onClick={() => navigateMonth(1)}
                className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-white hover:text-gray-900 hover:shadow-sm"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {successMessage && <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</p>}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Pendentes</p>
            <p className="mt-3 text-3xl font-black text-amber-700">{summary.pendingCount}</p>
            <p className="mt-2 text-sm text-gray-500">R$ {formatCurrency(String(summary.pendingAmount))}</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Pagos</p>
            <p className="mt-3 text-3xl font-black text-emerald-700">{summary.paidCount}</p>
            <p className="mt-2 text-sm text-gray-500">R$ {formatCurrency(String(summary.paidAmount))}</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Fornecedores ativos</p>
            <p className="mt-3 text-3xl font-black text-gray-950">{activeSuppliers.length}</p>
            <p className="mt-2 text-sm text-gray-500">{suppliers.length} cadastrados no total</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Solicitações elegíveis</p>
            <p className="mt-3 text-3xl font-black text-gray-950">{eligibleRequests.length}</p>
            <p className="mt-2 text-sm text-gray-500">Pagamentos diretos aprovados com saldo para agendar</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
          <div className={`${cardClass} space-y-4`}>
            <div>
              <p className="text-sm font-semibold text-gray-950">Novo lançamento</p>
              <p className="mt-1 text-sm text-gray-500">Escolha a solicitação aprovada, defina a data e registre a parcela no calendário.</p>
            </div>
            <form className="space-y-4" onSubmit={handleCreatePayment}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Solicitação aprovada</label>
                  <select
                    className={inputClass}
                    value={paymentForm.expense_request}
                    onChange={(event) => handleSelectRequest(event.target.value)}
                    required
                  >
                    <option value="">Selecione</option>
                    {eligibleRequests.map((request) => (
                      <option key={request.id} value={request.id}>
                        #{request.id} • {request.rubric_name} • saldo R$ {formatCurrency(request.remaining_amount)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Fornecedor</label>
                  <select
                    className={inputClass}
                    value={paymentForm.supplier}
                    onChange={(event) => setPaymentForm((current) => ({ ...current, supplier: event.target.value }))}
                    required
                  >
                    <option value="">Selecione</option>
                    {activeSuppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {selectedRequest && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                  <p className="font-semibold text-gray-950">Solicitação #{selectedRequest.id}</p>
                  <p className="mt-1">{selectedRequest.description || 'Sem descrição'}</p>
                  <p className="mt-2">
                    {selectedRequest.area_name} • {selectedRequest.rubric_name}
                  </p>
                  <p className="mt-2">
                    Aprovado: R$ {formatCurrency(selectedRequest.amount)} • Já agendado: R$ {formatCurrency(selectedRequest.scheduled_amount)} • Disponível para lançar: R$ {formatCurrency(selectedRequest.remaining_amount)}
                  </p>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Valor</label>
                  <input
                    className={inputClass}
                    value={paymentForm.amount}
                    onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Data prevista</label>
                  <input
                    className={inputClass}
                    type="date"
                    value={paymentForm.scheduled_date}
                    onChange={(event) => setPaymentForm((current) => ({ ...current, scheduled_date: event.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Observação</label>
                  <input
                    className={inputClass}
                    value={paymentForm.notes}
                    onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <button className="rounded-2xl bg-dark px-4 py-3 text-sm font-semibold text-white" type="submit">
                Agendar pagamento
              </button>
            </form>
          </div>

          <div className={`${cardClass} space-y-4`}>
            <div>
              <p className="text-sm font-semibold text-gray-950">Cadastro de fornecedores</p>
              <p className="mt-1 text-sm text-gray-500">Mantenha a base usada no calendário sem depender de texto solto no lançamento.</p>
            </div>
            <form className="space-y-3" onSubmit={handleCreateSupplier}>
              <input
                className={inputClass}
                placeholder="Nome do fornecedor"
                value={supplierForm.name}
                onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
              <textarea
                className={`${inputClass} min-h-[96px]`}
                placeholder="Observações"
                value={supplierForm.notes}
                onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))}
              />
              <button className="rounded-2xl bg-gold px-4 py-3 text-sm font-semibold text-dark" type="submit">
                Criar fornecedor
              </button>
            </form>
            <div className="space-y-3 border-t border-gray-100 pt-3">
              {suppliers.map((supplier) => (
                <div key={supplier.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-950">{supplier.name}</p>
                      <p className="mt-1 text-sm text-gray-500">{supplier.notes || 'Sem observações'}</p>
                    </div>
                    <button
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${supplier.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}
                      onClick={() => handleToggleSupplier(supplier)}
                      type="button"
                    >
                      {supplier.is_active ? 'Ativo' : 'Inativo'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`${cardClass} overflow-hidden`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-gray-950">
              {monthLabel}
              {visiblePayments.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">{visiblePayments.length} lançamento{visiblePayments.length !== 1 ? 's' : ''}</span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 outline-none focus:border-dark"
                value={supplierFilter}
                onChange={(event) => setSupplierFilter(event.target.value)}
              >
                <option value="">Todos os fornecedores</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
              <select
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 outline-none focus:border-dark"
                value={rubricFilter}
                onChange={(event) => setRubricFilter(event.target.value)}
              >
                <option value="">Todas as rubricas</option>
                {rubrics.map((rubric) => (
                  <option key={rubric.id} value={rubric.id}>{rubric.name}</option>
                ))}
              </select>
              <select
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 outline-none focus:border-dark"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'PENDING' | 'PAID' | '')}
              >
                <option value="">Todos os status</option>
                <option value="PENDING">Pendentes</option>
                <option value="PAID">Pagos</option>
              </select>
            </div>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-gray-400">Carregando calendário...</p>
          ) : (
            <div className="grid gap-px overflow-hidden rounded-2xl border border-gray-100 bg-gray-100 lg:grid-cols-7">
              {weekdayLabels.map((label) => (
                <div key={label} className="bg-gray-50 px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
                  {label}
                </div>
              ))}
              {calendarDays.map((day) => {
                const items = paymentCountByDay.get(day.isoDate) || [];
                const isToday = day.isoDate === todayIso;
                return (
                  <div
                    key={day.key}
                    className={`min-h-[110px] bg-white p-2 ${!day.inCurrentMonth ? 'bg-gray-50/70' : ''}`}
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        isToday
                          ? 'bg-dark text-white'
                          : day.inCurrentMonth
                            ? 'text-gray-800'
                            : 'text-gray-300'
                      }`}>
                        {day.dayNumber}
                      </span>
                      {items.length > 1 && (
                        <span className="rounded-full bg-dark/8 px-1.5 py-0.5 text-[10px] font-semibold text-dark">
                          {items.length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {items.map((payment) => (
                        <div
                          key={payment.id}
                          className={`overflow-hidden rounded-lg border text-[11px] ${
                            payment.status === 'PAID'
                              ? 'border-emerald-100 bg-emerald-50'
                              : 'border-amber-100 bg-amber-50'
                          }`}
                        >
                          <div className="px-2 py-1.5">
                            <p className="truncate font-semibold text-gray-900">{payment.supplier_name}</p>
                            <p className={`font-bold ${payment.status === 'PAID' ? 'text-emerald-800' : 'text-amber-800'}`}>
                              R$ {formatCurrency(payment.amount)}
                            </p>
                          </div>
                          <div className={`flex items-center gap-2 border-t px-2 py-1 ${
                            payment.status === 'PAID' ? 'border-emerald-100' : 'border-amber-100'
                          }`}>
                            {payment.status === 'PAID' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                {formatDate(payment.paid_on)}
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleMarkPaid(payment.id)}
                                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-dark hover:underline"
                                >
                                  <Clock3 className="h-3 w-3" />
                                  Pagar
                                </button>
                                <span className="text-gray-300">·</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePayment(payment.id)}
                                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 hover:underline"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Remover
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
