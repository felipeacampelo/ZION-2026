import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ChevronDown, ChevronRight } from 'lucide-react';
import AttachmentPreviewModal from '../components/AttachmentPreviewModal';
import AdminShell from '../components/AdminShell';
import { formatCurrencyBRL } from '../utils/currency';
import {
  approveFinanceRequest,
  confirmFinanceAdvanceReturn,
  executeFinanceRequest,
  getFinanceAreas,
  getFinanceRequests,
  getFinanceRubrics,
  manualCloseFinanceAdvance,
  rejectFinanceRequest,
  resolveMediaUrl,
  reviewFinanceRequest,
  type FinanceArea,
  type FinanceAttachment,
  type FinanceAuditLog,
  type FinanceExpenseRequest,
  type FinanceRubric,
} from '../services/api';

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR') : 'Sem data';

const getAttachmentName = (fileUrl: string) => {
  const lastSegment = fileUrl.split('/').pop() || 'arquivo';
  return decodeURIComponent(lastSegment.split('?')[0]);
};

const getDepositReceipt = (request: FinanceExpenseRequest) =>
  request.execution?.attachments.find((a) => a.category === 'DEPOSIT_RECEIPT') || null;

const getExecutionReceipt = (request: FinanceExpenseRequest) =>
  request.execution?.attachments.find((a) => a.category === 'RECEIPT') || null;

const getSettlementProofs = (request: FinanceExpenseRequest) =>
  request.execution?.attachments.filter((a) => a.category === 'SETTLEMENT_PROOF') || [];

const getReturnReceipt = (request: FinanceExpenseRequest) =>
  request.execution?.attachments.find((a) => a.category === 'RETURN_RECEIPT') || null;

const getSupportingAttachments = (request: FinanceExpenseRequest) =>
  request.attachments.filter((a) => a.category === 'SUPPORTING');

const getAttachmentMap = (request: FinanceExpenseRequest) =>
  new Map(
    [...request.attachments, ...(request.execution?.attachments || [])].map((a) => [a.id, a]),
  );

const getAuditLabel = (log: FinanceAuditLog) => {
  const labels: Record<string, string> = {
    CREATED: 'Solicitação criada',
    UNDER_REVIEW: 'Em análise',
    APPROVED: 'Aprovada',
    REJECTED: 'Rejeitada',
    CANCELLED: 'Cancelada',
    EXECUTED: 'Executada',
    ATTACHMENT_ADDED: 'Arquivo anexado',
    ATTACHMENT_REPLACED: 'Arquivo substituído',
    ATTACHMENT_REMOVED: 'Arquivo removido',
    ADVANCE_SETTLEMENT_SUBMITTED: 'Prestação enviada',
    ADVANCE_RETURN_CONFIRMED: 'Devolução confirmada',
    ADVANCE_MANUALLY_CLOSED: 'Encerrado manualmente',
  };
  return labels[log.action] || log.action;
};

const getSettlementStatusConfig = (status?: string) => {
  const labels: Record<string, { label: string; className: string }> = {
    NOT_REQUIRED: { label: 'Sem prestação', className: 'bg-gray-100 text-gray-500' },
    PENDING_PROOF: { label: 'Pendente de prestação', className: 'bg-amber-100 text-amber-800' },
    PENDING_RETURN: { label: 'Pendente de devolução', className: 'bg-orange-100 text-orange-700' },
    SETTLED: { label: 'Prestação concluída', className: 'bg-emerald-100 text-emerald-800' },
    MANUALLY_CLOSED: { label: 'Encerrado manualmente', className: 'bg-slate-200 text-slate-700' },
  };
  return labels[status || 'NOT_REQUIRED'] || labels.NOT_REQUIRED;
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

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pendente', className: 'bg-amber-100 text-amber-800' },
  UNDER_REVIEW: { label: 'Em análise', className: 'bg-blue-100 text-blue-700' },
  APPROVED: { label: 'Aprovada', className: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Rejeitada', className: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Cancelada', className: 'bg-gray-100 text-gray-500' },
  EXECUTED: { label: 'Executada', className: 'bg-dark/10 text-dark' },
};

