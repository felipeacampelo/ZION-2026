import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addFinanceRequestAttachment,
  cancelFinanceRequest,
  createFinanceRequest,
  getMyFinanceDashboard,
  type FinanceExpenseRequest,
  type FinanceMyDashboardResponse,
} from '../services/api';

const formatCurrency = (value?: string) =>
  Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    justification: '',
  });
  const [attachmentFiles, setAttachmentFiles] = useState<Record<number, File | null>>({});
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
        amount: form.amount,
        request_type: form.request_type,
        recipient_name: form.recipient_name,
        pix_key: form.pix_key,
        description: form.description,
        justification: form.justification,
      });
      setForm({
        rubric: '',
        amount: '',
        request_type: 'ADVANCE',
        recipient_name: '',
        pix_key: '',
        description: '',
        justification: '',
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
    await addFinanceRequestAttachment(requestId, { file });
    setAttachmentFiles((current) => ({ ...current, [requestId]: null }));
    await loadData();
  };

  const renderRequest = (request: FinanceExpenseRequest) => (
    <div key={request.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-gray-950">{request.rubric_name}</p>
          <p className="text-sm text-gray-500">{request.description}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{request.request_type_display}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-gray-950">R$ {formatCurrency(request.amount)}</p>
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{request.status}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-gray-700">{request.justification}</p>
      <div className="mt-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
        <p><span className="font-semibold text-gray-900">Favorecido:</span> {request.recipient_name}</p>
        <p className="mt-1"><span className="font-semibold text-gray-900">Chave PIX:</span> {request.pix_key}</p>
      </div>
      {request.rejection_reason && <p className="mt-2 text-sm font-medium text-red-600">{request.rejection_reason}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {['PENDING', 'UNDER_REVIEW'].includes(request.status) && (
          <button
            onClick={async () => { await cancelFinanceRequest(request.id); await loadData(); }}
            className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
          >
            Cancelar
          </button>
        )}
        <input
          type="file"
          onChange={(event) => setAttachmentFiles((current) => ({ ...current, [request.id]: event.target.files?.[0] || null }))}
          className="text-sm text-gray-600"
        />
        <button
          onClick={() => handleUpload(request.id)}
          className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white"
        >
          Anexar arquivo
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(220,253,97,0.25),_transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-8 lg:px-8">
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
          <Link to="/" className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm">Voltar ao site</Link>
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
              <div className={cardClass}><p className="text-xs uppercase tracking-[0.18em] text-gray-500">Disponível</p><p className="mt-3 text-2xl font-black text-gray-950">R$ {formatCurrency(dashboard.summary.available_amount)}</p></div>
              <div className={cardClass}><p className="text-xs uppercase tracking-[0.18em] text-gray-500">Em análise</p><p className="mt-3 text-2xl font-black text-gray-950">R$ {formatCurrency(dashboard.summary.pending_amount)}</p></div>
              <div className={cardClass}><p className="text-xs uppercase tracking-[0.18em] text-gray-500">Comprometido</p><p className="mt-3 text-2xl font-black text-gray-950">R$ {formatCurrency(dashboard.summary.committed_amount)}</p></div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <div className={cardClass}>
                <h2 className="text-lg font-black text-gray-950">Nova solicitação</h2>
                <form onSubmit={handleCreateRequest} className="mt-4 space-y-3">
                  <select className={inputClass} value={form.rubric} onChange={(e) => { setSuccessMessage(''); setForm((current) => ({ ...current, rubric: e.target.value })); }}>
                    <option value="">Selecione a rubrica</option>
                    {dashboard.rubrics.map((rubric) => (
                      <option key={rubric.id} value={rubric.id}>
                        {rubric.name} • disponível R$ {formatCurrency(rubric.summary.available_amount)}
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
                  <textarea className={`${inputClass} min-h-[100px]`} placeholder="Descrição detalhada" value={form.description} onChange={(e) => { setSuccessMessage(''); setForm((current) => ({ ...current, description: e.target.value })); }} />
                  <textarea className={`${inputClass} min-h-[120px]`} placeholder="Justificativa obrigatória" value={form.justification} onChange={(e) => { setSuccessMessage(''); setForm((current) => ({ ...current, justification: e.target.value })); }} />
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
                          <p className="font-semibold text-gray-950">R$ {formatCurrency(rubric.summary.available_amount)}</p>
                          <p className="text-gray-500">Disponível</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-black text-gray-950">Histórico</h2>
              <div className="mt-4 space-y-3">
                {dashboard.requests.map(renderRequest)}
                {!loading && dashboard.requests.length === 0 && <p className="text-sm text-gray-500">Nenhuma solicitação registrada para a sua área.</p>}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
