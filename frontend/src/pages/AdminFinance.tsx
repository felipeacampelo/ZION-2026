import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrencyBRL, normalizeCurrencyInput, toCurrencyInputValue } from '../utils/currency';
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

const renderCurrencyValue = (value?: string, positiveClassName = 'text-gray-950') => {
  const amount = Number(value || 0);
  const isNegative = amount < 0;
  return (
    <span className={isNegative ? 'text-red-600' : positiveClassName}>
      {isNegative ? '- R$ ' : 'R$ '}
      {formatCurrencyBRL(Math.abs(amount))}
    </span>
  );
};

const getErrorMessage = (error: any) => {
  const payload = error?.response?.data;
  if (!payload) return error?.message || 'Não foi possível concluir a operação.';
  if (typeof payload === 'string') return payload;
  if (payload.detail) return payload.detail;
  const firstEntry = Object.entries(payload)[0];
  if (!firstEntry) return 'Não foi possível concluir a operação.';
  const [field, value] = firstEntry;
  const labels: Record<string, string> = { leader_ids: 'Líderes da área', allocated_amount: 'Valor orçado' };
  const label = labels[field] || field;
  if (Array.isArray(value)) return `${label}: ${value.join(' ')}`;
  return `${label}: ${String(value)}`;
};

const cardClass = 'rounded-3xl border border-white/80 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.07)]';
const inputClass = 'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-dark';

const toggleLeaderId = (current: string[], leaderId: string) => (
  current.includes(leaderId)
    ? current.filter((id) => id !== leaderId)
    : current.length < 2
      ? [...current, leaderId]
      : current
);

