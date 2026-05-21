import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, Mail, Lock, User, Phone, FileText, AlertCircle } from 'lucide-react';
import { register as apiRegister } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import GoogleLoginButton from '../components/GoogleLoginButton';

export default function Register() {
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    password2: '',
    first_name: '',
    last_name: '',
    phone: '',
    cpf: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.password !== formData.password2) {
      setError('As senhas não coincidem');
      setLoading(false);
      return;
    }

    try {
      const response = await apiRegister(formData);
      
      // Save to auth context
      authLogin(response.data.user, response.data.token);
      
      // Redirect to home
      navigate('/');
    } catch (err: any) {
      const errorData = err.response?.data;
      if (errorData) {
        const errorMessage = Object.entries(errorData)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        setError(errorMessage);
      } else {
        setError('Erro ao criar conta. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black to-gray-900 flex items-start justify-center px-4 sm:px-6 lg:px-8 py-2">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-2">
          <div className="inline-flex items-center justify-center">
            <img 
              src="/logo.png" 
              alt="JUMP" 
              className="w-48 h-48 object-contain"
            />
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-lg p-5">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Nome */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="w-4 h-4 inline mr-2" />
                  Nome *
                </label>
                <input
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  style={{ outline: 'none' }}
                  onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px #1a2e1a'}
                  onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                  placeholder="João"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sobrenome *
                </label>
                <input
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  style={{ outline: 'none' }}
                  onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px #1a2e1a'}
                  onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                  placeholder="Silva"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="w-4 h-4 inline mr-2" />
                Email *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="seu@email.com"
              />
            </div>

            {/* Telefone e CPF */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Phone className="w-4 h-4 inline mr-2" />
                  Telefone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  style={{ outline: 'none' }}
                  onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px #1a2e1a'}
                  onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                  placeholder="(11) 99999-9999"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText className="w-4 h-4 inline mr-2" />
                  CPF
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  style={{ outline: 'none' }}
                  onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px #1a2e1a'}
                  onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
              </div>
            </div>

            {/* Senhas */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Lock className="w-4 h-4 inline mr-2" />
                  Senha *
                </label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  style={{ outline: 'none' }}
                  onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px #1a2e1a'}
                  onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                  placeholder="••••••••"
                  minLength={8}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirmar Senha *
                </label>
                <input
                  type="password"
                  required
                  value={formData.password2}
                  onChange={(e) => setFormData({ ...formData, password2: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  style={{ outline: 'none' }}
                  onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px #1a2e1a'}
                  onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                  placeholder="••••••••"
                  minLength={8}
                />
              </div>
            </div>

            <div className="flex items-start">
              <input
                type="checkbox"
                required
                className="w-4 h-4 border-gray-300 rounded mt-1"
                style={{ accentColor: '#1a2e1a' }}
              />
              <label className="ml-2 text-sm text-gray-600">
                Eu concordo com os{' '}
                <Link to="/terms" className="font-medium" style={{ color: '#1a2e1a' }} onMouseEnter={(e) => e.currentTarget.style.color = '#2a4a2a'} onMouseLeave={(e) => e.currentTarget.style.color = '#1a2e1a'}>
                  Termos de Uso
                </Link>{' '}
                e{' '}
                <Link to="/privacy" className="font-medium" style={{ color: '#1a2e1a' }} onMouseEnter={(e) => e.currentTarget.style.color = '#2a4a2a'} onMouseLeave={(e) => e.currentTarget.style.color = '#1a2e1a'}>
                  Política de Privacidade
                </Link>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Criando conta...' : 'Criar Conta'}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-gray-400">
              Ou continue com
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <GoogleLoginButton onError={setError} />

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Já tem uma conta?{' '}
              <Link
                to="/login"
                className="font-medium"
                style={{ color: '#1a2e1a' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#2a4a2a'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#1a2e1a'}
              >
                Faça login
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-sm text-white/70 hover:text-white transition-colors"
          >
            ← Voltar para início
          </Link>
        </div>
      </div>
    </div>
  );
}
