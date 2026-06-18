import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/AdminShell';
import {
  approveFinanceRequest,
  executeFinanceRequest,
  getFinanceAreas,
  getFinanceRequests,
  getFinanceRubrics,
  rejectFinanceRequest,
  reviewFinanceRequest,
  type FinanceArea,
  type FinanceAttachment,
  type FinanceAuditLog,
  type FinanceExpenseRequest,
  type FinanceRubric,
} from '../services/api';

const formatCurrency = (value?: string) =>
  Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR') : 'Sem data';

const getAttachmentName = (fileUrl: string) => {
  const lastSegment = fileUrl.split('/').pop() || 'arquivo';
  return decodeURIComponent(lastSegment.split('?')[0]);
};

const getRequestReceipt = (request: FinanceExpenseRequest) =>
  request.execution?.attachments.find((attachment) => attachment.category === 'RECEIPT') || null;

const getSupportingAttachments = (request: FinanceExpenseRequest) =>
  request.attachments.filter((attachment) => attachment.category !== 'RECEIPT');

const getAttachmentMap = (request: FinanceExpenseRequest) =>
  new Map(
    [...request.attachments, ...(request.execution?.attachments || [])].map((attachment) => [attachment.id, attachment]),
  );

const getAuditLabel = (log: FinanceAuditLog) => {
  const labels: Record<string, string> = {
    CREATED: 'Solicitação criada',
    UNDER_REVIEW: 'Solicitação em análise',
    APPROVED: 'Solicitação aprovada',
    REJECTED: 'Solicitação rejeitada',
    CANCELLED: 'Solicitação cancelada',
    EXECUTED: 'Solicitação executada',
    ATTACHMENT_ADDED: 'Arquivo anexado',
  };
  return labels[log.action] || log.action;
};

const getErrorMessage = (error: any) => {
  const payload = error?.response?.data;
  if (!payload) {
    return error?.message || 'Não foi possível concluir a operação.';
  }
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload.detail) {
    return payload.detail;
  }
  const firstEntry = Object.entries(payload)[0];
  if (!firstEntry) {
    return 'Não foi possível concluir a operação.';
  }
  const [, value] = firstEntry;
  if (Array.isArray(value)) {
    return value.join(' ');
  }
  return String(value);
};

const cardClass = 'rounded-3xl border border-white/80 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.07)]';
const inputClass = 'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-dark';