function StatusBadge({ status, isAwaitingExecution }: { status: string; isAwaitingExecution?: boolean }) {
  if (isAwaitingExecution) {
    return <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">Aguard. execução</span>;
  }
  const config = STATUS_CONFIG[status] || { label: status, className: 'bg-gray-100 text-gray-600' };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${config.className}`}>{config.label}</span>;
}

const cardClass = 'rounded-3xl border border-white/80 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.07)]';
const inputClass = 'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-dark';

export default function AdminFinanceApprovals() {
  const { canManageFinance } = useAuth();
  const [areas, setAreas] = useState<FinanceArea[]>([]);
  const [rubrics, setRubrics] = useState<FinanceRubric[]>([]);
  const [requests, setRequests] = useState<FinanceExpenseRequest[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [selectedRubricId, setSelectedRubricId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<number>>(new Set());
  const [selectedStatus, setSelectedStatus] = useState('');
  const [rejectingRequestId, setRejectingRequestId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [executingRequestId, setExecutingRequestId] = useState<number | null>(null);
  const [executionType, setExecutionType] = useState<'ADVANCE' | 'REIMBURSEMENT'>('ADVANCE');
  const [executionNotes, setExecutionNotes] = useState('');
  const [executionFile, setExecutionFile] = useState<File | null>(null);
  const [executionFeedback, setExecutionFeedback] = useState('');
  const [manualCloseRequestId, setManualCloseRequestId] = useState<number | null>(null);
  const [manualCloseNote, setManualCloseNote] = useState('');
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string } | null>(null);
  const [historyOpenIds, setHistoryOpenIds] = useState<Record<number, boolean>>({});

  const loadData = async () => {
    setError('');
    try {
      const [areasRes, rubricsRes, requestsRes] = await Promise.all([
        getFinanceAreas(),
        getFinanceRubrics(),
        getFinanceRequests(),
      ]);
      setAreas(areasRes.data);
      setRubrics(rubricsRes.data);
      setRequests(requestsRes.data);
    } catch (loadError: any) {
      setError('Não foi possível carregar as aprovações financeiras.');
      console.error(loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const toggleRequest = (id: number) => {
    setExpandedRequestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isRequestExpanded = (item: FinanceExpenseRequest) =>
    expandedRequestIds.has(item.id) ||
    rejectingRequestId === item.id ||
    executingRequestId === item.id;

  const filteredRubrics = useMemo(() => (
    selectedAreaId ? rubrics.filter((r) => String(r.area) === selectedAreaId) : rubrics
  ), [rubrics, selectedAreaId]);

  useEffect(() => {
    if (selectedRubricId && !filteredRubrics.some((r) => String(r.id) === selectedRubricId)) {
      setSelectedRubricId('');
    }
  }, [filteredRubrics, selectedRubricId]);

  const visibleRequests = useMemo(() => (
    requests.filter((r) => {
      if (selectedAreaId && String(r.area) !== selectedAreaId) return false;
      if (selectedRubricId && String(r.rubric) !== selectedRubricId) return false;
      if (selectedStatus && r.status !== selectedStatus) return false;
      return true;
    })
  ), [requests, selectedAreaId, selectedRubricId, selectedStatus]);

  const groupedRequests = useMemo(() => {
    const areaMap = new Map<number, { areaName: string; rubrics: Map<number, { rubricName: string; requests: FinanceExpenseRequest[] }> }>();
    visibleRequests.forEach((r) => {
      if (!areaMap.has(r.area)) areaMap.set(r.area, { areaName: r.area_name, rubrics: new Map() });
      const areaEntry = areaMap.get(r.area)!;
      if (!areaEntry.rubrics.has(r.rubric)) areaEntry.rubrics.set(r.rubric, { rubricName: r.rubric_name, requests: [] });
      areaEntry.rubrics.get(r.rubric)!.requests.push(r);
    });
    return Array.from(areaMap.entries()).map(([areaId, areaEntry]) => ({
      areaId,
      areaName: areaEntry.areaName,
      rubrics: Array.from(areaEntry.rubrics.entries()).map(([rubricId, rubricEntry]) => ({
        rubricId,
        rubricName: rubricEntry.rubricName,
        requests: rubricEntry.requests,
      })),
    }));
  }, [visibleRequests]);

  const sumAmount = (items: typeof visibleRequests) =>
    items.reduce((acc, r) => acc + Number(r.amount || 0), 0);

  const pendingItems = visibleRequests.filter((r) => ['PENDING', 'UNDER_REVIEW'].includes(r.status));
  const approvedItems = visibleRequests.filter((r) => r.status === 'APPROVED');
  const awaitingExecutionItems = visibleRequests.filter((r) => (
    r.status === 'APPROVED'
    && r.execution?.status === 'NOT_EXECUTED'
    && r.request_type !== 'DIRECT_PAYMENT'
  ));
  const pendingProofItems = visibleRequests.filter((r) => r.execution?.settlement_status === 'PENDING_PROOF');
  const pendingReturnItems = visibleRequests.filter((r) => r.execution?.settlement_status === 'PENDING_RETURN');

  const pendingCount = pendingItems.length;
  const approvedCount = approvedItems.length;
  const awaitingExecutionCount = awaitingExecutionItems.length;
  const pendingProofCount = pendingProofItems.length;
  const pendingReturnCount = pendingReturnItems.length;

  const submitRejection = async (requestId: number) => {
    try {
      setError('');
      await rejectFinanceRequest(requestId, rejectionReason);
      setSuccessMessage('Solicitação rejeitada com sucesso.');
      setRejectingRequestId(null);
      setRejectionReason('');
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const submitExecution = async (requestId: number) => {
    try {
      setError('');
      setExecutionFeedback('Enviando execução...');
      await executeFinanceRequest(requestId, { execution_type: executionType, notes: executionNotes, file: executionFile });
      setSuccessMessage(executionFile ? 'Execução registrada e comprovante anexado.' : 'Execução registrada com sucesso.');
      setExecutingRequestId(null);
      setExecutionType('ADVANCE');
      setExecutionNotes('');
      setExecutionFile(null);
      setExecutionFeedback('');
      await loadData();
    } catch (submitError: any) {
      setExecutionFeedback('');
      setError(getErrorMessage(submitError));
    }
  };

  const submitConfirmReturn = async (requestId: number) => {
    try {
      setError('');
      await confirmFinanceAdvanceReturn(requestId, 'Devolução confirmada pelo administrativo.');
      setSuccessMessage('Devolução confirmada com sucesso.');
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const submitManualClose = async (requestId: number) => {
    try {
      setError('');
      await manualCloseFinanceAdvance(requestId, manualCloseNote);
      setSuccessMessage('Prestação encerrada manualmente.');
      setManualCloseRequestId(null);
      setManualCloseNote('');
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  if (loading) return (
    <AdminShell>
      <div className="animate-pulse space-y-6">
        <div className="h-20 rounded-3xl bg-gray-100" />
        <div className="grid gap-4 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 rounded-3xl bg-gray-100" />)}
        </div>
        <div className="h-16 rounded-3xl bg-gray-100" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 rounded-3xl bg-gray-100" />)}
        </div>
      </div>
    </AdminShell>
  );

  return (
    <AdminShell>
      <AttachmentPreviewModal
        isOpen={Boolean(previewFile)}
        fileName={previewFile?.name || ''}
        fileUrl={previewFile?.url || ''}
        onClose={() => setPreviewFile(null)}
      />
      <div className="space-y-6">
        {/* Header */}
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-dark/70">Financeiro</p>
          <h1 className="mt-2 text-3xl font-black text-gray-950">Aprovações</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            Análise, aprovação e execução das solicitações financeiras por área e rubrica.
          </p>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {successMessage && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <span>{successMessage}</span>
            <button type="button" onClick={() => setSuccessMessage('')} className="flex-shrink-0 font-bold text-emerald-600 hover:text-emerald-900">✕</button>
          </div>
        )}

        {/* KPIs */}
        <section className="grid gap-4 sm:grid-cols-5">
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Em análise</p>
            <p className="mt-3 text-2xl font-black text-gray-950">{pendingCount}</p>
            {pendingCount > 0 && <p className="mt-1 text-xs text-gray-400">R$ {formatCurrencyBRL(sumAmount(pendingItems))}</p>}
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Aprovadas</p>
            <p className="mt-3 text-2xl font-black text-gray-950">{approvedCount}</p>
            {approvedCount > 0 && <p className="mt-1 text-xs text-gray-400">R$ {formatCurrencyBRL(sumAmount(approvedItems))}</p>}
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Aguardando execução</p>
            <p className="mt-3 text-2xl font-black text-gray-950">{awaitingExecutionCount}</p>
            {awaitingExecutionCount > 0 && <p className="mt-1 text-xs text-gray-400">R$ {formatCurrencyBRL(sumAmount(awaitingExecutionItems))}</p>}
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Pendente de prestação</p>
            <p className="mt-3 text-2xl font-black text-gray-950">{pendingProofCount}</p>
            {pendingProofCount > 0 && <p className="mt-1 text-xs text-gray-400">R$ {formatCurrencyBRL(sumAmount(pendingProofItems))}</p>}
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Pendente de devolução</p>
            <p className="mt-3 text-2xl font-black text-gray-950">{pendingReturnCount}</p>
            {pendingReturnCount > 0 && <p className="mt-1 text-xs text-gray-400">R$ {formatCurrencyBRL(sumAmount(pendingReturnItems))}</p>}
          </div>
        </section>

        {/* Filters — compact */}
        <section className={`${cardClass} py-4`}>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Filtrar:</p>
            <select
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-dark"
              value={selectedAreaId}
              onChange={(e) => setSelectedAreaId(e.target.value)}
            >
              <option value="">Todas as áreas</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>{area.name}</option>
              ))}
            </select>
            <select
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-dark"
              value={selectedRubricId}
              onChange={(e) => setSelectedRubricId(e.target.value)}
            >
              <option value="">Todas as rubricas</option>
              {filteredRubrics.map((rubric) => (
                <option key={rubric.id} value={rubric.id}>{rubric.name}</option>
              ))}
            </select>
            <select
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-dark"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">Todos os status</option>
              <option value="PENDING">Pendente</option>
              <option value="UNDER_REVIEW">Em análise</option>
              <option value="APPROVED">Aprovada</option>
              <option value="REJECTED">Rejeitada</option>
              <option value="CANCELLED">Cancelada</option>
              <option value="EXECUTED">Executada</option>
            </select>
            {(selectedAreaId || selectedRubricId || selectedStatus) && (
              <button
                type="button"
                onClick={() => { setSelectedAreaId(''); setSelectedRubricId(''); setSelectedStatus(''); }}
                className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 hover:text-gray-800"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </section>

        {/* Grouped requests */}
        <section className="space-y-5">
          {groupedRequests.map((areaGroup) => (
            <div key={areaGroup.areaId} className={cardClass}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Área</p>
                  <h2 className="mt-1 text-xl font-black text-gray-950">{areaGroup.areaName}</h2>
                </div>
                <span className="text-sm text-gray-400">
                  {areaGroup.rubrics.reduce((n, rg) => n + rg.requests.length, 0)} solicitações
                </span>
              </div>

              <div className="mt-4 space-y-4">
                {areaGroup.rubrics.map((rubricGroup) => (
                  <div key={rubricGroup.rubricId} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Rubrica</p>
                        <h3 className="mt-0.5 text-base font-black text-gray-950">{rubricGroup.rubricName}</h3>
                      </div>
                      <span className="text-xs text-gray-400">{rubricGroup.requests.length} registro{rubricGroup.requests.length !== 1 ? 's' : ''}</span>
                    </div>

                    <div className="space-y-2">
                      {rubricGroup.requests.map((item) => {
                        const isAwaitingExecution = item.status === 'APPROVED'
                          && item.execution?.status === 'NOT_EXECUTED'
                          && item.request_type !== 'DIRECT_PAYMENT';
                        const expanded = isRequestExpanded(item);
                        const depositReceipt = getDepositReceipt(item);
                        const executionReceipt = getExecutionReceipt(item);
                        const settlementProofs = getSettlementProofs(item);
                        const returnReceipt = getReturnReceipt(item);
                        const supportingAttachments = getSupportingAttachments(item);
                        const attachmentMap = getAttachmentMap(item);
                        const settlementConfig = getSettlementStatusConfig(item.execution?.settlement_status);
                        const historyOpen = Boolean(historyOpenIds[item.id]);

                        return (
                          <div key={item.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                            {/* Summary row — always visible */}
                            <div
                              className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                              onClick={() => toggleRequest(item.id)}
                            >
                              {expanded
                                ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                                : <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                              }
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-gray-950">{item.description}</p>
                                <p className="text-xs text-gray-400">{item.requester_email} • {item.request_type_display}</p>
                              </div>
                              <div className="flex flex-shrink-0 flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <p className="text-sm font-bold text-gray-950">R$ {formatCurrencyBRL(item.amount)}</p>
                                <StatusBadge status={item.status} isAwaitingExecution={isAwaitingExecution} />
                                {canManageFinance && item.status === 'PENDING' && (
                                  <button
                                    type="button"
                                    onClick={async () => { await reviewFinanceRequest(item.id, 'Em análise'); await loadData(); }}
                                    className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700"
                                  >
                                    Em análise
                                  </button>
                                )}
                                {canManageFinance && ['PENDING', 'UNDER_REVIEW'].includes(item.status) && (
                                  <button
                                    type="button"
                                    onClick={async () => { await approveFinanceRequest(item.id); await loadData(); }}
                                    className="rounded-xl bg-dark px-3 py-1.5 text-xs font-semibold text-white"
                                  >
                                    Aprovar
                                  </button>
                                )}
                                {canManageFinance && ['PENDING', 'UNDER_REVIEW'].includes(item.status) && (
                                  <button
                                    type="button"
                                    onClick={() => { setRejectingRequestId(item.id); setRejectionReason(''); }}
                                    className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"
                                  >
                                    Rejeitar
                                  </button>
                                )}
                                {canManageFinance && isAwaitingExecution && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExecutingRequestId(item.id);
                                      setExecutionType(
                                        item.execution?.execution_type === 'REIMBURSEMENT'
                                          ? 'REIMBURSEMENT'
                                          : 'ADVANCE'
                                      );
                                      setExecutionNotes('');
                                      setExecutionFile(null);
                                      setExecutionFeedback('');
                                    }}
                                    className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                                  >
                                    Executar
                                  </button>
                                )}
                                {canManageFinance && item.execution?.can_confirm_return && (
                                  <button
                                    type="button"
                                    onClick={() => submitConfirmReturn(item.id)}
                                    className="rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white"
                                  >
                                    Confirmar devolução
                                  </button>
                                )}
                                {canManageFinance && item.execution?.can_manual_close && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setManualCloseRequestId(item.id);
                                      setManualCloseNote(item.execution?.settlement_notes || '');
                                    }}
                                    className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                  >
                                    Encerrar manualmente
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Detail panel — expandable */}
                            {expanded && (
                              <div className="space-y-3 border-t border-gray-100 px-4 pb-4 pt-4">
                                {/* Recipient / PIX */}
                                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                                  <p><span className="font-semibold text-gray-900">Favorecido:</span> {item.recipient_name || 'Não informado'}</p>
                                  <p className="mt-1"><span className="font-semibold text-gray-900">Chave PIX:</span> {item.pix_key || 'Não informada'}</p>
                                  {item.rejection_reason && (
                                    <p className="mt-2 text-xs text-red-600"><span className="font-semibold">Motivo da rejeição:</span> {item.rejection_reason}</p>
                                  )}
                                </div>

                                {item.execution?.execution_type === 'ADVANCE' && item.execution?.status === 'EXECUTED' && (
                                  <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-sm font-semibold text-amber-900">Prestação de contas do adiantamento</p>
                                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${settlementConfig.className}`}>
                                        {settlementConfig.label}
                                      </span>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm text-amber-900">
                                      <div className="rounded-2xl bg-white/80 px-3 py-2">
                                        <p className="text-xs uppercase tracking-[0.16em] text-amber-700">Adiantado</p>
                                        <p className="mt-1 font-semibold">R$ {formatCurrencyBRL(item.execution.amount)}</p>
                                      </div>
                                      <div className="rounded-2xl bg-white/80 px-3 py-2">
                                        <p className="text-xs uppercase tracking-[0.16em] text-amber-700">Gasto informado</p>
                                        <p className="mt-1 font-semibold">R$ {formatCurrencyBRL(item.execution.spent_amount || '0')}</p>
                                      </div>
                                      <div className="rounded-2xl bg-white/80 px-3 py-2">
                                        <p className="text-xs uppercase tracking-[0.16em] text-amber-700">Valor a devolver</p>
                                        <p className="mt-1 font-semibold">R$ {formatCurrencyBRL(item.execution.returned_amount || '0')}</p>
                                      </div>
                                    </div>
                                    {item.execution.settlement_notes && (
                                      <p className="mt-3 text-sm text-amber-900">{item.execution.settlement_notes}</p>
                                    )}
                                  </div>
                                )}

                                {item.request_type === 'ADVANCE' ? (
                                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                                    <p className="text-sm font-semibold text-emerald-900">Comprovante de depósito do financeiro</p>
                                    {depositReceipt ? (
                                      <>
                                        <p className="mt-1 text-sm text-emerald-800">{getAttachmentName(depositReceipt.file)} • {formatDateTime(depositReceipt.created_at)}</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            onClick={() => setPreviewFile({ name: getAttachmentName(depositReceipt.file), url: resolveMediaUrl(depositReceipt.file) })}
                                            className="rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
                                          >
                                            Visualizar
                                          </button>
                                          <a href={resolveMediaUrl(depositReceipt.file)} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700">Nova aba</a>
                                          <a href={resolveMediaUrl(depositReceipt.file)} download className="rounded-xl border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800">Baixar</a>
                                        </div>
                                      </>
                                    ) : (
                                      <p className="mt-1 text-sm text-emerald-700">Nenhum comprovante de depósito anexado ainda.</p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                                    <p className="text-sm font-semibold text-emerald-900">Comprovante</p>
                                    {executionReceipt ? (
                                      <>
                                        <p className="mt-1 text-sm text-emerald-800">{getAttachmentName(executionReceipt.file)} • {formatDateTime(executionReceipt.created_at)}</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            onClick={() => setPreviewFile({ name: getAttachmentName(executionReceipt.file), url: resolveMediaUrl(executionReceipt.file) })}
                                            className="rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
                                          >
                                            Visualizar
                                          </button>
                                          <a href={resolveMediaUrl(executionReceipt.file)} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700">Nova aba</a>
                                          <a href={resolveMediaUrl(executionReceipt.file)} download className="rounded-xl border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800">Baixar</a>
                                        </div>
                                      </>
                                    ) : (
                                      <p className="mt-1 text-sm text-emerald-700">Nenhum comprovante de execução ainda.</p>
                                    )}
                                  </div>
                                )}

                                {settlementProofs.length > 0 && (
                                  <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                                    <p className="text-sm font-semibold text-amber-900">Comprovantes de compra</p>
                                    <div className="mt-2 space-y-2">
                                      {settlementProofs.map((attachment) => (
                                        <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 bg-white px-3 py-2">
                                          <div>
                                            <p className="text-sm font-medium text-gray-900">{getAttachmentName(attachment.file)}</p>
                                            <p className="text-xs text-amber-800">Anexado em {formatDateTime(attachment.created_at)}</p>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <button
                                              type="button"
                                              onClick={() => setPreviewFile({ name: getAttachmentName(attachment.file), url: resolveMediaUrl(attachment.file) })}
                                              className="rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white"
                                            >
                                              Visualizar
                                            </button>
                                            <a href={resolveMediaUrl(attachment.file)} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700">Nova aba</a>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {returnReceipt && (
                                  <div className="rounded-2xl border border-orange-200 bg-orange-50/80 px-4 py-3">
                                    <p className="text-sm font-semibold text-orange-900">Comprovante de devolução</p>
                                    <p className="mt-1 text-sm text-orange-800">{getAttachmentName(returnReceipt.file)} • {formatDateTime(returnReceipt.created_at)}</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setPreviewFile({ name: getAttachmentName(returnReceipt.file), url: resolveMediaUrl(returnReceipt.file) })}
                                        className="rounded-xl bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white"
                                      >
                                        Visualizar
                                      </button>
                                      <a href={resolveMediaUrl(returnReceipt.file)} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700">Nova aba</a>
                                    </div>
                                  </div>
                                )}

                                {/* Supporting attachments */}
                                {supportingAttachments.length > 0 && (
                                  <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                                    <p className="mb-2 text-sm font-semibold text-gray-900">Anexos de suporte</p>
                                    <div className="space-y-2">
                                      {supportingAttachments.map((attachment) => (
                                        <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2">
                                          <div>
                                            <p className="text-sm font-medium text-gray-900">{getAttachmentName(attachment.file)}</p>
                                            <p className="text-xs text-gray-400">Anexado em {formatDateTime(attachment.created_at)}</p>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <button
                                              type="button"
                                              onClick={() => setPreviewFile({ name: getAttachmentName(attachment.file), url: resolveMediaUrl(attachment.file) })}
                                              className="text-xs font-semibold text-dark"
                                            >
                                              Visualizar
                                            </button>
                                            <a href={resolveMediaUrl(attachment.file)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-gray-500">Nova aba</a>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Audit log */}
                                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                                  <button
                                    type="button"
                                    onClick={() => setHistoryOpenIds((current) => ({ ...current, [item.id]: !current[item.id] }))}
                                    className="flex w-full items-center justify-between text-left"
                                  >
                                    <p className="text-sm font-semibold text-gray-900">Histórico</p>
                                    <span className="text-xs font-semibold text-gray-500">{historyOpen ? 'Ocultar' : 'Mostrar'}</span>
                                  </button>
                                  {historyOpen && <div className="mt-2 space-y-2">
                                    {item.audit_logs.map((log) => {
                                      const linkedAttachment = ['ATTACHMENT_ADDED', 'ADVANCE_SETTLEMENT_SUBMITTED'].includes(log.action)
                                        ? attachmentMap.get(Number(log.metadata?.attachment_id))
                                        : null;
                                      return (
                                        <div key={log.id} className="rounded-xl border border-gray-100 bg-white px-3 py-2.5">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-gray-900">{getAuditLabel(log)}</p>
                                            <p className="text-xs text-gray-400">{formatDateTime(log.created_at)}</p>
                                          </div>
                                          <p className="mt-0.5 text-xs text-gray-400">{log.actor_email || 'Sistema'}</p>
                                          {log.note && <p className="mt-1.5 text-sm text-gray-700">{log.note}</p>}
                                          {linkedAttachment && (
                                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                                                {linkedAttachment.category === 'DEPOSIT_RECEIPT'
                                                  ? 'Depósito'
                                                  : linkedAttachment.category === 'SETTLEMENT_PROOF'
                                                    ? 'Compra'
                                                    : linkedAttachment.category === 'RETURN_RECEIPT'
                                                      ? 'Devolução'
                                                      : linkedAttachment.category === 'RECEIPT'
                                                        ? 'Comprovante'
                                                        : 'Anexo'}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => setPreviewFile({ name: getAttachmentName(linkedAttachment.file), url: resolveMediaUrl(linkedAttachment.file) })}
                                                className="font-semibold text-dark"
                                              >
                                                {getAttachmentName(linkedAttachment.file)}
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>}
                                </div>

                                {/* Rejection form */}
                                {rejectingRequestId === item.id && (
                                  <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                                    <p className="text-sm font-semibold text-red-700">Justificativa da rejeição</p>
                                    <textarea className={`${inputClass} mt-2 min-h-[100px] bg-white`} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
                                    <div className="mt-3 flex gap-2">
                                      <button type="button" onClick={() => submitRejection(item.id)} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white">Confirmar rejeição</button>
                                      <button type="button" onClick={() => { setRejectingRequestId(null); setRejectionReason(''); }} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                                    </div>
                                  </div>
                                )}

                                {manualCloseRequestId === item.id && (
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-700">Encerrar manualmente</p>
                                    <p className="mt-1 text-xs text-slate-600">
                                      Use esta opção quando a prestação não terá comprovante formal ou quando a devolução já foi resolvida fora do fluxo.
                                    </p>
                                    <textarea
                                      className={`${inputClass} mt-3 min-h-[100px] bg-white`}
                                      value={manualCloseNote}
                                      onChange={(e) => setManualCloseNote(e.target.value)}
                                      placeholder="Observação obrigatória"
                                    />
                                    <div className="mt-3 flex gap-2">
                                      <button type="button" onClick={() => submitManualClose(item.id)} className="rounded-xl bg-slate-700 px-3 py-2 text-xs font-semibold text-white">Confirmar encerramento</button>
                                      <button type="button" onClick={() => { setManualCloseRequestId(null); setManualCloseNote(''); }} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                                    </div>
                                  </div>
                                )}

                                {/* Execution form */}
                                {executingRequestId === item.id && (
                                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                                    <p className="text-sm font-semibold text-emerald-700">Executar solicitação</p>
                                    <p className="mt-1 text-xs text-emerald-700">
                                      {executionType === 'REIMBURSEMENT'
                                        ? 'Reembolso exige comprovante no momento da execução.'
                                        : 'Anexe o comprovante do depósito feito pelo financeiro.'}
                                    </p>
                                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                                      <select className={inputClass} value={executionType} onChange={(e) => setExecutionType(e.target.value as 'ADVANCE' | 'REIMBURSEMENT')}>
                                        <option value="ADVANCE">Adiantamento</option>
                                        <option value="REIMBURSEMENT">Reembolso</option>
                                      </select>
                                      <input type="file" className={inputClass} onChange={(e) => setExecutionFile(e.target.files?.[0] || null)} />
                                    </div>
                                    {executionFile && <p className="mt-2 text-xs text-emerald-700">Arquivo: {executionFile.name}</p>}
                                    {executionFeedback && <p className="mt-2 text-xs text-emerald-700">{executionFeedback}</p>}
                                    <textarea className={`${inputClass} mt-3 min-h-[80px] bg-white`} placeholder="Observações da execução" value={executionNotes} onChange={(e) => setExecutionNotes(e.target.value)} />
                                    <div className="mt-3 flex gap-2">
                                      <button type="button" onClick={() => submitExecution(item.id)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Confirmar execução</button>
                                      <button type="button" onClick={() => { setExecutingRequestId(null); setExecutionType('ADVANCE'); setExecutionNotes(''); setExecutionFile(null); setExecutionFeedback(''); }} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                                    </div>
                                    {executionType === 'REIMBURSEMENT' && (
                                      <p className="mt-2 text-xs text-emerald-700">Reembolso exige comprovante anexado.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {!loading && visibleRequests.length === 0 && (
            <div className={cardClass}>
              <p className="text-sm text-gray-500">Nenhuma solicitação encontrada para os filtros selecionados.</p>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
