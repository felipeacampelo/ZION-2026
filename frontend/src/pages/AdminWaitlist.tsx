import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarClock, Loader2, Mail, Trash2, X } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import {
  deleteAdminWaitlistEntry,
  extendAdminWaitlistDeadline,
  getAdminProducts,
  getAdminWaitlist,
  inviteAdminWaitlistEntry,
  reorderAdminWaitlist,
  toggleAdminWaitlistAutoInvite,
  type Product,
  type WaitlistEntry,
} from '../services/api';

const WAITLIST_STATUS_META: Record<string, { label: string; className: string }> = {
  WAITING: {
    label: 'Na fila',
    className: 'bg-amber-100 text-amber-800 border border-amber-200',
  },
  INVITED: {
    label: 'Convocado',
    className: 'bg-sky-100 text-sky-800 border border-sky-200',
  },
  CONVERTED: {
    label: 'Convertido',
    className: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  },
  EXPIRED: {
    label: 'Expirado',
    className: 'bg-orange-100 text-orange-800 border border-orange-200',
  },
  REMOVED: {
    label: 'Removido',
    className: 'bg-rose-100 text-rose-800 border border-rose-200',
  },
};

const WAITLIST_STATUS_ORDER: Record<string, number> = {
  CONVERTED: 0,
  INVITED: 1,
  WAITING: 2,
  EXPIRED: 3,
  REMOVED: 4,
};

const toDatetimeLocalValue = (date: Date) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

