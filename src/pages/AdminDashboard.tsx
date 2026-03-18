import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatCOP } from '@/lib/constants';
import { format, subDays, addDays, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Check, Clock, Copy, Glasses, LogOut, Users,
  DollarSign, TrendingUp, Loader2, Eye, UserCog,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import ReportDetailDialog from '@/components/ReportDetailDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeStatus {
  id: string;
  full_name: string;
  submitted: boolean;
  submitted_at?: string;
  total_valor?: number;
}

interface TrendPoint {
  date: string;        // formatted 'dd/MM'
  rawDate: string;     // 'yyyy-MM-dd'
  revenue: number;
  compliance: number;  // percentage 0-100
}

interface EmployeeStat {
  id: string;
  full_name: string;
  total_reports: number;
  total_valor: number;
  avg_daily: number;
}

interface AuditEntry {
  id: string;
  edited_at: string;
  editor_name: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  edit_reason: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // ── "Hoy" tab state ──────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [employees, setEmployees] = useState<EmployeeStatus[]>([]);
  const [loadingHoy, setLoadingHoy] = useState(true);
  const [viewingReport, setViewingReport] = useState<{ id: string; name: string } | null>(null);

  // ── "Tendencias" tab state ───────────────────────────────────────────────
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [trendFetched, setTrendFetched] = useState(false);

