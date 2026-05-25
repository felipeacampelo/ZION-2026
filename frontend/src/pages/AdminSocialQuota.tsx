import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, Wallet } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import {
  createAdminSocialQuotaContribution,
  deleteAdminSocialQuotaContribution,
  getAdminSocialQuotas,
  type Enrollment,
  type SocialQuotaContribution,
  updateAdminSocialQuotaContribution,
} from '../services/api';

const formatCurrency = (value: number | string | undefined) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const brandPurple = 'rgb(165, 44, 240)';

type ContributionFormState = {
  id?: number;
  date: string;
  amount: string;
  notes: string;
};

const emptyContributionForm = (): ContributionFormState => ({
  date: '',
  amount: '',
  notes: '',
});

export default function AdminSocialQuota() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    completed: 0,
    raised_total: 0,
    remaining_total: 0,
  });
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState('');
  const [contributionForm, setContributionForm] = useState<ContributionFormState>(emptyContributionForm());

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async (term?: string) => {
    try {
      const response = await getAdminSocialQuotas({ search: term ?? search });
      setEnrollments(response.data.results);
      setSummary(response.data.summary);
      if (selectedEnrollment) {
        const fresh = response.data.results.find((item) => item.id === selectedEnrollment.id) || null;
        setSelectedEnrollment(fresh);
      }
    } catch (requestError) {
      console.error('Error loading social quotas:', requestError);
      setError('Erro ao carregar a página de cota social.');
    } finally {
      setLoading(false);
    }
  };

  const selectedContributions = useMemo(
    () => selectedEnrollment?.social_quota_contributions || [],
    [selectedEnrollment]
  );

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    await loadData(search);
  };

  const resetContributionForm = () => {
    setContributionForm(emptyContributionForm());
  };

  const handleSelectEnrollment = (enrollment: Enrollment) => {
    setSelectedEnrollment(enrollment);
    resetContributionForm();
    setError('');
  };

  const handleEditContribution = (contribution: SocialQuotaContribution) => {
    setContributionForm({
      id: contribution.id,
      date: contribution.date,
      amount: contribution.amount,
      notes: contribution.notes || '',
    });
  };

  const handleSaveContribution = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedEnrollment) return;

    setSaving(true);
    setError('');

    try {
      if (contributionForm.id) {
        await updateAdminSocialQuotaContribution(contributionForm.id, {
          date: contributionForm.date,
          amount: contributionForm.amount,
          notes: contributionForm.notes,
        });
      } else {
        await createAdminSocialQuotaContribution({
          enrollment_id: selectedEnrollment.id,
          date: contributionForm.date,
          amount: contributionForm.amount,
          notes: contributionForm.notes,
        });
      }

      resetContributionForm();
      await loadData();
    } catch (requestError: any) {
      console.error('Error saving social quota contribution:', requestError);
      setError(requestError?.response?.data?.detail || 'Erro ao salvar lançamento.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContribution = async (contributionId: number) => {
    if (!window.confirm('Excluir este lançamento?')) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      await deleteAdminSocialQuotaContribution(contributionId);
      if (contributionForm.id === contributionId) {
        resetContributionForm();
      }
      await loadData();
    } catch (requestError: any) {
      console.error('Error deleting social quota contribution:', requestError);
      setError(requestError?.response?.data?.detail || 'Erro ao excluir lançamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-950">Cota Social</h1>
            <p className="mt-1 text-sm text-gray-600">
              Acompanhe adolescentes com cupom COTASOCIAL e registre arrecadações manualmente.
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex w-full max-w-xl gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, email ou CPF"
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 focus:border-dark focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-dark px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Buscar
            </button>
          </form>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-3xl border border-white/80 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Adolescentes</p>
            <p className="mt-3 text-3xl font-bold text-gray-950">{summary.total}</p>
            <p className="mt-1 text-sm text-gray-600">inscrições em cota social</p>
          </article>
          <article className="rounded-3xl border border-white/80 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Fecharam valor</p>
            <p className="mt-3 text-3xl font-bold text-gray-950">{summary.completed}</p>
            <p className="mt-1 text-sm text-gray-600">já bateram a meta total</p>
          </article>
          <article className="rounded-3xl border border-white/80 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Arrecadado</p>
            <p className="mt-3 text-3xl font-bold text-gray-950">{formatCurrency(summary.raised_total)}</p>
            <p className="mt-1 text-sm text-gray-600">lançamentos manuais somados</p>
          </article>
          <article className="rounded-3xl border border-white/80 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Ainda falta</p>
            <p className="mt-3 text-3xl font-bold text-gray-950">{formatCurrency(summary.remaining_total)}</p>
            <p className="mt-1 text-sm text-gray-600">para fechar todas as metas</p>
          </article>
        </section>

        <section className="rounded-[28px] border border-white/80 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-950">Planilha de acompanhamento</h2>
              <p className="text-sm text-gray-600">Clique em uma linha para abrir os lançamentos logo abaixo.</p>
            </div>
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ backgroundColor: 'rgba(165, 44, 240, 0.08)' }}
            >
              <Wallet className="h-5 w-5" style={{ color: brandPurple }} />
            </div>
          </div>

          {loading ? (
            <div className="py-14 text-center text-gray-500">Carregando cota social...</div>
          ) : enrollments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 px-5 py-10 text-center text-gray-500">
              Nenhuma inscrição de cota social encontrada.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                    <th className="px-2.5 py-2.5">Participante</th>
                    <th className="px-2.5 py-2.5">Inscrição</th>
                    <th className="px-2.5 py-2.5">Pago no sistema</th>
                    <th className="px-2.5 py-2.5">Arrecadado</th>
                    <th className="px-2.5 py-2.5">Progresso</th>
                    <th className="px-2.5 py-2.5">Faltante</th>
                    <th className="px-2.5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((enrollment) => (
                    <tr
                      key={enrollment.id}
                      className={`cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                        selectedEnrollment?.id === enrollment.id ? 'bg-gold/10' : ''
                      }`}
                      onClick={() => handleSelectEnrollment(enrollment)}
                    >
                      <td className="px-2.5 py-3">
                        <p className="text-sm font-semibold leading-tight text-gray-950">{enrollment.form_data?.nome_completo || '-'}</p>
                        <p className="text-[11px] text-gray-500">#{enrollment.id}</p>
                      </td>
                      <td className="px-2.5 py-3 text-sm font-medium text-gray-900">
                        {formatCurrency(enrollment.social_goal_amount)}
                      </td>
                      <td className="px-2.5 py-3 text-sm text-gray-700">
                        {formatCurrency(enrollment.social_paid_amount)}
                      </td>
                      <td className="px-2.5 py-3 text-sm text-gray-700">
                        {formatCurrency(enrollment.social_raised_amount)}
                      </td>
                      <td className="px-2.5 py-3 text-sm font-medium text-gray-950">
                        {formatCurrency(enrollment.social_total_progress)}
                      </td>
                      <td className="px-2.5 py-3 text-sm text-gray-700">
                        {formatCurrency(enrollment.social_remaining_amount)}
                      </td>
                      <td className="px-2.5 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            enrollment.social_is_completed
                              ? 'bg-green-50 text-green-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {enrollment.social_is_completed ? 'Fechou valor' : 'Pendente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selectedEnrollment ? (
          <section className="rounded-[28px] border border-white/80 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold text-gray-950">
                    {selectedEnrollment.form_data?.nome_completo || 'Participante'}
                  </h2>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      selectedEnrollment.social_is_completed
                        ? 'bg-green-50 text-green-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {selectedEnrollment.social_is_completed ? 'Fechou valor' : 'Pendente'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedEnrollment.user_email || 'Sem email'} • {selectedEnrollment.product?.name || selectedEnrollment.product_name || 'Evento'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedEnrollment(null);
                  resetContributionForm();
                }}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700"
              >
                Fechar detalhe
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Inscrição</p>
                <p className="mt-2 text-lg font-bold text-gray-950">{formatCurrency(selectedEnrollment.social_goal_amount)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Pago no sistema</p>
                <p className="mt-2 text-lg font-bold text-gray-950">{formatCurrency(selectedEnrollment.social_paid_amount)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Arrecadado</p>
                <p className="mt-2 text-lg font-bold text-gray-950">{formatCurrency(selectedEnrollment.social_raised_amount)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Faltante</p>
                <p className="mt-2 text-lg font-bold text-gray-950">{formatCurrency(selectedEnrollment.social_remaining_amount)}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
              <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-950">Novo lançamento</h3>
                    <p className="text-sm text-gray-500">Registre por data quanto esse adolescente arrecadou.</p>
                  </div>
                  <button
                    type="button"
                    onClick={resetContributionForm}
                    className="inline-flex items-center gap-2 rounded-xl bg-dark px-3 py-2 text-sm font-semibold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Novo
                  </button>
                </div>

                <form onSubmit={handleSaveContribution} className="grid gap-3 rounded-2xl border border-white bg-white p-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Data</label>
                      <input
                        type="date"
                        required
                        value={contributionForm.date}
                        onChange={(event) => setContributionForm((current) => ({ ...current, date: event.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-dark focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Valor</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={contributionForm.amount}
                        onChange={(event) => setContributionForm((current) => ({ ...current, amount: event.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-dark focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Observações</label>
                    <textarea
                      rows={3}
                      value={contributionForm.notes}
                      onChange={(event) => setContributionForm((current) => ({ ...current, notes: event.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-dark focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-xl bg-dark px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {saving ? 'Salvando...' : contributionForm.id ? 'Atualizar lançamento' : 'Adicionar lançamento'}
                    </button>
                    {contributionForm.id && (
                      <button
                        type="button"
                        onClick={resetContributionForm}
                        className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700"
                      >
                        Cancelar edição
                      </button>
                    )}
                  </div>
                </form>

                {error && (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-gray-950">Histórico de lançamentos</h3>
                  <p className="text-sm text-gray-500">Edite ou exclua qualquer linha já lançada.</p>
                </div>

                <div className="space-y-3">
                  {selectedContributions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-5 text-center text-sm text-gray-500">
                      Nenhum lançamento cadastrado ainda.
                    </div>
                  ) : (
                    selectedContributions.map((contribution) => (
                      <div
                        key={contribution.id}
                        className="flex flex-col gap-3 rounded-2xl border border-white bg-white px-4 py-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-gray-500">
                              {new Date(`${contribution.date}T00:00:00`).toLocaleDateString('pt-BR')}
                            </p>
                            <p className="mt-1 text-lg font-bold text-gray-950">
                              {formatCurrency(contribution.amount)}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditContribution(contribution)}
                              className="rounded-xl border border-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-50"
                              aria-label="Editar lançamento"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteContribution(contribution.id)}
                              className="rounded-xl border border-red-200 p-2 text-red-600 transition-colors hover:bg-red-50"
                              aria-label="Excluir lançamento"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {contribution.notes && (
                          <p className="text-sm text-gray-600">{contribution.notes}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-[28px] border border-dashed border-gray-200 bg-white p-10 text-center text-gray-500 shadow-sm">
            <Wallet className="mx-auto mb-4 h-10 w-10 text-gray-300" />
            <p className="font-medium text-gray-700">Selecione um adolescente na planilha</p>
            <p className="mt-1 text-sm text-gray-500">Os lançamentos e a edição aparecem abaixo da tabela.</p>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
