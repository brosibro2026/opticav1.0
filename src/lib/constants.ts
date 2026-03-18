export const REPORT_ITEMS = [
  'Preguntas',
  'Cotizaciones',
  'Entregas de Bonos',
  'Bonos redimidos',
  'Sistecreditos Realizados',
  'Addi Realizados',
  'Consultas Efectivas',
  'Consulta Venta Fórmula',
  'Consultas No Efectivas',
  'Control de Seguimiento',
  'Seguimiento Garantías',
  'Órdenes',
  'Plan Separe',
  'Otras Ventas',
  'Entregas',
  'Sistecreditos Abonos',
] as const;

export type ReportItemName = typeof REPORT_ITEMS[number];

export const formatCOP = (value: number): string => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const parseCurrencyInput = (value: string): number => {
  const cleaned = value.replace(/[^0-9]/g, '');
  return parseInt(cleaned, 10) || 0;
};
