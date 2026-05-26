import { useEffect, useState } from 'react';
import { ShieldAlert, Users } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import {
  allocateAdminEmpire,
  getAdminEmpiresBoard,
  type EmpireBoardItem,
  type EmpireBoardResponse,
} from '../services/api';

const brandPurple = 'rgb(165, 44, 240)';

const EMPIRE_META: Array<{
  key: keyof EmpireBoardResponse;
  label: string;
  accent: string;
  cellAccent: string;
}> = [
  { key: 'egito', label: 'Egito', accent: 'bg-emerald-50 text-emerald-700 border-emerald-100', cellAccent: 'bg-emerald-50/80 border-emerald-200' },
  { key: 'persia', label: 'Pérsia', accent: 'bg-purple-50 text-purple-700 border-purple-100', cellAccent: 'bg-purple-50/80 border-purple-200' },
  { key: 'grecia', label: 'Grécia', accent: 'bg-orange-50 text-orange-700 border-orange-100', cellAccent: 'bg-orange-50/80 border-orange-200' },
  { key: 'roma', label: 'Roma', accent: 'bg-rose-50 text-rose-700 border-rose-100', cellAccent: 'bg-rose-50/80 border-rose-200' },
  { key: 'none', label: 'Sem império', accent: 'bg-slate-100 text-slate-700 border-slate-200', cellAccent: 'bg-slate-50 border-slate-200' },
];

type EmpireKey = keyof EmpireBoardResponse;
type AssignableEmpire = 'egito' | 'persia' | 'grecia' | 'roma' | 'none';

const formatAverageAge = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return '-';
  return `${value.toFixed(1)} anos`;
};

