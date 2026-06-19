import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import {
  createExtraContribution,
  createFinanceArea,
  createFinanceRubric,
  deleteExtraContribution,
  deleteFinanceArea,
  deleteFinanceRubric,
  exportAdminFinanceReportCsv,
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
  type FinanceRubric,
  type FinanceUserOption,
} from '../services/api';

const formatCurrency = (value?: string) =>
  Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const renderCurrencyValue = (value?: string, positiveClassName = 'text-gray-950') => {
  const amount = Number(value || 0);
  const isNegative = amount < 0;
  return (
    <span className={isNegative ? 'text-red-600' : positiveClassName}>
      {isNegative ? '- R$ ' : 'R$ '}
      {formatCurrency(String(Math.abs(amount)))}
    </span>
  );
};

const normalizeAmountInput = (value: string) => value.replace(/\./g, '').replace(',', '.').trim();

const getErrorMessage = (error: any) => {
  const payload = error?.response?.data;
  if (!payload) return error?.message || 'Não foi possível concluir a operação.';
  if (typeof payload === 'string') return payload;
  if (payload.detail) return payload.detail;
  const firstEntry = Object.entries(payload)[0];
  if (!firstEntry) return 'Não foi possível concluir a operação.';
  const [field, value] = firstEntry;
  const labels: Record<string, string> = { leader_id: 'Líder principal', allocated_amount: 'Valor orçado' };
  const label = labels[field] || field;
  if (Array.isArray(value)) return `${label}: ${value.join(' ')}`;
  return `${label}: ${String(value)}`;
};

const cardClass = 'rounded-3xl border border-white/80 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.07)]';
const inputClass = 'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-dark';

function BudgetCols({ allocated, pending, committed, available, size = 'sm' }: {
  allocated: string; pending: string; committed: string; available: string; size?: 'sm' | 'xs';
}) {
  const labelClass = size === 'xs' ? 'text-[10px]' : 'text-xs';
  const valueClass = size === 'xs' ? 'text-xs font-semibold' : 'text-sm font-semibold';
  return (
    <div className="grid grid-cols-4 gap-x-4 text-right">
      <div><p className={`${labelClass} text-gray-400`}>Orçado</p><p className={`${valueClass} text-gray-700`}>R$ {formatCurrency(allocated)}</p></div>
      <div><p className={`${labelClass} text-gray-400`}>Pendente</p><p className={`${valueClass} text-amber-700`}>R$ {formatCurrency(pending)}</p></div>
      <div><p className={`${labelClass} text-gray-400`}>Comprometido</p><p className={`${valueClass} text-gray-700`}>R$ {formatCurrency(committed)}</p></div>
      <div><p className={`${labelClass} text-gray-400`}>Disponível</p><p className={`${valueClass} text-dark`}>R$ {formatCurrency(available)}</p></div>
    </div>
  );
}