export default function AdminWaitlist() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<number | ''>('');
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [autoInviteEnabled, setAutoInviteEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deadlineEntry, setDeadlineEntry] = useState<WaitlistEntry | null>(null);
  const [deadlineValue, setDeadlineValue] = useState('');

  const waitingEntries = useMemo(
    () => entries.filter((entry) => entry.status === 'WAITING'),
    [entries],
  );

  const orderedEntries = useMemo(
    () =>
      [...entries].sort((a, b) => {
        const statusDiff =
          (WAITLIST_STATUS_ORDER[a.status] ?? 99) - (WAITLIST_STATUS_ORDER[b.status] ?? 99);

        if (statusDiff !== 0) {
          return statusDiff;
        }

        if (a.status === 'WAITING' && b.status === 'WAITING') {
          return (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
        }

        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    [entries],
  );

  const getWaitlistStatusMeta = (entry: WaitlistEntry) => {
    if (entry.status === 'CONVERTED') {
      if (entry.waitlist_payment_state === 'PAID') {
        return {
          label: 'Pago',
          className: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
        };
      }

      return {
        label: 'Aguardando pagamento',
        className: 'bg-violet-100 text-violet-800 border border-violet-200',
      };
    }

    return WAITLIST_STATUS_META[entry.status] ?? {
      label: entry.status,
      className: 'bg-gray-100 text-gray-700 border border-gray-200',
    };
  };

  const loadData = async (productId?: number | '') => {
    setLoading(true);
    setError('');
    try {
      const [productsRes, waitlistRes] = await Promise.all([
        getAdminProducts(),
        getAdminWaitlist(productId ? { product: productId } : undefined),
      ]);
      setProducts(productsRes.data);
      setEntries(waitlistRes.data.results);
      setAutoInviteEnabled(waitlistRes.data.auto_invite_enabled);
      if (!selectedProduct && productsRes.data.length === 1) {
        setSelectedProduct(productsRes.data[0].id);
      }
    } catch (err) {
      setError('Erro ao carregar a lista de espera.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(selectedProduct);
  }, [selectedProduct]);

  const handleToggleAutoInvite = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await toggleAdminWaitlistAutoInvite(!autoInviteEnabled);
      setAutoInviteEnabled(response.data.waitlist_auto_invite_enabled);
      setSuccess(response.data.waitlist_auto_invite_enabled ? 'Convocação automática ativada.' : 'Convocação automática pausada.');
    } catch (err) {
      setError('Não foi possível atualizar a convocação automática.');
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async (entryId: number) => {
    setSaving(true);
    setError('');
    try {
      await inviteAdminWaitlistEntry(entryId);
      setSuccess('Convite enviado com sucesso.');
      await loadData(selectedProduct);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Não foi possível enviar o convite.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entryId: number) => {
    setSaving(true);
    setError('');
    try {
      await deleteAdminWaitlistEntry(entryId);
      setSuccess('Entrada removida da fila.');
      await loadData(selectedProduct);
    } catch (err) {
      setError('Não foi possível remover a entrada.');
    } finally {
      setSaving(false);
    }
  };

  const openDeadlineModal = (entry: WaitlistEntry) => {
    const currentDeadline = entry.invite_expires_at ? new Date(entry.invite_expires_at) : null;
    const fallbackDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
    setDeadlineEntry(entry);
    setDeadlineValue(toDatetimeLocalValue(currentDeadline && currentDeadline > new Date() ? currentDeadline : fallbackDeadline));
    setError('');
  };

  const closeDeadlineModal = () => {
    setDeadlineEntry(null);
    setDeadlineValue('');
  };

  const handleExtendDeadline = async () => {
    if (!deadlineEntry || !deadlineValue) return;

    const selectedDate = new Date(deadlineValue);
    if (Number.isNaN(selectedDate.getTime()) || selectedDate <= new Date()) {
      setError('Escolha uma data e hora futura para o prazo.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await extendAdminWaitlistDeadline(deadlineEntry.id, {
        expires_at: selectedDate.toISOString(),
      });
      setSuccess(deadlineEntry.status === 'EXPIRED' ? 'Convite prorrogado e reenviado com sucesso.' : 'Prazo atualizado com sucesso.');
      closeDeadlineModal();
      await loadData(selectedProduct);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.expires_at?.[0] || 'Não foi possível atualizar o prazo.');
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (entryId: number, direction: 'up' | 'down') => {
    const waitingIds = waitingEntries.map((entry) => entry.id);
    const currentIndex = waitingIds.indexOf(entryId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= waitingIds.length) return;

    const reordered = [...waitingIds];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];

    setSaving(true);
    setError('');
    try {
      await reorderAdminWaitlist({
        product_id: Number(selectedProduct || entries.find((entry) => entry.id === entryId)?.product || 0),
        ordered_ids: reordered,
      });
      await loadData(selectedProduct);
    } catch (err) {
      setError('Não foi possível reordenar a fila.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Operação</p>
              <h1 className="mt-2 text-3xl font-bold text-gray-950">Lista de espera</h1>
              <p className="mt-2 text-sm text-gray-600">Gerencie a fila, dispare convites manuais e pause a convocação automática quando necessário.</p>
            </div>
            <button
              type="button"
              onClick={handleToggleAutoInvite}
              disabled={saving}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${autoInviteEnabled ? 'bg-dark text-white' : 'bg-gray-100 text-gray-800'}`}
            >
              {autoInviteEnabled ? 'Pausar convocação automática' : 'Ativar convocação automática'}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-gray-700">Evento</label>
          <select
            value={selectedProduct}
            onChange={(event) => setSelectedProduct(event.target.value ? Number(event.target.value) : '')}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-dark focus:outline-none"
          >
            <option value="">Todos os eventos</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center gap-3 p-10 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando fila...
            </div>
          ) : entries.length === 0 ? (
            <div className="p-10 text-center text-gray-500">Nenhuma pessoa na lista de espera.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    <th className="px-4 py-3">Posição</th>
                    <th className="px-4 py-3">Participante</th>
                    <th className="px-4 py-3">Evento</th>
                    <th className="px-4 py-3">Lote ref.</th>
                    <th className="px-4 py-3">Cupom</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Prazo</th>
                    <th className="px-4 py-3">Entrada</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orderedEntries.map((entry) => {
                    const statusMeta = getWaitlistStatusMeta(entry);

                    return (
                    <tr key={entry.id} className="text-sm text-gray-700">
                      <td className="px-4 py-4">
                        {entry.status === 'WAITING' ? (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-950">{entry.position}</span>
                            <button type="button" onClick={() => handleMove(entry.id, 'up')} disabled={saving} className="rounded-md border border-gray-200 p-1 hover:bg-gray-50">
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => handleMove(entry.id, 'down')} disabled={saving} className="rounded-md border border-gray-200 p-1 hover:bg-gray-50">
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-gray-950">{entry.participant_name}</div>
                        <div className="text-xs text-gray-500">{entry.email}</div>
                        {entry.phone && <div className="text-xs text-gray-500">{entry.phone}</div>}
                      </td>
                      <td className="px-4 py-4">{entry.product_name}</td>
                      <td className="px-4 py-4">{entry.reference_batch_name || '-'}</td>
                      <td className="px-4 py-4">{entry.coupon_code || '-'}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-500">
                        {entry.invite_expires_at ? new Date(entry.invite_expires_at).toLocaleString('pt-BR') : '-'}
                      </td>
                      <td className="px-4 py-4">{new Date(entry.created_at).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          {entry.status === 'WAITING' && (
                            <button type="button" onClick={() => handleInvite(entry.id)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white">
                              <Mail className="h-3.5 w-3.5" />
                              Convocar
                            </button>
                          )}
                          {entry.status === 'INVITED' && (
                            <button type="button" onClick={() => openDeadlineModal(entry)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                              <CalendarClock className="h-3.5 w-3.5" />
                              Alterar prazo
                            </button>
                          )}
                          {entry.status === 'EXPIRED' && (
                            <button type="button" onClick={() => openDeadlineModal(entry)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-orange-200 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-50">
                              <CalendarClock className="h-3.5 w-3.5" />
                              Prorrogar
                            </button>
                          )}
                          <button type="button" onClick={() => handleDelete(entry.id)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                            Remover
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {deadlineEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Prazo do convite</p>
                <h2 className="mt-2 text-xl font-bold text-gray-950">
                  {deadlineEntry.status === 'EXPIRED' ? 'Prorrogar convite' : 'Alterar prazo'}
                </h2>
              </div>
              <button type="button" onClick={closeDeadlineModal} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <div className="font-semibold text-gray-950">{deadlineEntry.participant_name}</div>
                <div className="text-sm text-gray-500">{deadlineEntry.email}</div>
              </div>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700">Novo prazo</span>
                <input
                  type="datetime-local"
                  value={deadlineValue}
                  onChange={(event) => setDeadlineValue(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-dark focus:outline-none"
                />
              </label>
              <p className="text-sm text-gray-600">
                {deadlineEntry.status === 'EXPIRED'
                  ? 'Ao confirmar, um novo link será gerado e o email de convite será reenviado.'
                  : 'Ao confirmar, o link atual continua válido até o novo prazo. Nenhum email será enviado automaticamente.'}
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeDeadlineModal} disabled={saving} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">
                Cancelar
              </button>
              <button type="button" onClick={handleExtendDeadline} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-dark px-4 py-2 text-sm font-semibold text-white">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