const formatBirthDate = (value: string) => {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const escapeCsvCell = (value: unknown) => {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export default function AdminEmpires() {
  const [board, setBoard] = useState<EmpireBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [bulkReturning, setBulkReturning] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [error, setError] = useState('');
  const [ageSort, setAgeSort] = useState<'older_first' | 'younger_first'>('older_first');
  const [selectedAssignedIds, setSelectedAssignedIds] = useState<number[]>([]);

  const loadBoard = async () => {
    try {
      const response = await getAdminEmpiresBoard();
      setBoard(response.data);
      setSelectedAssignedIds((current) => {
        const validAssignedIds = new Set(
          ['egito', 'persia', 'grecia', 'roma']
            .flatMap((key) => response.data[key as Exclude<EmpireKey, 'none'>].items)
            .map((item) => item.id)
        );
        return current.filter((id) => validAssignedIds.has(id));
      });
    } catch (requestError) {
      console.error('Error loading empires board:', requestError);
      setError('Erro ao carregar a página de impérios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBoard();
  }, []);

  const handleAllocate = async (enrollmentId: number, targetEmpire: AssignableEmpire) => {
    setSavingId(enrollmentId);
    setError('');

    try {
      const response = await allocateAdminEmpire({
        enrollment_id: enrollmentId,
        target_empire: targetEmpire,
      });
      setBoard(response.data.board);
    } catch (requestError: any) {
      console.error('Error allocating empire:', requestError);
      setError(requestError?.response?.data?.enrollment_id?.[0] || requestError?.response?.data?.detail || 'Erro ao alocar inscrito.');
    } finally {
      setSavingId(null);
    }
  };

  const toggleAssignedSelection = (enrollmentId: number) => {
    setSelectedAssignedIds((current) =>
      current.includes(enrollmentId)
        ? current.filter((id) => id !== enrollmentId)
        : [...current, enrollmentId]
    );
  };

  const handleReturnSelectedToNone = async () => {
    if (selectedAssignedIds.length === 0) return;

    setBulkReturning(true);
    setError('');

    try {
      await Promise.all(
        selectedAssignedIds.map((enrollmentId) =>
          allocateAdminEmpire({
            enrollment_id: enrollmentId,
            target_empire: 'none',
          })
        )
      );
      setSelectedAssignedIds([]);
      await loadBoard();
    } catch (requestError: any) {
      console.error('Error returning selected empires:', requestError);
      setError(requestError?.response?.data?.detail || 'Erro ao devolver inscritos para Sem império.');
    } finally {
      setBulkReturning(false);
    }
  };

  const sortItemsByAge = (items: EmpireBoardItem[]) =>
    [...items].sort((a, b) => {
      const ageA = a.age ?? (ageSort === 'older_first' ? -1 : Number.MAX_SAFE_INTEGER);
      const ageB = b.age ?? (ageSort === 'older_first' ? -1 : Number.MAX_SAFE_INTEGER);

      if (ageA === ageB) {
        return a.participant_name.localeCompare(b.participant_name, 'pt-BR');
      }

      return ageSort === 'older_first' ? ageB - ageA : ageA - ageB;
    });

  const exportCsv = () => {
    if (!board) return;

    setExportingCsv(true);
    try {
      const rows = [EMPIRE_META.find((empire) => empire.key === 'none')!, ...EMPIRE_META.filter((empire) => empire.key !== 'none')]
        .flatMap((empire) =>
          sortItemsByAge(board[empire.key].items).map((item) => [
            empire.label,
            item.participant_name,
            formatBirthDate(item.birth_date),
            item.age ?? '',
          ])
        );

      const csvContent = [
        ['Império', 'Nome', 'Nascimento', 'Idade'].map(escapeCsvCell).join(','),
        ...rows.map((row) => row.map(escapeCsvCell).join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `imperios_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } finally {
      setExportingCsv(false);
    }
  };

  const renderParticipantCard = (item: EmpireBoardItem, empireKey: EmpireKey) => {
    const isUnassigned = empireKey === 'none';
    const isSelected = selectedAssignedIds.includes(item.id);
    const empireMeta = EMPIRE_META.find((empire) => empire.key === empireKey)!;

    return (
      <article
        key={item.id}
        onClick={!isUnassigned ? () => toggleAssignedSelection(item.id) : undefined}
        className={`rounded-xl border p-2.5 shadow-sm xl:rounded-lg xl:px-2 xl:py-1.5 ${empireMeta.cellAccent} ${
          isSelected
            ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-200'
            : 'border-slate-200'
        } ${!isUnassigned ? 'cursor-pointer transition-colors hover:border-amber-200 hover:bg-amber-50/70' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2 xl:items-center">
          <div className="min-w-0 xl:flex-1">
            <h3 className="truncate text-[13px] font-sans font-semibold leading-tight tracking-normal text-gray-950">
              {item.participant_name}
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-gray-600 xl:mt-1 xl:flex xl:items-center xl:gap-3">
              <div className="xl:min-w-0">
                <p className="uppercase tracking-[0.08em] text-gray-500 xl:hidden">Nascimento</p>
                <p className="mt-0.5 font-medium text-gray-900 xl:mt-0">{formatBirthDate(item.birth_date)}</p>
              </div>
              <div className="xl:min-w-0">
                <p className="uppercase tracking-[0.08em] text-gray-500 xl:hidden">Idade</p>
                <p className="mt-0.5 font-medium text-gray-900 xl:mt-0">{item.age ?? '-'}</p>
              </div>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 xl:shrink-0">
            #{item.id}
          </span>
        </div>

        {isUnassigned ? (
          <div className="mt-3 grid grid-cols-2 gap-1.5 xl:mt-2 xl:grid-cols-4 xl:gap-1">
            {EMPIRE_META.filter((empire) => empire.key !== 'none').map((empire) => (
              <button
                key={empire.key}
                type="button"
                disabled={savingId === item.id}
                onClick={() => void handleAllocate(item.id, empire.key as AssignableEmpire)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-slate-100 disabled:opacity-60 xl:px-1.5 xl:py-1 xl:text-[10px]"
              >
                {savingId === item.id ? '...' : empire.label}
              </button>
            ))}
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-950">Impérios</h1>
          <p className="mt-1 text-sm text-gray-600">
            Organize os inscritos por império e aloque quem ainda está sem império.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
              Controles
            </p>
            <p className="mt-1 text-sm text-gray-700">Ordene os integrantes e exporte a distribuição atual.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Idade</span>
              <select
                value={ageSort}
                onChange={(event) => setAgeSort(event.target.value as 'older_first' | 'younger_first')}
                className="min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-[rgb(165,44,240)] focus:ring-2 focus:ring-[rgba(165,44,240,0.12)]"
              >
                <option value="older_first">Mais velhos primeiro</option>
                <option value="younger_first">Mais novos primeiro</option>
              </select>
            </div>
            <button
              type="button"
              onClick={exportCsv}
              disabled={exportingCsv || !board}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: brandPurple }}
            >
              {exportingCsv ? 'Exportando...' : 'Exportar CSV'}
            </button>
          </div>
        </div>

        {selectedAssignedIds.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-[rgba(165,44,240,0.12)] bg-[rgba(165,44,240,0.05)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-gray-800">
              {selectedAssignedIds.length} {selectedAssignedIds.length === 1 ? 'integrante selecionado' : 'integrantes selecionados'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedAssignedIds([])}
                disabled={bulkReturning}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                Limpar seleção
              </button>
              <button
                type="button"
                onClick={() => void handleReturnSelectedToNone()}
                disabled={bulkReturning}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: brandPurple }}
              >
                {bulkReturning ? 'Movendo...' : 'Voltar selecionados para Sem império'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-[28px] border border-white/80 bg-white p-12 text-center text-gray-500 shadow-sm">
            Carregando impérios...
          </div>
        ) : !board ? (
          <div className="rounded-[28px] border border-white/80 bg-white p-12 text-center text-gray-500 shadow-sm">
            Não foi possível carregar os impérios.
          </div>
        ) : (
          <>
            <div className="space-y-3 xl:hidden">
              {[EMPIRE_META.find((empire) => empire.key === 'none')!, ...EMPIRE_META.filter((empire) => empire.key !== 'none')].map((empire) => {
                const column = board[empire.key];
                const isUnassigned = empire.key === 'none';

                return (
                  <section key={empire.key} className="rounded-[22px] border border-white/80 bg-white p-2.5 shadow-sm">
                    <div className={`rounded-xl border px-2.5 py-2 ${empire.accent}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h2 className="text-sm font-bold">{empire.label}</h2>
                          <p className="mt-0.5 text-[10px] opacity-80">{column.count} integrantes</p>
                        </div>
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/70">
                          {isUnassigned ? (
                            <ShieldAlert className="h-4 w-4" />
                          ) : (
                            <Users className="h-4 w-4" style={{ color: brandPurple }} />
                          )}
                        </div>
                      </div>
                      <p className="mt-1.5 text-[11px] font-semibold">Idade média: {formatAverageAge(column.average_age)}</p>
                    </div>

                    <div className="mt-2.5 space-y-2">
                      {column.items.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-gray-500">
                          {isUnassigned ? 'Nenhum inscrito sem império.' : 'Nenhum inscrito nesta coluna.'}
                        </div>
                      ) : (
                        sortItemsByAge(column.items).map((item) => renderParticipantCard(item, empire.key))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto pb-2 xl:block">
              <div className="grid min-w-[1120px] gap-3 xl:grid-cols-5">
                {[EMPIRE_META.find((empire) => empire.key === 'none')!, ...EMPIRE_META.filter((empire) => empire.key !== 'none')].map((empire) => {
                  const column = board[empire.key];
                  const isUnassigned = empire.key === 'none';

                  return (
                    <section key={empire.key} className="rounded-[22px] border border-white/80 bg-white p-2.5 shadow-sm">
                      <div className={`rounded-xl border px-2.5 py-2 ${empire.accent}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h2 className="text-sm font-bold">{empire.label}</h2>
                            <p className="mt-0.5 text-[10px] opacity-80">{column.count} integrantes</p>
                          </div>
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/70">
                            {isUnassigned ? (
                              <ShieldAlert className="h-4 w-4" />
                            ) : (
                              <Users className="h-4 w-4" style={{ color: brandPurple }} />
                            )}
                          </div>
                        </div>
                        <p className="mt-1.5 text-[11px] font-semibold">Idade média: {formatAverageAge(column.average_age)}</p>
                      </div>

                      <div className="mt-2.5 space-y-2">
                        {column.items.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-gray-500">
                            {isUnassigned ? 'Nenhum inscrito sem império.' : 'Nenhum inscrito nesta coluna.'}
                          </div>
                        ) : (
                          sortItemsByAge(column.items).map((item) => renderParticipantCard(item, empire.key))
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
