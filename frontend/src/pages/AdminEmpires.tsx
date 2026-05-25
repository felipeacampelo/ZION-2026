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
}> = [
  { key: 'egito', label: 'Egito', accent: 'bg-amber-50 text-amber-700 border-amber-100' },
  { key: 'persia', label: 'Pérsia', accent: 'bg-sky-50 text-sky-700 border-sky-100' },
  { key: 'grecia', label: 'Grécia', accent: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  { key: 'roma', label: 'Roma', accent: 'bg-rose-50 text-rose-700 border-rose-100' },
  { key: 'none', label: 'Sem império', accent: 'bg-slate-100 text-slate-700 border-slate-200' },
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

export default function AdminEmpires() {
  const [board, setBoard] = useState<EmpireBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const loadBoard = async () => {
    try {
      const response = await getAdminEmpiresBoard();
      setBoard(response.data);
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

  const handleAllocate = async (enrollmentId: number, targetEmpire: 'egito' | 'persia' | 'grecia' | 'roma') => {
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

  const renderParticipantCard = (item: EmpireBoardItem, allowAllocation: boolean) => (
    <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-950">{item.participant_name}</h3>
          <p className="mt-1 break-all text-xs text-gray-500">{item.user_email}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
          #{item.id}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-600">
        <div>
          <p className="uppercase tracking-[0.08em] text-gray-500">Nascimento</p>
          <p className="mt-1 font-medium text-gray-900">{formatBirthDate(item.birth_date)}</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.08em] text-gray-500">Idade</p>
          <p className="mt-1 font-medium text-gray-900">{item.age ?? '-'}</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.08em] text-gray-500">Telefone</p>
          <p className="mt-1 font-medium text-gray-900">{item.phone || '-'}</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.08em] text-gray-500">CPF</p>
          <p className="mt-1 font-medium text-gray-900">{item.cpf || '-'}</p>
        </div>
      </div>

      {allowAllocation && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {EMPIRE_META.filter((empire) => empire.key !== 'none').map((empire) => (
            <button
              key={empire.key}
              type="button"
              disabled={savingId === item.id}
              onClick={() => void handleAllocate(item.id, empire.key as 'egito' | 'persia' | 'grecia' | 'roma')}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
            >
              {savingId === item.id ? 'Alocando...' : `Enviar para ${empire.label}`}
            </button>
          ))}
        </div>
      )}
    </article>
  );

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-950">Impérios</h1>
          <p className="mt-1 text-sm text-gray-600">
            Organize os inscritos por império e aloque quem ainda está sem império.
          </p>
        </div>

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
          <div className="grid gap-4 2xl:grid-cols-5 xl:grid-cols-3 md:grid-cols-2">
            {EMPIRE_META.map((empire) => {
              const column = board[empire.key];
              return (
                <section key={empire.key} className="rounded-[28px] border border-white/80 bg-white p-4 shadow-sm">
                  <div className={`rounded-2xl border px-4 py-3 ${empire.accent}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold">{empire.label}</h2>
                        <p className="mt-1 text-xs opacity-80">{column.count} integrantes</p>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70">
                        {empire.key === 'none' ? (
                          <ShieldAlert className="h-5 w-5" />
                        ) : (
                          <Users className="h-5 w-5" style={{ color: brandPurple }} />
                        )}
                      </div>
                    </div>
                    <p className="mt-3 text-sm font-semibold">Idade média: {formatAverageAge(column.average_age)}</p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {column.items.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-gray-500">
                        Nenhum inscrito nesta coluna.
                      </div>
                    ) : (
                      column.items.map((item) => renderParticipantCard(item, empire.key === 'none'))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
