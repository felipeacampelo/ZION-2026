import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/AdminShell';
import {
  createExtraContribution,
  createFinanceArea,
  createFinanceRubric,
  deleteExtraContribution,
  deleteFinanceArea,
  deleteFinanceRubric,
  exportAdminFinanceReportCsv,
  getAdminFinanceReports,
  getAdminFinanceSummary,
  getExtraContributions,
  getFinanceAreas,
  getFinanceLeaderCandidates,
  getFinanceRubrics,
  updateFinanceArea,
  updateFinanceRubric,
  type ExtraContribution,
  type FinanceArea,
  type FinanceGlobalSummary,
  type FinanceReportResponse,
  type FinanceRubric,
  type FinanceUserOption,
} from '../services/api';

const formatCurrency = (value?: string) =>
  Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const normalizeAmountInput = (value: string) => value.replace(/\./g, '').replace(',', '.').trim();

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
  const [leaders, setLeaders] = useState<FinanceUserOption[]>([]);
  const [contributions, setContributions] = useState<ExtraContribution[]>([]);
  const [contributionForm, setContributionForm] = useState({ label: '', amount: '', source_type: 'OTHER' as ExtraContribution['source_type'], date: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [areaForm, setAreaForm] = useState({ name: '', description: '', allocated_amount: '', leader_id: '' });
  const [rubricForm, setRubricForm] = useState({ area: '', name: '', description: '', allocated_amount: '' });
  const [editingAreaId, setEditingAreaId] = useState<number | null>(null);
  const [editingAreaName, setEditingAreaName] = useState('');
  const [editingAreaDescription, setEditingAreaDescription] = useState('');
  const [editingAreaAmount, setEditingAreaAmount] = useState('');
  const [editingAreaLeaderId, setEditingAreaLeaderId] = useState('');
  const [editingRubricId, setEditingRubricId] = useState<number | null>(null);
  const [editingRubricName, setEditingRubricName] = useState('');
  const [editingRubricDescription, setEditingRubricDescription] = useState('');
  const [editingRubricAmount, setEditingRubricAmount] = useState('');

  const loadData = async () => {
    setError('');
    try {
      const [summaryRes, reportRes, areasRes, rubricsRes, leadersRes, contributionsRes] = await Promise.all([
        getAdminFinanceSummary(),
        getAdminFinanceReports(),
        getFinanceAreas(),
        getFinanceRubrics(),
        getFinanceLeaderCandidates(),
        getExtraContributions(),
      ]);
      setSummary(summaryRes.data);
      setReport(reportRes.data);
      setAreas(areasRes.data);
      setRubrics(rubricsRes.data);
      setLeaders(leadersRes.data.results);
      setContributions(contributionsRes.data);
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
    setEditingAreaName(area.name);
    setEditingAreaDescription(area.description || '');
    setEditingAreaAmount(area.budget.allocated_amount);
    setEditingAreaLeaderId(area.leader ? String(area.leader.id) : '');
  };

  const saveAreaEdit = async (areaId: number) => {
    try {
      setError('');
      await updateFinanceArea(areaId, {
        name: editingAreaName,
        description: editingAreaDescription,
        allocated_amount: normalizeAmountInput(editingAreaAmount),
        leader_id: editingAreaLeaderId ? Number(editingAreaLeaderId) : null,
      });
      setEditingAreaId(null);
      setEditingAreaName('');
      setEditingAreaDescription('');
      setEditingAreaAmount('');
      setEditingAreaLeaderId('');
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const startRubricEdit = (rubric: FinanceRubric) => {
    setEditingRubricId(rubric.id);
    setEditingRubricName(rubric.name);
    setEditingRubricDescription(rubric.description || '');
    setEditingRubricAmount(rubric.allocated_amount);
  };

  const saveRubricEdit = async (rubricId: number) => {
    try {
      setError('');
      await updateFinanceRubric(rubricId, {
        name: editingRubricName,
        description: editingRubricDescription,
        allocated_amount: normalizeAmountInput(editingRubricAmount),
      });
      setEditingRubricId(null);
      setEditingRubricName('');
      setEditingRubricDescription('');
      setEditingRubricAmount('');
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const handleCreateContribution = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSuccessMessage('');
      await createExtraContribution({
        label: contributionForm.label,
        amount: contributionForm.amount,
        source_type: contributionForm.source_type,
        date: contributionForm.date,
        notes: contributionForm.notes,
      });
      setContributionForm({ label: '', amount: '', source_type: 'OTHER', date: '', notes: '' });
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const handleDeleteContribution = async (id: number) => {
    try {
      setSuccessMessage('');
      await deleteExtraContribution(id);
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
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
            O módulo usa a receita líquida das inscrições como referência, mas o orçamento por área é configurado manualmente.
          </p>
        </div>
        <div className="flex justify-end">
          <button onClick={handleExportCsv} className="rounded-2xl bg-dark px-4 py-3 text-sm font-semibold text-white">
            Exportar CSV
          </button>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {successMessage && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div>}

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

        <section className="grid gap-4 lg:grid-cols-2">
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Total de aportes</p>
            <p className="mt-3 text-2xl font-black text-gray-950">R$ {formatCurrency(summary?.extra_contributions.total)}</p>
            <p className="mt-1 text-xs text-gray-500">Ofertas, investidores, doações — não contam como receita líquida</p>
          </div>
          <div className="rounded-3xl border border-lime-200 bg-lime-50/80 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
            <p className="text-xs uppercase tracking-[0.2em] text-lime-700">Receita total (líquida + aportes)</p>
            <p className="mt-3 text-2xl font-black text-gray-950">R$ {formatCurrency(summary?.extra_contributions.combined_with_net)}</p>
            <p className="mt-1 text-xs text-gray-500">Receita líquida + aportes registrados</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className={cardClass}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-950">Aportes</h2>
              <span className="text-sm text-gray-500">{contributions.length} registros</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">Valores recebidos de ofertas, investidores, doações etc. Não contam como receita líquida operacional.</p>
            <div className="mt-4 space-y-3">
              {contributions.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div>
                    <p className="font-bold text-gray-950">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.source_type_display} • {item.date}</p>
                    {item.notes && <p className="mt-1 text-xs text-gray-500">{item.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-lg font-black text-gray-950">R$ {formatCurrency(item.amount)}</p>
                    <button onClick={() => handleDeleteContribution(item.id)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Excluir</button>
                  </div>
                </div>
              ))}
              {!loading && contributions.length === 0 && <p className="text-sm text-gray-500">Nenhum aporte registrado.</p>}
            </div>
          </div>

          <div className={cardClass}>
            <h2 className="text-lg font-black text-gray-950">Novo aporte</h2>
            <form onSubmit={handleCreateContribution} className="mt-4 space-y-3">
              <input className={inputClass} placeholder="Descrição (ex: Oferta do culto de domingo)" value={contributionForm.label} onChange={(e) => setContributionForm((c) => ({ ...c, label: e.target.value }))} required />
              <input className={inputClass} placeholder="Valor (ex: 1500.00)" value={contributionForm.amount} onChange={(e) => setContributionForm((c) => ({ ...c, amount: e.target.value }))} required />
              <select className={inputClass} value={contributionForm.source_type} onChange={(e) => setContributionForm((c) => ({ ...c, source_type: e.target.value as ExtraContribution['source_type'] }))}>
                <option value="OFFERING">Oferta</option>
                <option value="INVESTOR">Investidor</option>
                <option value="DONATION">Doação</option>
                <option value="OTHER">Outro</option>
              </select>
              <input type="date" className={inputClass} value={contributionForm.date} onChange={(e) => setContributionForm((c) => ({ ...c, date: e.target.value }))} required />
              <textarea className={`${inputClass} min-h-[80px]`} placeholder="Observações (opcional)" value={contributionForm.notes} onChange={(e) => setContributionForm((c) => ({ ...c, notes: e.target.value }))} />
              <button className="rounded-2xl bg-dark px-4 py-3 text-sm font-semibold text-white" type="submit">Registrar aporte</button>
            </form>
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
                      <button type="button" onClick={() => startAreaEdit(area)} className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white">Editar área</button>
                      <button type="button" onClick={async () => { try { await deleteFinanceArea(area.id); await loadData(); } catch (submitError: any) { setError(getErrorMessage(submitError)); } }} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Excluir</button>
                    </div>
                  </div>
                  {editingAreaId === area.id && (
                    <form
                      className="mt-3 space-y-3"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        await saveAreaEdit(area.id);
                      }}
                    >
                      <input className={`${inputClass} max-w-[420px]`} placeholder="Nome da área" value={editingAreaName} onChange={(e) => setEditingAreaName(e.target.value)} />
                      <textarea className={`${inputClass} min-h-[100px] max-w-[520px]`} placeholder="Descrição" value={editingAreaDescription} onChange={(e) => setEditingAreaDescription(e.target.value)} />
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
                        <button type="submit" className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white">Salvar</button>
                        <button type="button" onClick={() => { setEditingAreaId(null); setEditingAreaName(''); setEditingAreaDescription(''); setEditingAreaAmount(''); setEditingAreaLeaderId(''); }} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                      </div>
                    </form>
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
                      <button type="button" onClick={() => startRubricEdit(rubric)} className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white">Editar</button>
                      <button type="button" onClick={async () => { try { await deleteFinanceRubric(rubric.id); await loadData(); } catch (submitError: any) { setError(getErrorMessage(submitError)); } }} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Excluir</button>
                    </div>
                  </div>
                  {editingRubricId === rubric.id && (
                    <form
                      className="mt-3 space-y-3"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        await saveRubricEdit(rubric.id);
                      }}
                    >
                      <input className={`${inputClass} max-w-[420px]`} placeholder="Nome da rubrica" value={editingRubricName} onChange={(e) => setEditingRubricName(e.target.value)} />
                      <textarea className={`${inputClass} min-h-[100px] max-w-[520px]`} placeholder="Descrição" value={editingRubricDescription} onChange={(e) => setEditingRubricDescription(e.target.value)} />
                      <input className={`${inputClass} max-w-[220px]`} value={editingRubricAmount} onChange={(e) => setEditingRubricAmount(e.target.value)} />
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="submit" className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white">Salvar</button>
                        <button type="button" onClick={() => { setEditingRubricId(null); setEditingRubricName(''); setEditingRubricDescription(''); setEditingRubricAmount(''); }} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                      </div>
                    </form>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-gray-950">Aprovações e execuções</h2>
              <p className="mt-1 text-sm text-gray-600">
                As solicitações financeiras agora ficam em uma página dedicada, com separação por área e rubrica.
              </p>
            </div>
            <Link
              to="/admin/finance/approvals"
              className="rounded-2xl bg-dark px-4 py-3 text-sm font-semibold text-white"
            >
              Abrir aprovações
            </Link>
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
