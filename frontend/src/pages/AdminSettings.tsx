import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import { getAdminSettings, updateAdminSettings, type AppSettings } from '../services/api';

type SettingsForm = Pick<AppSettings, 'max_installments' | 'enable_pix_installment' | 'enable_shirt_size_field'>;

export default function AdminSettings() {
  const [formData, setFormData] = useState<SettingsForm>({
    max_installments: 6,
    enable_pix_installment: true,
    enable_shirt_size_field: true,
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
          max_installments: response.data.max_installments,
          enable_pix_installment: response.data.enable_pix_installment,
          enable_shirt_size_field: response.data.enable_shirt_size_field,
        });
      } catch (err) {
        setError('Erro ao carregar opções do admin.');
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
        max_installments: response.data.max_installments,
        enable_pix_installment: response.data.enable_pix_installment,
        enable_shirt_size_field: response.data.enable_shirt_size_field,
      });
      setSuccess('Opções salvas com sucesso.');
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.max_installments?.[0]) {
        setError(data.max_installments[0]);
      } else {
        setError('Erro ao salvar opções.');
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleField = (field: 'enable_pix_installment' | 'enable_shirt_size_field') => {
    setFormData((current) => ({ ...current, [field]: !current[field] }));
    setSuccess('');
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <h2 className="text-3xl font-bold text-gray-900">Opções do Admin</h2>

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

              <section className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Pagamentos</h3>
                  <p className="text-sm text-gray-600">Controle as opções disponíveis para novos pagamentos.</p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleField('enable_pix_installment')}
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

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Máximo de parcelas</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={formData.max_installments}
                    onChange={(e) => setFormData((current) => ({ ...current, max_installments: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                  />
                  <p className="mt-2 text-sm text-gray-500">Valor entre 1 e 12, igual ao controle operacional já existente no Django Admin.</p>
                </div>
              </section>

              <section className="space-y-4 border-t border-gray-200 pt-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Formulário</h3>
                  <p className="text-sm text-gray-600">Controle os campos exibidos em novas inscrições.</p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleField('enable_shirt_size_field')}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-4 py-4 text-left"
                >
                  <div>
                    <p className="font-medium text-gray-900">Exibir campo de tamanho da camiseta</p>
                    <p className="text-sm text-gray-600">Oculta o campo no formulário de novas inscrições.</p>
                  </div>
                  <span className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition-colors ${formData.enable_shirt_size_field ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`h-5 w-5 rounded-full bg-white transition-transform ${formData.enable_shirt_size_field ? 'translate-x-5' : 'translate-x-0'}`} />
                  </span>
                </button>
              </section>

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
