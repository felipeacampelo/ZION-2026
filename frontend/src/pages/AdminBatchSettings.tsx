import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Trash2, Power, Pencil } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import {
  createAdminBatch,
  deleteAdminBatch,
  getAdminBatches,
  getAdminProducts,
  updateAdminBatch,
  type Batch,
  type Product,
} from '../services/api';

type BatchCreateForm = {
  product: number;
  name: string;
  start_date: string;
  end_date: string;
  price: string;
  pix_installment_price: string;
  credit_card_price: string;
  max_enrollments: string;
};

const emptyCreateForm: BatchCreateForm = {
  product: 0,
  name: '',
  start_date: '',
  end_date: '',
  price: '',
  pix_installment_price: '',
  credit_card_price: '',
  max_enrollments: '',
};

export default function AdminBatchSettings() {
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createForm, setCreateForm] = useState<BatchCreateForm>(emptyCreateForm);
  const [editingBatchId, setEditingBatchId] = useState<number | null>(null);
  const [priceForm, setPriceForm] = useState({
    price: '',
    pix_installment_price: '',
    credit_card_price: '',
  });

  const sortedBatches = useMemo(
    () => [...batches].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()),
    [batches],
  );

  const loadData = async () => {
    try {
      const [productsRes, batchesRes] = await Promise.all([getAdminProducts(), getAdminBatches()]);
      setProducts(productsRes.data);
      setBatches(batchesRes.data);
      if (productsRes.data.length > 0) {
        setCreateForm((current) => ({
          ...current,
          product: current.product || productsRes.data[0].id,
        }));
      }
    } catch (err) {
      setError('Erro ao carregar lotes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await createAdminBatch({
        product: createForm.product,
        name: createForm.name,
        start_date: new Date(createForm.start_date).toISOString(),
        end_date: new Date(createForm.end_date).toISOString(),
        price: createForm.price,
        pix_installment_price: createForm.pix_installment_price,
        credit_card_price: createForm.credit_card_price,
        max_enrollments: createForm.max_enrollments ? Number(createForm.max_enrollments) : null,
      });

      setCreateForm((current) => ({
        ...emptyCreateForm,
        product: current.product,
      }));
      setSuccess('Lote criado com sucesso.');
      await loadData();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Erro ao criar lote.');
    } finally {
      setSaving(false);
    }
  };

  const startEditPrices = (batch: Batch) => {
    setEditingBatchId(batch.id);
    setPriceForm({
      price: String(batch.price),
      pix_installment_price: String(batch.pix_installment_price),
      credit_card_price: String(batch.credit_card_price),
    });
    setError('');
    setSuccess('');
  };

  const savePrices = async (batchId: number) => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateAdminBatch(batchId, {
        price: priceForm.price,
        pix_installment_price: priceForm.pix_installment_price,
        credit_card_price: priceForm.credit_card_price,
      });
      setEditingBatchId(null);
      setSuccess('Preços atualizados com sucesso.');
      await loadData();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Erro ao atualizar preços do lote.');
    } finally {
      setSaving(false);
    }
  };

  const toggleBatchStatus = async (batch: Batch) => {
    setSaving(true);
    setError('');
    setSuccess('');

    const now = new Date();
    const startDate = new Date(batch.start_date);
    const endDate = new Date(batch.end_date);

    const activating = batch.status !== 'ACTIVE';

    const payload = activating
      ? {
          status: 'ACTIVE',
          start_date: (startDate > now ? now : startDate).toISOString(),
          end_date: (endDate <= now ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : endDate).toISOString(),
        }
      : {
          status: 'ENDED',
          end_date: now.toISOString(),
        };

    try {
      await updateAdminBatch(batch.id, payload);
      setSuccess(activating ? 'Lote ativado.' : 'Lote desativado.');
      await loadData();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Erro ao alterar status do lote.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBatch = async (batchId: number) => {
    const confirmed = window.confirm('Tem certeza que deseja excluir este lote?');
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await deleteAdminBatch(batchId);
      setSuccess('Lote excluído com sucesso.');
      await loadData();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Erro ao excluir lote.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Controle de Lotes</h2>
          <p className="mt-2 text-sm text-gray-600">Ative/desative, crie, edite preços e exclua lotes.</p>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Plus className="h-5 w-5 text-purple" />
            Novo Lote
          </h3>

          <form onSubmit={handleCreateBatch} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={createForm.product}
              onChange={(e) => setCreateForm((current) => ({ ...current, product: Number(e.target.value) }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              required
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Nome do lote"
              value={createForm.name}
              onChange={(e) => setCreateForm((current) => ({ ...current, name: e.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              required
            />

            <input
              type="datetime-local"
              value={createForm.start_date}
              onChange={(e) => setCreateForm((current) => ({ ...current, start_date: e.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              required
            />

            <input
              type="datetime-local"
              value={createForm.end_date}
              onChange={(e) => setCreateForm((current) => ({ ...current, end_date: e.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              required
            />

            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Preço PIX à vista"
              value={createForm.price}
              onChange={(e) => setCreateForm((current) => ({ ...current, price: e.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              required
            />

            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Preço PIX parcelado"
              value={createForm.pix_installment_price}
              onChange={(e) => setCreateForm((current) => ({ ...current, pix_installment_price: e.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              required
            />

            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Preço cartão"
              value={createForm.credit_card_price}
              onChange={(e) => setCreateForm((current) => ({ ...current, credit_card_price: e.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              required
            />

            <input
              type="number"
              min="1"
              placeholder="Vagas (opcional)"
              value={createForm.max_enrollments}
              onChange={(e) => setCreateForm((current) => ({ ...current, max_enrollments: e.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
            />

            <div className="md:col-span-2 xl:col-span-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: 'rgb(165, 44, 240)' }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar lote
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Lotes existentes</h3>

          {loading ? (
            <div className="flex items-center gap-3 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando lotes...
            </div>
          ) : (
            <div className="space-y-4">
              {sortedBatches.map((batch) => (
                <div key={batch.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{batch.name}</p>
                      <p className="text-sm text-gray-600">{batch.product_name || `Produto #${batch.product}`}</p>
                    </div>
                    <span className="inline-flex w-fit rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {batch.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    <p className="rounded-lg bg-gray-50 px-3 py-2 text-gray-700">PIX à vista: <strong>R$ {batch.price}</strong></p>
                    <p className="rounded-lg bg-gray-50 px-3 py-2 text-gray-700">PIX parcelado: <strong>R$ {batch.pix_installment_price}</strong></p>
                    <p className="rounded-lg bg-gray-50 px-3 py-2 text-gray-700">Cartão: <strong>R$ {batch.credit_card_price}</strong></p>
                  </div>

                  <p className="mt-3 text-xs text-gray-500">
                    {new Date(batch.start_date).toLocaleString('pt-BR')} até {new Date(batch.end_date).toLocaleString('pt-BR')}
                  </p>

                  {editingBatchId === batch.id && (
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={priceForm.price}
                        onChange={(e) => setPriceForm((current) => ({ ...current, price: e.target.value }))}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={priceForm.pix_installment_price}
                        onChange={(e) => setPriceForm((current) => ({ ...current, pix_installment_price: e.target.value }))}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={priceForm.credit_card_price}
                        onChange={(e) => setPriceForm((current) => ({ ...current, credit_card_price: e.target.value }))}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                      />
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleBatchStatus(batch)}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      <Power className="h-4 w-4" />
                      {batch.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                    </button>

                    {editingBatchId === batch.id ? (
                      <button
                        type="button"
                        onClick={() => void savePrices(batch.id)}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                        style={{ backgroundColor: 'rgb(165, 44, 240)' }}
                      >
                        <Save className="h-4 w-4" />
                        Salvar preços
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditPrices(batch)}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        <Pencil className="h-4 w-4" />
                        Editar preços
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleDeleteBatch(batch.id)}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir
                    </button>
                  </div>
                </div>
              ))}

              {sortedBatches.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
                  Nenhum lote cadastrado.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
