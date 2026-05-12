import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, TicketPercent } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import {
  createAdminCoupon,
  deleteAdminCoupon,
  getAdminCoupons,
  getAdminProducts,
  getAdminSettings,
  updateAdminCoupon,
  updateAdminSettings,
  type Coupon,
  type Product,
} from '../services/api';

type CouponForm = {
  code: string;
  description: string;
  discount_type: 'PERCENTAGE' | 'FIXED';
  discount_value: string;
  max_discount: string;
  min_purchase: string;
  max_uses: string;
  valid_from: string;
  valid_until: string;
  active: boolean;
  enable_12x_installments: boolean;
  max_installments: number;
  allow_installments: boolean;
  allowed_payment_methods: Array<'PIX_CASH' | 'PIX_INSTALLMENT' | 'CREDIT_CARD'>;
  products: number[];
};

const emptyCouponForm: CouponForm = {
  code: '',
  description: '',
  discount_type: 'PERCENTAGE',
  discount_value: '',
  max_discount: '',
  min_purchase: '0',
  max_uses: '',
  valid_from: '',
  valid_until: '',
  active: true,
  enable_12x_installments: false,
  max_installments: 6,
  allow_installments: true,
  allowed_payment_methods: [],
  products: [],
};

export default function AdminCouponSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [enableCoupons, setEnableCoupons] = useState(true);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState<CouponForm>(emptyCouponForm);

  const sortedCoupons = useMemo(
    () => [...coupons].sort((a, b) => new Date(b.created_at || b.valid_from).getTime() - new Date(a.created_at || a.valid_from).getTime()),
    [coupons],
  );

  const loadData = async () => {
    try {
      const [settingsRes, couponsRes, productsRes] = await Promise.all([
        getAdminSettings(),
        getAdminCoupons(),
        getAdminProducts(),
      ]);

      setEnableCoupons(settingsRes.data.enable_coupons);
      setCoupons(couponsRes.data);
      setProducts(productsRes.data);
    } catch {
      setError('Erro ao carregar dados de cupons.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const toggleGlobalCoupons = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const newValue = !enableCoupons;
      await updateAdminSettings({ enable_coupons: newValue });
      setEnableCoupons(newValue);
      setSuccess(newValue ? 'Cupons ativados globalmente.' : 'Cupons desativados globalmente.');
    } catch {
      setError('Erro ao atualizar disponibilidade global de cupons.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await createAdminCoupon({
        code: formData.code,
        description: formData.description,
        discount_type: formData.discount_type,
        discount_value: formData.discount_value,
        max_discount: formData.max_discount || null,
        min_purchase: formData.min_purchase || '0',
        max_uses: formData.max_uses ? Number(formData.max_uses) : null,
        valid_from: new Date(formData.valid_from).toISOString(),
        valid_until: new Date(formData.valid_until).toISOString(),
        active: formData.active,
        enable_12x_installments: formData.enable_12x_installments,
        max_installments: formData.max_installments,
        allow_installments: formData.allow_installments,
        allowed_payment_methods: formData.allowed_payment_methods,
        products: formData.products,
      });

      setFormData(emptyCouponForm);
      setShowCreate(false);
      setSuccess('Cupom criado com sucesso.');
      await loadData();
    } catch {
      setError('Erro ao criar cupom. Verifique os dados preenchidos.');
    } finally {
      setSaving(false);
    }
  };

  const toggleCouponActive = async (coupon: Coupon) => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateAdminCoupon(coupon.id, { active: !coupon.active });
      setSuccess(!coupon.active ? 'Cupom ativado.' : 'Cupom desativado.');
      await loadData();
    } catch {
      setError('Erro ao alterar status do cupom.');
    } finally {
      setSaving(false);
    }
  };

  const removeCoupon = async (couponId: number) => {
    const confirmed = window.confirm('Tem certeza que deseja excluir este cupom?');
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await deleteAdminCoupon(couponId);
      setSuccess('Cupom excluído com sucesso.');
      await loadData();
    } catch {
      setError('Erro ao excluir cupom.');
    } finally {
      setSaving(false);
    }
  };

  const togglePaymentMethod = (method: 'PIX_CASH' | 'PIX_INSTALLMENT' | 'CREDIT_CARD') => {
    setFormData((current) => {
      const hasMethod = current.allowed_payment_methods.includes(method);
      return {
        ...current,
        allowed_payment_methods: hasMethod
          ? current.allowed_payment_methods.filter((value) => value !== method)
          : [...current.allowed_payment_methods, method],
      };
    });
  };

  const toggleProduct = (productId: number) => {
    setFormData((current) => {
      const hasProduct = current.products.includes(productId);
      return {
        ...current,
        products: hasProduct
          ? current.products.filter((value) => value !== productId)
          : [...current.products, productId],
      };
    });
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Cupons</h2>
            <p className="mt-2 text-sm text-gray-600">Gestão rápida de cupons e regras de parcelamento/pagamento.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white"
            style={{ backgroundColor: 'rgb(165, 44, 240)' }}
          >
            <Plus className="h-4 w-4" />
            Novo cupom
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <button
            type="button"
            onClick={() => void toggleGlobalCoupons()}
            disabled={saving}
            className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-4 py-4 text-left disabled:opacity-60"
          >
            <div>
              <p className="font-medium text-gray-900">Ativar/Desativar cupons globalmente</p>
              <p className="text-sm text-gray-600">Quando desativado, nenhum cupom novo é aceito no checkout.</p>
            </div>
            <span className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition-colors ${enableCoupons ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`h-5 w-5 rounded-full bg-white transition-transform ${enableCoupons ? 'translate-x-5' : 'translate-x-0'}`} />
            </span>
          </button>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Cupons cadastrados</h3>

          {loading ? (
            <div className="flex items-center gap-3 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando cupons...
            </div>
          ) : (
            <div className="space-y-4">
              {sortedCoupons.map((coupon) => (
                <div key={coupon.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{coupon.code}</p>
                      <p className="text-sm text-gray-600">{coupon.description || 'Sem descrição'}</p>
                    </div>
                    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${coupon.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                      {coupon.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
                    <p className="rounded-lg bg-gray-50 px-3 py-2 text-gray-700">
                      Desconto: <strong>{coupon.discount_type === 'PERCENTAGE' ? `${coupon.discount_value}%` : `R$ ${coupon.discount_value}`}</strong>
                    </p>
                    <p className="rounded-lg bg-gray-50 px-3 py-2 text-gray-700">
                      Parcelamento especial: <strong>{coupon.enable_12x_installments ? `Sim (${coupon.max_installments}x)` : 'Não'}</strong>
                    </p>
                    <p className="rounded-lg bg-gray-50 px-3 py-2 text-gray-700">
                      Parcelado permitido: <strong>{coupon.allow_installments ? 'Sim' : 'Não'}</strong>
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                      Usos: {coupon.uses_count}/{coupon.max_uses ?? '∞'}
                    </span>
                    {coupon.allowed_payment_methods.length > 0 ? (
                      <span className="rounded-full bg-purple/10 px-2 py-1 text-purple">
                        Pagamentos: {coupon.allowed_payment_methods.join(', ')}
                      </span>
                    ) : (
                      <span className="rounded-full bg-purple/10 px-2 py-1 text-purple">Pagamentos: todos</span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void toggleCouponActive(coupon)}
                      disabled={saving}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-60"
                    >
                      <span className={`inline-flex h-6 w-11 items-center rounded-full p-1 transition-colors ${coupon.active ? 'bg-green-500' : 'bg-gray-300'}`}>
                        <span className={`h-4 w-4 rounded-full bg-white transition-transform ${coupon.active ? 'translate-x-5' : 'translate-x-0'}`} />
                      </span>
                      {coupon.active ? 'Ativo' : 'Inativo'}
                    </button>

                    <button
                      type="button"
                      onClick={() => void removeCoupon(coupon.id)}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir
                    </button>
                  </div>
                </div>
              ))}

              {sortedCoupons.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
                  Nenhum cupom cadastrado.
                </div>
              )}
            </div>
          )}
        </div>

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-2xl">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <TicketPercent className="h-5 w-5 text-purple" />
                Novo cupom
              </h3>

              <form onSubmit={handleCreateCoupon} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData((current) => ({ ...current, code: e.target.value.toUpperCase() }))}
                  placeholder="Código (ex: PROMO10)"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                  required
                />

                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData((current) => ({ ...current, description: e.target.value }))}
                  placeholder="Descrição"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                />

                <select
                  value={formData.discount_type}
                  onChange={(e) => setFormData((current) => ({ ...current, discount_type: e.target.value as 'PERCENTAGE' | 'FIXED' }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                >
                  <option value="PERCENTAGE">Porcentagem</option>
                  <option value="FIXED">Valor fixo</option>
                </select>

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.discount_value}
                  onChange={(e) => setFormData((current) => ({ ...current, discount_value: e.target.value }))}
                  placeholder="Valor do desconto"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                  required
                />

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.max_discount}
                  onChange={(e) => setFormData((current) => ({ ...current, max_discount: e.target.value }))}
                  placeholder="Desconto máximo (opcional)"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                />

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.min_purchase}
                  onChange={(e) => setFormData((current) => ({ ...current, min_purchase: e.target.value }))}
                  placeholder="Compra mínima"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                />

                <input
                  type="number"
                  min="1"
                  value={formData.max_uses}
                  onChange={(e) => setFormData((current) => ({ ...current, max_uses: e.target.value }))}
                  placeholder="Usos máximos (opcional)"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                />

                <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  Parcelamento especial
                  <div className="mt-2 flex items-center justify-between">
                    <span>{formData.enable_12x_installments ? 'Ativo' : 'Inativo'}</span>
                    <span className={`inline-flex h-6 w-11 items-center rounded-full p-1 ${formData.enable_12x_installments ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <button
                        type="button"
                        onClick={() => setFormData((current) => ({ ...current, enable_12x_installments: !current.enable_12x_installments }))}
                        className={`h-4 w-4 rounded-full bg-white transition-transform ${formData.enable_12x_installments ? 'translate-x-5' : 'translate-x-0'}`}
                      />
                    </span>
                  </div>
                </div>

                <input
                  type="datetime-local"
                  value={formData.valid_from}
                  onChange={(e) => setFormData((current) => ({ ...current, valid_from: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                  required
                />

                <input
                  type="datetime-local"
                  value={formData.valid_until}
                  onChange={(e) => setFormData((current) => ({ ...current, valid_until: e.target.value }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                  required
                />

                <input
                  type="number"
                  min="1"
                  max="12"
                  value={formData.max_installments}
                  onChange={(e) => setFormData((current) => ({ ...current, max_installments: Number(e.target.value) }))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                  disabled={!formData.enable_12x_installments}
                />

                <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  Permitir parcelado
                  <div className="mt-2 flex items-center justify-between">
                    <span>{formData.allow_installments ? 'Sim' : 'Não'}</span>
                    <span className={`inline-flex h-6 w-11 items-center rounded-full p-1 ${formData.allow_installments ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <button
                        type="button"
                        onClick={() => setFormData((current) => ({ ...current, allow_installments: !current.allow_installments }))}
                        className={`h-4 w-4 rounded-full bg-white transition-transform ${formData.allow_installments ? 'translate-x-5' : 'translate-x-0'}`}
                      />
                    </span>
                  </div>
                </div>

                <div className="xl:col-span-2 rounded-lg border border-gray-200 p-3">
                  <p className="mb-2 text-sm font-medium text-gray-800">Formas de pagamento permitidas</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'PIX_CASH', label: 'PIX à vista' },
                      { value: 'PIX_INSTALLMENT', label: 'PIX parcelado' },
                      { value: 'CREDIT_CARD', label: 'Cartão' },
                    ].map((method) => {
                      const checked = formData.allowed_payment_methods.includes(method.value as 'PIX_CASH' | 'PIX_INSTALLMENT' | 'CREDIT_CARD');
                      return (
                        <button
                          key={method.value}
                          type="button"
                          onClick={() => togglePaymentMethod(method.value as 'PIX_CASH' | 'PIX_INSTALLMENT' | 'CREDIT_CARD')}
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${checked ? 'border-purple bg-purple/10 text-purple' : 'border-gray-300 text-gray-600'}`}
                        >
                          {method.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">Sem seleção = todas permitidas.</p>
                </div>

                <div className="xl:col-span-2 rounded-lg border border-gray-200 p-3">
                  <p className="mb-2 text-sm font-medium text-gray-800">Produtos permitidos</p>
                  <div className="flex flex-wrap gap-2">
                    {products.map((product) => {
                      const checked = formData.products.includes(product.id);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => toggleProduct(product.id)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${checked ? 'border-purple bg-purple/10 text-purple' : 'border-gray-300 text-gray-600'}`}
                        >
                          {product.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">Sem seleção = todos os produtos.</p>
                </div>

                <div className="md:col-span-2 xl:col-span-4 flex justify-end gap-2 border-t border-gray-200 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: 'rgb(165, 44, 240)' }}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Criar cupom
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
