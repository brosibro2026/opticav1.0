import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatCOP, REPORT_ITEMS } from '@/lib/constants';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';

interface ReportDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  reportDate: string;
}

interface ReportItem {
  item_name: string;
  item_order: number;
  hombre: number;
  mujer: number;
  nino: number;
  total: number | null;
  valor_recibido: number;
  observaciones: string | null;
}

export default function ReportDetailDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  reportDate,
}: ReportDetailDialogProps) {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    const fetch = async () => {
      const { data: report } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('employee_id', employeeId)
        .eq('report_date', reportDate)
        .single();

      if (report) {
        const { data } = await supabase
          .from('report_items')
          .select('*')
          .eq('report_id', report.id)
          .order('item_order');
        setItems(data || []);
      }
      setLoading(false);
    };
    fetch();
  }, [open, employeeId, reportDate]);

  const grandTotalPersonas = items.reduce((s, i) => s + (i.total || 0), 0);
  const grandTotalValor = items.reduce((s, i) => s + i.valor_recibido, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Reporte de {employeeName}
            <Badge variant="secondary" className="text-xs font-normal">
              {format(new Date(reportDate + 'T12:00:00'), "d 'de' MMMM yyyy", { locale: es })}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No hay datos para este reporte</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ítem</th>
                  <th className="px-2 py-2 text-center font-medium text-muted-foreground">H</th>
                  <th className="px-2 py-2 text-center font-medium text-muted-foreground">M</th>
                  <th className="px-2 py-2 text-center font-medium text-muted-foreground">N</th>
                  <th className="px-2 py-2 text-center font-medium text-muted-foreground">Total</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">Valor</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Obs.</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.item_name} className="border-b last:border-0">
                    <td className="px-3 py-2 text-xs font-medium text-foreground whitespace-nowrap">{item.item_name}</td>
                    <td className="px-2 py-2 text-center text-xs text-foreground">{item.hombre}</td>
                    <td className="px-2 py-2 text-center text-xs text-foreground">{item.mujer}</td>
                    <td className="px-2 py-2 text-center text-xs text-foreground">{item.nino}</td>
                    <td className="px-2 py-2 text-center text-xs font-semibold text-primary">{item.total}</td>
                    <td className="px-2 py-2 text-right text-xs text-foreground">{formatCOP(item.valor_recibido)}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground max-w-[120px] truncate">{item.observaciones || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/50 font-semibold">
                  <td className="px-3 py-2 text-sm text-foreground">TOTAL</td>
                  <td colSpan={3} />
                  <td className="px-2 py-2 text-center text-sm text-primary">{grandTotalPersonas}</td>
                  <td className="px-2 py-2 text-right text-sm text-primary">{formatCOP(grandTotalValor)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