export default function AdminFinance() {
  const [summary, setSummary] = useState<FinanceGlobalSummary | null>(null);
  const [areas, setAreas] = useState<FinanceArea[]>([]);
  const [rubrics, setRubrics] = useState<FinanceRubric[]>([]);
  const [leaders, setLeaders] = useState<FinanceUserOption[]>([]);
  const [contributions, setContributions] = useState<ExtraContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Area form
  const [areaForm, setAreaForm] = useState({ name: '', description: '', allocated_amount: '', leader_id: '' });
  const [showCreateAreaForm, setShowCreateAreaForm] = useState(false);

  // Rubric form
  const [rubricForm, setRubricForm] = useState({ area: '', name: '', description: '', allocated_amount: '' });
  const [creatingRubricForAreaId, setCreatingRubricForAreaId] = useState<number | null>(null);

  // Inline area edits
  const [editingAreaId, setEditingAreaId] = useState<number | null>(null);
  const [editingAreaName, setEditingAreaName] = useState('');
  const [editingAreaDescription, setEditingAreaDescription] = useState('');
  const [editingAreaAmount, setEditingAreaAmount] = useState('');
  const [editingAreaLeaderId, setEditingAreaLeaderId] = useState('');

  // Inline rubric edits
  const [editingRubricId, setEditingRubricId] = useState<number | null>(null);
  const [editingRubricName, setEditingRubricName] = useState('');
  const [editingRubricDescription, setEditingRubricDescription] = useState('');
  const [editingRubricAmount, setEditingRubricAmount] = useState('');

  // Tree expand state
  const [expandedAreaIds, setExpandedAreaIds] = useState<Set<number>>(new Set());

  // Contribution form
  const [contributionForm, setContributionForm] = useState({ label: '', amount: '', source_type: 'OTHER' as ExtraContribution['source_type'], date: '', notes: '' });

  const loadData = async () => {
    setError('');
    try {
      const [summaryRes, areasRes, rubricsRes, leadersRes, contributionsRes] = await Promise.all([
        getAdminFinanceSummary(),
        getFinanceAreas(),
        getFinanceRubrics(),
        getFinanceLeaderCandidates(),
        getExtraContributions(),
      ]);
      setSummary(summaryRes.data);
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

  useEffect(() => { loadData(); }, []);

  const toggleAreaExpand = (areaId: number) => {
    setExpandedAreaIds((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
  };

  const openRubricForm = (areaId: number) => {
    setCreatingRubricForAreaId(areaId);
    setRubricForm((f) => ({ ...f, area: String(areaId) }));
  };

  const cancelRubricCreate = () => {
    setCreatingRubricForAreaId(null);
    setRubricForm({ area: '', name: '', description: '', allocated_amount: '' });
  };

  const handleCreateArea = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createFinanceArea({ ...areaForm, leader_id: areaForm.leader_id ? Number(areaForm.leader_id) : null });
      setAreaForm({ name: '', description: '', allocated_amount: '', leader_id: '' });
      setShowCreateAreaForm(false);
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
      cancelRubricCreate();
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
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const handleCreateContribution = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSuccessMessage('');
      await createExtraContribution(contributionForm);
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
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-dark/70">Controle Financeiro</p>
            <h1 className="mt-2 text-3xl font-black text-gray-950">Visão Geral</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Receita, orçamento por área e execução financeira.
            </p>
          </div>
          <button onClick={handleExportCsv} className="rounded-2xl bg-dark px-4 py-3 text-sm font-semibold text-white">
            Exportar CSV
          </button>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {successMessage && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div>}

        {/* KPIs — 4 cols */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Receita líquida</p>
            <p className="mt-3 text-2xl font-black">{renderCurrencyValue(summary?.revenue.net)}</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Aguardando execução</p>
            <p className="mt-3 text-2xl font-black">{renderCurrencyValue(summary?.budgets.awaiting_execution_total)}</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Orçado em áreas</p>
            <p className="mt-3 text-2xl font-black">{renderCurrencyValue(summary?.budgets.allocated_total)}</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Ainda distribuível</p>
            <p className="mt-3 text-2xl font-black">{renderCurrencyValue(summary?.budgets.remaining_to_allocate)}</p>
          </div>
        </section>

        {/* Aportes summary */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Total de aportes</p>
            <p className="mt-3 text-2xl font-black">{renderCurrencyValue(summary?.extra_contributions.total)}</p>
            <p className="mt-1 text-xs text-gray-500">Ofertas, investidores, doações — não contam como receita líquida</p>
          </div>
          <div className="rounded-3xl border border-lime-200 bg-lime-50/80 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
            <p className="text-xs uppercase tracking-[0.2em] text-lime-700">Receita total (líquida + aportes)</p>
            <p className="mt-3 text-2xl font-black">{renderCurrencyValue(summary?.extra_contributions.combined_with_net)}</p>
            <p className="mt-1 text-xs text-gray-500">Receita líquida + aportes registrados</p>
          </div>
        </section>

        {/* Aportes list + create form */}
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className={cardClass}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-950">Aportes</h2>
              <span className="text-sm text-gray-500">{contributions.length} registros</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">Valores recebidos de ofertas, investidores, doações etc.</p>
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

        {/* Áreas e Rubricas — unified tree */}
        <section className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-gray-950">Áreas e Rubricas</h2>
              <p className="mt-1 text-xs text-gray-500">{areas.length} áreas • {rubrics.length} rubricas</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateAreaForm((v) => !v)}
              className="rounded-2xl bg-dark px-4 py-2.5 text-sm font-semibold text-white"
            >
              {showCreateAreaForm ? 'Cancelar' : '+ Nova área'}
            </button>
          </div>

          {showCreateAreaForm && (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="mb-3 text-sm font-bold text-gray-950">Nova área</p>
              <form onSubmit={handleCreateArea} className="space-y-3">
                <input className={inputClass} placeholder="Nome da área" value={areaForm.name} onChange={(e) => setAreaForm((c) => ({ ...c, name: e.target.value }))} required />
                <textarea className={`${inputClass} min-h-[80px]`} placeholder="Descrição" value={areaForm.description} onChange={(e) => setAreaForm((c) => ({ ...c, description: e.target.value }))} />
                <input className={inputClass} placeholder="Valor orçado" value={areaForm.allocated_amount} onChange={(e) => setAreaForm((c) => ({ ...c, allocated_amount: e.target.value }))} />
                <select className={inputClass} value={areaForm.leader_id} onChange={(e) => setAreaForm((c) => ({ ...c, leader_id: e.target.value }))}>
                  <option value="">Selecione o líder principal</option>
                  {leaders.map((leader) => (
                    <option key={leader.id} value={leader.id}>{leader.name} ({leader.email})</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button className="rounded-2xl bg-dark px-4 py-3 text-sm font-semibold text-white" type="submit">Criar área</button>
                  <button type="button" onClick={() => setShowCreateAreaForm(false)} className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600">Cancelar</button>
                </div>
              </form>
            </div>
          )}

          <div className="mt-4 space-y-2">
            {areas.map((area) => {
              const areaRubrics = rubrics.filter((r) => r.area === area.id);
              const isExpanded = expandedAreaIds.has(area.id);

              return (
                <div key={area.id} className="overflow-hidden rounded-2xl border border-gray-100">
                  {/* Area header row */}
                  <div
                    className="flex cursor-pointer items-center gap-3 bg-gray-50 px-4 py-3 transition-colors hover:bg-gray-100"
                    onClick={() => toggleAreaExpand(area.id)}
                  >
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                      : <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    }
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-950">{area.name}</p>
                      <p className="text-xs text-gray-500">{area.leader?.name || 'Sem líder'} • {areaRubrics.length} rubrica{areaRubrics.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="hidden xl:block" onClick={(e) => e.stopPropagation()}>
                      <BudgetCols
                        allocated={area.summary.allocated_amount}
                        pending={area.summary.pending_amount}
                        committed={area.summary.committed_amount}
                        available={area.summary.available_amount}
                        size="xs"
                      />
                    </div>
                    <div className="flex flex-shrink-0 gap-2 pl-3" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => startAreaEdit(area)} className="rounded-xl bg-dark px-3 py-1.5 text-xs font-semibold text-white">Editar</button>
                      <button
                        type="button"
                        onClick={async () => { try { await deleteFinanceArea(area.id); await loadData(); } catch (submitError: any) { setError(getErrorMessage(submitError)); } }}
                        className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>

                  {/* Area warning */}
                  {area.leader && area.leader_is_eligible === false && (
                    <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">
                      O líder atual não pertence mais ao grupo <code>area_leaders</code>. Atualize o vínculo para salvar alterações.
                    </div>
                  )}

                  {/* Inline area edit form */}
                  {editingAreaId === area.id && (
                    <div className="border-t border-gray-100 bg-white px-4 py-4">
                      <form
                        className="space-y-3"
                        onSubmit={async (event) => { event.preventDefault(); await saveAreaEdit(area.id); }}
                      >
                        <input className={`${inputClass} max-w-[420px]`} placeholder="Nome da área" value={editingAreaName} onChange={(e) => setEditingAreaName(e.target.value)} />
                        <textarea className={`${inputClass} min-h-[80px] max-w-[520px]`} placeholder="Descrição" value={editingAreaDescription} onChange={(e) => setEditingAreaDescription(e.target.value)} />
                        <input className={`${inputClass} max-w-[220px]`} placeholder="Valor orçado" value={editingAreaAmount} onChange={(e) => setEditingAreaAmount(e.target.value)} />
                        <select className={`${inputClass} max-w-[420px]`} value={editingAreaLeaderId} onChange={(e) => setEditingAreaLeaderId(e.target.value)}>
                          <option value="">Sem líder principal</option>
                          {area.leader && area.leader_is_eligible === false && (
                            <option value={area.leader.id}>{area.leader.name} ({area.leader.email}) — fora do grupo</option>
                          )}
                          {leaders.map((leader) => (
                            <option key={leader.id} value={leader.id}>{leader.name} ({leader.email})</option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-2">
                          <button type="submit" className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white">Salvar</button>
                          <button type="button" onClick={() => setEditingAreaId(null)} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Rubrics list (expanded) */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-white px-4 pb-4 pt-3 space-y-2">
                      {areaRubrics.length === 0 && creatingRubricForAreaId !== area.id && (
                        <p className="text-xs text-gray-400">Nenhuma rubrica cadastrada nesta área.</p>
                      )}

                      {areaRubrics.map((rubric) => (
                        <div key={rubric.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-950">{rubric.name}</p>
                              {rubric.description && <p className="mt-0.5 text-xs text-gray-400">{rubric.description}</p>}
                            </div>
                            <div className="hidden lg:block">
                              <BudgetCols
                                allocated={rubric.summary.allocated_amount}
                                pending={rubric.summary.pending_amount}
                                committed={rubric.summary.committed_amount}
                                available={rubric.summary.available_amount}
                                size="xs"
                              />
                            </div>
                            <div className="flex flex-shrink-0 gap-2">
                              <button type="button" onClick={() => startRubricEdit(rubric)} className="rounded-xl bg-dark px-3 py-1.5 text-xs font-semibold text-white">Editar</button>
                              <button
                                type="button"
                                onClick={async () => { try { await deleteFinanceRubric(rubric.id); await loadData(); } catch (submitError: any) { setError(getErrorMessage(submitError)); } }}
                                className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                          {/* Mobile budget cols */}
                          <div className="mt-2 block lg:hidden">
                            <BudgetCols
                              allocated={rubric.summary.allocated_amount}
                              pending={rubric.summary.pending_amount}
                              committed={rubric.summary.committed_amount}
                              available={rubric.summary.available_amount}
                              size="xs"
                            />
                          </div>

                          {/* Inline rubric edit form */}
                          {editingRubricId === rubric.id && (
                            <form
                              className="mt-3 space-y-3 border-t border-gray-100 pt-3"
                              onSubmit={async (event) => { event.preventDefault(); await saveRubricEdit(rubric.id); }}
                            >
                              <input className={`${inputClass} max-w-[420px]`} placeholder="Nome da rubrica" value={editingRubricName} onChange={(e) => setEditingRubricName(e.target.value)} />
                              <textarea className={`${inputClass} min-h-[80px] max-w-[520px]`} placeholder="Descrição" value={editingRubricDescription} onChange={(e) => setEditingRubricDescription(e.target.value)} />
                              <input className={`${inputClass} max-w-[220px]`} placeholder="Valor orçado" value={editingRubricAmount} onChange={(e) => setEditingRubricAmount(e.target.value)} />
                              <div className="flex gap-2">
                                <button type="submit" className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white">Salvar</button>
                                <button type="button" onClick={() => setEditingRubricId(null)} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                              </div>
                            </form>
                          )}
                        </div>
                      ))}

                      {/* Create rubric form */}
                      {creatingRubricForAreaId === area.id ? (
                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-4">
                          <p className="mb-3 text-xs font-bold text-gray-950">Nova rubrica em {area.name}</p>
                          <form onSubmit={handleCreateRubric} className="space-y-3">
                            <input className={inputClass} placeholder="Nome da rubrica" value={rubricForm.name} onChange={(e) => setRubricForm((c) => ({ ...c, name: e.target.value }))} required />
                            <textarea className={`${inputClass} min-h-[60px]`} placeholder="Descrição" value={rubricForm.description} onChange={(e) => setRubricForm((c) => ({ ...c, description: e.target.value }))} />
                            <input className={inputClass} placeholder="Valor orçado" value={rubricForm.allocated_amount} onChange={(e) => setRubricForm((c) => ({ ...c, allocated_amount: e.target.value }))} />
                            <div className="flex gap-2">
                              <button className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white" type="submit">Criar rubrica</button>
                              <button type="button" onClick={cancelRubricCreate} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                            </div>
                          </form>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openRubricForm(area.id)}
                          className="mt-1 w-full rounded-xl border border-dashed border-gray-200 py-2 text-xs font-semibold text-gray-500 transition-colors hover:border-dark hover:text-dark"
                        >
                          + Nova rubrica
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && areas.length === 0 && (
              <p className="text-sm text-gray-500">Nenhuma área cadastrada.</p>
            )}
          </div>
        </section>

        {/* Approvals link */}
        <section className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-gray-950">Aprovações e execuções</h2>
              <p className="mt-1 text-sm text-gray-600">
                Solicitações financeiras separadas por área e rubrica, com fluxo de aprovação e execução.
              </p>
            </div>
            <Link to="/admin/finance/approvals" className="rounded-2xl bg-dark px-4 py-3 text-sm font-semibold text-white">
              Abrir aprovações
            </Link>
          </div>
        </section>

        {/* Relatório consolidado — tree */}
        {areas.length > 0 && (
          <section className={cardClass}>
            <h2 className="text-lg font-black text-gray-950">Relatório consolidado</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="pb-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Área / Rubrica</th>
                    <th className="pb-3 pr-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Orçado</th>
                    <th className="pb-3 pr-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Pendente</th>
                    <th className="pb-3 pr-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Comprometido</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-dark">Disponível</th>
                  </tr>
                </thead>
                <tbody>
                  {areas.map((area) => {
                    const areaRubrics = rubrics.filter((r) => r.area === area.id);
                    return (
                      <>
                        <tr key={`area-${area.id}`} className="border-t border-gray-100">
                          <td className="py-2.5 font-bold text-gray-950">{area.name}</td>
                          <td className="py-2.5 pr-4 text-right font-semibold text-gray-700">R$ {formatCurrency(area.summary.allocated_amount)}</td>
                          <td className="py-2.5 pr-4 text-right font-semibold text-amber-700">R$ {formatCurrency(area.summary.pending_amount)}</td>
                          <td className="py-2.5 pr-4 text-right font-semibold text-gray-700">R$ {formatCurrency(area.summary.committed_amount)}</td>
                          <td className="py-2.5 text-right font-bold text-dark">R$ {formatCurrency(area.summary.available_amount)}</td>
                        </tr>
                        {areaRubrics.map((rubric) => (
                          <tr key={`rubric-${rubric.id}`} className="border-t border-gray-50">
                            <td className="py-2 pl-6 text-gray-600">
                              <span className="mr-2 text-gray-300">└</span>{rubric.name}
                            </td>
                            <td className="py-2 pr-4 text-right text-gray-500">R$ {formatCurrency(rubric.summary.allocated_amount)}</td>
                            <td className="py-2 pr-4 text-right text-amber-600">R$ {formatCurrency(rubric.summary.pending_amount)}</td>
                            <td className="py-2 pr-4 text-right text-gray-500">R$ {formatCurrency(rubric.summary.committed_amount)}</td>
                            <td className="py-2 text-right font-semibold text-dark/80">R$ {formatCurrency(rubric.summary.available_amount)}</td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
