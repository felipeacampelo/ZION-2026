import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AttachmentPreviewModal from '../components/AttachmentPreviewModal';
import { formatCurrencyBRL, normalizeCurrencyInput } from '../utils/currency';
import {
  addFinanceRequestAttachment,
  cancelFinanceRequest,
  createFinanceRequest,
  deleteFinanceRequestAttachment,
  getMyFinanceDashboard,
  replaceFinanceRequestAttachment,
  resolveMediaUrl,
  submitFinanceAdvanceSettlement,
  uploadFinanceAdvanceReturnReceipt,
  type FinanceAttachment,
  type FinanceAuditLog,
  type FinanceExpenseRequest,
  type FinanceMyDashboardResponse,
} from '../services/api';

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR') : 'Sem data';

const getAttachmentName = (fileUrl: string) => {
  const lastSegment = fileUrl.split('/').pop() || 'arquivo';
  return decodeURIComponent(lastSegment.split('?')[0]);
};

const getDepositReceipt = (request: FinanceExpenseRequest) =>
  request.execution?.attachments.find((attachment) => attachment.category === 'DEPOSIT_RECEIPT') || null;

const getExecutionReceipt = (request: FinanceExpenseRequest) =>
  request.execution?.attachments.find((attachment) => attachment.category === 'RECEIPT') || null;

const getSettlementProofs = (request: FinanceExpenseRequest) =>
  request.execution?.attachments.filter((attachment) => attachment.category === 'SETTLEMENT_PROOF') || [];

const getReturnReceipt = (request: FinanceExpenseRequest) =>
  request.execution?.attachments.find((attachment) => attachment.category === 'RETURN_RECEIPT') || null;

const getSupportingAttachments = (request: FinanceExpenseRequest) =>
  request.attachments.filter((attachment) => attachment.category === 'SUPPORTING');

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
    ATTACHMENT_REPLACED: 'Arquivo substituído',
    ATTACHMENT_REMOVED: 'Arquivo removido',
    ADVANCE_SETTLEMENT_SUBMITTED: 'Prestação enviada',
    ADVANCE_RETURN_CONFIRMED: 'Devolução confirmada',
    ADVANCE_MANUALLY_CLOSED: 'Encerrado manualmente',
  };
  return labels[log.action] || log.action;
};

const getSettlementStatusConfig = (status?: string) => {
  const map: Record<string, { label: string; className: string }> = {
    PENDING_PROOF: { label: 'Pendente de prestação', className: 'bg-amber-100 text-amber-800' },
    PENDING_RETURN: { label: 'Pendente de devolução', className: 'bg-orange-100 text-orange-700' },
    SETTLED: { label: 'Prestação concluída', className: 'bg-emerald-100 text-emerald-800' },
    MANUALLY_CLOSED: { label: 'Encerrado manualmente', className: 'bg-slate-200 text-slate-700' },
    NOT_REQUIRED: { label: 'Sem prestação', className: 'bg-gray-100 text-gray-500' },
  };
  return map[status || 'NOT_REQUIRED'] || map.NOT_REQUIRED;
};

type UploadState = {
  status: 'idle' | 'uploading' | 'success' | 'error';
  message: string;
  fileName: string;
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
  const [field, value] = firstEntry;
  if (Array.isArray(value)) {
    return `${field}: ${value.join(' ')}`;
  }
  return `${field}: ${String(value)}`;
};

const cardClass = 'rounded-3xl border border-white/80 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.07)]';
const inputClass = 'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-dark';

