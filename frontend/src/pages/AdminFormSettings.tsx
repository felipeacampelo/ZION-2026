import { useEffect, useState } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import {
  getAdminSettings,
  updateAdminSettings,
  type AppSettings,
  type FormFieldConfig,
  type ResponsibleFieldConfig,
} from '../services/api';

type FormSettingsForm = Pick<AppSettings, 'form_fields_config' | 'responsible_fields_config' | 'min_birth_year'>;

const FIELD_TYPE_OPTIONS: Array<{ value: ResponsibleFieldConfig['type']; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Telefone' },
  { value: 'cpf', label: 'CPF' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Seleção' },
  { value: 'checkbox', label: 'Checkbox' },
];

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export default function AdminFormSettings() {
  const primaryButtonClass =
    'inline-flex items-center gap-2 rounded-lg bg-dark px-5 py-3 font-medium text-white transition-colors hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-60';
  const secondaryButtonClass =
    'inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-dark transition-colors hover:bg-gold-400';

  const [formData, setFormData] = useState<FormSettingsForm>({
    form_fields_config: {},
    responsible_fields_config: [],
    min_birth_year: 2009,
  });
  const [newResponsibleField, setNewResponsibleField] = useState({
    label: '',
    type: 'text' as ResponsibleFieldConfig['type'],
    required: false,
    placeholder: '',
    optionsText: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingChanges, setPendingChanges] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await getAdminSettings();
        setFormData({
          form_fields_config: response.data.form_fields_config,
          responsible_fields_config: response.data.responsible_fields_config || [],
          min_birth_year: response.data.min_birth_year ?? 2009,
        });
        setPendingChanges(false);
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
        responsible_fields_config: response.data.responsible_fields_config || [],
        min_birth_year: response.data.min_birth_year ?? 2009,
      });
      setSuccess('Opções do formulário salvas com sucesso.');
      setPendingChanges(false);
    } catch (err) {
      setError('Erro ao salvar opções do formulário.');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (fieldName: string, patch: Partial<FormFieldConfig>) => {
    setFormData((current) => ({
      ...current,
      form_fields_config: {
        ...current.form_fields_config,
        [fieldName]: {
          ...current.form_fields_config[fieldName],
          ...patch,
        },
      },
    }));
    setSuccess('');
    setPendingChanges(true);
  };

  const updateResponsibleField = (key: string, patch: Partial<ResponsibleFieldConfig>) => {
    setFormData((current) => ({
      ...current,
      responsible_fields_config: current.responsible_fields_config.map((field) =>
        field.key === key ? { ...field, ...patch } : field
      ),
    }));
    setSuccess('');
    setPendingChanges(true);
  };

  const removeResponsibleField = (key: string) => {
    setFormData((current) => ({
      ...current,
      responsible_fields_config: current.responsible_fields_config.filter((field) => field.key !== key),
    }));
    setSuccess('');
    setPendingChanges(true);
  };

  const addResponsibleField = () => {
    const trimmedLabel = newResponsibleField.label.trim();
    if (!trimmedLabel) {
      setError('Informe o nome do campo do responsável.');
      return;
    }

    const baseKey = slugify(trimmedLabel) || 'campo_responsavel';
    let nextKey = baseKey;
    let suffix = 2;
    while (formData.responsible_fields_config.some((field) => field.key === nextKey)) {
      nextKey = `${baseKey}_${suffix}`;
      suffix += 1;
    }

    const nextField: ResponsibleFieldConfig = {
      key: nextKey,
      label: trimmedLabel,
      type: newResponsibleField.type,
      required: newResponsibleField.required,
      placeholder: newResponsibleField.placeholder.trim(),
      options:
        newResponsibleField.type === 'select'
          ? newResponsibleField.optionsText
              .split('\n')
              .map((option) => option.trim())
              .filter(Boolean)
          : [],
    };

    setFormData((current) => ({
      ...current,
      responsible_fields_config: [...current.responsible_fields_config, nextField],
    }));
    setNewResponsibleField({
      label: '',
      type: 'text',
      required: false,
      placeholder: '',
      optionsText: '',
    });
    setError('');
    setSuccess('');
    setPendingChanges(true);
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
              {pendingChanges && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Há alterações pendentes. Clique em <strong>Salvar opções</strong> para publicar no formulário de inscrição.
                </div>
              )}

              <div className="rounded-xl border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900">Faixa etária</h3>
                <p className="mt-1 text-sm text-gray-600">
                  O bloqueio de inscrição será feito pelo ano de nascimento.
                </p>
                <div className="mt-4 max-w-xs">
                  <label className="mb-2 block text-sm font-medium text-gray-700">Ano mínimo de nascimento</label>
                  <input
                    type="number"
                    min="1900"
                    max="2100"
                    value={formData.min_birth_year}
                    onChange={(e) =>
                      {
                        setFormData((current) => ({
                          ...current,
                          min_birth_year: Number(e.target.value),
                        }));
                        setPendingChanges(true);
                        setSuccess('');
                      }
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                  />
                  <p className="mt-2 text-sm text-gray-500">
                    Exemplo: 2009 permite apenas nascidos em 2009 ou depois.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900">Dados fixos do responsável</h3>
                <p className="mt-1 text-sm text-gray-600">
                  O formulário sempre exibirá nome, email e telefone do responsável. Os campos abaixo servem apenas para adicionar informações extras.
                </p>
              </div>

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

              <div className="space-y-4 rounded-xl border border-gray-200 p-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Crie campos</h3>
                  <p className="mt-1 text-sm text-gray-600">
                    Crie os campos extras que serão exibidos na seção de responsável da inscrição.
                  </p>
                </div>

                <div className="space-y-4 rounded-xl border border-dashed border-gray-300 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Nome do campo</label>
                      <input
                        type="text"
                        value={newResponsibleField.label}
                        onChange={(e) => setNewResponsibleField((current) => ({ ...current, label: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                        placeholder="Ex: Nome da mãe"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Tipo do campo</label>
                      <select
                        value={newResponsibleField.type}
                        onChange={(e) =>
                          setNewResponsibleField((current) => ({
                            ...current,
                            type: e.target.value as ResponsibleFieldConfig['type'],
                            optionsText: e.target.value === 'select' ? current.optionsText : '',
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                      >
                        {FIELD_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Placeholder</label>
                      <input
                        type="text"
                        value={newResponsibleField.placeholder}
                        onChange={(e) => setNewResponsibleField((current) => ({ ...current, placeholder: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                        placeholder="Texto de apoio no campo"
                      />
                    </div>
                    <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={newResponsibleField.required}
                        onChange={(e) => setNewResponsibleField((current) => ({ ...current, required: e.target.checked }))}
                        className="h-4 w-4"
                      />
                      <span className="text-sm text-gray-700">Campo obrigatório</span>
                    </label>
                  </div>

                  {newResponsibleField.type === 'select' && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Opções</label>
                      <textarea
                        value={newResponsibleField.optionsText}
                        onChange={(e) => setNewResponsibleField((current) => ({ ...current, optionsText: e.target.value }))}
                        rows={4}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                        placeholder={'Uma opção por linha\nPai\nMãe\nOutro responsável'}
                      />
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={addResponsibleField}
                      className={secondaryButtonClass}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar campo
                    </button>
                  </div>
                </div>

                {formData.responsible_fields_config.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                    Nenhum campo do responsável cadastrado.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.responsible_fields_config.map((field) => (
                      <div key={field.key} className="rounded-xl border border-gray-200 p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">Nome do campo</label>
                            <input
                              type="text"
                              value={field.label}
                              onChange={(e) => updateResponsibleField(field.key, { label: e.target.value })}
                              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                            />
                          </div>
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">Tipo do campo</label>
                            <select
                              value={field.type}
                              onChange={(e) =>
                                updateResponsibleField(field.key, {
                                  type: e.target.value as ResponsibleFieldConfig['type'],
                                  options: e.target.value === 'select' ? field.options : [],
                                })
                              }
                              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                            >
                              {FIELD_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">Placeholder</label>
                            <input
                              type="text"
                              value={field.placeholder}
                              onChange={(e) => updateResponsibleField(field.key, { placeholder: e.target.value })}
                              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                            />
                          </div>
                          <div className="flex items-end justify-between gap-4">
                            <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={(e) => updateResponsibleField(field.key, { required: e.target.checked })}
                                className="h-4 w-4"
                              />
                              <span className="text-sm text-gray-700">Obrigatório</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => removeResponsibleField(field.key)}
                              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              Remover
                            </button>
                          </div>
                        </div>

                        {field.type === 'select' && (
                          <div className="mt-4">
                            <label className="mb-2 block text-sm font-medium text-gray-700">Opções</label>
                            <textarea
                              value={field.options.join('\n')}
                              onChange={(e) =>
                                updateResponsibleField(field.key, {
                                  options: e.target.value
                                    .split('\n')
                                    .map((option) => option.trim())
                                    .filter(Boolean),
                                })
                              }
                              rows={4}
                              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t border-gray-200 pt-6">
                <button
                  type="submit"
                  disabled={saving}
                  className={primaryButtonClass}
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