function BudgetCols({ allocated, pending, committed, executed, available, size = 'sm', showBar = false }: {
  allocated: string; pending: string; committed: string; executed: string; available: string; size?: 'sm' | 'xs'; showBar?: boolean;
}) {
  const labelClass = size === 'xs' ? 'text-[10px]' : 'text-xs';
  const valueClass = size === 'xs' ? 'text-xs font-semibold' : 'text-sm font-semibold';
  const allocatedNum = Number(allocated || 0);
  const usedNum = Number(pending || 0) + Number(committed || 0) + Number(executed || 0);
  const usedPct = allocatedNum > 0 ? Math.min(100, (usedNum / allocatedNum) * 100) : 0;
  const committedPct = allocatedNum > 0 ? Math.min(100, (Number(committed || 0) / allocatedNum) * 100) : 0;
  return (
    <div className="grid grid-cols-5 gap-x-4 text-right">
      <div><p className={`${labelClass} text-gray-400`}>Orçado</p><p className={`${valueClass} text-gray-700`}>R$ {formatCurrencyBRL(allocated)}</p></div>
      <div><p className={`${labelClass} text-gray-400`}>Pendente</p><p className={`${valueClass} text-amber-700`}>R$ {formatCurrencyBRL(pending)}</p></div>
      <div><p className={`${labelClass} text-gray-400`}>Comprometido</p><p className={`${valueClass} text-gray-700`}>R$ {formatCurrencyBRL(committed)}</p></div>
      <div><p className={`${labelClass} text-gray-400`}>Executado</p><p className={`${valueClass} text-blue-700`}>R$ {formatCurrencyBRL(executed)}</p></div>
      <div><p className={`${labelClass} text-gray-400`}>Disponível</p><p className={`${valueClass} text-gold-700`}>R$ {formatCurrencyBRL(available)}</p></div>
      {showBar && allocatedNum > 0 && (
        <div className="col-span-5 mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${usedPct}%` }}>
              <div className="h-full rounded-full bg-dark" style={{ width: committedPct > 0 ? `${(committedPct / usedPct) * 100}%` : '0%' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminFinance() {
  const { canManageFinance } = useAuth();
  const [summary, setSummary] = useState<FinanceGlobalSummary | null>(null);
  const [areas, setAreas] = useState<FinanceArea[]>([]);
  const [rubrics, setRubrics] = useState<FinanceRubric[]>([]);
  const [leaders, setLeaders] = useState<FinanceUserOption[]>([]);
  const [contributions, setContributions] = useState<ExtraContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Area form
  const [areaForm, setAreaForm] = useState({ name: '', description: '', allocated_amount: '', leader_ids: [] as string[] });
  const [showCreateAreaForm, setShowCreateAreaForm] = useState(false);

  // Rubric form
  const [rubricForm, setRubricForm] = useState({ area: '', name: '', description: '', allocated_amount: '' });
  const [creatingRubricForAreaId, setCreatingRubricForAreaId] = useState<number | null>(null);

  // Inline area edits
  const [editingAreaId, setEditingAreaId] = useState<number | null>(null);
  const [editingAreaName, setEditingAreaName] = useState('');
  const [editingAreaDescription, setEditingAreaDescription] = useState('');
  const [editingAreaAmount, setEditingAreaAmount] = useState('');
  const [editingAreaLeaderIds, setEditingAreaLeaderIds] = useState<string[]>([]);

  // Inline rubric edits
  const [editingRubricId, setEditingRubricId] = useState<number | null>(null);
  const [editingRubricName, setEditingRubricName] = useState('');
  const [editingRubricDescription, setEditingRubricDescription] = useState('');
  const [editingRubricAmount, setEditingRubricAmount] = useState('');

  // Tree expand state
  const [expandedAreaIds, setExpandedAreaIds] = useState<Set<number>>(new Set());

  // Delete confirmations
  const [deletingAreaId, setDeletingAreaId] = useState<number | null>(null);
  const [deletingRubricId, setDeletingRubricId] = useState<number | null>(null);
  const [deletingContributionId, setDeletingContributionId] = useState<number | null>(null);

  // Contribution form
  const [contributionForm, setContributionForm] = useState({ label: '', amount: '', source_type: 'OTHER' as ExtraContribution['source_type'], date: '', notes: '' });

  const loadData = async () => {
    setError('');
    try {
      const [summaryRes, areasRes, rubricsRes, leadersRes, contributionsRes] = await Promise.all([
        getAdminFinanceSummary(),
        getFinanceAreas(),
        getFinanceRubrics(),
        canManageFinance ? getFinanceLeaderCandidates() : Promise.resolve({ data: { results: [] } }),
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

  useEffect(() => { loadData(); }, [canManageFinance]);

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

  const handleDeleteArea = async (areaId: number) => {
    try {
      await deleteFinanceArea(areaId);
      setDeletingAreaId(null);
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const handleDeleteRubric = async (rubricId: number) => {
    try {
      await deleteFinanceRubric(rubricId);
      setDeletingRubricId(null);
      await loadData();
    } catch (submitError: any) {
      setError(getErrorMessage(submitError));
    }
  };

  const handleCreateArea = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createFinanceArea({
        ...areaForm,
        allocated_amount: normalizeCurrencyInput(areaForm.allocated_amount),
        leader_ids: areaForm.leader_ids.map(Number),
      });
      setAreaForm({ name: '', description: '', allocated_amount: '', leader_ids: [] });
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
        allocated_amount: normalizeCurrencyInput(rubricForm.allocated_amount),
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
    setEditingAreaAmount(toCurrencyInputValue(area.budget.allocated_amount));
    setEditingAreaLeaderIds(area.leaders.map((leader) => String(leader.id)));
  };

  const saveAreaEdit = async (areaId: number) => {
    try {
      setError('');
      await updateFinanceArea(areaId, {
        name: editingAreaName,
        description: editingAreaDescription,
        allocated_amount: normalizeCurrencyInput(editingAreaAmount),
        leader_ids: editingAreaLeaderIds.map(Number),
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
    setEditingRubricAmount(toCurrencyInputValue(rubric.allocated_amount));
  };

  const saveRubricEdit = async (rubricId: number) => {
    try {
      setError('');
      await updateFinanceRubric(rubricId, {
        name: editingRubricName,
        description: editingRubricDescription,
        allocated_amount: normalizeCurrencyInput(editingRubricAmount),
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
      await createExtraContribution({
        ...contributionForm,
        amount: normalizeCurrencyInput(contributionForm.amount),
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

  if (loading) return (
    <AdminShell>
      <div className="animate-pulse space-y-6">
        <div className="h-20 rounded-3xl bg-gray-100" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-3xl bg-gray-100" />)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 rounded-3xl bg-gray-100" />)}
        </div>
        <div className="h-48 rounded-3xl bg-gray-100" />
        <div className="h-64 rounded-3xl bg-gray-100" />
      </div>
    </AdminShell>
  );

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
            {!canManageFinance && (
              <p className="mt-2 text-sm font-medium text-amber-700">
                Seu acesso ao financeiro está em modo leitura.
              </p>
            )}
          </div>
          <button onClick={handleExportCsv} className="rounded-2xl bg-dark px-4 py-3 text-sm font-semibold text-white">
            Exportar CSV
          </button>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {successMessage && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <span>{successMessage}</span>
            <button type="button" onClick={() => setSuccessMessage('')} className="flex-shrink-0 font-bold text-emerald-600 hover:text-emerald-900">✕</button>
          </div>
        )}

        {/* KPIs — 4 cols */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Receita líquida</p>
            <p className="mt-3 text-2xl font-black">{renderCurrencyValue(summary?.revenue.net)}</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Aguardando aprovação</p>
            <p className="mt-3 text-2xl font-black">{renderCurrencyValue(summary?.budgets.awaiting_approval_total)}</p>
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
                    <p className="text-lg font-black text-gray-950">R$ {formatCurrencyBRL(item.amount)}</p>
                    {canManageFinance && deletingContributionId === item.id ? (
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-red-700">Confirmar exclusão?</p>
                        <button type="button" onClick={async () => { setDeletingContributionId(null); await handleDeleteContribution(item.id); }} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white">Sim</button>
                        <button type="button" onClick={() => setDeletingContributionId(null)} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Não</button>
                      </div>
                    ) : canManageFinance ? (
                      <button type="button" onClick={() => setDeletingContributionId(item.id)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Excluir</button>
                    ) : null}
                  </div>
                </div>
              ))}
              {!loading && contributions.length === 0 && <p className="text-sm text-gray-500">Nenhum aporte registrado.</p>}
            </div>
          </div>

          {canManageFinance && (
          <div className={cardClass}>
            <h2 className="text-lg font-black text-gray-950">Novo aporte</h2>
            <form onSubmit={handleCreateContribution} className="mt-4 space-y-3">
              <input className={inputClass} placeholder="Descrição (ex: Oferta do culto de domingo)" value={contributionForm.label} onChange={(e) => setContributionForm((c) => ({ ...c, label: e.target.value }))} required />
              <input className={inputClass} placeholder="Valor (ex: 1.500,00)" value={contributionForm.amount} onChange={(e) => setContributionForm((c) => ({ ...c, amount: e.target.value }))} required />
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
          )}
        </section>

        {/* Áreas e Rubricas — unified tree */}
        <section className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-gray-950">Áreas e Rubricas</h2>
              <p className="mt-1 text-xs text-gray-500">{areas.length} áreas • {rubrics.length} rubricas</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const allExpanded = areas.every((a) => expandedAreaIds.has(a.id));
                  setExpandedAreaIds(allExpanded ? new Set() : new Set(areas.map((a) => a.id)));
                }}
                className="rounded-2xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:border-dark hover:text-dark"
              >
                {areas.every((a) => expandedAreaIds.has(a.id)) ? 'Colapsar tudo' : 'Expandir tudo'}
              </button>
              {canManageFinance && (
              <button
                type="button"
                onClick={() => setShowCreateAreaForm((v) => !v)}
                className="rounded-2xl bg-dark px-4 py-2.5 text-sm font-semibold text-white"
              >
                {showCreateAreaForm ? 'Cancelar' : '+ Nova área'}
              </button>
              )}
            </div>
          </div>

          {canManageFinance && showCreateAreaForm && (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="mb-3 text-sm font-bold text-gray-950">Nova área</p>
              <form onSubmit={handleCreateArea} className="space-y-3">
                <input className={inputClass} placeholder="Nome da área" value={areaForm.name} onChange={(e) => setAreaForm((c) => ({ ...c, name: e.target.value }))} required />
                <textarea className={`${inputClass} min-h-[80px]`} placeholder="Descrição" value={areaForm.description} onChange={(e) => setAreaForm((c) => ({ ...c, description: e.target.value }))} />
                <input className={inputClass} placeholder="Valor orçado" value={areaForm.allocated_amount} onChange={(e) => setAreaForm((c) => ({ ...c, allocated_amount: e.target.value }))} />
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">Líderes da área</p>
                  <p className="mt-1 text-xs text-gray-500">Selecione até 2 líderes.</p>
                  <div className="mt-3 space-y-2">
                    {leaders.map((leader) => (
                      <label key={leader.id} className="flex items-start gap-3 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={areaForm.leader_ids.includes(String(leader.id))}
                          onChange={() => setAreaForm((c) => ({ ...c, leader_ids: toggleLeaderId(c.leader_ids, String(leader.id)) }))}
                        />
                        <span>{leader.name} ({leader.email})</span>
                      </label>
                    ))}
                  </div>
                </div>
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
                      <p className="text-xs text-gray-500">
                        {area.leaders.length > 0 ? area.leaders.map((leader) => leader.name).join(', ') : 'Sem líderes'} • {areaRubrics.length} rubrica{areaRubrics.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="hidden xl:block" onClick={(e) => e.stopPropagation()}>
                      <BudgetCols
                        allocated={area.summary.allocated_amount}
                        pending={area.summary.pending_amount}
                        committed={area.summary.committed_amount}
                        executed={area.summary.executed_amount}
                        available={area.summary.available_amount}
                        size="xs"
                        showBar
                      />
                    </div>
                    {canManageFinance && (
                    <div className="flex flex-shrink-0 gap-2 pl-3" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => startAreaEdit(area)} className="rounded-xl bg-dark px-3 py-1.5 text-xs font-semibold text-white">Editar</button>
                      <button
                        type="button"
                        onClick={() => setDeletingAreaId(area.id)}
                        className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"
                      >
                        Excluir
                      </button>
                    </div>
                    )}
                  </div>

                  {/* Area warning */}
                  {area.leaders_have_ineligible && (
                    <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">
                      Há líder vinculado fora do grupo <code>area_leaders</code>. Atualize os vínculos para salvar alterações.
                    </div>
                  )}

                  {/* Area delete confirmation */}
                  {canManageFinance && deletingAreaId === area.id && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-red-100 bg-red-50 px-4 py-3">
                      <p className="text-sm font-semibold text-red-700">Excluir <span className="font-black">"{area.name}"</span>? Esta ação não pode ser desfeita.</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleDeleteArea(area.id)} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white">Confirmar exclusão</button>
                        <button type="button" onClick={() => setDeletingAreaId(null)} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                      </div>
                    </div>
                  )}

                  {/* Inline area edit form */}
                  {canManageFinance && editingAreaId === area.id && (
                    <div className="border-t border-gray-200 bg-slate-50/60 px-4 py-5">
                      <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Editando área</p>
                      <form
                        className="grid gap-5 lg:grid-cols-[1fr_260px]"
                        onSubmit={async (event) => { event.preventDefault(); await saveAreaEdit(area.id); }}
                      >
                        <div className="space-y-3">
                          <input className={inputClass} placeholder="Nome da área" value={editingAreaName} onChange={(e) => setEditingAreaName(e.target.value)} />
                          <textarea className={`${inputClass} min-h-[80px]`} placeholder="Descrição" value={editingAreaDescription} onChange={(e) => setEditingAreaDescription(e.target.value)} />
                          <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Valor orçado</p>
                            <input className={inputClass} placeholder="0,00" value={editingAreaAmount} onChange={(e) => setEditingAreaAmount(e.target.value)} />
                          </div>
                        </div>

                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Líderes da área</p>
                          <p className="mb-3 text-xs text-gray-500">Selecione até 2.</p>
                          {area.leaders_have_ineligible && (
                            <p className="mb-3 text-xs text-amber-700">Os líderes fora do grupo atual precisam ser substituídos antes de salvar.</p>
                          )}
                          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                            {leaders.map((leader) => (
                              <label
                                key={leader.id}
                                className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 transition-colors hover:border-gray-300 has-[:checked]:border-dark has-[:checked]:bg-dark/[0.04]"
                              >
                                <input
                                  type="checkbox"
                                  className="accent-dark"
                                  checked={editingAreaLeaderIds.includes(String(leader.id))}
                                  onChange={() => setEditingAreaLeaderIds((current) => toggleLeaderId(current, String(leader.id)))}
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-gray-900">{leader.name}</p>
                                  <p className="truncate text-xs text-gray-400">{leader.email}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:col-span-2">
                          <button type="submit" className="rounded-xl bg-dark px-4 py-2 text-xs font-semibold text-white">Salvar alterações</button>
                          <button type="button" onClick={() => setEditingAreaId(null)} className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
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
                                executed={rubric.summary.executed_amount}
                                available={rubric.summary.available_amount}
                                size="xs"
                              />
                            </div>
                            {canManageFinance && (
                            <div className="flex flex-shrink-0 gap-2">
                              <button type="button" onClick={() => startRubricEdit(rubric)} className="rounded-xl bg-dark px-3 py-1.5 text-xs font-semibold text-white">Editar</button>
                              <button
                                type="button"
                                onClick={() => setDeletingRubricId(rubric.id)}
                                className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"
                              >
                                Excluir
                              </button>
                            </div>
                            )}
                          </div>
                          {/* Mobile budget cols */}
                          <div className="mt-2 block lg:hidden">
                            <BudgetCols
                              allocated={rubric.summary.allocated_amount}
                              pending={rubric.summary.pending_amount}
                              committed={rubric.summary.committed_amount}
                              executed={rubric.summary.executed_amount}
                              available={rubric.summary.available_amount}
                              size="xs"
                            />
                          </div>

                          {/* Inline rubric edit form */}
                          {canManageFinance && editingRubricId === rubric.id && (
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

                          {/* Rubric delete confirmation */}
                          {canManageFinance && deletingRubricId === rubric.id && (
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-3 py-3">
                              <p className="text-sm font-semibold text-red-700">Excluir <span className="font-black">"{rubric.name}"</span>?</p>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => handleDeleteRubric(rubric.id)} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white">Confirmar</button>
                                <button type="button" onClick={() => setDeletingRubricId(null)} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">Cancelar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Create rubric form */}
                      {canManageFinance && creatingRubricForAreaId === area.id ? (
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
                      ) : canManageFinance ? (
                        <button
                          type="button"
                          onClick={() => openRubricForm(area.id)}
                          className="mt-1 w-full rounded-xl border border-dashed border-gray-200 py-2 text-xs font-semibold text-gray-500 transition-colors hover:border-dark hover:text-dark"
                        >
                          + Nova rubrica
                        </button>
                      ) : null}
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
        {canManageFinance && (
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
        )}

        {/* Relatório consolidado — tree */}
        {areas.length > 0 && (
          <section className={cardClass}>
            <h2 className="text-lg font-black text-gray-950">Relatório consolidado</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="border-b-2 border-gray-200 pb-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Área / Rubrica</th>
                    <th className="border-b-2 border-gray-200 pb-3 pr-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Orçado</th>
                    <th className="border-b-2 border-gray-200 pb-3 pr-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Pendente</th>
                    <th className="border-b-2 border-gray-200 pb-3 pr-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Comprometido</th>
                    <th className="border-b-2 border-gray-200 pb-3 pr-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Executado</th>
                    <th className="border-b-2 border-gray-200 pb-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-gold-700">Disponível</th>
                  </tr>
                </thead>
                <tbody>
                  {areas.map((area, areaIdx) => {
                    const areaRubrics = rubrics.filter((r) => r.area === area.id);
                    return (
                      <>
                        <tr key={`area-${area.id}`} className={areaIdx > 0 ? 'border-t-2 border-gray-200' : ''}>
                          <td className="bg-gray-50 py-2.5 pl-2 font-bold text-gray-950">{area.name}</td>
                          <td className="bg-gray-50 py-2.5 pr-4 text-right font-semibold text-gray-700">R$ {formatCurrencyBRL(area.summary.allocated_amount)}</td>
                          <td className="bg-gray-50 py-2.5 pr-4 text-right font-semibold text-amber-700">R$ {formatCurrencyBRL(area.summary.pending_amount)}</td>
                          <td className="bg-gray-50 py-2.5 pr-4 text-right font-semibold text-gray-700">R$ {formatCurrencyBRL(area.summary.committed_amount)}</td>
                          <td className="bg-gray-50 py-2.5 pr-4 text-right font-semibold text-blue-700">R$ {formatCurrencyBRL(area.summary.executed_amount)}</td>
                          <td className="bg-gray-50 py-2.5 text-right font-bold text-gold-700">R$ {formatCurrencyBRL(area.summary.available_amount)}</td>
                        </tr>
                        {areaRubrics.map((rubric) => (
                          <tr key={`rubric-${rubric.id}`} className="border-t border-gray-100">
                            <td className="py-2 pl-7 text-gray-600">
                              <span className="mr-2 text-gray-300">└</span>{rubric.name}
                            </td>
                            <td className="py-2 pr-4 text-right text-gray-500">R$ {formatCurrencyBRL(rubric.summary.allocated_amount)}</td>
                            <td className="py-2 pr-4 text-right text-amber-600">R$ {formatCurrencyBRL(rubric.summary.pending_amount)}</td>
                            <td className="py-2 pr-4 text-right text-gray-500">R$ {formatCurrencyBRL(rubric.summary.committed_amount)}</td>
                            <td className="py-2 pr-4 text-right text-blue-600">R$ {formatCurrencyBRL(rubric.summary.executed_amount)}</td>
                            <td className="py-2 text-right font-semibold text-gold-600">R$ {formatCurrencyBRL(rubric.summary.available_amount)}</td>
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