export default function AdminFinanceApprovals() {
  const [areas, setAreas] = useState<FinanceArea[]>([]);
  const [rubrics, setRubrics] = useState<FinanceRubric[]>([]);
  const [requests, setRequests] = useState<FinanceExpenseRequest[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [selectedRubricId, setSelectedRubricId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [rejectingRequestId, setRejectingRequestId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [executingRequestId, setExecutingRequestId] = useState<number | null>(null);
  const [executionType, setExecutionType] = useState<'ADVANCE' | 'REIMBURSEMENT' | 'DIRECT_PAYMENT'>('ADVANCE');
  const [executionNotes, setExecutionNotes] = useState('');
  const [executionFile, setExecutionFile] = useState<File | null>(null);
  const [executionFeedback, setExecutionFeedback] = useState('');

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

  useEffect(() => {
    loadData();
  }, []);

  const filteredRubrics = useMemo(() => (
    selectedAreaId
      ? rubrics.filter((rubric) => String(rubric.area) === selectedAreaId)
      : rubrics
  ), [rubrics, selectedAreaId]);

  useEffect(() => {
    if (selectedRubricId && !filteredRubrics.some((rubric) => String(rubric.id) === selectedRubricId)) {
      setSelectedRubricId('');
    }
  }, [filteredRubrics, selectedRubricId]);

  const visibleRequests = useMemo(() => (
    requests.filter((request) => {
      if (selectedAreaId && String(request.area) !== selectedAreaId) {
        return false;
      }
      if (selectedRubricId && String(request.rubric) !== selectedRubricId) {
        return false;
      }
      return true;
    })
  ), [requests, selectedAreaId, selectedRubricId]);

  const groupedRequests = useMemo(() => {
    const areaMap = new Map<number, { areaName: string; rubrics: Map<number, { rubricName: string; requests: FinanceExpenseRequest[] }> }>();

    visibleRequests.forEach((request) => {
      if (!areaMap.has(request.area)) {
        areaMap.set(request.area, {
          areaName: request.area_name,
          rubrics: new Map(),
        });
      }

      const areaEntry = areaMap.get(request.area)!;
      if (!areaEntry.rubrics.has(request.rubric)) {
        areaEntry.rubrics.set(request.rubric, {
          rubricName: request.rubric_name,
          requests: [],
        });
      }

      areaEntry.rubrics.get(request.rubric)!.requests.push(request);
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

  const pendingCount = visibleRequests.filter((item) => ['PENDING', 'UNDER_REVIEW'].includes(item.status)).length;
  const approvedCount = visibleRequests.filter((item) => item.status === 'APPROVED').length;
  const awaitingExecutionCount = visibleRequests.filter((item) => item.status === 'APPROVED' && item.execution?.status === 'NOT_EXECUTED').length;

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
      await executeFinanceRequest(requestId, {
        execution_type: executionType,
        notes: executionNotes,
        file: executionFile,
      });
      setSuccessMessage(executionFile ? 'Execução registrada e comprovante anexado com sucesso.' : 'Execução registrada com sucesso.');
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

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-dark/70">Financeiro</p>
          <h1 className="mt-2 text-3xl font-black text-gray-950">Aprovações por área e rubrica</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Página dedicada para análise, aprovação, rejeição e execução das solicitações financeiras.
          </p>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {successMessage && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div>}

        <section className="grid gap-4 lg:grid-cols-3">
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Em análise</p>
            <p className="mt-3 text-2xl font-black text-gray-950">{pendingCount}</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Aprovadas</p>
            <p className="mt-3 text-2xl font-black text-gray-950">{approvedCount}</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Aguardando execução</p>
            <p className="mt-3 text-2xl font-black text-gray-950">{awaitingExecutionCount}</p>
          </div>
        </section>

        <section className={cardClass}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-900">Filtrar por área</p>
              <select className={inputClass} value={selectedAreaId} onChange={(e) => setSelectedAreaId(e.target.value)}>
                <option value="">Todas as áreas</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-900">Filtrar por rubrica</p>
              <select className={inputClass} value={selectedRubricId} onChange={(e) => setSelectedRubricId(e.target.value)}>
                <option value="">Todas as rubricas</option>
                {filteredRubrics.map((rubric) => (
                  <option key={rubric.id} value={rubric.id}>{rubric.name}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          {groupedRequests.map((areaGroup) => (
            <div key={areaGroup.areaId} className={cardClass}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Área</p>
                  <h2 className="mt-1 text-xl font-black text-gray-950">{areaGroup.areaName}</h2>
                </div>
                <span className="text-sm text-gray-500">
                  {areaGroup.rubrics.reduce((count, rubricGroup) => count + rubricGroup.requests.length, 0)} solicitações
                </span>
              </div>

              <div className="mt-4 space-y-5">
                {areaGroup.rubrics.map((rubricGroup) => (
                  <div key={rubricGroup.rubricId} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Rubrica</p>
                        <h3 className="mt-1 text-lg font-black text-gray-950">{rubricGroup.rubricName}</h3>
                      </div>
                      <span className="text-sm text-gray-500">{rubricGroup.requests.length} registros</span>
                    </div>

                    <div className="mt-4 space-y-4">
                      {rubricGroup.requests.map((item) => {
                        const receipt = getRequestReceipt(item);
                        const supportingAttachments = getSupportingAttachments(item);
                        const attachmentMap = getAttachmentMap(item);

                        return (
                          <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-bold text-gray-950">{item.rubric_name} • {item.area_name}</p>
                                <p className="text-sm text-gray-500">{item.requester_email}</p>
                                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{item.request_type_display}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {item.status === 'PENDING' && <button type="button" onClick={async () => { await reviewFinanceRequest(item.id, 'Em análise'); await loadData(); }} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700">Em análise</button>}
                                {['PENDING', 'UNDER_REVIEW'].includes(item.status) && <button type="button" onClick={async () => { await approveFinanceRequest(item.id); await loadData(); }} className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white">Aprovar</button>}
                                {['PENDING', 'UNDER_REVIEW'].includes(item.status) && <button type="button" onClick={() => { setRejectingRequestId(item.id); setRejectionReason(''); }} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Rejeitar</button>}
                                {item.status === 'APPROVED' && item.execution?.status === 'NOT_EXECUTED' && <button type="button" onClick={() => { setExecutingRequestId(item.id); setExecutionType(item.execution?.execution_type || item.request_type); setExecutionNotes(''); setExecutionFile(null); setExecutionFeedback(''); }} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Executar</button>}
                              </div>
                            </div>

                            <div className="mt-3 grid gap-3 lg:grid-cols-[120px_1fr_1fr]">
                              <div>
                                <p className="text-xs text-gray-500">Valor</p>
                                <p className="font-semibold text-gray-900">R$ {formatCurrency(item.amount)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Descrição</p>
                                <p className="text-sm text-gray-700">{item.description}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Status</p>
                                <p className="text-sm font-semibold text-gray-900">{item.status}</p>
                                {item.rejection_reason && <p className="mt-1 text-xs text-red-600">{item.rejection_reason}</p>}
                              </div>
                            </div>

                            <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                              <p><span className="font-semibold text-gray-900">Favorecido:</span> {item.recipient_name || 'Não informado'}</p>
                              <p className="mt-1"><span className="font-semibold text-gray-900">Chave PIX:</span> {item.pix_key || 'Não informada'}</p>
                            </div>

                            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
                              <p className="text-sm font-semibold text-emerald-900">Comprovante</p>
                              {receipt ? (
                                <>
                                  <p className="mt-1 text-sm text-emerald-800">
                                    {getAttachmentName(receipt.file)} • enviado em {formatDateTime(receipt.created_at)}
                                  </p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <a href={receipt.file} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">
                                      Ver comprovante
                                    </a>
                                    <a href={receipt.file} download className="rounded-xl border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800">
                                      Baixar comprovante
                                    </a>
                                  </div>
                                </>
                              ) : (
                                <p className="mt-1 text-sm text-emerald-800">Nenhum comprovante de execução anexado ainda.</p>
                              )}
                            </div>

                            {supportingAttachments.length > 0 && (
                              <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                <p className="text-sm font-semibold text-gray-900">Anexos de suporte</p>
                                <div className="mt-3 space-y-2">
                                  {supportingAttachments.map((attachment) => (
                                    <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2">
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">{getAttachmentName(attachment.file)}</p>
                                        <p className="text-xs text-gray-500">Anexado em {formatDateTime(attachment.created_at)}</p>
                                      </div>
                                      <a href={attachment.file} target="_blank" rel="noreferrer" className="text-xs font-semibold text-dark">
                                        Abrir anexo
                                      </a>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                              <p className="text-sm font-semibold text-gray-900">Histórico de ações</p>
                              <div className="mt-3 space-y-3">
                                {item.audit_logs.map((log) => {
                                  const linkedAttachment = log.action === 'ATTACHMENT_ADDED'
                                    ? attachmentMap.get(Number(log.metadata?.attachment_id))
                                    : null;
                                  return (
                                    <div key={log.id} className="rounded-xl border border-gray-100 bg-white px-3 py-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm font-semibold text-gray-900">{getAuditLabel(log)}</p>
                                        <p className="text-xs text-gray-500">{formatDateTime(log.created_at)}</p>
                                      </div>
                                      <p className="mt-1 text-xs text-gray-500">{log.actor_email || 'Sistema'}</p>
                                      {log.note && <p className="mt-2 text-sm text-gray-700">{log.note}</p>}
                                      {linkedAttachment && (
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                          <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                                            {linkedAttachment.category === 'RECEIPT' ? 'Comprovante' : 'Anexo de suporte'}
                                          </span>
                                          <a href={linkedAttachment.file} target="_blank" rel="noreferrer" className="font-semibold text-dark">
                                            {getAttachmentName(linkedAttachment.file)}
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {rejectingRequestId === item.id && (
                              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4">
                                <p className="text-sm font-semibold text-red-700">Justificativa da rejeição</p>
                                <textarea className={`${inputClass} mt-2 min-h-[100px] bg-white`} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
                                <div className="mt-3 flex gap-2">
                                  <button type="button" onClick={() => submitRejection(item.id)} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white">Confirmar rejeição</button>
                                  <button type="button" onClick={() => { setRejectingRequestId(null); setRejectionReason(''); }} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                                </div>
                              </div>
                            )}

                            {executingRequestId === item.id && (
                              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                                <p className="text-sm font-semibold text-emerald-700">Executar solicitação</p>
                                <p className="mt-1 text-xs text-emerald-700">
                                  {executionType === 'REIMBURSEMENT'
                                    ? 'Reembolso exige comprovante no momento da execução.'
                                    : 'Anexe um comprovante se quiser deixar a transferência ou o pagamento documentado.'}
                                </p>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  <select className={inputClass} value={executionType} onChange={(e) => setExecutionType(e.target.value as 'ADVANCE' | 'REIMBURSEMENT' | 'DIRECT_PAYMENT')}>
                                    <option value="ADVANCE">Adiantamento</option>
                                    <option value="REIMBURSEMENT">Reembolso</option>
                                    <option value="DIRECT_PAYMENT">Pagamento direto</option>
                                  </select>
                                  <input type="file" className={inputClass} onChange={(e) => setExecutionFile(e.target.files?.[0] || null)} />
                                </div>
                                {executionFile && <p className="mt-2 text-xs text-emerald-700">Arquivo selecionado: {executionFile.name}</p>}
                                {executionFeedback && <p className="mt-2 text-xs text-emerald-700">{executionFeedback}</p>}
                                <textarea className={`${inputClass} mt-3 min-h-[100px] bg-white`} placeholder="Observações da execução" value={executionNotes} onChange={(e) => setExecutionNotes(e.target.value)} />
                                <div className="mt-3 flex gap-2">
                                  <button type="button" onClick={() => submitExecution(item.id)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Confirmar execução</button>
                                  <button type="button" onClick={() => { setExecutingRequestId(null); setExecutionType('ADVANCE'); setExecutionNotes(''); setExecutionFile(null); setExecutionFeedback(''); }} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                                </div>
                                {executionType === 'REIMBURSEMENT' && (
                                  <p className="mt-2 text-xs text-emerald-700">Reembolso exige comprovante anexado no envio.</p>
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
