import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  getProducts,
  getSettings,
  joinWaitlist,
  type FormFieldConfig,
  type Product,
  type ResponsibleFieldConfig,
} from '../services/api';

type MainFormData = Record<string, any>;

const baseInputClass = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-dark focus:outline-none';

const defaultFormData: MainFormData = {
  nome_completo: '',
  email: '',
  telefone: '',
  data_nascimento: '',
  sexo: '',
  cpf: '',
  rg: '',
  cep: '',
  tamanho_camiseta: '',
  membro_batista_capital: '',
  igreja: '',
  lider_pg: '',
  ja_participou_zion: '',
  imperio_zion: '',
  observacoes: '',
};

const defaultResponsibleData: MainFormData = {
  nome_responsavel: '',
  email_responsavel: '',
  telefone_responsavel: '',
};

export default function WaitlistSignup() {
  const navigate = useNavigate();
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [formFieldsConfig, setFormFieldsConfig] = useState<Record<string, FormFieldConfig>>({});
  const [responsibleFieldsConfig, setResponsibleFieldsConfig] = useState<ResponsibleFieldConfig[]>([]);
  const [formData, setFormData] = useState<MainFormData>(defaultFormData);
  const [responsibleFormData, setResponsibleFormData] = useState<MainFormData>(defaultResponsibleData);
  const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [settingsRes, productsRes] = await Promise.all([getSettings(), getProducts()]);
        setFormFieldsConfig(settingsRes.data.form_fields_config || {});
        setResponsibleFieldsConfig(settingsRes.data.responsible_fields_config || []);

        const soldOutProducts = productsRes.data.results.filter((item) => item.waitlist_state === 'sold_out_with_waitlist');
        setAvailableProducts(soldOutProducts);
        const soldOutProduct = soldOutProducts[0] || null;
        setProduct(soldOutProduct);
        if (!soldOutProduct) {
          setError('A lista de espera não está disponível no momento.');
        }
      } catch (err) {
        setError('Não foi possível carregar a lista de espera.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const getFieldConfig = (fieldName: string) => {
    return formFieldsConfig[fieldName] || { enabled: true, required: true, label: fieldName };
  };

  const responsibleExtraFields = useMemo(
    () => responsibleFieldsConfig.filter((field) => !['nome_responsavel', 'email_responsavel', 'telefone_responsavel'].includes(field.key)),
    [responsibleFieldsConfig],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!product) return;
    setSaving(true);
    setError('');

    try {
      await joinWaitlist({
        product_id: product.id,
        form_data: {
          ...formData,
          responsavel: {
            ...responsibleFormData,
          },
        },
        coupon_code: couponCode || undefined,
      });
      navigate('/lista-espera/confirmacao', {
        state: {
          eventName: product.name,
        },
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.form_data || 'Não foi possível entrar na lista de espera.');
    } finally {
      setSaving(false);
    }
  };

  const renderResponsibleField = (field: ResponsibleFieldConfig) => {
    const value = responsibleFormData[field.key] ?? '';
    if (field.type === 'textarea') {
      return (
        <textarea
          value={value}
          required={field.required}
          onChange={(event) => setResponsibleFormData((current) => ({ ...current, [field.key]: event.target.value }))}
          className={baseInputClass}
          placeholder={field.placeholder || field.label}
          rows={4}
        />
      );
    }

    if (field.type === 'select') {
      return (
        <select
          value={value}
          required={field.required}
          onChange={(event) => setResponsibleFormData((current) => ({ ...current, [field.key]: event.target.value }))}
          className={baseInputClass}
        >
          <option value="">Selecione</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === 'checkbox') {
      return (
        <label className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => setResponsibleFormData((current) => ({ ...current, [field.key]: event.target.checked }))}
          />
          {field.label}
        </label>
      );
    }

    const type =
      field.type === 'email' ? 'email' :
      field.type === 'date' ? 'date' :
      field.type === 'phone' ? 'tel' :
      'text';

    return (
      <input
        type={type}
        value={value}
        required={field.required}
        onChange={(event) => setResponsibleFormData((current) => ({ ...current, [field.key]: event.target.value }))}
        className={baseInputClass}
        placeholder={field.placeholder || field.label}
      />
    );
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-gray-600">Carregando lista de espera...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-4xl px-4">
        <button onClick={() => navigate('/')} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-dark">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao site
        </button>

        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Vagas esgotadas</p>
          <h1 className="mt-3 text-3xl font-bold text-gray-950">Lista de espera</h1>
          <p className="mt-3 text-gray-600">
            {product ? `Preencha sua pré-inscrição para entrar na fila de ${product.name}. Se uma vaga surgir, enviaremos um convite exclusivo por email.` : 'No momento não há fila aberta para este evento.'}
          </p>

          {error && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {product && (
            <form onSubmit={handleSubmit} className="mt-8 space-y-8">
              {availableProducts.length > 1 && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Evento</label>
                  <select
                    value={product.id}
                    onChange={(event) => {
                      const nextProduct = availableProducts.find((item) => item.id === Number(event.target.value)) || null;
                      setProduct(nextProduct);
                    }}
                    className={baseInputClass}
                  >
                    {availableProducts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Nome completo *</label>
                  <input className={baseInputClass} value={formData.nome_completo} onChange={(event) => setFormData((current) => ({ ...current, nome_completo: event.target.value }))} required={getFieldConfig('nome_completo').required} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Email *</label>
                  <input type="email" className={baseInputClass} value={formData.email} onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))} required={getFieldConfig('email').required} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Telefone *</label>
                  <input className={baseInputClass} value={formData.telefone} onChange={(event) => setFormData((current) => ({ ...current, telefone: event.target.value }))} required={getFieldConfig('telefone').required} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Data de nascimento *</label>
                  <input type="date" className={baseInputClass} value={formData.data_nascimento} onChange={(event) => setFormData((current) => ({ ...current, data_nascimento: event.target.value }))} required={getFieldConfig('data_nascimento').required} />
                </div>
                {getFieldConfig('sexo').enabled && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Sexo *</label>
                    <select className={baseInputClass} value={formData.sexo} onChange={(event) => setFormData((current) => ({ ...current, sexo: event.target.value }))} required={getFieldConfig('sexo').required}>
                      <option value="">Selecione</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Feminino">Feminino</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">CPF *</label>
                  <input className={baseInputClass} value={formData.cpf} onChange={(event) => setFormData((current) => ({ ...current, cpf: event.target.value }))} required={getFieldConfig('cpf').required} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">RG *</label>
                  <input className={baseInputClass} value={formData.rg} onChange={(event) => setFormData((current) => ({ ...current, rg: event.target.value }))} required={getFieldConfig('rg').required} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">CEP *</label>
                  <input className={baseInputClass} value={formData.cep} onChange={(event) => setFormData((current) => ({ ...current, cep: event.target.value }))} required={getFieldConfig('cep').required} />
                </div>
                {getFieldConfig('tamanho_camiseta').enabled && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Tamanho da camiseta</label>
                    <input className={baseInputClass} value={formData.tamanho_camiseta} onChange={(event) => setFormData((current) => ({ ...current, tamanho_camiseta: event.target.value }))} />
                  </div>
                )}
                {getFieldConfig('membro_batista_capital').enabled && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Membro Batista Capital? *</label>
                  <select className={baseInputClass} value={formData.membro_batista_capital} onChange={(event) => setFormData((current) => ({ ...current, membro_batista_capital: event.target.value }))} required={getFieldConfig('membro_batista_capital').required}>
                    <option value="">Selecione</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </div>
                )}
                {getFieldConfig('igreja').enabled && formData.membro_batista_capital === 'nao' && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Igreja *</label>
                    <input className={baseInputClass} value={formData.igreja} onChange={(event) => setFormData((current) => ({ ...current, igreja: event.target.value }))} required />
                  </div>
                )}
                {getFieldConfig('lider_pg').enabled && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Líder de PG *</label>
                  <input className={baseInputClass} value={formData.lider_pg} onChange={(event) => setFormData((current) => ({ ...current, lider_pg: event.target.value }))} required={getFieldConfig('lider_pg').required} />
                </div>
                )}
                {getFieldConfig('ja_participou_zion').enabled && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Já participou do ZION? *</label>
                  <select className={baseInputClass} value={formData.ja_participou_zion} onChange={(event) => setFormData((current) => ({ ...current, ja_participou_zion: event.target.value, imperio_zion: event.target.value === 'sim' ? current.imperio_zion : '' }))} required={getFieldConfig('ja_participou_zion').required}>
                    <option value="">Selecione</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </div>
                )}
                {getFieldConfig('imperio_zion').enabled && formData.ja_participou_zion === 'sim' && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Império</label>
                    <select className={baseInputClass} value={formData.imperio_zion} onChange={(event) => setFormData((current) => ({ ...current, imperio_zion: event.target.value }))}>
                      <option value="">Selecione</option>
                      <option value="egito">Egito</option>
                      <option value="persia">Pérsia</option>
                      <option value="grecia">Grécia</option>
                      <option value="roma">Roma</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Observações</label>
                <textarea className={baseInputClass} rows={4} value={formData.observacoes} onChange={(event) => setFormData((current) => ({ ...current, observacoes: event.target.value }))} />
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                <h2 className="text-xl font-semibold text-gray-950">Responsável</h2>
                <div className="mt-4 grid gap-6 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Nome do responsável *</label>
                    <input className={baseInputClass} value={responsibleFormData.nome_responsavel} onChange={(event) => setResponsibleFormData((current) => ({ ...current, nome_responsavel: event.target.value }))} required />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Email do responsável *</label>
                    <input type="email" className={baseInputClass} value={responsibleFormData.email_responsavel} onChange={(event) => setResponsibleFormData((current) => ({ ...current, email_responsavel: event.target.value }))} required />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Telefone do responsável *</label>
                    <input className={baseInputClass} value={responsibleFormData.telefone_responsavel} onChange={(event) => setResponsibleFormData((current) => ({ ...current, telefone_responsavel: event.target.value }))} required />
                  </div>
                  {responsibleExtraFields.map((field) => (
                    <div key={field.key} className={field.type === 'checkbox' ? 'md:col-span-2' : ''}>
                      {field.type !== 'checkbox' && <label className="mb-2 block text-sm font-medium text-gray-700">{field.label}{field.required ? ' *' : ''}</label>}
                      {renderResponsibleField(field)}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Cupom (opcional)</label>
                <input className={baseInputClass} value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} />
              </div>

              <button type="submit" disabled={saving} className="w-full rounded-2xl bg-dark px-6 py-4 text-base font-semibold text-white disabled:opacity-60">
                {saving ? 'Entrando na fila...' : 'Entrar na lista de espera'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
