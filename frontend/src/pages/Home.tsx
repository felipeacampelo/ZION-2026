import { useState, useEffect, useRef } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { Calendar, MapPin, LogIn, LogOut, User as UserIcon, ChevronDown, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getProducts, getProduct, getSettings, type Product } from '../services/api';

import type { Variants } from 'framer-motion';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.15, ease: [0.33, 1, 0.68, 1] },
  }),
};

const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
};

const scaleOnHover: Variants = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.02, y: -4, transition: { duration: 0.3, ease: [0.33, 1, 0.68, 1] } },
};

function ScrollReveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={fadeUp}
      custom={delay}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout, isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [homeDescription, setHomeDescription] = useState(
    'As ruas estão cheias de pessoas alegres, bandeiras são levantadas e hinos são entoados. Estão todos em festa, mas falta algo.\n\nTodos têm um sorriso no rosto, mas enxergo corações vazios, sozinhos, em busca de um propósito maior.\n\nEm 2026 iremos pelas ruas levantar a bandeira, gritando a verdade que é Cristo. Só ele é a esperança verdadeira. Vamos fazer parte disso?'
  );
  const [homeDateText, setHomeDateText] = useState('');
  const [homeLocationText, setHomeLocationText] = useState('');
  const [homeLocationSubtext, setHomeLocationSubtext] = useState('');
  const [enrollmentStartAt, setEnrollmentStartAt] = useState<string | null>(null);
  const [enrollmentEndAt, setEnrollmentEndAt] = useState<string | null>(null);
  const [maxInstallments, setMaxInstallments] = useState(6);
  const [enablePixCash, setEnablePixCash] = useState(true);
  const [enablePixInstallment, setEnablePixInstallment] = useState(true);
  const [enableCreditCard, setEnableCreditCard] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.3]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 80]);

  useEffect(() => {
    loadProducts();
    loadSettings();
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const loadProducts = async () => {
    try {
      const response = await getProducts();
      const productsList = response.data.results || [];
      setProducts(productsList);
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
      setHomeDescription(response.data.home_description || homeDescription);
      setHomeDateText(response.data.home_date_text || '');
      setHomeLocationText(response.data.home_location_text || '');
      setHomeLocationSubtext(response.data.home_location_subtext || '');
      setEnrollmentStartAt(response.data.enrollment_start_at);
      setEnrollmentEndAt(response.data.enrollment_end_at);
      setMaxInstallments(response.data.max_installments);
      setEnablePixCash(response.data.enable_pix_cash);
      setEnablePixInstallment(response.data.enable_pix_installment);
      setEnableCreditCard(response.data.enable_credit_card);
    } catch (err) {
      console.error('Erro ao carregar configurações:', err);
    }
  };

  const product = products[0];
  const activeBatch = product?.active_batch;

  const pixCashPrice = activeBatch?.price ? parseFloat(String(activeBatch.price)) : null;
  const pixInstallmentPrice = activeBatch?.pix_installment_price ? parseFloat(String(activeBatch.pix_installment_price)) : null;
  const creditCardPrice = activeBatch?.credit_card_price ? parseFloat(String(activeBatch.credit_card_price)) : null;
  const pixInstallmentValue =
    pixInstallmentPrice !== null ? (pixInstallmentPrice / maxInstallments).toFixed(2) : null;
  const creditCardInstallmentValue =
    creditCardPrice !== null ? (creditCardPrice / maxInstallments).toFixed(2) : null;
  const hasAvailablePricing =
    (enablePixCash && pixCashPrice !== null) ||
    (enablePixInstallment && pixInstallmentPrice !== null) ||
    (enableCreditCard && creditCardPrice !== null);
  const availablePaymentOptions = [
    enablePixCash && pixCashPrice !== null
      ? { key: 'pix_cash', label: 'PIX à Vista', price: pixCashPrice, description: 'Pagamento único via PIX' }
      : null,
    enablePixInstallment && pixInstallmentPrice !== null && pixInstallmentValue !== null
      ? {
          key: 'pix_installment',
          label: 'PIX Parcelado',
          price: pixInstallmentPrice,
          description: `Até ${maxInstallments}x de R$ ${pixInstallmentValue} via PIX`,
        }
      : null,
    enableCreditCard && creditCardPrice !== null && creditCardInstallmentValue !== null
      ? {
          key: 'credit_card',
          label: 'Cartão de Crédito',
          price: creditCardPrice,
          description: `Até ${maxInstallments}x de R$ ${creditCardInstallmentValue} no cartão`,
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; price: number; description: string }>;
  const uniqueAvailablePrices = Array.from(new Set(availablePaymentOptions.map((option) => option.price.toFixed(2))));
  const hasUnifiedPrice = availablePaymentOptions.length > 0 && uniqueAvailablePrices.length === 1;

  const enrollmentWindowStart = enrollmentStartAt ? new Date(enrollmentStartAt) : null;
  const enrollmentWindowEnd = enrollmentEndAt ? new Date(enrollmentEndAt) : null;
  const now = new Date();
  const enrollmentWindowStatus =
    enrollmentWindowStart && now < enrollmentWindowStart
      ? 'not_started'
      : enrollmentWindowEnd && now > enrollmentWindowEnd
        ? 'closed'
        : 'open';

  const formatEnrollmentWindowDate = (value: string | null) => {
    if (!value) return '';
    return new Date(value).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const descriptionParagraphs = homeDescription
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const campGalleryImages = [
    {
      src: '/images/zion-day-02-333.jpg',
      alt: 'Culto e adoração no acampamento ZION',
      className: 'md:col-span-2 aspect-[16/10]',
    },
    {
      src: '/images/zion-day-02-086.jpg',
      alt: 'Gincana e interação no acampamento ZION',
      className: 'aspect-[4/5]',
    },
    {
      src: '/images/zion-day-02-274.jpg',
      alt: 'Louvor e celebração no acampamento ZION',
      className: 'aspect-[4/5]',
    },
  ];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-cream font-body">
      {/* Header / Navbar */}
      <motion.header
        className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300"
        style={{
          backgroundColor: scrolled ? 'rgba(26, 46, 26, 0.92)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
        }}
      >
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2 group">
            <img 
              src="/images/logo-white.png" 
              alt="ZION 2026" 
              className="h-20 md:h-24 w-auto transition-opacity group-hover:opacity-80"
            />
          </button>

          {/* Center Nav Links (desktop) */}
          <nav className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
            <button onClick={() => scrollToSection('sobre')} className="text-sm text-white/80 hover:text-gold transition-colors">
              Sobre
            </button>
            <button onClick={() => scrollToSection('inscricao')} className="text-sm text-white/80 hover:text-gold transition-colors">
              Inscrição
            </button>
          </nav>

          {/* Auth Buttons */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <span className="hidden md:flex items-center gap-1.5 text-white/80 text-sm">
                  <UserIcon className="w-4 h-4" />
                  {user?.first_name || user?.email}
                </span>
                <button
                  onClick={() => navigate('/minhas-inscricoes')}
                  className="text-sm px-4 py-1.5 rounded-lg font-semibold transition-colors bg-white text-dark-900 hover:bg-cream shadow-sm"
                >
                  Minhas inscrições
                </button>
                {isAdmin && (
                  <button
                    onClick={() => navigate('/admin')}
                    className="text-sm px-4 py-1.5 rounded-lg font-semibold transition-colors bg-white text-dark-900 hover:bg-cream shadow-sm"
                  >
                    Admin
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  title="Sair"
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="text-sm text-white/80 hover:text-gold transition-colors flex items-center gap-1.5"
                >
                  <LogIn className="w-4 h-4" />
                  Entrar
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="text-sm px-4 py-1.5 rounded-lg font-semibold transition-colors bg-white text-dark-900 hover:bg-cream shadow-sm"
                >
                  Cadastrar
                </button>
              </>
            )}
          </div>
        </div>
      </motion.header>

      {/* Hero Section */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src="/images/banner-zion-borrado.png"
            alt="Banner ZION 2026"
            className="w-full h-full object-cover opacity-85"
          />
          {/* Dark overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/20 to-black/45" />
        </div>

        {/* Hero Content */}
        <motion.div
          className="relative z-10 text-center px-6 max-w-5xl mx-auto py-20"
          style={{ opacity: heroOpacity, y: heroY }}
        >
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="flex flex-col items-center justify-center gap-16"
          >
            <motion.div
              variants={fadeUp}
              custom={0}
              className="flex flex-col sm:flex-row items-center justify-center gap-5 pt-72 md:pt-64 lg:pt-72"
            >
              <button
                onClick={() => scrollToSection('inscricao')}
                className="btn-gold text-base md:text-lg px-10 py-4 font-semibold"
              >
                Fazer Inscrição
              </button>
              <button
                onClick={() => scrollToSection('detalhes')}
                className="btn-outline text-base md:text-lg px-10 py-4 font-semibold"
              >
                Ver Detalhes
              </button>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          className="absolute bottom-12 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown className="w-10 h-10 text-white/70" />
        </motion.div>
      </section>

      {/* Info Section */}
      <section id="detalhes" style={{ backgroundColor: '#f5f0e8' }}>
        <motion.div
          className="max-w-7xl mx-auto grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-300"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={staggerContainer}
        >
          {/* Data */}
          <motion.div
            variants={fadeUp}
            className="flex items-center gap-8 px-12 py-14"
          >
            <Calendar className="w-10 h-10 text-gold flex-shrink-0" />
            <div>
              <p className="text-gold-700 text-xs uppercase tracking-[0.25em] font-semibold mb-2">Quando</p>
              <p className="text-gray-900 text-3xl md:text-4xl font-bold leading-tight">{homeDateText}</p>
            </div>
          </motion.div>

          {/* Local */}
          <motion.div
            variants={fadeUp}
            className="flex items-center gap-8 px-12 py-14"
          >
            <MapPin className="w-10 h-10 text-gold flex-shrink-0" />
            <div>
              <p className="text-gold-700 text-xs uppercase tracking-[0.25em] font-semibold mb-2">Onde</p>
              <p className="text-gray-900 text-3xl md:text-4xl font-bold leading-tight">{homeLocationText}</p>
              {homeLocationSubtext && (
                <p className="mt-3 text-sm md:text-base text-gray-600 leading-relaxed">{homeLocationSubtext}</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* About Section */}
      <section id="sobre" className="py-24 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="max-w-6xl mx-auto grid items-start gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
            <div>
              <ScrollReveal>
                <p className="text-gold-600 text-xs uppercase tracking-[0.25em] font-bold mb-3" />
              </ScrollReveal>

              <ScrollReveal delay={0.1}>
                <h2 className="text-4xl md:text-5xl font-bold text-dark-900 mb-12 max-w-3xl">
                  VOLTE AO PRIMEIRO AMOR
                </h2>
              </ScrollReveal>

              <motion.div
                className="space-y-8"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                variants={staggerContainer}
              >
                {descriptionParagraphs.map((paragraph, index) => (
                  <motion.p
                    key={index}
                    variants={fadeUp}
                    className="text-gray-700 leading-loose text-xl font-light"
                  >
                    {paragraph}
                  </motion.p>
                ))}
              </motion.div>
            </div>

            <ScrollReveal delay={0.2} className="lg:pt-6">
              <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-[0_22px_70px_rgba(20,20,20,0.08)]">
                <div className="grid grid-cols-2 gap-4">
                  {campGalleryImages.map((image) => (
                    <motion.div
                      key={image.src}
                      whileHover={{ y: -4, scale: 1.01 }}
                      transition={{ duration: 0.28, ease: [0.33, 1, 0.68, 1] }}
                      className={`overflow-hidden rounded-[1.5rem] bg-dark-900 ${image.className}`}
                    >
                      <img
                        src={image.src}
                        alt={image.alt}
                        className="h-full w-full object-cover"
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="inscricao" className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-dark-900 mb-6">
                Valores e Inscrição
              </h2>
              <p className="text-xl text-gray-600 font-light">
                {enrollmentWindowStatus === 'open'
                  ? 'Escolha a melhor forma de pagamento para você'
                  : enrollmentWindowStatus === 'not_started'
                    ? 'As inscrições ainda não começaram'
                    : 'As inscrições foram encerradas'}
              </p>
            </div>
          </ScrollReveal>

          {enrollmentWindowStatus === 'open' && hasAvailablePricing ? (
            hasUnifiedPrice ? (
              <motion.div
                className="max-w-3xl mx-auto"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                variants={staggerContainer}
              >
                <motion.div
                  variants={fadeUp}
                  whileHover="hover"
                  initial="rest"
                  animate="rest"
                >
                  <motion.div
                    variants={scaleOnHover}
                    className="relative rounded-3xl border-2 border-gold/70 bg-white px-8 py-10 md:px-10 md:py-12 shadow-xl"
                  >
                    <div className="text-center">
                      <h3 className="text-2xl md:text-3xl font-bold text-dark-900 mb-3">Inscrição</h3>
                      <div className="text-5xl md:text-6xl font-bold text-dark mb-4">
                        R$ {availablePaymentOptions[0].price.toFixed(2)}
                      </div>
                      <p className="mx-auto max-w-xl text-gray-600 text-sm md:text-base mb-6">
                        Mesmo valor para todas as formas de pagamento.
                      </p>
                      <div className="mb-8 flex flex-wrap items-center justify-center gap-2.5">
                        {availablePaymentOptions.map((option) => (
                          <span
                            key={option.key}
                            className="rounded-full border border-gray-200 bg-cream px-3 py-1.5 text-sm font-medium text-dark-900"
                          >
                            {option.label}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => navigate('/inscricao')}
                        className="btn-gold w-full md:w-auto px-8 py-3.5 text-base font-semibold"
                      >
                        Inscrever-se
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              </motion.div>
            ) : (
            <motion.div
              className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={staggerContainer}
            >
              {/* PIX a Vista */}
              {enablePixCash && pixCashPrice !== null && (
                <motion.div
                  variants={fadeUp}
                  whileHover="hover"
                  initial="rest"
                  animate="rest"
                >
                  <motion.div
                    variants={scaleOnHover}
                    className="relative bg-gradient-to-br from-gold-50 to-white border-4 border-gold rounded-3xl p-10 shadow-2xl"
                  >
                    <div className="text-center">
                      <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold uppercase tracking-wide bg-gradient-to-r from-dark to-dark-700 text-gold mb-6 shadow-lg">
                        <Sparkles className="w-4 h-4" />
                        Melhor Preço
                      </div>
                      <h3 className="text-3xl font-bold text-dark-900 mb-4">PIX à Vista</h3>
                      <div className="text-6xl font-bold text-gold mb-3">
                        R$ {pixCashPrice.toFixed(2)}
                      </div>
                      <p className="text-gray-600 text-base mb-10 font-light">Pagamento único via PIX</p>
                      <button
                        onClick={() => navigate('/inscricao')}
                        className="btn-gold w-full text-lg py-4 font-semibold"
                      >
                        Inscrever-se
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {/* PIX Parcelado */}
              {enablePixInstallment && pixInstallmentPrice !== null && pixInstallmentValue !== null && (
                <motion.div
                  variants={fadeUp}
                  whileHover="hover"
                  initial="rest"
                  animate="rest"
                >
                  <motion.div
                    variants={scaleOnHover}
                    className="bg-white border-2 border-gray-200 rounded-3xl p-10 hover:border-gold/60 transition-all shadow-xl hover:shadow-2xl"
                  >
                    <div className="text-center">
                      <h3 className="text-3xl font-bold text-dark-900 mb-4">PIX Parcelado</h3>
                      <div className="text-6xl font-bold text-dark-900 mb-3">
                        R$ {pixInstallmentPrice.toFixed(2)}
                      </div>
                      <p className="text-gray-600 text-base mb-10 font-light">
                        Até {maxInstallments}x de R$ {pixInstallmentValue} via PIX
                      </p>
                      <button
                        onClick={() => navigate('/inscricao')}
                        className="btn-outline w-full text-lg py-4 border-2 border-dark-900 text-dark-900 hover:bg-dark-50 font-semibold"
                      >
                        Inscrever-se
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {/* Cartao de Credito */}
              {enableCreditCard && creditCardPrice !== null && creditCardInstallmentValue !== null && (
                <motion.div
                  variants={fadeUp}
                  whileHover="hover"
                  initial="rest"
                  animate="rest"
                >
                  <motion.div
                    variants={scaleOnHover}
                    className="bg-white border-2 border-gray-200 rounded-3xl p-10 hover:border-gold/60 transition-all shadow-xl hover:shadow-2xl"
                  >
                    <div className="text-center">
                      <h3 className="text-3xl font-bold text-dark-900 mb-4">Cartão de Crédito</h3>
                      <div className="text-6xl font-bold text-dark-900 mb-3">
                        R$ {creditCardPrice.toFixed(2)}
                      </div>
                      <p className="text-gray-600 text-base mb-10 font-light">
                        Até {maxInstallments}x de R$ {creditCardInstallmentValue} no cartão
                      </p>
                      <button
                        onClick={() => navigate('/inscricao')}
                        className="btn-outline w-full text-lg py-4 border-2 border-dark-900 text-dark-900 hover:bg-dark-50 font-semibold"
                      >
                        Inscrever-se
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
            )
          ) : (
            <ScrollReveal>
              <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-cream px-6 py-14 text-center shadow-sm">
                <p className="text-2xl md:text-3xl font-bold text-dark-900">
                  {enrollmentWindowStatus === 'not_started'
                    ? 'Inscrições iniciam em breve'
                    : enrollmentWindowStatus === 'closed'
                      ? 'Inscrições encerradas'
                      : 'Nenhum lote disponível no momento'}
                </p>
                {enrollmentWindowStatus === 'not_started' && (
                  <p className="mt-4 text-lg text-gray-600">
                    {`As inscrições começam em ${formatEnrollmentWindowDate(enrollmentStartAt)}.`}
                  </p>
                )}
              </div>
            </ScrollReveal>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black py-8">
        <div className="container mx-auto px-6">
          <div className="max-w-5xl mx-auto text-center">
            <div className="mb-4 flex flex-wrap items-center justify-center gap-6 text-sm text-white/70">
              <a
                href="/docs/termo-de-consentimento-zion.pdf"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-white"
              >
                Termo de Consentimento
              </a>
              <a
                href="https://www.instagram.com/jump_capital/"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-white"
              >
                Instagram
              </a>
            </div>
            <p className="text-white/50 text-sm">
              &copy; 2026 Jump Capital | Igreja Batista Capital
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
