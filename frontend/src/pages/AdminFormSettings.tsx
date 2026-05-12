import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import { getAdminSettings, updateAdminSettings, type AppSettings, type FormFieldConfig } from '../services/api';

type FormSettingsForm = Pick<AppSettings, 'form_fields_config'>;

export default function AdminFormSettings() {
  const [formData, setFormData] = useState<FormSettingsForm>({
    form_fields_config: {},
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
          form_fields_config: response.data.form_fields_config,
        });
      } catch (err) {
        setError('Erro ao carregar opções do formulário.');
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
        form_fields_config: response.data.form_fields_config,
      });
      setSuccess('Opções do formulário salvas com sucesso.');
    } catch (err) {
      setError('Erro ao salvar opções do formulário.');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (fieldName: string, patch: Partial<FormFieldConfig>) => {
    setFormData((current) => ({
      form_fields_config: {
        ...current.form_fields_config,
        [fieldName]: {
          ...current.form_fields_config[fieldName],
          ...patch,
        },
      },
    }));
    setSuccess('');
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Formulário</h2>
          <p className="mt-2 text-sm text-gray-600">Controle os campos exibidos em novas inscrições.</p>
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

              <div className="overflow-hidden rounded-xl border border-gray-200">
                <div className="grid grid-cols-[minmax(0,1fr)_120px_140px] gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
                  <span>Campo</span>
                  <span className="text-center">Exibir</span>
                  <span className="text-center">Obrigatório</span>
                </div>
                <div className="divide-y divide-gray-200">
                  {Object.entries(formData.form_fields_config).map(([fieldName, config]) => (
                    <div key={fieldName} className="grid grid-cols-[minmax(0,1fr)_120px_140px] items-center gap-4 px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{config.label}</p>
                      </div>
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(e) =>
                            updateField(fieldName, {
                              enabled: e.target.checked,
                              required: e.target.checked ? config.required : false,
                            })
                          }
                          className="h-4 w-4"
                        />
                      </div>
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={config.required}
                          disabled={!config.enabled}
                          onChange={(e) => updateField(fieldName, { required: e.target.checked })}
                          className="h-4 w-4 disabled:opacity-40"
                        />
                      </div>
                    </div>
                  ))}
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
