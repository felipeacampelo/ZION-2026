import { useEffect, useState } from 'react';
import { ArrowDownToLine, ShieldAlert, SlidersHorizontal, Users, X } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import {
  allocateAdminEmpire,
  getAdminEmpiresBoard,
  type EmpireBoardItem,
  type EmpireBoardResponse,
} from '../services/api';

const brandInk = 'rgb(18, 24, 23)';
type EmpireKey = Exclude<keyof EmpireBoardResponse, 'summary'>;
type AssignableEmpire = 'egito' | 'persia' | 'grecia' | 'roma' | 'none';
type GenderFilter = 'all' | 'male' | 'female';
type AgeGroupFilter = 'all' | '16_plus' | 'sub16';
type YearFilter = 'all' | '2008' | '2009' | '2010' | '2011' | '2012' | '2013';
type CsvColumnKey = 'empire' | 'participant_name' | 'birth_date' | 'age' | 'gender' | 'user_email' | 'phone' | 'cpf' | 'id';

const EMPIRE_META: Array<{
  key: EmpireKey;
  label: string;
  accent: string;
  cellAccent: string;
}> = [
  { key: 'egito', label: 'Egito', accent: 'bg-emerald-50 text-emerald-800 border-emerald-200', cellAccent: 'bg-emerald-50/80 border-emerald-200' },
  { key: 'persia', label: 'Pérsia', accent: 'bg-violet-50 text-violet-800 border-violet-200', cellAccent: 'bg-violet-50/80 border-violet-200' },
  { key: 'grecia', label: 'Grécia', accent: 'bg-orange-50 text-orange-800 border-orange-200', cellAccent: 'bg-orange-50/80 border-orange-200' },
  { key: 'roma', label: 'Roma', accent: 'bg-rose-50 text-rose-800 border-rose-200', cellAccent: 'bg-rose-50/80 border-rose-200' },
  { key: 'none', label: 'Sem império', accent: 'bg-stone-100 text-stone-800 border-stone-300', cellAccent: 'bg-stone-50 border-stone-200' },
];

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

const shellCardClass = 'rounded-[24px] border border-white/80 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]';
const summaryCardClass = 'rounded-[18px] border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]';
const statPillClass = 'inline-flex items-center rounded-full border border-white/80 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-gray-700 shadow-sm';
const inputClass =
  'min-w-[148px] rounded-2xl border border-[#ddd1bc] bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-[#bfa14a] focus:ring-2 focus:ring-[rgba(191,161,74,0.16)]';
const csvColumnOptions: Array<{ key: CsvColumnKey; label: string }> = [
  { key: 'empire', label: 'Império' },
  { key: 'participant_name', label: 'Nome' },
  { key: 'birth_date', label: 'Nascimento' },
  { key: 'age', label: 'Idade' },
  { key: 'gender', label: 'Sexo' },
  { key: 'user_email', label: 'Email' },
  { key: 'phone', label: 'Telefone' },
  { key: 'cpf', label: 'CPF' },
  { key: 'id', label: 'ID da inscrição' },
];

const renderColumnStats = (column: EmpireBoardResponse[EmpireKey]) => (
  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
    <span className={statPillClass}>H {column.summary.male_count}</span>
    <span className={statPillClass}>M {column.summary.female_count}</span>
    <span className={statPillClass}>16+ {column.summary.age_16_plus_count}</span>
    <span className={statPillClass}>SUB16 {column.summary.sub16_count}</span>
  </div>
);

const extractBirthYear = (value: string) => {
  if (!value || value.length < 4) return null;
  const year = value.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
};

