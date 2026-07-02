export const formatCurrencyBRL = (value?: string | number | null) =>
  Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const normalizeCurrencyInput = (value: string) => {
  const sanitized = value.replace(/[^\d,.-]/g, '').trim();
  if (!sanitized) return '';

  if (sanitized.includes(',')) {
    return sanitized.replace(/\./g, '').replace(',', '.');
  }

  const dotParts = sanitized.split('.');
  if (dotParts.length > 2) {
    const decimalPart = dotParts.pop();
    return `${dotParts.join('')}.${decimalPart}`;
  }

  return sanitized;
};

export const toCurrencyInputValue = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') return '';
  return formatCurrencyBRL(value);
};
