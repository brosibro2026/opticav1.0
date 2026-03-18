import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { REPORT_ITEMS, formatCOP, parseCurrencyInput } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, Send, Loader2, LogOut, Glasses, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import ReportDetailDialog from '@/components/ReportDetailDialog';

interface ReportItemData {
  item_name: string;
  item_order: number;
  hombre: number;
  mujer: number;
  nino: number;
  valor_recibido: number;
  observaciones: string;
}

interface HistorialReport {
  id: string;
  report_date: string;
  total_valor_recibido: number;
  is_submitted: boolean;
}

export default function EmployeeReport() {
  const { user, profile, signOut } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<ReportItemData[]>(() =>
    REPORT_ITEMS.map((name, i) => ({
      item_name: name,
      item_order: i + 1,
      hombre: 0,
      mujer: 0,
      nino: 0,
      valor_recibido: 0,
      observaciones: '',
    }))
  );
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<'loading' | 'ready' | 'submitting'>('loading');
  const [showConfirm, setShowConfirm] = useState(false);

  // Draft recovery banner state
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<ReportItemData[] | null>(null);

  // Historial state
  const [historialReports, setHistorialReports] = useState<HistorialReport[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [selectedHistorialReport, setSelectedHistorialReport] = useState<HistorialReport | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  // Resumen state
  const [resumenLoading, setResumenLoading] = useState(false);
  const [resumenReports, setResumenReports] = useState<{ report_date: string; total_valor_recibido: number }[]>([]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayDisplay = format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es });
  const currentMonth = format(new Date(), 'yyyy-MM');

  // Load existing report for today
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: report } = await supabase
        .from('daily_reports')
        .select('id, is_submitted')
        .eq('employee_id', user.id)
        .eq('report_date', today)
        .maybeSingle();

      if (report) {
        setReportId(report.id);
        setIsSubmitted(report.is_submitted);

        const { data: existingItems } = await supabase
          .from('report_items')
          .select('*')
          .eq('report_id', report.id)
          .order('item_order');

        if (existingItems && existingItems.length > 0) {
          setItems(existingItems.map(item => ({
            item_name: item.item_name,
            item_order: item.item_order,
            hombre: item.hombre,
            mujer: item.mujer,
            nino: item.nino,
            valor_recibido: item.valor_recibido,
            observaciones: item.observaciones || '',
          })));
        }
      }
      setLoadingState('ready');
    };
    load();
  }, [user, today]);

  // Check for draft to show banner after DB load is ready
  useEffect(() => {
    if (!user || isSubmitted || loadingState !== 'ready') return;
    // Only show banner if there's no submitted report in DB (reportId may or may not exist)
    const key = `draft-${user.id}-${today}`;
    const draft = localStorage.getItem(key);
    if (draft && !reportId) {
      try {
        const parsed = JSON.parse(draft);
        if (Array.isArray(parsed) && parsed.length === REPORT_ITEMS.length) {
          setPendingDraft(parsed);
          setShowDraftBanner(true);
        }
      } catch {
        // ignore malformed draft
      }
    }
  }, [user, today, loadingState, reportId, isSubmitted]);

  // Auto-save draft to localStorage every 30s
  useEffect(() => {
    if (isSubmitted || loadingState !== 'ready') return;
    const key = `draft-${user?.id}-${today}`;
    const interval = setInterval(() => {
      localStorage.setItem(key, JSON.stringify(items));
    }, 30000);
    return () => clearInterval(interval);
  }, [items, isSubmitted, user, today, loadingState]);

  const updateItem = useCallback((index: number, field: keyof ReportItemData, value: number | string) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const grandTotalPersonas = items.reduce((sum, it) => sum + it.hombre + it.mujer + it.nino, 0);
  const grandTotalValor = items.reduce((sum, it) => sum + it.valor_recibido, 0);

  // Items that have any data (for confirm dialog summary)
  const itemsWithData = items.filter(
    it => it.hombre + it.mujer + it.nino > 0 || it.valor_recibido > 0
  );

  const handleRestoreDraft = () => {
    if (pendingDraft) {
      setItems(pendingDraft);
      toast({ title: 'Borrador restaurado', description: 'Se han recuperado los datos del borrador.' });
    }
    setShowDraftBanner(false);
    setPendingDraft(null);
  };

  const handleDiscardDraft = () => {
    if (user) {
      localStorage.removeItem(`draft-${user.id}-${today}`);
    }
    setShowDraftBanner(false);
    setPendingDraft(null);
    toast({ title: 'Borrador descartado' });
  };

  const handleSaveDraft = () => {
    if (!user) return;
    const key = `draft-${user.id}-${today}`;
    localStorage.setItem(key, JSON.stringify(items));
    toast({ title: 'Borrador guardado', description: 'Los datos han sido guardados localmente.' });
  };

  const handleSubmit = async () => {
    if (!user) return;
    setLoadingState('submitting');

    try {
      let rId = reportId;

      if (!rId) {
        const { data: newReport, error } = await supabase
          .from('daily_reports')
          .insert({
            employee_id: user.id,
            report_date: today,
            is_submitted: true,
            submitted_at: new Date().toISOString(),
            total_valor_recibido: grandTotalValor,
          })
          .select('id')
          .single();

        if (error) throw error;
        rId = newReport.id;
      } else {
        await supabase
          .from('daily_reports')
          .update({
            is_submitted: true,
            submitted_at: new Date().toISOString(),
            total_valor_recibido: grandTotalValor,
          })
          .eq('id', rId);
      }

      // Delete old items and insert new
      await supabase.from('report_items').delete().eq('report_id', rId);

      const { error: itemsError } = await supabase.from('report_items').insert(
        items.map(it => ({
          report_id: rId!,
          item_name: it.item_name,
          item_order: it.item_order,
          hombre: it.hombre,
          mujer: it.mujer,
          nino: it.nino,
          valor_recibido: it.valor_recibido,
          observaciones: it.observaciones || null,
        }))
      );

      if (itemsError) throw itemsError;

      setReportId(rId);
      setIsSubmitted(true);
      localStorage.removeItem(`draft-${user.id}-${today}`);

      toast({ title: '¡Reporte enviado!', description: 'Tu reporte diario ha sido registrado exitosamente.' });
    } catch (err: any) {
      toast({ title: 'Error al enviar', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingState('ready');
    }
  };

  // Load historial when tab is activated
  const loadHistorial = useCallback(async () => {
    if (!user) return;
    setHistorialLoading(true);
    try {
      const thirtyDaysAgo = format(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        'yyyy-MM-dd'
      );
      const { data } = await supabase
        .from('daily_reports')
        .select('id, report_date, total_valor_recibido, is_submitted')
        .eq('employee_id', user.id)
        .gte('report_date', thirtyDaysAgo)
        .order('report_date', { ascending: false })
        .limit(30);

      if (data) setHistorialReports(data);
    } finally {
      setHistorialLoading(false);
    }
  }, [user]);

  // Load resumen when tab is activated
  const loadResumen = useCallback(async () => {
    if (!user) return;
    setResumenLoading(true);
    try {
      const { data } = await supabase
        .from('daily_reports')
        .select('report_date, total_valor_recibido')
        .eq('employee_id', user.id)
        .eq('is_submitted', true)
        .like('report_date', `${currentMonth}%`)
        .order('report_date', { ascending: true });

      if (data) setResumenReports(data);
    } finally {
      setResumenLoading(false);
    }
  }, [user, currentMonth]);

  const resumenTotalReportes = resumenReports.length;
  const resumenTotalValor = resumenReports.reduce((sum, r) => sum + (r.total_valor_recibido || 0), 0);
  const resumenPromedioDiario = resumenTotalReportes > 0 ? resumenTotalValor / resumenTotalReportes : 0;
  const resumenBestDay = resumenReports.reduce<{ report_date: string; total_valor_recibido: number } | null>(
    (best, r) => (!best || r.total_valor_recibido > best.total_valor_recibido ? r : best),
    null
  );

  const barChartData = resumenReports.map(r => ({
    day: format(new Date(r.report_date + 'T12:00:00'), 'd MMM', { locale: es }),
    valor: r.total_valor_recibido || 0,
  }));

  if (loadingState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Glasses className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-card-foreground">{profile?.full_name}</h1>
              <p className="text-xs capitalize text-muted-foreground">{todayDisplay}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSubmitted && (
              <Badge className="bg-success text-success-foreground">
                <Check className="mr-1 h-3 w-3" /> Enviado
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4">
        <Tabs
          defaultValue="reporte"
          onValueChange={value => {
            if (value === 'historial') loadHistorial();
            if (value === 'resumen') loadResumen();
          }}
        >
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="reporte" className="flex-1">Reporte</TabsTrigger>
            <TabsTrigger value="historial" className="flex-1">Historial</TabsTrigger>
            <TabsTrigger value="resumen" className="flex-1">Resumen</TabsTrigger>
          </TabsList>

          {/* ── TAB: REPORTE ── */}
          <TabsContent value="reporte">
            {/* Draft recovery banner */}
            {showDraftBanner && (
              <div className="mb-4 flex flex-col gap-2 rounded-lg border border-yellow-400/60 bg-yellow-50 px-4 py-3 dark:bg-yellow-900/20 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Tienes un borrador guardado. ¿Deseas restaurarlo?
                </p>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={handleDiscardDraft}>
                    Descartar
                  </Button>
                  <Button size="sm" onClick={handleRestoreDraft}>
                    Restaurar
                  </Button>
                </div>
              </div>
            )}

            {isSubmitted && (
              <div className="mb-4 animate-fade-in rounded-lg border border-success/30 bg-success/10 p-4 text-center">
                <Check className="mx-auto mb-2 h-8 w-8 text-success" />
                <p className="font-semibold text-foreground">Reporte enviado exitosamente</p>
                <p className="mt-1 text-sm text-muted-foreground">Total: {formatCOP(grandTotalValor)}</p>
              </div>
            )}

            {/* Report Table – desktop only */}
            <Card className="hidden md:block">
              <CardHeader className="pb-2">
                <h2 className="text-lg font-semibold text-card-foreground">Reporte Diario</h2>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ítem</th>
                      <th className="px-2 py-2 text-center font-medium text-muted-foreground">H</th>
                      <th className="px-2 py-2 text-center font-medium text-muted-foreground">M</th>
                      <th className="px-2 py-2 text-center font-medium text-muted-foreground">N</th>
                      <th className="px-2 py-2 text-center font-medium text-muted-foreground">Total</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground">Valor ($)</th>
                      <th className="px-2 py-2 text-center font-medium text-muted-foreground">Obs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const total = item.hombre + item.mujer + item.nino;
                      return (
                        <tr key={item.item_name} className="border-b last:border-0">
                          <td className="px-3 py-2 text-xs font-medium text-foreground whitespace-nowrap">
                            {item.item_name}
                          </td>
                          {(['hombre', 'mujer', 'nino'] as const).map(field => (
                            <td key={field} className="px-1 py-1 text-center">
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={9999}
                                value={item[field] || ''}
                                onChange={e => updateItem(idx, field, Math.max(0, Math.min(9999, parseInt(e.target.value) || 0)))}
                                disabled={isSubmitted}
                                className="h-8 w-14 text-center text-xs"
                              />
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center text-xs font-semibold text-primary">
                            {total}
                          </td>
                          <td className="px-1 py-1 text-right">
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={item.valor_recibido ? formatCOP(item.valor_recibido).replace('COP', '').trim() : ''}
                              onChange={e => {
                                const val = parseCurrencyInput(e.target.value);
                                updateItem(idx, 'valor_recibido', Math.min(val, 999999999));
                              }}
                              disabled={isSubmitted}
                              className="h-8 w-24 text-right text-xs currency-input"
                              placeholder="$0"
                            />
                          </td>
                          <td className="px-1 py-1">
                            <Textarea
                              value={item.observaciones}
                              onChange={e => updateItem(idx, 'observaciones', e.target.value.slice(0, 500))}
                              disabled={isSubmitted}
                              className="h-8 min-h-[32px] w-24 resize-none text-xs"
                              placeholder="—"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/50 font-semibold">
                      <td className="px-3 py-2 text-sm text-foreground">GRAN TOTAL</td>
                      <td colSpan={3} />
                      <td className="px-2 py-2 text-center text-sm text-primary">{grandTotalPersonas}</td>
                      <td className="px-2 py-2 text-right text-sm text-primary">{formatCOP(grandTotalValor)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>

            {/* Mobile card view – visible below md */}
            <div className="md:hidden space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-card-foreground">Reporte Diario</h2>
                <span className="text-sm text-muted-foreground">
                  Total: <span className="font-semibold text-primary">{formatCOP(grandTotalValor)}</span>
                </span>
              </div>
              {items.map((item, idx) => {
                const total = item.hombre + item.mujer + item.nino;
                return (
                  <Card key={item.item_name}>
                    <CardContent className="p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{item.item_name}</p>
                        {total > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {total} personas
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        {(['hombre', 'mujer', 'nino'] as const).map(field => (
                          <div key={field} className="flex flex-col gap-1">
                            <label className="text-xs text-muted-foreground text-center capitalize">
                              {field === 'hombre' ? 'H' : field === 'mujer' ? 'M' : 'N'}
                            </label>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={9999}
                              value={item[field] || ''}
                              onChange={e => updateItem(idx, field, Math.max(0, Math.min(9999, parseInt(e.target.value) || 0)))}
                              disabled={isSubmitted}
                              className="h-9 text-center text-sm"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mb-2">
                        <label className="mb-1 block text-xs text-muted-foreground">Valor ($)</label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={item.valor_recibido ? formatCOP(item.valor_recibido).replace('COP', '').trim() : ''}
                          onChange={e => {
                            const val = parseCurrencyInput(e.target.value);
                            updateItem(idx, 'valor_recibido', Math.min(val, 999999999));
                          }}
                          disabled={isSubmitted}
                          className="h-9 text-right text-sm currency-input"
                          placeholder="$0"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Observaciones</label>
                        <Textarea
                          value={item.observaciones}
                          onChange={e => updateItem(idx, 'observaciones', e.target.value.slice(0, 500))}
                          disabled={isSubmitted}
                          className="min-h-[56px] resize-none text-sm"
                          placeholder="—"
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Mobile totals card */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="font-semibold text-sm text-foreground">GRAN TOTAL</span>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{grandTotalPersonas} personas</p>
                    <p className="font-bold text-primary">{formatCOP(grandTotalValor)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {!isSubmitted && (
              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full max-w-sm gap-2 sm:w-auto"
                  onClick={handleSaveDraft}
                  disabled={loadingState === 'submitting'}
                >
                  <Save className="h-4 w-4" />
                  Guardar borrador
                </Button>
                <Button
                  size="lg"
                  className="w-full max-w-sm gap-2"
                  onClick={() => setShowConfirm(true)}
                  disabled={loadingState === 'submitting'}
                >
                  {loadingState === 'submitting' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Enviar Reporte del Día
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ── TAB: HISTORIAL ── */}
          <TabsContent value="historial">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-card-foreground">Historial (últimos 30 días)</h2>

              {historialLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : historialReports.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No hay reportes en los últimos 30 días.
                </p>
              ) : (
                historialReports.map(report => (
                  <Card
                    key={report.id}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                    onClick={() => {
                      setSelectedHistorialReport(report);
                      setShowDetailDialog(true);
                    }}
                  >
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium text-foreground capitalize">
                          {format(new Date(report.report_date + 'T12:00:00'), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatCOP(report.total_valor_recibido || 0)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {report.is_submitted ? (
                          <Badge className="bg-success text-success-foreground">
                            <Check className="mr-1 h-3 w-3" /> Enviado
                          </Badge>
                        ) : (
                          <Badge variant="outline">Borrador</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* ── TAB: RESUMEN ── */}
          <TabsContent value="resumen">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-card-foreground">
                Resumen — {format(new Date(), "MMMM yyyy", { locale: es })}
              </h2>

              {resumenLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-primary">{resumenTotalReportes}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Reportes enviados</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-lg font-bold text-primary">{formatCOP(resumenTotalValor)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Total acumulado</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-lg font-bold text-primary">{formatCOP(Math.round(resumenPromedioDiario))}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Promedio diario</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-xs font-bold text-primary truncate">
                          {resumenBestDay
                            ? format(new Date(resumenBestDay.report_date + 'T12:00:00'), "d MMM", { locale: es })
                            : '—'}
                        </p>
                        <p className="text-xs text-primary font-semibold">
                          {resumenBestDay ? formatCOP(resumenBestDay.total_valor_recibido) : ''}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Mejor día</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Bar chart */}
                  {barChartData.length > 0 ? (
                    <Card>
                      <CardHeader className="pb-2">
                        <h3 className="text-sm font-semibold text-card-foreground">Valor por día</h3>
                      </CardHeader>
                      <CardContent className="p-3">
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={barChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                            <XAxis
                              dataKey="day"
                              tick={{ fontSize: 11 }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              tickFormatter={v => {
                                if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                                if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
                                return String(v);
                              }}
                              tick={{ fontSize: 11 }}
                              tickLine={false}
                              axisLine={false}
                              width={48}
                            />
                            <Tooltip
                              formatter={(value: number) => [formatCOP(value), 'Valor']}
                              labelStyle={{ fontWeight: 600 }}
                              contentStyle={{ fontSize: 12 }}
                            />
                            <Bar dataKey="valor" radius={[4, 4, 0, 0]} className="fill-primary" fill="hsl(var(--primary))" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No hay reportes enviados este mes.
                    </p>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Confirm submit dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar reporte?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás segura de enviar? No podrás editar después de medianoche.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* $0 warning */}
          {grandTotalValor === 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              ⚠ El total es $0. ¿Estás segura de enviar un reporte vacío?
            </p>
          )}

          {/* Summary of items with data */}
          <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
            {itemsWithData.length === 0 ? (
              <p className="text-muted-foreground italic">Todos los valores están en 0</p>
            ) : (
              <ul className="space-y-1">
                {itemsWithData.map(it => (
                  <li key={it.item_name} className="flex items-center justify-between gap-2">
                    <span className="text-foreground font-medium truncate">{it.item_name}</span>
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {it.hombre + it.mujer + it.nino > 0 && (
                        <span className="mr-2">{it.hombre + it.mujer + it.nino} pers.</span>
                      )}
                      {it.valor_recibido > 0 && (
                        <span className="text-primary font-semibold">{formatCOP(it.valor_recibido)}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit}>Confirmar envío</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Historial detail dialog */}
      {selectedHistorialReport && (
        <ReportDetailDialog
          open={showDetailDialog}
          onOpenChange={setShowDetailDialog}
          reportDate={selectedHistorialReport.report_date}
          employeeId={user?.id ?? ''}
          employeeName={profile?.full_name ?? ''}
        />
      )}
    </div>
  );
}
