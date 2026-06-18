import { useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell';
import {
  approveFinanceRequest,
  createFinanceArea,
  createFinanceRubric,
  deleteFinanceArea,
  deleteFinanceRubric,
  executeFinanceRequest,
  exportAdminFinanceReportCsv,
  getAdminFinanceReports,
  getAdminFinanceSummary,
  getFinanceAreas,
  getFinanceLeaderCandidates,
  getFinanceRequests,
  getFinanceRubrics,
  rejectFinanceRequest,
  reviewFinanceRequest,
  updateFinanceArea,
  updateFinanceRubric,
  type FinanceArea,
  type FinanceExpenseRequest,
  type FinanceGlobalSummary,
  type FinanceReportResponse,
  type FinanceRubric,
  type FinanceUserOption,
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
  const labels: Record<string, string> = {
    leader_id: 'Líder principal',
    allocated_amount: 'Valor orçado',
  };
  const label = labels[field] || field;
  if (Array.isArray(value)) {
    return `${label}: ${value.join(' ')}`;
  }
  return `${label}: ${String(value)}`;
};

const cardClass = 'rounded-3xl border border-white/80 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.07)]';
const inputClass = 'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-dark';

export default function AdminFinance() {
  const [summary, setSummary] = useState<FinanceGlobalSummary | null>(null);
  const [report, setReport] = useState<FinanceReportResponse | null>(null);
  const [areas, setAreas] = useState<FinanceArea[]>([]);
  const [rubrics, setRubrics] = useState<FinanceRubric[]>([]);
  const [requests, setRequests] = useState<FinanceExpenseRequest[]>([]);
  const [leaders, setLeaders] = useState<FinanceUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [areaForm, setAreaForm] = useState({ name: '', description: '', allocated_amount: '', leader_id: '' });
  const [rubricForm, setRubricForm] = useState({ area: '', name: '', description: '', allocated_amount: '' });
  const [editingAreaId, setEditingAreaId] = useState<number | null>(null);
  const [editingAreaAmount, setEditingAreaAmount] = useState('');
  const [editingAreaLeaderId, setEditingAreaLeaderId] = useState('');
  const [editingRubricId, setEditingRubricId] = useState<number | null>(null);
  const [editingRubricAmount, setEditingRubricAmount] = useState('');
  const [rejectingRequestId, setRejectingRequestId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [executingRequestId, setExecutingRequestId] = useState<number | null>(null);
  const [executionType, setExecutionType] = useState<'ADVANCE' | 'REIMBURSEMENT'>('ADVANCE');
  const [executionNotes, setExecutionNotes] = useState('');
  const [executionFile, setExecutionFile] = useState<File | null>(null);

  const loadData = async () => {
    setError('');
    try {
      const [summaryRes, reportRes, areasRes, rubricsRes, requestsRes, leadersRes] = await Promise.all([
        getAdminFinanceSummary(),
        getAdminFinanceReports(),
        getFinanceAreas(),
        getFinanceRubrics(),
        getFinanceRequests(),
        getFinanceLeaderCandidates(),
      ]);
      setSummary(summaryRes.data);
      setReport(reportRes.data);
      setAreas(areasRes.data);
      setRubrics(rubricsRes.data);
      setRequests(requestsRes.data);
      setLeaders(leadersRes.data.results);
    } catch (loadError: any) {
      setError('Não foi possível carregar o módulo financeiro.');
      console.error(loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateArea = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createFinanceArea({
        ...areaForm,
        leader_id: areaForm.leader_id ? Number(areaForm.leader_id) : null,
      });
      setAreaForm({ name: '', description: '', allocated_amount: '', leader_id: '' });
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const handleCreateRubric = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createFinanceRubric({
        area: Number(rubricForm.area),
        name: rubricForm.name,
        description: rubricForm.description,
        allocated_amount: rubricForm.allocated_amount,
      });
      setRubricForm({ area: '', name: '', description: '', allocated_amount: '' });
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const startAreaEdit = (area: FinanceArea) => {
    setEditingAreaId(area.id);
    setEditingAreaAmount(area.budget.allocated_amount);
    setEditingAreaLeaderId(area.leader ? String(area.leader.id) : '');
  };

  const saveAreaEdit = async (areaId: number) => {
    try {
      await updateFinanceArea(areaId, {
        allocated_amount: editingAreaAmount,
        leader_id: editingAreaLeaderId ? Number(editingAreaLeaderId) : null,
      });
      setEditingAreaId(null);
      setEditingAreaAmount('');
      setEditingAreaLeaderId('');
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const startRubricEdit = (rubric: FinanceRubric) => {
    setEditingRubricId(rubric.id);
    setEditingRubricAmount(rubric.allocated_amount);
  };

  const saveRubricEdit = async (rubricId: number) => {
    await updateFinanceRubric(rubricId, { allocated_amount: editingRubricAmount });
    setEditingRubricId(null);
    setEditingRubricAmount('');
    await loadData();
  };

  const submitRejection = async (requestId: number) => {
    await rejectFinanceRequest(requestId, rejectionReason);
    setRejectingRequestId(null);
    setRejectionReason('');
    await loadData();
  };

  const submitExecution = async (requestId: number) => {
    await executeFinanceRequest(requestId, {
      execution_type: executionType,
      notes: executionNotes,
      file: executionFile,
    });
    setExecutingRequestId(null);
    setExecutionType('ADVANCE');
    setExecutionNotes('');
    setExecutionFile(null);
    await loadData();
  };

  const handleExportCsv = async () => {
    const response = await exportAdminFinanceReportCsv();
    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financeiro_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-dark/70">Controle Financeiro</p>
          <h1 className="mt-2 text-3xl font-black text-gray-950">Receita líquida, orçamento e execução</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            O teto do módulo vem da receita líquida das inscrições. A distribuição por área é manual, mas nunca pode ultrapassar o total já realizado.
          </p>
        </div>
        <div className="flex justify-end">
          <button onClick={handleExportCsv} className="rounded-2xl bg-dark px-4 py-3 text-sm font-semibold text-white">
            Exportar CSV
          </button>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <section className="grid gap-4 lg:grid-cols-4">
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Receita líquida</p>
            <p className="mt-3 text-2xl font-black text-gray-950">R$ {formatCurrency(summary?.revenue.net)}</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Taxas</p>
            <p className="mt-3 text-2xl font-black text-gray-950">R$ {formatCurrency(summary?.revenue.fees)}</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Orçado em áreas</p>
            <p className="mt-3 text-2xl font-black text-gray-950">R$ {formatCurrency(summary?.budgets.allocated_total)}</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Ainda distribuível</p>
            <p className="mt-3 text-2xl font-black text-gray-950">R$ {formatCurrency(summary?.budgets.remaining_to_allocate)}</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className={cardClass}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-950">Áreas</h2>
              <span className="text-sm text-gray-500">{areas.length} cadastradas</span>
            </div>
            <div className="mt-4 space-y-3">
              {areas.map((area) => (
                <div key={area.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-950">{area.name}</p>
                      <p className="text-sm text-gray-500">{area.leader?.name || 'Sem líder definido'}</p>
                      {area.leader && area.leader_is_eligible === false && (
                        <p className="mt-1 text-sm text-amber-700">
                          O líder atual não pertence mais ao grupo <code>area_leaders</code>. Atualize o vínculo para salvar alterações nesta área.
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startAreaEdit(area)} className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white">Editar área</button>
                      <button onClick={async () => { await deleteFinanceArea(area.id); await loadData(); }} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Excluir</button>
                    </div>
                  </div>
                  {editingAreaId === area.id && (
                    <div className="mt-3 space-y-3">
                      <input className={`${inputClass} max-w-[220px]`} value={editingAreaAmount} onChange={(e) => setEditingAreaAmount(e.target.value)} />
                      <select className={`${inputClass} max-w-[420px]`} value={editingAreaLeaderId} onChange={(e) => setEditingAreaLeaderId(e.target.value)}>
                        <option value="">Sem líder principal</option>
                        {area.leader && area.leader_is_eligible === false && (
                          <option value={area.leader.id}>
                            {area.leader.name} ({area.leader.email}) - fora do grupo
                          </option>
                        )}
                        {leaders.map((leader) => (
                          <option key={leader.id} value={leader.id}>{leader.name} ({leader.email})</option>
                        ))}
                      </select>
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => saveAreaEdit(area.id)} className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white">Salvar</button>
                        <button onClick={() => { setEditingAreaId(null); setEditingAreaAmount(''); setEditingAreaLeaderId(''); }} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <div><p className="text-xs text-gray-500">Orçado</p><p className="font-semibold text-gray-900">R$ {formatCurrency(area.summary.allocated_amount)}</p></div>
                    <div><p className="text-xs text-gray-500">Pendente</p><p className="font-semibold text-gray-900">R$ {formatCurrency(area.summary.pending_amount)}</p></div>
                    <div><p className="text-xs text-gray-500">Comprometido</p><p className="font-semibold text-gray-900">R$ {formatCurrency(area.summary.committed_amount)}</p></div>
                    <div><p className="text-xs text-gray-500">Disponível</p><p className="font-semibold text-gray-900">R$ {formatCurrency(area.summary.available_amount)}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={cardClass}>
            <h2 className="text-lg font-black text-gray-950">Nova área</h2>
            <form onSubmit={handleCreateArea} className="mt-4 space-y-3">
              <input className={inputClass} placeholder="Nome da área" value={areaForm.name} onChange={(e) => setAreaForm((current) => ({ ...current, name: e.target.value }))} />
              <textarea className={`${inputClass} min-h-[100px]`} placeholder="Descrição" value={areaForm.description} onChange={(e) => setAreaForm((current) => ({ ...current, description: e.target.value }))} />
              <input className={inputClass} placeholder="Valor orçado da área" value={areaForm.allocated_amount} onChange={(e) => setAreaForm((current) => ({ ...current, allocated_amount: e.target.value }))} />
              <select className={inputClass} value={areaForm.leader_id} onChange={(e) => setAreaForm((current) => ({ ...current, leader_id: e.target.value }))}>
                <option value="">Selecione o líder principal</option>
                {leaders.map((leader) => (
                  <option key={leader.id} value={leader.id}>{leader.name} ({leader.email})</option>
                ))}
              </select>
              <button className="rounded-2xl bg-dark px-4 py-3 text-sm font-semibold text-white" type="submit">Criar área</button>
            </form>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className={cardClass}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-950">Rubricas</h2>
              <span className="text-sm text-gray-500">{rubrics.length} cadastradas</span>
            </div>
            <div className="mt-4 space-y-3">
              {rubrics.map((rubric) => (
                <div key={rubric.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-950">{rubric.name}</p>
                      <p className="text-sm text-gray-500">{rubric.area_name}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startRubricEdit(rubric)} className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white">Editar</button>
                      <button onClick={async () => { await deleteFinanceRubric(rubric.id); await loadData(); }} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Excluir</button>
                    </div>
                  </div>
                  {editingRubricId === rubric.id && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input className={`${inputClass} max-w-[220px]`} value={editingRubricAmount} onChange={(e) => setEditingRubricAmount(e.target.value)} />
                      <button onClick={() => saveRubricEdit(rubric.id)} className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white">Salvar</button>
                      <button onClick={() => { setEditingRubricId(null); setEditingRubricAmount(''); }} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                    </div>
                  )}
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <div><p className="text-xs text-gray-500">Orçado</p><p className="font-semibold text-gray-900">R$ {formatCurrency(rubric.summary.allocated_amount)}</p></div>
                    <div><p className="text-xs text-gray-500">Pendente</p><p className="font-semibold text-gray-900">R$ {formatCurrency(rubric.summary.pending_amount)}</p></div>
                    <div><p className="text-xs text-gray-500">Comprometido</p><p className="font-semibold text-gray-900">R$ {formatCurrency(rubric.summary.committed_amount)}</p></div>
                    <div><p className="text-xs text-gray-500">Disponível</p><p className="font-semibold text-gray-900">R$ {formatCurrency(rubric.summary.available_amount)}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={cardClass}>
            <h2 className="text-lg font-black text-gray-950">Nova rubrica</h2>
            <form onSubmit={handleCreateRubric} className="mt-4 space-y-3">
              <select className={inputClass} value={rubricForm.area} onChange={(e) => setRubricForm((current) => ({ ...current, area: e.target.value }))}>
                <option value="">Selecione a área</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </select>
              <input className={inputClass} placeholder="Nome da rubrica" value={rubricForm.name} onChange={(e) => setRubricForm((current) => ({ ...current, name: e.target.value }))} />
              <textarea className={`${inputClass} min-h-[100px]`} placeholder="Descrição" value={rubricForm.description} onChange={(e) => setRubricForm((current) => ({ ...current, description: e.target.value }))} />
              <input className={inputClass} placeholder="Valor orçado da rubrica" value={rubricForm.allocated_amount} onChange={(e) => setRubricForm((current) => ({ ...current, allocated_amount: e.target.value }))} />
              <button className="rounded-2xl bg-dark px-4 py-3 text-sm font-semibold text-white" type="submit">Criar rubrica</button>
            </form>
          </div>
        </section>

        <section className={cardClass}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-gray-950">Solicitacoes</h2>
            <span className="text-sm text-gray-500">{requests.length} registros</span>
          </div>
          <div className="mt-4 space-y-3">
            {requests.map((item) => (
              <div key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-gray-950">{item.rubric_name} • {item.area_name}</p>
                    <p className="text-sm text-gray-500">{item.requester_email}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{item.request_type_display}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.status === 'PENDING' && <button onClick={async () => { await reviewFinanceRequest(item.id, 'Em análise'); await loadData(); }} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700">Em análise</button>}
                    {['PENDING', 'UNDER_REVIEW'].includes(item.status) && <button onClick={async () => { await approveFinanceRequest(item.id); await loadData(); }} className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white">Aprovar</button>}
                    {['PENDING', 'UNDER_REVIEW'].includes(item.status) && <button onClick={() => { setRejectingRequestId(item.id); setRejectionReason(''); }} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Rejeitar</button>}
                    {item.status === 'APPROVED' && item.execution?.status === 'NOT_EXECUTED' && <button onClick={() => { setExecutingRequestId(item.id); setExecutionType(item.execution?.execution_type || item.request_type); setExecutionNotes(''); setExecutionFile(null); }} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Executar</button>}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[120px_1fr_1fr]">
                  <div>
                    <p className="text-xs text-gray-500">Valor</p>
                    <p className="font-semibold text-gray-900">R$ {formatCurrency(item.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Descricao</p>
                    <p className="text-sm text-gray-700">{item.description}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Status</p>
                    <p className="text-sm font-semibold text-gray-900">{item.status}</p>
                    {item.rejection_reason && <p className="mt-1 text-xs text-red-600">{item.rejection_reason}</p>}
                  </div>
                </div>
                {rejectingRequestId === item.id && (
                  <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4">
                    <p className="text-sm font-semibold text-red-700">Justificativa da rejeição</p>
                    <textarea className={`${inputClass} mt-2 min-h-[100px] bg-white`} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => submitRejection(item.id)} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white">Confirmar rejeição</button>
                      <button onClick={() => { setRejectingRequestId(null); setRejectionReason(''); }} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                    </div>
                  </div>
                )}
                {executingRequestId === item.id && (
                  <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-sm font-semibold text-emerald-700">Executar solicitação</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <select className={inputClass} value={executionType} onChange={(e) => setExecutionType(e.target.value as 'ADVANCE' | 'REIMBURSEMENT')}>
                        <option value="ADVANCE">Adiantamento</option>
                        <option value="REIMBURSEMENT">Reembolso</option>
                      </select>
                      <input type="file" className={inputClass} onChange={(e) => setExecutionFile(e.target.files?.[0] || null)} />
                    </div>
                    <textarea className={`${inputClass} mt-3 min-h-[100px] bg-white`} placeholder="Observações da execução" value={executionNotes} onChange={(e) => setExecutionNotes(e.target.value)} />
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => submitExecution(item.id)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Confirmar execução</button>
                      <button onClick={() => { setExecutingRequestId(null); setExecutionType('ADVANCE'); setExecutionNotes(''); setExecutionFile(null); }} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                    </div>
                    {executionType === 'REIMBURSEMENT' && (
                      <p className="mt-2 text-xs text-emerald-700">Reembolso exige comprovante anexado no envio.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && requests.length === 0 && <p className="text-sm text-gray-500">Nenhuma solicitacao registrada.</p>}
          </div>
        </section>

        {report && (
          <section className={cardClass}>
            <h2 className="text-lg font-black text-gray-950">Relatório consolidado</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-sm font-semibold text-gray-700">Por área</p>
                <div className="space-y-2">
                  {report.report.areas.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-3">
                      <span className="font-medium text-gray-900">{item.name}</span>
                      <span className="text-sm text-gray-600">Disponível R$ {formatCurrency(item.available_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-semibold text-gray-700">Por rubrica</p>
                <div className="space-y-2">
                  {report.report.rubrics.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-3">
                      <span className="font-medium text-gray-900">{item.name} <span className="text-xs text-gray-500">({item.area_name})</span></span>
                      <span className="text-sm text-gray-600">Disponível R$ {formatCurrency(item.available_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
