import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import {
  createAdminProduct,
  getAdminProducts,
  getAdminSettings,
  updateAdminProduct,
  updateAdminSettings,
  type AppSettings,
  type Product,
} from '../services/api';

type EventSettingsForm = Pick<
  AppSettings,
  'home_description' | 'home_date_text' | 'home_location_text' | 'home_location_subtext'
>;

export default function AdminEventSettings() {
  const primaryButtonClass =
    'inline-flex items-center gap-2 rounded-lg bg-dark px-5 py-3 font-medium text-white transition-colors hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-60';
  const activeTabClass = 'bg-gold/20 text-dark';

  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<'home' | 'event'>('home');
  const [eventProductId, setEventProductId] = useState<number | null>(null);
  const [formData, setFormData] = useState<EventSettingsForm>({
    home_description: '',
    home_date_text: '',
    home_location_text: '',
    home_location_subtext: '',
  });
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    base_price: '',
    max_installments: '6',
    event_date: '',
    is_active: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [productError, setProductError] = useState('');
  const [productSuccess, setProductSuccess] = useState('');

  const toDateTimeLocal = (iso?: string | null) => {
    if (!iso) return '';
    const date = new Date(iso);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
  };

  const mapProductToForm = (product?: Product | null) => ({
    name: product?.name || '',
    description: product?.description || '',
    base_price: product?.base_price || '',
    max_installments: product?.max_installments ? String(product.max_installments) : '6',
    event_date: toDateTimeLocal(product?.event_date || null),
    is_active: product?.is_active ?? true,
  });

  const loadProducts = async (preserveSelection = false) => {
    const response = await getAdminProducts();
    const loadedProducts = response.data as Product[];
    setProducts(loadedProducts);

    if (loadedProducts.length === 0) {
      setEventProductId(null);
      setProductForm(mapProductToForm(null));
      return;
    }

    const currentEventProduct =
      preserveSelection && eventProductId
        ? loadedProducts.find((product) => product.id === eventProductId) || loadedProducts[0]
        : loadedProducts[0];

    setEventProductId(currentEventProduct.id);
    setProductForm(mapProductToForm(currentEventProduct));
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [settingsResponse] = await Promise.all([
          getAdminSettings(),
          loadProducts(),
        ]);
        setFormData({
          home_description: settingsResponse.data.home_description || '',
          home_date_text: settingsResponse.data.home_date_text || '',
          home_location_text: settingsResponse.data.home_location_text || '',
          home_location_subtext: settingsResponse.data.home_location_subtext || '',
        });
      } catch (err) {
        setError('Erro ao carregar configurações do evento.');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await updateAdminSettings(formData);
      setFormData({
        home_description: response.data.home_description || '',
        home_date_text: response.data.home_date_text || '',
        home_location_text: response.data.home_location_text || '',
        home_location_subtext: response.data.home_location_subtext || '',
      });
      setSuccess('Configurações do evento salvas com sucesso.');
    } catch (err) {
      setError('Erro ao salvar configurações do evento.');
    } finally {
      setSaving(false);
    }
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProduct(true);
    setProductError('');
    setProductSuccess('');

    const payload = {
      name: productForm.name,
      description: productForm.description,
      base_price: productForm.base_price,
      max_installments: Number(productForm.max_installments),
      event_date: productForm.event_date ? new Date(productForm.event_date).toISOString() : null,
      is_active: productForm.is_active,
    };

    try {
      if (!eventProductId) {
        const response = await createAdminProduct(payload);
        setProductSuccess('Evento criado com sucesso.');
        await loadProducts();
        if (response.data?.id) {
          setEventProductId(response.data.id);
          setProductForm(mapProductToForm(response.data));
        }
      } else {
        await updateAdminProduct(eventProductId, payload);
        setProductSuccess('Evento atualizado com sucesso.');
        await loadProducts(true);
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setProductError(detail || 'Erro ao salvar evento.');
    } finally {
      setSavingProduct(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Evento</h2>
          <p className="mt-2 text-sm text-gray-600">
            Gerencie o conteúdo da home e o evento principal do site.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <div className="mb-6 flex flex-wrap gap-3 border-b border-gray-200 pb-4">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'home' ? activeTabClass : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('event')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'event' ? activeTabClass : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              Evento
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando configurações...
            </div>
          ) : activeTab === 'home' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
              {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Data mostrada na home</label>
                <input
                  type="text"
                  value={formData.home_date_text}
                  onChange={(e) => {
                    setFormData((current) => ({ ...current, home_date_text: e.target.value }));
                    setSuccess('');
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                  placeholder="Digite a data exibida na home"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Local mostrado na home</label>
                <input
                  type="text"
                  value={formData.home_location_text}
                  onChange={(e) => {
                    setFormData((current) => ({ ...current, home_location_text: e.target.value }));
                    setSuccess('');
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                  placeholder="Digite o local exibido na home"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Subtexto do local</label>
                <input
                  type="text"
                  value={formData.home_location_subtext}
                  onChange={(e) => {
                    setFormData((current) => ({ ...current, home_location_subtext: e.target.value }));
                    setSuccess('');
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                  placeholder="Endereço, referência ou complemento"
                />
                <p className="mt-2 text-sm text-gray-500">
                  Esse texto aparece menor logo abaixo do local na home.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Descrição da página inicial</label>
                <textarea
                  value={formData.home_description}
                  onChange={(e) => {
                    setFormData((current) => ({ ...current, home_description: e.target.value }));
                    setSuccess('');
                  }}
                  rows={8}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                  placeholder="Escreva aqui o texto principal da seção de descrição da home."
                />
                <p className="mt-2 text-sm text-gray-500">
                  Use linhas em branco para separar parágrafos na home.
                </p>
              </div>

              <div className="flex justify-end border-t border-gray-200 pt-6">
                <button
                  type="submit"
                  disabled={saving}
                  className={primaryButtonClass}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Salvando...' : 'Salvar conteúdo'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleProductSubmit} className="space-y-6">
              {productError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{productError}</div>}
              {productSuccess && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{productSuccess}</div>}

              <div>
                <h3 className="text-xl font-semibold text-gray-900">
                  {eventProductId ? 'Editar evento' : 'Criar evento'}
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  {eventProductId
                    ? 'Edite o evento principal usado pelo site e pelas inscrições.'
                    : 'Cadastre o evento principal usado pelo site e pelas inscrições.'}
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Nome do evento</label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => {
                    setProductForm((current) => ({ ...current, name: e.target.value }));
                    setProductSuccess('');
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                  placeholder="Ex: ZION 2026"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Descrição do evento</label>
                <textarea
                  value={productForm.description}
                  onChange={(e) => {
                    setProductForm((current) => ({ ...current, description: e.target.value }));
                    setProductSuccess('');
                  }}
                  rows={5}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                  placeholder="Descrição interna ou pública do evento."
                />
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Preço base</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.base_price}
                    onChange={(e) => {
                      setProductForm((current) => ({ ...current, base_price: e.target.value }));
                      setProductSuccess('');
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                    placeholder="0,00"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Máximo de parcelas</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={productForm.max_installments}
                    onChange={(e) => {
                      setProductForm((current) => ({ ...current, max_installments: e.target.value }));
                      setProductSuccess('');
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Data do evento</label>
                  <input
                    type="datetime-local"
                    value={productForm.event_date}
                    onChange={(e) => {
                      setProductForm((current) => ({ ...current, event_date: e.target.value }));
                      setProductSuccess('');
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
                <input
                  type="checkbox"
                  checked={productForm.is_active}
                  onChange={(e) => {
                    setProductForm((current) => ({ ...current, is_active: e.target.checked }));
                    setProductSuccess('');
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Evento ativo</span>
              </label>

              <div className="flex justify-end border-t border-gray-200 pt-6">
                <button
                  type="submit"
                  disabled={savingProduct}
                  className={primaryButtonClass}
                >
                  {savingProduct ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {savingProduct ? 'Salvando...' : eventProductId ? 'Salvar evento' : 'Criar evento'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
