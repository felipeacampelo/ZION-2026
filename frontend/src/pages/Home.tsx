import { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, Clock, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getProducts, getProduct, getSettings, type Product } from '../services/api';
import Countdown from '../components/Countdown';

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout, isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [maxInstallments, setMaxInstallments] = useState(6);
  const [enablePixCash, setEnablePixCash] = useState(true);
  const [enablePixInstallment, setEnablePixInstallment] = useState(true);
  const [enableCreditCard, setEnableCreditCard] = useState(true);

  useEffect(() => {
    loadProducts();
    loadSettings();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await getProducts();
      const productsList = response.data.results || [];
      setProducts(productsList);
      
      // Set event date from first product
      if (productsList.length > 0 && productsList[0].event_date) {
        setEventDate(new Date(productsList[0].event_date));
      }
      
      // Get first product details with active batch
      if (productsList.length > 0) {
        const detailResponse = await getProduct(productsList[0].id);
        setProducts([detailResponse.data]);
      }
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await getSettings();
      setMaxInstallments(response.data.max_installments);
      setEnablePixCash(response.data.enable_pix_cash);
      setEnablePixInstallment(response.data.enable_pix_installment);
      setEnableCreditCard(response.data.enable_credit_card);
    } catch (err) {
      console.error('Erro ao carregar configurações:', err);
      // Keep default value of 6 if API fails
    }
  };

  // Get the first (and only) product
  const product = products[0];
  const activeBatch = product?.active_batch;
  
  // Use actual values from the product - now with separate prices for each payment method
  const pixCashPrice = activeBatch?.price 
    ? parseFloat(String(activeBatch.price)) 
    : 900;
  const pixInstallmentPrice = activeBatch?.pix_installment_price 
    ? parseFloat(String(activeBatch.pix_installment_price))
    : 1000;
  const creditCardPrice = activeBatch?.credit_card_price 
    ? parseFloat(String(activeBatch.credit_card_price))
    : 1100;
  const pixInstallmentValue = (pixInstallmentPrice / maxInstallments).toFixed(2);
  const creditCardInstallmentValue = (creditCardPrice / maxInstallments).toFixed(2);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen">
      {/* Header with Auth */}
      <div className="fixed top-0 left-0 right-0 p-3 md:p-4 z-50 bg-gradient-to-b from-black/80 to-transparent">
        <div className="container mx-auto flex items-center justify-between flex-wrap gap-2 md:gap-4">
          {isAuthenticated ? (
            <>
              <span className="text-white text-sm md:text-base flex items-center gap-2 order-1 md:order-1">
                <UserIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{user?.first_name || user?.email}</span>
              </span>
              <div className="flex items-center gap-2 md:gap-3 order-2 md:order-2 flex-wrap justify-end">
                <button
                  onClick={() => navigate('/minhas-inscricoes')}
                  className="text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  Minhas Inscrições
                </button>
                {isAdmin && (
                  <button
                    onClick={() => navigate('/admin')}
                    className="text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 rounded-lg transition-colors font-medium"
                    style={{ backgroundColor: 'rgb(220, 253, 97)', color: '#000000' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(210, 243, 67)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(220, 253, 97)'}
                  >
                    Admin
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors flex items-center gap-1"
                >
                  <LogOut className="w-3 h-3 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => navigate('/login')}
                className="text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors flex items-center gap-1"
              >
                <LogIn className="w-3 h-3 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Entrar</span>
              </button>
              <button
                onClick={() => navigate('/register')}
                className="text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 rounded-lg transition-colors font-medium"
                style={{ backgroundColor: 'rgb(165, 44, 240)', color: '#ffffff' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(185, 84, 245)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(165, 44, 240)'}
              >
                Cadastrar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative text-white py-20 pt-24 md:pt-32" style={{
        backgroundImage: 'url(/images/hero-background.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}>
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/50"></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="font-bold" style={{ fontFamily: 'Procerus, sans-serif', fontSize: 'clamp(4.5rem, 18vw, 12rem)', marginBottom: '-0.8rem' }}>
              PELAS RUAS
            </h1>
            <p className="text-lg md:text-2xl mb-8" style={{ color: 'rgb(220, 253, 97)' }}>
              ACAMPAMENTO A+ 2026
            </p>
            
            {/* Countdown */}
            {eventDate && (
              <div className="mb-8">
                <h2 className="text-2xl md:text-3xl font-semibold mb-6">
                  Faltam apenas:
                </h2>
                <Countdown targetDate={eventDate} />
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
              <button 
                onClick={() => navigate('/inscricao')} 
                className="font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg border-2"
                style={{
                  backgroundColor: '#000000',
                  color: 'rgb(220, 253, 97)',
                  borderColor: 'rgb(220, 253, 97)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgb(220, 253, 97)';
                  e.currentTarget.style.color = '#000000';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#000000';
                  e.currentTarget.style.color = 'rgb(220, 253, 97)';
                }}
              >
                Fazer Inscrição
              </button>
              <a href="#detalhes" className="btn-secondary inline-block">
                Ver Detalhes
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Info Section */}
      <section id="detalhes" className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8 md:gap-12">
              {/* Data */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full" style={{ backgroundColor: 'rgb(165, 44, 240)' }}>
                    <Calendar className="w-7 h-7 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1" style={{ color: 'rgb(165, 44, 240)' }}>Data</h3>
                  <p className="text-2xl font-bold text-gray-900">13, 20, 26 a 28 de junho e 04 de julho</p>
                  <p className="text-sm text-gray-600 mt-1"></p>
                </div>
              </div>

              {/* Local */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full" style={{ backgroundColor: 'rgb(165, 44, 240)' }}>
                    <MapPin className="w-7 h-7 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1" style={{ color: 'rgb(165, 44, 240)' }}>Local</h3>
                  <p className="text-2xl font-bold text-gray-900">Acampamento El Rancho</p>
                  <p className="text-sm text-gray-600 mt-1"></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-8 text-center">
              ACAMPAMENTO A+ 2026
            </h2>
            
            <div className="space-y-6 text-left">
              <p className="text-lg text-gray-700 leading-relaxed">
                As ruas estão cheias de pessoas alegres, bandeiras são levantadas e hinos são entoados. Estão todos em festa, mas falta algo.
              </p>
              
              <p className="text-lg text-gray-700 leading-relaxed">
                Todos tem um sorriso no rosto, mas enxergo corações vazios, sozinhos, em busca de um propósito maior.
              </p>
              
              <p className="text-lg text-gray-700 leading-relaxed">
                Em 2026 iremos pelas ruas levantar a bandeira, gritando a verdade que é Cristo. So ele é a esperança verdadeira. Vamos fazer parte disso?
              </p>
              
              <div className="bg-white rounded-lg p-6 shadow-sm border-l-4" style={{ borderColor: 'rgb(165, 44, 240)' }}>
                <h3 className="text-xl font-bold mb-4" style={{ color: 'rgb(165, 44, 240)' }}>Programação:</h3>
                
                <div className="space-y-3">
                  <p className="text-gray-700">
                    <span className="font-semibold">13.06</span> - Iniciaremos nosso acampamento com o nosso pré madruga entre os nossos PG's.
                  </p>
                  
                  <p className="text-gray-700">
                    <span className="font-semibold">20.06</span> - Um sábado inteiro de conferência Pelas Ruas | Pré acamps com alguns convidados.
                  </p>
                  
                  <p className="text-gray-700">
                    <span className="font-semibold">26 a 28.06</span> - Nosso tradicional EL RANCHO, como você já conhece. Se não conhece, aumente sua expectativa.
                  </p>
                  
                  <p className="text-gray-700">
                    <span className="font-semibold">04.07</span> - Iremos pelas ruas de Brasília levantando a bandeira e gritando a verdade que Cristo é o Senhor!
                  </p>
                </div>
              </div>
              
              <p className="text-xl text-center font-bold mt-8" style={{ color: 'rgb(165, 44, 240)' }}>
                Garanta sua inscrição pra não ficar de fora de nada da nossa programação!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="inscricao" className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Valores e Inscrição
            </h2>
            <p className="text-lg text-gray-600">
              Escolha a melhor forma de pagamento para você
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {enablePixCash && (
              <div className="card border-2" style={{ borderColor: 'rgb(165, 44, 240)' }}>
                <div className="text-center">
                  <div className="inline-block px-4 py-1 rounded-full text-sm font-semibold mb-4" style={{ backgroundColor: 'rgb(220, 253, 97)', color: '#000000' }}>
                    Melhor Preço
                  </div>
                  <h3 className="text-2xl font-bold mb-2">PIX à Vista</h3>
                  <div className="text-4xl font-bold mb-4" style={{ color: 'rgb(165, 44, 240)' }}>
                    R$ {pixCashPrice.toFixed(2)}
                  </div>
                  <p className="text-gray-600 mb-6">Pagamento único via PIX</p>
                  <button onClick={() => navigate('/inscricao')} className="btn-primary w-full">
                    Inscrever-se
                  </button>
                </div>
              </div>
            )}

            {enablePixInstallment && (
              <div className="card border-2" style={{ borderColor: 'rgb(165, 44, 240)' }}>
                <div className="text-center">
                  <h3 className="text-2xl font-bold mb-2">PIX Parcelado</h3>
                  <div className="text-4xl font-bold mb-4" style={{ color: 'rgb(165, 44, 240)' }}>
                    R$ {pixInstallmentPrice.toFixed(2)}
                  </div>
                  <p className="text-gray-600 mb-6">
                    Até {maxInstallments}x de R$ {pixInstallmentValue}<br/>
                    via PIX
                  </p>
                  <button onClick={() => navigate('/inscricao')} className="btn-primary w-full">
                    Inscrever-se
                  </button>
                </div>
              </div>
            )}

            {enableCreditCard && (
              <div className="card border-2" style={{ borderColor: 'rgb(165, 44, 240)' }}>
                <div className="text-center">
                  <h3 className="text-2xl font-bold mb-2">Cartão de Crédito</h3>
                  <div className="text-4xl font-bold mb-4" style={{ color: 'rgb(165, 44, 240)' }}>
                    R$ {creditCardPrice.toFixed(2)}
                  </div>
                  <p className="text-gray-600 mb-6">
                    Até {maxInstallments}x de R$ {creditCardInstallmentValue}<br/>
                    no cartão
                  </p>
                  <button onClick={() => navigate('/inscricao')} className="btn-primary w-full">
                    Inscrever-se
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-400">
            © 2025 Área Mais | IGREJA BATISTA CAPITAL®
          </p>
        </div>
      </footer>
    </div>
  );
}
