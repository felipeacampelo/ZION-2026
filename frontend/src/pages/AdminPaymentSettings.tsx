import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import { getAdminSettings, updateAdminSettings, type AppSettings } from '../services/api';

type PaymentSettingsForm = Pick<
  AppSettings,
  | 'enrollment_start_at'
  | 'enrollment_end_at'
  | 'max_installments'
  | 'enable_pix_cash'
  | 'enable_pix_installment'
  | 'enable_credit_card'
>;

const toDateTimeLocal = (value: string | null) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function AdminPaymentSettings() {
  const [formData, setFormData] = useState<PaymentSettingsForm>({
    enrollment_start_at: null,
    enrollment_end_at: null,
    max_installments: 6,
    enable_pix_cash: true,
    enable_pix_installment: true,
    enable_credit_card: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await getAdminSettings();
        setFormData({
          enrollment_start_at: response.data.enrollment_start_at ? toDateTimeLocal(response.data.enrollment_start_at) : null,
          enrollment_end_at: response.data.enrollment_end_at ? toDateTimeLocal(response.data.enrollment_end_at) : null,
          max_installments: response.data.max_installments,
          enable_pix_cash: response.data.enable_pix_cash,
          enable_pix_installment: response.data.enable_pix_installment,
          enable_credit_card: response.data.enable_credit_card,
        });
      } catch (err) {
        setError('Erro ao carregar opções de pagamento.');
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
      const payload = {
        ...formData,
        enrollment_start_at: formData.enrollment_start_at ? new Date(formData.enrollment_start_at).toISOString() : null,
        enrollment_end_at: formData.enrollment_end_at ? new Date(formData.enrollment_end_at).toISOString() : null,
      };
      const response = await updateAdminSettings(payload);
      setFormData({
        enrollment_start_at: response.data.enrollment_start_at ? toDateTimeLocal(response.data.enrollment_start_at) : null,
        enrollment_end_at: response.data.enrollment_end_at ? toDateTimeLocal(response.data.enrollment_end_at) : null,
        max_installments: response.data.max_installments,
        enable_pix_cash: response.data.enable_pix_cash,
        enable_pix_installment: response.data.enable_pix_installment,
        enable_credit_card: response.data.enable_credit_card,
      });
      setSuccess('Opções de pagamento salvas com sucesso.');
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.max_installments?.[0]) {
        setError(data.max_installments[0]);
      } else if (data?.non_field_errors?.[0]) {
        setError(data.non_field_errors[0]);
      } else {
        setError('Erro ao salvar opções de pagamento.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Pagamentos</h2>
          <p className="mt-2 text-sm text-gray-600">Controle as opções disponíveis para novos pagamentos.</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg">
          {loading ? (
            <div className="flex items-center gap-3 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando opções...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
              {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

              <button
                type="button"
                onClick={() => {
                  setFormData((current) => ({
                    ...current,
                    enable_pix_cash: !current.enable_pix_cash,
                  }));
                  setSuccess('');
                }}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-4 py-4 text-left"
              >
                <div>
                  <p className="font-medium text-gray-900">Permitir PIX à vista</p>
                  <p className="text-sm text-gray-600">Controla a disponibilidade do PIX à vista para novos pagamentos.</p>
                </div>
                <span className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition-colors ${formData.enable_pix_cash ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`h-5 w-5 rounded-full bg-white transition-transform ${formData.enable_pix_cash ? 'translate-x-5' : 'translate-x-0'}`} />
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFormData((current) => ({
                    ...current,
                    enable_pix_installment: !current.enable_pix_installment,
                  }));
                  setSuccess('');
                }}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-4 py-4 text-left"
              >
                <div>
                  <p className="font-medium text-gray-900">Permitir PIX parcelado</p>
                  <p className="text-sm text-gray-600">Remove do frontend e bloqueia novos pagamentos parcelados via PIX.</p>
                </div>
                <span className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition-colors ${formData.enable_pix_installment ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`h-5 w-5 rounded-full bg-white transition-transform ${formData.enable_pix_installment ? 'translate-x-5' : 'translate-x-0'}`} />
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFormData((current) => ({
                    ...current,
                    enable_credit_card: !current.enable_credit_card,
                  }));
                  setSuccess('');
                }}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-4 py-4 text-left"
              >
                <div>
                  <p className="font-medium text-gray-900">Permitir cartão de crédito</p>
                  <p className="text-sm text-gray-600">Controla a disponibilidade do cartão para novos pagamentos.</p>
                </div>
                <span className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition-colors ${formData.enable_credit_card ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`h-5 w-5 rounded-full bg-white transition-transform ${formData.enable_credit_card ? 'translate-x-5' : 'translate-x-0'}`} />
                </span>
              </button>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Máximo de parcelas</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={formData.max_installments}
                  onChange={(e) =>
                    setFormData((current) => ({
                      ...current,
                      max_installments: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                />
                <p className="mt-2 text-sm text-gray-500">Valor entre 1 e 12, igual ao controle operacional já existente no Django Admin.</p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <h3 className="text-lg font-semibold text-gray-900">Inscrições</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Defina a janela em que a homepage mostra os cards de pagamento e libera novas inscrições.
                  Se os campos ficarem vazios, as inscrições permanecem abertas.
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Início das inscrições</label>
                    <input
                      type="datetime-local"
                      value={formData.enrollment_start_at ?? ''}
                      onChange={(e) =>
                        setFormData((current) => ({
                          ...current,
                          enrollment_start_at: e.target.value || null,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Fim das inscrições</label>
                    <input
                      type="datetime-local"
                      value={formData.enrollment_end_at ?? ''}
                      onChange={(e) =>
                        setFormData((current) => ({
                          ...current,
                          enrollment_end_at: e.target.value || null,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end border-t border-gray-200 pt-6">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: 'rgb(165, 44, 240)' }}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Salvando...' : 'Salvar opções'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