  // ── "Por Vendedora" tab state ────────────────────────────────────────────
  const [employeeStats, setEmployeeStats] = useState<EmployeeStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsFetched, setStatsFetched] = useState(false);

  // ── "Auditoría" tab state ────────────────────────────────────────────────
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditFetched, setAuditFetched] = useState(false);

  // ── Derived date strings ─────────────────────────────────────────────────
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const selectedDateDisplay = format(selectedDate, "EEEE, d 'de' MMMM yyyy", { locale: es });
  const isToday = selectedDateStr === format(new Date(), 'yyyy-MM-dd');

  // ── Fetch "Hoy" data ─────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true);

    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role');

    const employeeIds = new Set(
      (roles || []).filter(r => r.role === 'employee').map(r => r.user_id)
    );

    const { data: reports } = await supabase
      .from('daily_reports')
      .select('employee_id, is_submitted, submitted_at, total_valor_recibido')
      .eq('report_date', dateStr)
      .eq('is_submitted', true);

    const reportMap = new Map(
      (reports || []).map(r => [r.employee_id, r])
    );

    const statuses: EmployeeStatus[] = (profiles || [])
      .filter(p => employeeIds.has(p.id))
      .map(p => {
        const report = reportMap.get(p.id);
        return {
          id: p.id,
          full_name: p.full_name,
          submitted: !!report?.is_submitted,
          submitted_at: report?.submitted_at || undefined,
          total_valor: report?.total_valor_recibido,
        };
      });

    setEmployees(statuses);
    setLoadingHoy(false);
  }, [selectedDate]);

  // Initial load + re-fetch when date changes
  useEffect(() => {
    setLoadingHoy(true);
    fetchData();
  }, [fetchData]);

  // Polling fallback every 5 minutes
  useEffect(() => {
    const interval = setInterval(fetchData, 300000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_reports' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // ── Fetch "Tendencias" data ──────────────────────────────────────────────
  const fetchTrend = useCallback(async () => {
    setLoadingTrend(true);
    const today = new Date();
    const dates: string[] = [];
    for (let i = 13; i >= 0; i--) {
      dates.push(format(subDays(today, i), 'yyyy-MM-dd'));
    }
    const from = dates[0];
    const to = dates[dates.length - 1];

    // Fetch all submitted reports in the range
    const { data: reports } = await supabase
      .from('daily_reports')
      .select('report_date, total_valor_recibido, employee_id')
      .gte('report_date', from)
      .lte('report_date', to)
      .eq('is_submitted', true);

    // Fetch active employee count
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_active', true);

    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role');

    const employeeIds = new Set(
      (roles || []).filter(r => r.role === 'employee').map(r => r.user_id)
    );
    const activeEmployeeCount = (profiles || []).filter(p => employeeIds.has(p.id)).length;

    // Aggregate by date
    const byDate = new Map<string, { revenue: number; submitters: Set<string> }>();
    for (const d of dates) {
      byDate.set(d, { revenue: 0, submitters: new Set() });
    }
    for (const r of reports || []) {
      const entry = byDate.get(r.report_date);
      if (entry) {
        entry.revenue += r.total_valor_recibido ?? 0;
        entry.submitters.add(r.employee_id);
      }
    }

    const points: TrendPoint[] = dates.map(d => {
      const entry = byDate.get(d)!;
      return {
        date: format(new Date(d + 'T12:00:00'), 'dd/MM'),
        rawDate: d,
        revenue: entry.revenue,
        compliance: activeEmployeeCount > 0
          ? Math.round((entry.submitters.size / activeEmployeeCount) * 100)
          : 0,
      };
    });

    setTrendData(points);
    setLoadingTrend(false);
    setTrendFetched(true);
  }, []);

  // ── Fetch "Por Vendedora" data ───────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const today = format(new Date(), 'yyyy-MM-dd');

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true);

    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role');

    const employeeIds = new Set(
      (roles || []).filter(r => r.role === 'employee').map(r => r.user_id)
    );

    const activeProfiles = (profiles || []).filter(p => employeeIds.has(p.id));

    const { data: reports } = await supabase
      .from('daily_reports')
      .select('employee_id, total_valor_recibido, report_date')
      .gte('report_date', monthStart)
      .lte('report_date', today)
      .eq('is_submitted', true);

    const statsMap = new Map<string, { total_reports: number; total_valor: number }>();
    for (const r of reports || []) {
      const existing = statsMap.get(r.employee_id) || { total_reports: 0, total_valor: 0 };
      existing.total_reports += 1;
      existing.total_valor += r.total_valor_recibido ?? 0;
      statsMap.set(r.employee_id, existing);
    }

    const stats: EmployeeStat[] = activeProfiles.map(p => {
      const s = statsMap.get(p.id) || { total_reports: 0, total_valor: 0 };
      return {
        id: p.id,
        full_name: p.full_name,
        total_reports: s.total_reports,
        total_valor: s.total_valor,
        avg_daily: s.total_reports > 0 ? Math.round(s.total_valor / s.total_reports) : 0,
      };
    });

    // Sort by total value descending for ranking
    stats.sort((a, b) => b.total_valor - a.total_valor);

    setEmployeeStats(stats);
    setLoadingStats(false);
    setStatsFetched(true);
  }, []);

  // ── Fetch "Auditoría" data ───────────────────────────────────────────────
  const fetchAudit = useCallback(async () => {
    setLoadingAudit(true);

    const { data: logs } = await supabase
      .from('report_edit_log')
      .select('id, edited_at, edited_by, field_changed, old_value, new_value, edit_reason')
      .order('edited_at', { ascending: false })
      .limit(50);

    if (!logs || logs.length === 0) {
      setAuditLog([]);
      setLoadingAudit(false);
      setAuditFetched(true);
      return;
    }

    // Fetch editor names
    const editorIds = [...new Set(logs.map(l => l.edited_by).filter(Boolean))];
    const { data: editorProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', editorIds);

    const nameMap = new Map((editorProfiles || []).map(p => [p.id, p.full_name]));

    const entries: AuditEntry[] = logs.map(l => ({
      id: l.id,
      edited_at: l.edited_at,
      editor_name: nameMap.get(l.edited_by) || l.edited_by || 'Desconocido',
      field_changed: l.field_changed,
      old_value: l.old_value,
      new_value: l.new_value,
      edit_reason: l.edit_reason,
    }));

    setAuditLog(entries);
    setLoadingAudit(false);
    setAuditFetched(true);
  }, []);

  // ── "Hoy" derived values ─────────────────────────────────────────────────
  const submitted = employees.filter(e => e.submitted);
  const pending = employees.filter(e => !e.submitted);
  const totalRevenue = submitted.reduce((s, e) => s + (e.total_valor || 0), 0);
  const complianceRate = employees.length > 0
    ? Math.round((submitted.length / employees.length) * 100)
    : 0;

  // ── "Tendencias" derived values ──────────────────────────────────────────
  const bestDay = trendData.length > 0
    ? trendData.reduce((best, p) => p.revenue > best.revenue ? p : best, trendData[0])
    : null;
  const avgDaily = trendData.length > 0
    ? Math.round(trendData.reduce((s, p) => s + p.revenue, 0) / trendData.length)
    : 0;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const copyReminder = (name: string) => {
    const msg = `Hola ${name}, recuerda que aún no has enviado tu reporte diario de hoy. Por favor hazlo antes de las 8pm. Gracias - Óptica Evolution`;
    navigator.clipboard.writeText(msg);
    toast({ title: 'Copiado', description: 'Mensaje de recordatorio copiado al portapapeles' });
  };

  const handleTabChange = (value: string) => {
    if (value === 'tendencias' && !trendFetched) fetchTrend();
    if (value === 'vendedora' && !statsFetched) fetchStats();
    if (value === 'auditoria' && !auditFetched) fetchAudit();
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Glasses className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-card-foreground">Panel de Administración</h1>
              <p className="text-xs capitalize text-muted-foreground">{selectedDateDisplay}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/admin/employees')}>
              <UserCog className="h-4 w-4" /> Empleadas
            </Button>
            <span className="hidden text-sm text-muted-foreground sm:inline">{profile?.full_name}</span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl p-4">
        <Tabs defaultValue="hoy" onValueChange={handleTabChange}>
          <TabsList className="mb-6 w-full justify-start gap-1">
            <TabsTrigger value="hoy">Hoy</TabsTrigger>
            <TabsTrigger value="tendencias">Tendencias</TabsTrigger>
            <TabsTrigger value="vendedora">Por Vendedora</TabsTrigger>
            <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
          </TabsList>

          {/* ── Tab: Hoy ─────────────────────────────────────────────────── */}
          <TabsContent value="hoy" className="space-y-6">
            {/* Date navigation */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSelectedDate(prev => subDays(prev, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[160px] text-center text-sm font-medium capitalize text-foreground">
                  {isToday ? 'Hoy — ' : ''}{format(selectedDate, "d 'de' MMMM yyyy", { locale: es })}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSelectedDate(prev => addDays(prev, 1))}
                  disabled={isToday}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              {!isToday && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date())}>
                  Volver a hoy
                </Button>
              )}
            </div>

            {loadingHoy ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Card>
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <DollarSign className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Ingresos del día</p>
                        <p className="text-sm font-bold text-card-foreground">{formatCOP(totalRevenue)}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
                        <Check className="h-5 w-5 text-success" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Enviados</p>
                        <p className="text-sm font-bold text-card-foreground">{submitted.length} / {employees.length}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                        <Clock className="h-5 w-5 text-warning" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Pendientes</p>
                        <p className="text-sm font-bold text-card-foreground">{pending.length}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <TrendingUp className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Cumplimiento</p>
                        <p className="text-sm font-bold text-card-foreground">{complianceRate}%</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Two panels */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Submitted */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-success" />
                        <h2 className="text-sm font-semibold text-card-foreground">Reportes enviados</h2>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {submitted.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">Ningún reporte enviado aún</p>
                      ) : (
                        submitted.map(emp => (
                          <div
                            key={emp.id}
                            className="flex items-center justify-between rounded-lg border border-success/20 bg-success/5 px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-foreground">{emp.full_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {emp.submitted_at && format(new Date(emp.submitted_at), 'h:mm a')}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <Badge className="bg-success text-success-foreground">
                                  <Check className="mr-1 h-3 w-3" /> Enviado
                                </Badge>
                                {emp.total_valor != null && (
                                  <p className="mt-1 text-xs font-semibold text-foreground">{formatCOP(emp.total_valor)}</p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewingReport({ id: emp.id, name: emp.full_name })}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  {/* Pending */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-destructive" />
                        <h2 className="text-sm font-semibold text-card-foreground">Pendientes</h2>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {pending.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">🎉 Todos los reportes fueron enviados</p>
                      ) : (
                        pending.map(emp => (
                          <div
                            key={emp.id}
                            className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-foreground">{emp.full_name}</p>
                              <Badge variant="destructive" className="mt-1 text-xs">No ha enviado</Badge>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => copyReminder(emp.full_name)}
                            >
                              <Copy className="h-3 w-3" /> Recordar
                            </Button>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Tab: Tendencias ──────────────────────────────────────────── */}
          <TabsContent value="tendencias" className="space-y-6">
            {loadingTrend ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <TrendingUp className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Mejor día del período</p>
                        <p className="text-sm font-bold text-card-foreground">
                          {bestDay ? `${bestDay.date} — ${formatCOP(bestDay.revenue)}` : '—'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
                        <DollarSign className="h-5 w-5 text-success" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Promedio diario</p>
                        <p className="text-sm font-bold text-card-foreground">{formatCOP(avgDaily)}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <h2 className="text-sm font-semibold text-card-foreground">Últimos 14 días</h2>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <ComposedChart data={trendData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          yAxisId="revenue"
                          orientation="left"
                          tickFormatter={v => formatCOP(v)}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={90}
                        />
                        <YAxis
                          yAxisId="compliance"
                          orientation="right"
                          domain={[0, 100]}
                          tickFormatter={v => `${v}%`}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={40}
                        />
                        <Tooltip
                          formatter={(value: number, name: string) =>
                            name === 'Ingresos' ? formatCOP(value) : `${value}%`
                          }
                        />
                        <Legend />
                        <Area
                          yAxisId="revenue"
                          type="monotone"
                          dataKey="revenue"
                          name="Ingresos"
                          fill="hsl(var(--primary) / 0.15)"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                        />
                        <Line
                          yAxisId="compliance"
                          type="monotone"
                          dataKey="compliance"
                          name="Cumplimiento %"
                          stroke="hsl(var(--success, 142 76% 36%))"
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── Tab: Por Vendedora ───────────────────────────────────────── */}
          <TabsContent value="vendedora" className="space-y-4">
            {loadingStats ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <h2 className="text-sm font-semibold text-card-foreground">
                    Estadísticas del mes — {format(new Date(), 'MMMM yyyy', { locale: es })}
                  </h2>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">#</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Vendedora</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Reportes</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Total acumulado</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Promedio diario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeStats.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            Sin datos para este mes
                          </td>
                        </tr>
                      ) : (
                        employeeStats.map((emp, idx) => (
                          <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-3 text-sm font-semibold text-muted-foreground">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-foreground">
                              {emp.full_name}
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-foreground">
                              {emp.total_reports}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-primary">
                              {formatCOP(emp.total_valor)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-foreground">
                              {formatCOP(emp.avg_daily)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Tab: Auditoría ───────────────────────────────────────────── */}
          <TabsContent value="auditoria" className="space-y-4">
            {loadingAudit ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : auditLog.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No hay registros de auditoría
              </div>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <h2 className="text-sm font-semibold text-card-foreground">
                    Últimas {auditLog.length} ediciones
                  </h2>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {auditLog.map(entry => (
                    <div
                      key={entry.id}
                      className="rounded-lg border bg-muted/20 px-4 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{entry.editor_name}</span>
                        <Badge variant="secondary" className="text-xs font-normal">
                          {entry.field_changed}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(entry.edited_at), "d MMM yyyy, h:mm a", { locale: es })}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
                          {entry.old_value ?? '—'}
                        </span>
                        <span>→</span>
                        <span className="rounded bg-success/10 px-1.5 py-0.5 text-success">
                          {entry.new_value ?? '—'}
                        </span>
                        {entry.edit_reason && (
                          <span className="ml-2 italic text-muted-foreground">"{entry.edit_reason}"</span>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Report Detail Dialog */}
      {viewingReport && (
        <ReportDetailDialog
          open={!!viewingReport}
          onOpenChange={() => setViewingReport(null)}
          employeeId={viewingReport.id}
          employeeName={viewingReport.name}
          reportDate={selectedDateStr}
        />
      )}
    </div>
  );
}