const buildSummaryFromItems = (items: EmpireBoardItem[]) => {
  const summary: EmpireBoardResponse['summary'] = {
    total: items.length,
    male_count: 0,
    female_count: 0,
    unknown_gender_count: 0,
    age_16_plus_count: 0,
    sub16_count: 0,
    birth_year_groups: {
      '2008': 0,
      '2009': 0,
      '2010': 0,
      '2011': 0,
      '2012': 0,
      '2013': 0,
    },
  };

  items.forEach((item) => {
    if (item.gender === 'male') summary.male_count += 1;
    else if (item.gender === 'female') summary.female_count += 1;
    else summary.unknown_gender_count += 1;

    const year = extractBirthYear(item.birth_date);
    if (year && year in summary.birth_year_groups) {
      summary.birth_year_groups[year as keyof typeof summary.birth_year_groups] += 1;
    }
    if (year === '2008' || year === '2009' || year === '2010') summary.age_16_plus_count += 1;
    if (year === '2011' || year === '2012' || year === '2013') summary.sub16_count += 1;
  });

  return summary;
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
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [ageGroupFilter, setAgeGroupFilter] = useState<AgeGroupFilter>('all');
  const [yearFilter, setYearFilter] = useState<YearFilter>('all');
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedCsvColumns, setSelectedCsvColumns] = useState<CsvColumnKey[]>([
    'empire',
    'participant_name',
    'birth_date',
    'age',
    'gender',
  ]);

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

  const applyFilters = (items: EmpireBoardItem[]) =>
    items.filter((item) => {
      if (genderFilter !== 'all' && item.gender !== genderFilter) return false;

      const year = extractBirthYear(item.birth_date);

      if (yearFilter !== 'all' && year !== yearFilter) return false;

      if (ageGroupFilter === '16_plus' && !['2008', '2009', '2010'].includes(year || '')) return false;
      if (ageGroupFilter === 'sub16' && !['2011', '2012', '2013'].includes(year || '')) return false;

      return true;
    });

  const filteredBoard = board
    ? Object.fromEntries(
        EMPIRE_META.map((empire) => {
          const originalColumn = board[empire.key];
          const items = applyFilters(originalColumn.items);
          const ages = items.map((item) => item.age).filter((age): age is number => age !== null && !Number.isNaN(age));
          return [
            empire.key,
            {
              count: items.length,
              average_age: ages.length > 0 ? Number((ages.reduce((sum, age) => sum + age, 0) / ages.length).toFixed(1)) : null,
              summary: buildSummaryFromItems(items),
              items,
            },
          ];
        })
      ) as Record<EmpireKey, EmpireBoardResponse[EmpireKey]>
    : null;

  const filteredSummary = filteredBoard
    ? buildSummaryFromItems(EMPIRE_META.flatMap((empire) => filteredBoard[empire.key].items))
    : null;

  const toggleCsvColumn = (columnKey: CsvColumnKey) => {
    setSelectedCsvColumns((current) => {
      if (current.includes(columnKey)) {
        if (current.length === 1) return current;
        return current.filter((key) => key !== columnKey);
      }
      return [...current, columnKey];
    });
  };

  const formatGender = (value?: 'male' | 'female' | null) => {
    if (value === 'male') return 'Homem';
    if (value === 'female') return 'Mulher';
    return '';
  };

  const exportCsv = () => {
    if (!filteredBoard || selectedCsvColumns.length === 0) return;

    setExportingCsv(true);
    try {
      const rows = [EMPIRE_META.find((empire) => empire.key === 'none')!, ...EMPIRE_META.filter((empire) => empire.key !== 'none')]
        .flatMap((empire) =>
          sortItemsByAge(filteredBoard[empire.key].items).map((item) => [
            ...selectedCsvColumns.map((columnKey) => {
              if (columnKey === 'empire') return empire.label;
              if (columnKey === 'participant_name') return item.participant_name;
              if (columnKey === 'birth_date') return formatBirthDate(item.birth_date);
              if (columnKey === 'age') return item.age ?? '';
              if (columnKey === 'gender') return formatGender(item.gender);
              if (columnKey === 'user_email') return item.user_email;
              if (columnKey === 'phone') return item.phone;
              if (columnKey === 'cpf') return item.cpf;
              if (columnKey === 'id') return item.id;
              return '';
            }),
          ])
        );

      const csvContent = [
        selectedCsvColumns
          .map((columnKey) => csvColumnOptions.find((option) => option.key === columnKey)?.label || columnKey)
          .map(escapeCsvCell)
          .join(','),
        ...rows.map((row) => row.map(escapeCsvCell).join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `imperios_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      setShowExportModal(false);
    } finally {
      setExportingCsv(false);
    }
  };

  const renderParticipantCard = (item: EmpireBoardItem, empireKey: EmpireKey) => {
    const isUnassigned = empireKey === 'none';
    const isSelected = selectedAssignedIds.includes(item.id);
    const empireMeta = EMPIRE_META.find((empire) => empire.key === empireKey)!;
    const genderLabel = formatGender(item.gender);

    return (
      <article
        key={item.id}
        onClick={!isUnassigned ? () => toggleAssignedSelection(item.id) : undefined}
        className={`rounded-[16px] border p-2.5 shadow-sm transition-all ${empireMeta.cellAccent} ${
          isSelected
            ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-200'
            : 'border-white/80'
        } ${!isUnassigned ? 'cursor-pointer hover:-translate-y-0.5 hover:border-amber-200 hover:bg-amber-50/70' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-sans text-[12px] font-semibold leading-tight text-gray-950">
              {item.participant_name}
            </h3>
            <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
              <span className={statPillClass}>{formatBirthDate(item.birth_date)}</span>
              <span className={statPillClass}>{item.age ?? '-'} anos</span>
              {genderLabel ? <span className={statPillClass}>{genderLabel}</span> : null}
            </div>
          </div>
          <span className="rounded-full border border-white/80 bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
            #{item.id}
          </span>
        </div>

        {isUnassigned ? (
          <div className="mt-2.5 grid grid-cols-2 gap-1">
            {EMPIRE_META.filter((empire) => empire.key !== 'none').map((empire) => (
              <button
                key={empire.key}
                type="button"
                disabled={savingId === item.id}
                onClick={() => void handleAllocate(item.id, empire.key as AssignableEmpire)}
                className="rounded-lg border border-[#ddd1bc] bg-white px-2 py-1.5 text-[10px] font-semibold text-gray-700 transition-colors hover:bg-[#faf4e7] disabled:opacity-60"
              >
                {savingId === item.id ? '...' : empire.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-gray-500">
            <span>{empireMeta.label}</span>
            {!isUnassigned && isSelected ? <span className="text-amber-700">Selecionado</span> : null}
          </div>
        )}
      </article>
    );
  };

  const assignedEmpireMeta = EMPIRE_META.filter((empire) => empire.key !== 'none');
  const activeFilterCount = [genderFilter, ageGroupFilter, yearFilter].filter((value) => value !== 'all').length;
  const boardMeta = [
    { key: 'none' as EmpireKey, label: 'Sem império', accent: EMPIRE_META.find((empire) => empire.key === 'none')!.accent },
    ...assignedEmpireMeta,
  ];

  return (
    <AdminShell>
      <div className="space-y-4">
        <section
          className={`${shellCardClass} overflow-hidden p-4 lg:p-4.5`}
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-[1.85rem] font-bold tracking-tight text-gray-950 lg:text-[2.15rem]">
                Impérios
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-gray-600">
                Alocação por império com leitura compacta, filtros e comparação direta entre colunas.
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className={statPillClass}>{filteredSummary?.total ?? 0} visíveis</span>
                <span className={statPillClass}>{filteredBoard?.none.count ?? 0} sem império</span>
                <span className={statPillClass}>H {filteredSummary?.male_count ?? 0}</span>
                <span className={statPillClass}>M {filteredSummary?.female_count ?? 0}</span>
                <span className={statPillClass}>16+ {filteredSummary?.age_16_plus_count ?? 0}</span>
                <span className={statPillClass}>SUB16 {filteredSummary?.sub16_count ?? 0}</span>
                <span className={statPillClass}>{selectedAssignedIds.length} selecionados</span>
                <span className={statPillClass}>
                  {activeFilterCount === 0 ? 'Sem filtros' : `${activeFilterCount} filtros`}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className={`${shellCardClass} p-3.5 lg:p-4`}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#f5efe1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Controles da visão
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(true)}
                disabled={exportingCsv || !board}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: brandInk }}
              >
                <ArrowDownToLine className="h-4 w-4" />
                {exportingCsv ? 'Exportando...' : 'Exportar CSV'}
              </button>
            </div>

            <div className="grid gap-2 lg:grid-cols-[1fr_1fr_1fr_1.15fr]">
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Sexo</span>
                <select
                  value={genderFilter}
                  onChange={(event) => setGenderFilter(event.target.value as GenderFilter)}
                  className={inputClass}
                >
                  <option value="all">Todos</option>
                  <option value="male">Homens</option>
                  <option value="female">Mulheres</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Faixa</span>
                <select
                  value={ageGroupFilter}
                  onChange={(event) => setAgeGroupFilter(event.target.value as AgeGroupFilter)}
                  className={inputClass}
                >
                  <option value="all">Todas</option>
                  <option value="16_plus">16+</option>
                  <option value="sub16">SUB16</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Ano</span>
                <select
                  value={yearFilter}
                  onChange={(event) => setYearFilter(event.target.value as YearFilter)}
                  className={inputClass}
                >
                  <option value="all">Todos</option>
                  <option value="2008">2008</option>
                  <option value="2009">2009</option>
                  <option value="2010">2010</option>
                  <option value="2011">2011</option>
                  <option value="2012">2012</option>
                  <option value="2013">2013</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Ordenação</span>
                <select
                  value={ageSort}
                  onChange={(event) => setAgeSort(event.target.value as 'older_first' | 'younger_first')}
                  className={inputClass}
                >
                  <option value="older_first">Mais velhos primeiro</option>
                  <option value="younger_first">Mais novos primeiro</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
            <div className="w-full max-w-xl rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-sans text-xl font-bold text-gray-950">Exportar CSV</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Escolha quais colunas devem aparecer na planilha.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                  aria-label="Fechar modal de exportação"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {csvColumnOptions.map((option) => {
                  const checked = selectedCsvColumns.includes(option.key);
                  return (
                    <label
                      key={option.key}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors ${
                        checked
                          ? 'border-amber-300 bg-amber-50 text-gray-900'
                          : 'border-slate-200 bg-white text-gray-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCsvColumn(option.key)}
                        className="h-4 w-4"
                      />
                      <span className="font-medium">{option.label}</span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={exportingCsv || selectedCsvColumns.length === 0}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: brandInk }}
                >
                  {exportingCsv ? 'Exportando...' : 'Baixar CSV'}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedAssignedIds.length > 0 && (
          <div className="flex flex-col gap-2 rounded-[18px] border border-amber-200 bg-amber-50/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
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
                style={{ backgroundColor: brandInk }}
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
          <div className={`${shellCardClass} p-12 text-center text-gray-500`}>
            Carregando impérios...
          </div>
        ) : !board || !filteredBoard || !filteredSummary ? (
          <div className={`${shellCardClass} p-12 text-center text-gray-500`}>
            Não foi possível carregar os impérios.
          </div>
        ) : (
          <>
            <section className={`${shellCardClass} p-3.5 lg:p-4`}>
              <div className="space-y-3 xl:hidden">
                {boardMeta.map((empire) => {
                  const column = filteredBoard[empire.key];
                  const isUnassigned = empire.key === 'none';

                  return (
                    <section key={empire.key} className="rounded-[18px] border border-slate-200 bg-white p-2.5 shadow-sm">
                      <div className={`rounded-[14px] border px-2.5 py-2 ${empire.accent}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h2 className="font-sans text-sm font-bold">{empire.label}</h2>
                            <p className="mt-0.5 text-[10px] opacity-80">{column.count} integrantes</p>
                          </div>
                          <div className="rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                            {formatAverageAge(column.average_age)}
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-medium">
                          <span>H {column.summary.male_count}</span>
                          <span>M {column.summary.female_count}</span>
                          <span>16+ {column.summary.age_16_plus_count}</span>
                          <span>SUB16 {column.summary.sub16_count}</span>
                        </div>
                      </div>

                      <div className="mt-2.5 space-y-2">
                        {column.items.length === 0 ? (
                          <div className="rounded-[14px] border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-gray-500">
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

              <div className="hidden overflow-x-auto pb-1 xl:block">
                <div className="grid min-w-[1340px] gap-3 xl:grid-cols-5">
                  {boardMeta.map((empire) => {
                    const column = filteredBoard[empire.key];
                    const isUnassigned = empire.key === 'none';

                    return (
                      <section key={empire.key} className="rounded-[18px] border border-slate-200 bg-white p-2.5 shadow-sm">
                        <div className={`rounded-[14px] border px-2.5 py-2 ${empire.accent}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <h2 className="font-sans text-sm font-bold">{empire.label}</h2>
                              <p className="mt-0.5 text-[10px] opacity-80">{column.count} integrantes</p>
                            </div>
                            <div className="rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                              {formatAverageAge(column.average_age)}
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-medium">
                            <span>H {column.summary.male_count}</span>
                            <span>M {column.summary.female_count}</span>
                            <span>16+ {column.summary.age_16_plus_count}</span>
                            <span>SUB16 {column.summary.sub16_count}</span>
                          </div>
                        </div>

                        <div className="mt-2.5 max-h-[30rem] space-y-2 overflow-y-auto pr-1">
                          {column.items.length === 0 ? (
                            <div className="rounded-[14px] border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-gray-500">
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
            </section>
          </>
        )}
      </div>
    </AdminShell>
  );
}