export default function FinanceWorkspace() {
  const [dashboard, setDashboard] = useState<FinanceMyDashboardResponse | null>(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    rubric: '',
    amount: '',
    request_type: 'ADVANCE' as 'ADVANCE' | 'REIMBURSEMENT' | 'DIRECT_PAYMENT',
    recipient_name: '',
    pix_key: '',
    description: '',
  });
  const [attachmentFiles, setAttachmentFiles] = useState<Record<number, File | null>>({});
  const [attachmentStates, setAttachmentStates] = useState<Record<number, UploadState>>({});
  const [attachmentInputKeys, setAttachmentInputKeys] = useState<Record<number, number>>({});
  const [replacementFiles, setReplacementFiles] = useState<Record<number, File | null>>({});
  const [replacementStates, setReplacementStates] = useState<Record<number, UploadState>>({});
  const [replacementInputKeys, setReplacementInputKeys] = useState<Record<number, number>>({});
  const [settlementForms, setSettlementForms] = useState<Record<number, { spent_amount: string; settlement_notes: string }>>({});
  const [settlementFiles, setSettlementFiles] = useState<Record<number, File[]>>({});
  const [settlementStates, setSettlementStates] = useState<Record<number, UploadState>>({});
  const [settlementInputKeys, setSettlementInputKeys] = useState<Record<number, number>>({});
  const [returnReceiptFiles, setReturnReceiptFiles] = useState<Record<number, File | null>>({});
  const [returnReceiptStates, setReturnReceiptStates] = useState<Record<number, UploadState>>({});
  const [returnReceiptInputKeys, setReturnReceiptInputKeys] = useState<Record<number, number>>({});
  const [historyOpenIds, setHistoryOpenIds] = useState<Record<number, boolean>>({});
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string } | null>(null);
  const needsBankDetails = form.request_type !== 'DIRECT_PAYMENT';

  const loadData = async () => {
    setError('');
    try {
      const response = await getMyFinanceDashboard();
      setDashboard(response.data);
    } catch (loadError: any) {
      setError(loadError.response?.data?.detail || 'Você ainda não possui área financeira vinculada.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setError('');
      await createFinanceRequest({
        rubric: Number(form.rubric),
        amount: normalizeCurrencyInput(form.amount),
        request_type: form.request_type,
        recipient_name: form.recipient_name,
        pix_key: form.pix_key,
        description: form.description,
      });
      setForm({
        rubric: '',
        amount: '',
        request_type: 'ADVANCE',
        recipient_name: '',
        pix_key: '',
        description: '',
      });
      setSuccessMessage('Solicitação enviada com sucesso.');
      await loadData();
    } catch (submitError: any) {
      setSuccessMessage('');
      setError(getErrorMessage(submitError));
    }
  };

  const handleUpload = async (requestId: number) => {
    const file = attachmentFiles[requestId];
    if (!file) return;
    setAttachmentStates((current) => ({
      ...current,
      [requestId]: {
        status: 'uploading',
        message: 'Enviando arquivo...',
        fileName: file.name,
      },
    }));
    try {
      await addFinanceRequestAttachment(requestId, { file });
      setAttachmentFiles((current) => ({ ...current, [requestId]: null }));
      setAttachmentStates((current) => ({
        ...current,
        [requestId]: {
          status: 'success',
          message: 'Arquivo anexado com sucesso.',
          fileName: file.name,
        },
      }));
      setAttachmentInputKeys((current) => ({ ...current, [requestId]: (current[requestId] || 0) + 1 }));
      await loadData();
    } catch (uploadError: any) {
      setAttachmentStates((current) => ({
        ...current,
        [requestId]: {
          status: 'error',
          message: getErrorMessage(uploadError),
          fileName: file.name,
        },
      }));
    }
  };

  const handleReplaceAttachment = async (requestId: number, attachment: FinanceAttachment) => {
    const file = replacementFiles[attachment.id];
    if (!file) return;

    setReplacementStates((current) => ({
      ...current,
      [attachment.id]: {
        status: 'uploading',
        message: 'Substituindo arquivo...',
        fileName: file.name,
      },
    }));

    try {
      await replaceFinanceRequestAttachment(requestId, attachment.id, { file });
      setReplacementFiles((current) => ({ ...current, [attachment.id]: null }));
      setReplacementStates((current) => ({
        ...current,
        [attachment.id]: {
          status: 'success',
          message: 'Arquivo substituído com sucesso.',
          fileName: file.name,
        },
      }));
      setReplacementInputKeys((current) => ({ ...current, [attachment.id]: (current[attachment.id] || 0) + 1 }));
      await loadData();
    } catch (replaceError: any) {
      setReplacementStates((current) => ({
        ...current,
        [attachment.id]: {
          status: 'error',
          message: getErrorMessage(replaceError),
          fileName: file.name,
        },
      }));
    }
  };

  const handleDeleteAttachment = async (requestId: number, attachment: FinanceAttachment) => {
    try {
      await deleteFinanceRequestAttachment(requestId, attachment.id);
      setReplacementFiles((current) => ({ ...current, [attachment.id]: null }));
      setReplacementStates((current) => ({
        ...current,
        [attachment.id]: {
          status: 'success',
          message: 'Anexo excluído com sucesso.',
          fileName: '',
        },
      }));
      setReplacementInputKeys((current) => ({ ...current, [attachment.id]: (current[attachment.id] || 0) + 1 }));
      await loadData();
    } catch (deleteError: any) {
      setReplacementStates((current) => ({
        ...current,
        [attachment.id]: {
          status: 'error',
          message: getErrorMessage(deleteError),
          fileName: '',
        },
      }));
    }
  };

  const handleSettlement = async (request: FinanceExpenseRequest) => {
    const values = settlementForms[request.id] || { spent_amount: '', settlement_notes: '' };
    const files = settlementFiles[request.id] || [];
    setSettlementStates((current) => ({
      ...current,
      [request.id]: {
        status: 'uploading',
        message: 'Enviando prestação de contas...',
        fileName: files.map((file) => file.name).join(', '),
      },
    }));
    try {
      await submitFinanceAdvanceSettlement(request.id, {
        spent_amount: normalizeCurrencyInput(values.spent_amount),
        settlement_notes: values.settlement_notes,
        files,
      });
      setSettlementStates((current) => ({
        ...current,
        [request.id]: {
          status: 'success',
          message: 'Prestação de contas enviada com sucesso.',
          fileName: files.map((file) => file.name).join(', '),
        },
      }));
      setSettlementFiles((current) => ({ ...current, [request.id]: [] }));
      setSettlementInputKeys((current) => ({ ...current, [request.id]: (current[request.id] || 0) + 1 }));
      await loadData();
    } catch (settlementError: any) {
      setSettlementStates((current) => ({
        ...current,
        [request.id]: {
          status: 'error',
          message: getErrorMessage(settlementError),
          fileName: files.map((file) => file.name).join(', '),
        },
      }));
    }
  };

  const handleReturnReceiptUpload = async (requestId: number) => {
    const file = returnReceiptFiles[requestId];
    if (!file) return;
    setReturnReceiptStates((current) => ({
      ...current,
      [requestId]: {
        status: 'uploading',
        message: 'Enviando comprovante de devolução...',
        fileName: file.name,
      },
    }));
    try {
      await uploadFinanceAdvanceReturnReceipt(requestId, file);
      setReturnReceiptFiles((current) => ({ ...current, [requestId]: null }));
      setReturnReceiptInputKeys((current) => ({ ...current, [requestId]: (current[requestId] || 0) + 1 }));
      setReturnReceiptStates((current) => ({
        ...current,
        [requestId]: {
          status: 'success',
          message: 'Comprovante de devolução anexado com sucesso.',
          fileName: file.name,
        },
      }));
      await loadData();
    } catch (uploadError: any) {
      setReturnReceiptStates((current) => ({
        ...current,
        [requestId]: {
          status: 'error',
          message: getErrorMessage(uploadError),
          fileName: file.name,
        },
      }));
    }
  };

  const renderRequest = (request: FinanceExpenseRequest) => {
    const depositReceipt = getDepositReceipt(request);
    const executionReceipt = getExecutionReceipt(request);
    const settlementProofs = getSettlementProofs(request);
    const returnReceipt = getReturnReceipt(request);
    const supportingAttachments = getSupportingAttachments(request);
    const attachmentMap = getAttachmentMap(request);
    const uploadState = attachmentStates[request.id];
    const selectedFile = attachmentFiles[request.id];
    const depositReceiptUrl = depositReceipt ? resolveMediaUrl(depositReceipt.file) : '';
    const executionReceiptUrl = executionReceipt ? resolveMediaUrl(executionReceipt.file) : '';
    const settlementState = settlementStates[request.id];
    const settlementForm = settlementForms[request.id] || { spent_amount: '', settlement_notes: '' };
    const selectedSettlementFiles = settlementFiles[request.id] || [];
    const settlementConfig = getSettlementStatusConfig(request.execution?.settlement_status);
    const hasAdvanceSettlementFlow = request.execution?.execution_type === 'ADVANCE' && request.execution?.status === 'EXECUTED';
    const historyOpen = Boolean(historyOpenIds[request.id]);
    const returnReceiptState = returnReceiptStates[request.id];
    const selectedReturnReceiptFile = returnReceiptFiles[request.id];

    return (
      <div key={request.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-bold text-gray-950">{request.rubric_name}</p>
            <p className="text-sm text-gray-500">{request.description}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{request.request_type_display}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-950">R$ {formatCurrencyBRL(request.amount)}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{request.status}</p>
          </div>
        </div>
        {(request.request_type !== 'DIRECT_PAYMENT' || request.recipient_name || request.pix_key) && (
          <div className="mt-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            <p><span className="font-semibold text-gray-900">Favorecido:</span> {request.recipient_name || 'Não informado'}</p>
            <p className="mt-1"><span className="font-semibold text-gray-900">Chave PIX:</span> {request.pix_key || 'Não informada'}</p>
          </div>
        )}
        {request.rejection_reason && <p className="mt-2 text-sm font-medium text-red-600">{request.rejection_reason}</p>}

        {request.request_type === 'ADVANCE' ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
            <p className="text-sm font-semibold text-emerald-900">Comprovante de depósito do financeiro</p>
            {depositReceipt ? (
              <>
                <p className="mt-1 text-sm text-emerald-800">
                  {getAttachmentName(depositReceipt.file)} • enviado em {formatDateTime(depositReceipt.created_at)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewFile({ name: getAttachmentName(depositReceipt.file), url: depositReceiptUrl })}
                    className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Visualizar
                  </button>
                  <a href={depositReceiptUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700">
                    Nova aba
                  </a>
                  <a href={depositReceiptUrl} download className="rounded-xl border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800">
                    Baixar comprovante
                  </a>
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-emerald-800">O financeiro ainda não anexou o comprovante de depósito.</p>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
            <p className="text-sm font-semibold text-emerald-900">Comprovante</p>
            {executionReceipt ? (
            <>
              <p className="mt-1 text-sm text-emerald-800">
                {getAttachmentName(executionReceipt.file)} • enviado em {formatDateTime(executionReceipt.created_at)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewFile({ name: getAttachmentName(executionReceipt.file), url: executionReceiptUrl })}
                  className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
                >
                  Visualizar
                </button>
                <a href={executionReceiptUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700">
                  Nova aba
                </a>
                <a href={executionReceiptUrl} download className="rounded-xl border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800">
                  Baixar comprovante
                </a>
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-emerald-800">Nenhum comprovante de execução anexado ainda.</p>
          )}
          </div>
        )}

        {hasAdvanceSettlementFlow && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-amber-900">Prestação de contas do adiantamento</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${settlementConfig.className}`}>
                {settlementConfig.label}
              </span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm text-amber-900">
              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.16em] text-amber-700">Adiantado</p>
                <p className="mt-1 font-semibold">R$ {formatCurrencyBRL(request.execution?.amount)}</p>
              </div>
              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.16em] text-amber-700">Gasto informado</p>
                <p className="mt-1 font-semibold">R$ {formatCurrencyBRL(request.execution?.spent_amount || '0')}</p>
              </div>
              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.16em] text-amber-700">Valor a devolver</p>
                <p className="mt-1 font-semibold">R$ {formatCurrencyBRL(request.execution?.returned_amount || '0')}</p>
              </div>
            </div>
            {request.execution?.settlement_notes && (
              <p className="mt-3 text-sm text-amber-900">{request.execution.settlement_notes}</p>
            )}
            <div className="mt-3 rounded-2xl border border-amber-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">Comprovantes de compra</p>
              {settlementProofs.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {settlementProofs.map((attachment) => (
                    <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{getAttachmentName(attachment.file)}</p>
                        <p className="text-xs text-amber-800">Enviado em {formatDateTime(attachment.created_at)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewFile({ name: getAttachmentName(attachment.file), url: resolveMediaUrl(attachment.file) })}
                          className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-semibold text-white"
                        >
                          Visualizar
                        </button>
                        <a href={resolveMediaUrl(attachment.file)} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700">
                          Nova aba
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-amber-800">Nenhum comprovante de compra anexado ainda.</p>
              )}
            </div>

            {(request.execution?.returned_amount && Number(request.execution.returned_amount) > 0) && (
              <div className="mt-3 rounded-2xl border border-orange-200 bg-white px-4 py-3">
                <p className="text-sm font-semibold text-orange-900">Comprovante de devolução</p>
                {returnReceipt ? (
                  <>
                    <p className="mt-1 text-sm text-orange-800">
                      {getAttachmentName(returnReceipt.file)} • enviado em {formatDateTime(returnReceipt.created_at)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewFile({ name: getAttachmentName(returnReceipt.file), url: resolveMediaUrl(returnReceipt.file) })}
                        className="rounded-xl bg-orange-700 px-3 py-2 text-xs font-semibold text-white"
                      >
                        Visualizar
                      </button>
                      <a href={resolveMediaUrl(returnReceipt.file)} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700">
                        Nova aba
                      </a>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-orange-800">Anexe o comprovante da devolução do saldo restante.</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <input
                        key={`${request.id}-${returnReceiptInputKeys[request.id] || 0}`}
                        type="file"
                        className="text-sm text-gray-600"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          setReturnReceiptFiles((current) => ({ ...current, [request.id]: file }));
                          setReturnReceiptStates((current) => ({
                            ...current,
                            [request.id]: {
                              status: 'idle',
                              message: file ? 'Arquivo pronto para envio.' : '',
                              fileName: file?.name || '',
                            },
                          }));
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleReturnReceiptUpload(request.id)}
                        disabled={!selectedReturnReceiptFile || returnReceiptState?.status === 'uploading'}
                        className="rounded-xl bg-orange-700 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {returnReceiptState?.status === 'uploading' ? 'Enviando...' : 'Anexar devolução'}
                      </button>
                    </div>
                    {returnReceiptState?.message && (
                      <p className={`mt-3 text-xs ${returnReceiptState.status === 'error' ? 'text-red-600' : returnReceiptState.status === 'success' ? 'text-emerald-700' : 'text-gray-600'}`}>
                        {returnReceiptState.message}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {request.execution?.can_submit_settlement && request.execution.settlement_status !== 'SETTLED' && request.execution.settlement_status !== 'MANUALLY_CLOSED' && (
              <div className="mt-4 rounded-2xl border border-dashed border-amber-300 bg-white px-4 py-4">
                <p className="text-sm font-semibold text-amber-900">Enviar prestação</p>
                <p className="mt-1 text-xs text-amber-800">
                  Informe quanto foi gasto. Se sobrou dinheiro, o sistema deixará a devolução pendente para o administrativo confirmar.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <input
                    className={inputClass}
                    placeholder="Valor efetivamente gasto"
                    value={settlementForm.spent_amount}
                    onChange={(event) => setSettlementForms((current) => ({
                      ...current,
                      [request.id]: {
                        ...settlementForm,
                        spent_amount: event.target.value,
                      },
                    }))}
                  />
                  <input
                    key={`${request.id}-${settlementInputKeys[request.id] || 0}`}
                    type="file"
                    multiple
                    className="text-sm text-gray-600"
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      setSettlementFiles((current) => ({ ...current, [request.id]: files }));
                      setSettlementStates((current) => ({
                        ...current,
                        [request.id]: {
                          status: 'idle',
                          message: files.length ? `${files.length} arquivo(s) pronto(s) para envio.` : '',
                          fileName: files.map((file) => file.name).join(', '),
                        },
                      }));
                    }}
                  />
                </div>
                <textarea
                  className={`${inputClass} mt-3 min-h-[90px]`}
                  placeholder="Observações da prestação"
                  value={settlementForm.settlement_notes}
                  onChange={(event) => setSettlementForms((current) => ({
                    ...current,
                    [request.id]: {
                      ...settlementForm,
                      settlement_notes: event.target.value,
                    },
                  }))}
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleSettlement(request)}
                    disabled={!settlementForm.spent_amount || settlementState?.status === 'uploading'}
                    className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {settlementState?.status === 'uploading' ? 'Enviando...' : 'Enviar prestação'}
                  </button>
                  {selectedSettlementFiles.length > 0 && <p className="text-xs text-gray-600">Arquivos selecionados: {selectedSettlementFiles.map((file) => file.name).join(', ')}</p>}
                </div>
                {settlementState?.message && (
                  <p
                    className={`mt-3 text-xs ${
                      settlementState.status === 'error'
                        ? 'text-red-600'
                        : settlementState.status === 'success'
                          ? 'text-emerald-700'
                          : 'text-gray-600'
                    }`}
                  >
                    {settlementState.message}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {supportingAttachments.length > 0 && (
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-900">Anexos de suporte</p>
            <div className="mt-3 space-y-2">
              {supportingAttachments.map((attachment) => (
                <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{getAttachmentName(attachment.file)}</p>
                    <p className="text-xs text-gray-500">Anexado em {formatDateTime(attachment.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewFile({ name: getAttachmentName(attachment.file), url: resolveMediaUrl(attachment.file) })}
                      className="text-xs font-semibold text-dark"
                    >
                      Visualizar
                    </button>
                    <a href={resolveMediaUrl(attachment.file)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-gray-500">
                      Nova aba
                    </a>
                    {attachment.can_manage && (
                      <>
                        <input
                          key={`${attachment.id}-${replacementInputKeys[attachment.id] || 0}`}
                          type="file"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            setReplacementFiles((current) => ({ ...current, [attachment.id]: file }));
                            setReplacementStates((current) => ({
                              ...current,
                              [attachment.id]: {
                                status: 'idle',
                                message: file ? 'Arquivo pronto para substituição.' : '',
                                fileName: file?.name || '',
                              },
                            }));
                          }}
                          className="text-xs text-gray-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleReplaceAttachment(request.id, attachment)}
                          disabled={!replacementFiles[attachment.id] || replacementStates[attachment.id]?.status === 'uploading'}
                          className="text-xs font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Substituir
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(request.id, attachment)}
                          className="text-xs font-semibold text-red-600"
                        >
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                  {attachment.can_manage && replacementStates[attachment.id]?.message && (
                    <div className="w-full text-xs">
                      <p
                        className={
                          replacementStates[attachment.id]?.status === 'error'
                            ? 'text-red-600'
                            : replacementStates[attachment.id]?.status === 'success'
                              ? 'text-emerald-700'
                              : 'text-gray-600'
                        }
                      >
                        {replacementStates[attachment.id]?.message}
                      </p>
                    </div>
                  )}
                  {!attachment.can_manage && attachment.uploaded_by_email && (
                    <div className="w-full text-xs text-gray-400">
                      Enviado por {attachment.uploaded_by_email}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">Anexar arquivo</p>
          <p className="mt-1 text-xs text-gray-500">
            {request.request_type === 'REIMBURSEMENT'
              ? 'Reembolso exige comprovante. Selecione o arquivo e envie por aqui.'
              : 'Você pode anexar comprovantes ou arquivos de suporte para facilitar a conferência.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              key={`${request.id}-${attachmentInputKeys[request.id] || 0}`}
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setAttachmentFiles((current) => ({ ...current, [request.id]: file }));
                setAttachmentStates((current) => ({
                  ...current,
                  [request.id]: {
                    status: 'idle',
                    message: file ? 'Arquivo pronto para envio.' : '',
                    fileName: file?.name || '',
                  },
                }));
              }}
              className="text-sm text-gray-600"
            />
            <button
              type="button"
              onClick={() => handleUpload(request.id)}
              disabled={!selectedFile || uploadState?.status === 'uploading'}
              className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadState?.status === 'uploading' ? 'Enviando...' : 'Anexar arquivo'}
            </button>
            {['PENDING', 'UNDER_REVIEW'].includes(request.status) && (
              <button
                type="button"
                onClick={async () => { await cancelFinanceRequest(request.id); await loadData(); }}
                className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
              >
                Cancelar
              </button>
            )}
          </div>
          {(selectedFile || uploadState?.message) && (
            <div className="mt-3 text-xs">
              {selectedFile && <p className="text-gray-600">Arquivo selecionado: {selectedFile.name}</p>}
              {uploadState?.message && (
                <p
                  className={
                    uploadState.status === 'error'
                      ? 'text-red-600'
                      : uploadState.status === 'success'
                        ? 'text-emerald-700'
                        : 'text-gray-600'
                  }
                >
                  {uploadState.message}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
          <button
            type="button"
            onClick={() => setHistoryOpenIds((current) => ({ ...current, [request.id]: !current[request.id] }))}
            className="flex w-full items-center justify-between text-left"
          >
            <p className="text-sm font-semibold text-gray-900">Histórico de ações</p>
            <span className="text-xs font-semibold text-gray-500">{historyOpen ? 'Ocultar' : 'Mostrar'}</span>
          </button>
          {historyOpen && (
            <div className="mt-3 space-y-3">
              {request.audit_logs.map((log) => {
              const linkedAttachment = ['ATTACHMENT_ADDED', 'ADVANCE_SETTLEMENT_SUBMITTED'].includes(log.action)
                ? attachmentMap.get(Number(log.metadata?.attachment_id))
                : null;
              return (
                <div key={log.id} className="rounded-xl border border-gray-100 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{getAuditLabel(log)}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(log.created_at)}</p>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{log.actor_email || 'Sistema'}</p>
                  {log.note && <p className="mt-2 text-sm text-gray-700">{log.note}</p>}
                  {linkedAttachment && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                        {linkedAttachment.category === 'DEPOSIT_RECEIPT'
                          ? 'Depósito'
                          : linkedAttachment.category === 'SETTLEMENT_PROOF'
                            ? 'Compra'
                            : linkedAttachment.category === 'RETURN_RECEIPT'
                              ? 'Devolução'
                              : linkedAttachment.category === 'RECEIPT'
                                ? 'Comprovante'
                                : 'Anexo de suporte'}
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
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(220,253,97,0.25),_transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-8 lg:px-8">
      <AttachmentPreviewModal
        isOpen={Boolean(previewFile)}
        fileName={previewFile?.name || ''}
        fileUrl={previewFile?.url || ''}
        onClose={() => setPreviewFile(null)}
      />
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-dark/70">Meu Financeiro</p>
            <h1 className="mt-2 text-3xl font-black text-gray-950">Solicitações da sua área</h1>
            {dashboard && (
              <p className="mt-2 text-sm text-gray-600">
                Área vinculada: <span className="font-semibold text-gray-900">{dashboard.area.name}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-right shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">CNPJ da Igreja</p>
              <p className="mt-0.5 font-mono text-sm font-bold text-gray-900">00.353.219/0001-74</p>
            </div>
            <Link to="/" className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm">Voltar ao site</Link>
          </div>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {successMessage && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        )}

        {dashboard && (
          <>
            <section className="grid gap-4 lg:grid-cols-4">
              <div className={cardClass}><p className="text-xs uppercase tracking-[0.18em] text-gray-500">Área</p><p className="mt-3 text-2xl font-black text-gray-950">{dashboard.area.name}</p></div>
              <div className={cardClass}><p className="text-xs uppercase tracking-[0.18em] text-gray-500">Disponível</p><p className="mt-3 text-2xl font-black text-gray-950">R$ {formatCurrencyBRL(dashboard.summary.available_amount)}</p></div>
              <div className={cardClass}><p className="text-xs uppercase tracking-[0.18em] text-gray-500">Em análise</p><p className="mt-3 text-2xl font-black text-gray-950">R$ {formatCurrencyBRL(dashboard.summary.pending_amount)}</p></div>
              <div className={cardClass}><p className="text-xs uppercase tracking-[0.18em] text-gray-500">Comprometido</p><p className="mt-3 text-2xl font-black text-gray-950">R$ {formatCurrencyBRL(dashboard.summary.committed_amount)}</p></div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <div className={cardClass}>
                <h2 className="text-lg font-black text-gray-950">Nova solicitação</h2>
                <form onSubmit={handleCreateRequest} className="mt-4 space-y-3">
                  <select className={inputClass} value={form.rubric} onChange={(e) => { setSuccessMessage(''); setForm((current) => ({ ...current, rubric: e.target.value })); }}>
                    <option value="">Selecione a rubrica</option>
                    {dashboard.rubrics.map((rubric) => (
                      <option key={rubric.id} value={rubric.id}>
                        {rubric.name} • disponível R$ {formatCurrencyBRL(rubric.summary.available_amount)}
                      </option>
                    ))}
                  </select>
                  <div className="space-y-2 rounded-2xl border border-gray-200 bg-white px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">Tipo de Solicitação</p>
                    <label className="flex items-center gap-3 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="request_type"
                        value="REIMBURSEMENT"
                        checked={form.request_type === 'REIMBURSEMENT'}
                        onChange={() => { setSuccessMessage(''); setForm((current) => ({ ...current, request_type: 'REIMBURSEMENT' })); }}
                      />
                      Reembolso
                    </label>
                    <label className="flex items-center gap-3 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="request_type"
                        value="ADVANCE"
                        checked={form.request_type === 'ADVANCE'}
                        onChange={() => { setSuccessMessage(''); setForm((current) => ({ ...current, request_type: 'ADVANCE' })); }}
                      />
                      Solicitação de transferência
                    </label>
                    <label className="flex items-center gap-3 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="request_type"
                        value="DIRECT_PAYMENT"
                        checked={form.request_type === 'DIRECT_PAYMENT'}
                        onChange={() => { setSuccessMessage(''); setForm((current) => ({ ...current, request_type: 'DIRECT_PAYMENT' })); }}
                      />
                      Pagamento direto
                    </label>
                  </div>
                  <input className={inputClass} placeholder="Valor da solicitação" value={form.amount} onChange={(e) => { setSuccessMessage(''); setForm((current) => ({ ...current, amount: e.target.value })); }} />
                  {needsBankDetails && (
                    <>
                      <input className={inputClass} placeholder="Nome do favorecido" value={form.recipient_name} onChange={(e) => { setSuccessMessage(''); setForm((current) => ({ ...current, recipient_name: e.target.value })); }} />
                      <input className={inputClass} placeholder="Chave PIX" value={form.pix_key} onChange={(e) => { setSuccessMessage(''); setForm((current) => ({ ...current, pix_key: e.target.value })); }} />
                    </>
                  )}
                  <textarea className={`${inputClass} min-h-[120px]`} placeholder="Descrição da verba solicitada" value={form.description} onChange={(e) => { setSuccessMessage(''); setForm((current) => ({ ...current, description: e.target.value })); }} />
                  <button className="rounded-2xl bg-dark px-4 py-3 text-sm font-semibold text-white" type="submit">Enviar solicitação</button>
                </form>
              </div>

              <div className={cardClass}>
                <h2 className="text-lg font-black text-gray-950">Rubricas da área</h2>
                <div className="mt-4 space-y-3">
                  {dashboard.rubrics.map((rubric) => (
                    <div key={rubric.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-bold text-gray-950">{rubric.name}</p>
                          <p className="text-sm text-gray-500">{rubric.description || 'Sem descrição'}</p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-semibold text-gray-950">R$ {formatCurrencyBRL(rubric.summary.available_amount)}</p>
                          <p className="text-gray-500">Disponível</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-black text-gray-950">Solicitações</h2>
              <div className="mt-4 space-y-3">
                {dashboard.requests.map(renderRequest)}
                {!loading && dashboard.requests.length === 0 && <p className="text-sm text-gray-500">Nenhuma solicitação registrada por você ainda.</p>}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
