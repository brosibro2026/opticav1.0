import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Glasses, LogOut, ArrowLeft, UserPlus, Key,
  Loader2, UserCheck, UserX, Search, Download, Printer, Eye, EyeOff,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth } from 'date-fns';
import { formatCOP } from '@/lib/constants';

interface Employee {
  id: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

interface ComparativoRow {
  employee_id: string;
  full_name: string;
  report_count: number;
  total_valor: number;
  avg_per_day: number;
  best_day_date: string;
  best_day_valor: number;
}

interface ExportRow {
  fecha: string;
  empleada: string;
  item: string;
  hombre: number;
  mujer: number;
  nino: number;
  total: number;
  valor: number;
  observaciones: string;
}

function getDefaultDesde() {
  return format(startOfMonth(new Date()), 'yyyy-MM-dd');
}

function getDefaultHasta() {
  return format(new Date(), 'yyyy-MM-dd');
}

function countBusinessDays(desde: string, hasta: string): number {
  const start = new Date(desde + 'T00:00:00');
  const end = new Date(hasta + 'T00:00:00');
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(count, 1);
}

export default function AdminEmployees() {
  const { profile, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  // Add employee dialog
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [adding, setAdding] = useState(false);

  // Reset password dialog
  const [resetTarget, setResetTarget] = useState<Employee | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Comparativo tab
  const [compDesde, setCompDesde] = useState(getDefaultDesde());
  const [compHasta, setCompHasta] = useState(getDefaultHasta());
  const [compLoading, setCompLoading] = useState(false);
  const [compData, setCompData] = useState<ComparativoRow[] | null>(null);

  // Exportar tab
  const [expDesde, setExpDesde] = useState(getDefaultDesde());
  const [expHasta, setExpHasta] = useState(getDefaultHasta());
  const [expEmployee, setExpEmployee] = useState<string>('todos');
  const [expLoading, setExpLoading] = useState(false);
  const [expPreview, setExpPreview] = useState<ExportRow[] | null>(null);

  const fetchEmployees = async () => {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'employee');

    const employeeIds = (roles || []).map((r: { user_id: string }) => r.user_id);

    if (employeeIds.length === 0) {
      setEmployees([]);
      setLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, is_active, created_at')
      .in('id', employeeIds)
      .order('full_name');

    setEmployees(profiles || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const closeAddDialog = () => {
    setShowAdd(false);
    setNewName('');
    setNewEmail('');
    setNewPassword('');
    setShowNewPassword(false);
  };

  const handleAddEmployee = async () => {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) return;
    if (newPassword.length < 6) {
      toast({ title: 'Contraseña muy corta', description: 'La contraseña debe tener al menos 6 caracteres.', variant: 'destructive' });
      return;
    }
    setAdding(true);

    const { data, error } = await supabase.functions.invoke('manage-employees', {
      body: {
        action: 'create_employee',
        email: newEmail.trim(),
        password: newPassword,
        full_name: newName.trim(),
      },
    });

    setAdding(false);

    if (error || data?.error) {
      toast({
        title: 'Error',
        description: data?.error || error?.message || 'No se pudo crear',
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Empleada creada', description: `${newName.trim()} fue agregada exitosamente` });
    closeAddDialog();
    fetchEmployees();
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !resetPassword.trim()) return;
    setResetting(true);

    const { data, error } = await supabase.functions.invoke('manage-employees', {
      body: {
        action: 'reset_password',
        user_id: resetTarget.id,
        new_password: resetPassword,
      },
    });

    setResetting(false);

    if (error || data?.error) {
      toast({
        title: 'Error',
        description: data?.error || error?.message || 'No se pudo cambiar',
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Contraseña cambiada', description: `La contraseña de ${resetTarget.full_name} fue actualizada` });
    setResetTarget(null);
    setResetPassword('');
  };

  const handleToggleActive = async (emp: Employee) => {
    const { data, error } = await supabase.functions.invoke('manage-employees', {
      body: {
        action: 'toggle_active',
        user_id: emp.id,
        is_active: !emp.is_active,
      },
    });

    if (error || data?.error) {
      toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' });
      return;
    }

    toast({
      title: emp.is_active ? 'Empleada desactivada' : 'Empleada activada',
      description: emp.full_name,
    });
    fetchEmployees();
  };

  // ─── Comparativo ───────────────────────────────────────────────────────────

  const handleBuscarComparativo = async () => {
    setCompLoading(true);
    setCompData(null);

    try {
      // Get active employees
      const activeEmployees = employees.filter(e => e.is_active);
      if (activeEmployees.length === 0) {
        setCompData([]);
        setCompLoading(false);
        return;
      }

      const activeIds = activeEmployees.map(e => e.id);

      // Fetch daily_reports within date range for active employees
      const { data: reports, error: repError } = await supabase
        .from('daily_reports')
        .select('id, employee_id, report_date, total_valor_recibido')
        .in('employee_id', activeIds)
        .gte('report_date', compDesde)
        .lte('report_date', compHasta);

      if (repError) throw repError;

      if (!reports || reports.length === 0) {
        setCompData([]);
        setCompLoading(false);
        return;
      }

      const businessDays = countBusinessDays(compDesde, compHasta);

      // Aggregate per employee
      const map = new Map<string, {
        report_count: number;
        total_valor: number;
        best_day_date: string;
        best_day_valor: number;
      }>();

      for (const r of reports) {
        const existing = map.get(r.employee_id);
        const valor = r.total_valor_recibido ?? 0;
        if (!existing) {
          map.set(r.employee_id, {
            report_count: 1,
            total_valor: valor,
            best_day_date: r.report_date,
            best_day_valor: valor,
          });
        } else {
          existing.report_count += 1;
          existing.total_valor += valor;
          if (valor > existing.best_day_valor) {
            existing.best_day_valor = valor;
            existing.best_day_date = r.report_date;
          }
        }
      }

      const rows: ComparativoRow[] = activeEmployees
        .filter(e => map.has(e.id))
        .map(e => {
          const agg = map.get(e.id)!;
          return {
            employee_id: e.id,
            full_name: e.full_name,
            report_count: agg.report_count,
            total_valor: agg.total_valor,
            avg_per_day: agg.total_valor / businessDays,
            best_day_date: agg.best_day_date,
            best_day_valor: agg.best_day_valor,
          };
        });

      // Also include active employees with no reports (zero row)
      for (const e of activeEmployees) {
        if (!map.has(e.id)) {
          rows.push({
            employee_id: e.id,
            full_name: e.full_name,
            report_count: 0,
            total_valor: 0,
            avg_per_day: 0,
            best_day_date: '',
            best_day_valor: 0,
          });
        }
      }

      rows.sort((a, b) => b.total_valor - a.total_valor);
      setCompData(rows);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Error al cargar datos', variant: 'destructive' });
    } finally {
      setCompLoading(false);
    }
  };

  const medalEmoji = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return '';
  };

  // ─── Exportar ──────────────────────────────────────────────────────────────

  const buildExportRows = async (): Promise<ExportRow[]> => {
    const activeEmployees = employees.filter(e => e.is_active);
    const targetIds = expEmployee === 'todos'
      ? activeEmployees.map(e => e.id)
      : [expEmployee];

    const empNameMap = new Map(employees.map(e => [e.id, e.full_name]));

    const { data: reports, error: repError } = await supabase
      .from('daily_reports')
      .select('id, employee_id, report_date, observaciones')
      .in('employee_id', targetIds)
      .gte('report_date', expDesde)
      .lte('report_date', expHasta)
      .order('report_date');

    if (repError) throw repError;
    if (!reports || reports.length === 0) return [];

    const reportIds = reports.map((r: any) => r.id);
    const reportMap = new Map(reports.map((r: any) => [r.id, r]));

    const { data: items, error: itemsError } = await supabase
      .from('report_items')
      .select('report_id, item_name, hombre, mujer, nino, total, valor')
      .in('report_id', reportIds);

    if (itemsError) throw itemsError;

    const rows: ExportRow[] = (items || []).map((item: any) => {
      const rep = reportMap.get(item.report_id) as any;
      return {
        fecha: rep?.report_date ?? '',
        empleada: empNameMap.get(rep?.employee_id) ?? '',
        item: item.item_name ?? '',
        hombre: item.hombre ?? 0,
        mujer: item.mujer ?? 0,
        nino: item.nino ?? 0,
        total: item.total ?? 0,
        valor: item.valor ?? 0,
        observaciones: rep?.observaciones ?? '',
      };
    });

    rows.sort((a, b) => {
      if (a.fecha < b.fecha) return -1;
      if (a.fecha > b.fecha) return 1;
      return a.empleada.localeCompare(b.empleada);
    });

    return rows;
  };

  const handleLoadPreview = async () => {
    setExpLoading(true);
    setExpPreview(null);
    try {
      const rows = await buildExportRows();
      setExpPreview(rows);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Error al cargar datos', variant: 'destructive' });
    } finally {
      setExpLoading(false);
    }
  };

  const handleExportCSV = async () => {
    setExpLoading(true);
    try {
      const rows = await buildExportRows();
      if (rows.length === 0) {
        toast({ title: 'Sin datos', description: 'No hay datos para exportar en el rango seleccionado.' });
        setExpLoading(false);
        return;
      }

      const header = ['Fecha', 'Empleada', 'Item', 'Hombre', 'Mujer', 'Niño', 'Total', 'Valor', 'Observaciones'].join(',');
      const csvRows = rows.map(r =>
        [
          r.fecha,
          `"${r.empleada.replace(/"/g, '""')}"`,
          `"${r.item.replace(/"/g, '""')}"`,
          r.hombre,
          r.mujer,
          r.nino,
          r.total,
          r.valor,
          `"${r.observaciones.replace(/"/g, '""')}"`,
        ].join(',')
      );

      const csv = '\uFEFF' + [header, ...csvRows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExpPreview(rows);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Error al exportar', variant: 'destructive' });
    } finally {
      setExpLoading(false);
    }
  };

  const handlePrintPDF = async () => {
    setExpLoading(true);
    try {
      const rows = await buildExportRows();
      if (rows.length === 0) {
        toast({ title: 'Sin datos', description: 'No hay datos para imprimir en el rango seleccionado.' });
        setExpLoading(false);
        return;
      }

      const empLabel = expEmployee === 'todos'
        ? 'Todas las empleadas'
        : (employees.find(e => e.id === expEmployee)?.full_name ?? '');

      const tableRows = rows.map(r => `
        <tr>
          <td>${r.fecha}</td>
          <td>${r.empleada}</td>
          <td>${r.item}</td>
          <td style="text-align:center">${r.hombre}</td>
          <td style="text-align:center">${r.mujer}</td>
          <td style="text-align:center">${r.nino}</td>
          <td style="text-align:center">${r.total}</td>
          <td style="text-align:right">${formatCOP(r.valor)}</td>
          <td>${r.observaciones}</td>
        </tr>
      `).join('');

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte ${expDesde} al ${expHasta}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
    h2 { margin-bottom: 4px; }
    p { margin: 2px 0 12px; color: #555; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; }
    th { background: #f0f0f0; text-align: left; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h2>Reporte de Empleadas</h2>
  <p>${empLabel} &mdash; Desde ${expDesde} hasta ${expHasta}</p>
  <table>
    <thead>
      <tr>
        <th>Fecha</th><th>Empleada</th><th>Item</th>
        <th>Hombre</th><th>Mujer</th><th>Ni&ntilde;o</th>
        <th>Total</th><th>Valor</th><th>Observaciones</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
      }
      setExpPreview(rows);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Error al imprimir', variant: 'destructive' });
    } finally {
      setExpLoading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Glasses className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-sm font-semibold text-card-foreground">Gestión de Empleadas</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4">
        <Tabs defaultValue="empleadas">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="empleadas" className="flex-1">Empleadas</TabsTrigger>
            <TabsTrigger value="comparativo" className="flex-1">Comparativo</TabsTrigger>
            <TabsTrigger value="exportar" className="flex-1">Exportar</TabsTrigger>
          </TabsList>

          {/* ── Tab: Empleadas ── */}
          <TabsContent value="empleadas" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" className="gap-1" onClick={() => setShowAdd(true)}>
                <UserPlus className="h-4 w-4" /> Agregar empleada
              </Button>
            </div>
            {employees.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No hay empleadas registradas. Haz clic en "Agregar" para crear una.
                </CardContent>
              </Card>
            ) : (
              employees.map(emp => (
                <Card key={emp.id} className={!emp.is_active ? 'opacity-60' : ''}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${emp.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
                        {emp.is_active ? (
                          <UserCheck className="h-5 w-5 text-primary" />
                        ) : (
                          <UserX className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-card-foreground">{emp.full_name}</p>
                        <Badge variant={emp.is_active ? 'secondary' : 'destructive'} className="text-xs">
                          {emp.is_active ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => { setResetTarget(emp); setResetPassword(''); }}
                      >
                        <Key className="h-3 w-3" /> Contraseña
                      </Button>
                      <Button
                        variant={emp.is_active ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => handleToggleActive(emp)}
                      >
                        {emp.is_active ? 'Desactivar' : 'Activar'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ── Tab: Comparativo ── */}
          <TabsContent value="comparativo" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Rango de fechas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="comp-desde" className="text-xs">Desde</Label>
                    <Input
                      id="comp-desde"
                      type="date"
                      value={compDesde}
                      onChange={e => setCompDesde(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="comp-hasta" className="text-xs">Hasta</Label>
                    <Input
                      id="comp-hasta"
                      type="date"
                      value={compHasta}
                      onChange={e => setCompHasta(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <Button onClick={handleBuscarComparativo} disabled={compLoading} className="gap-1">
                    {compLoading
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Search className="h-4 w-4" />}
                    Buscar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {compData !== null && (
              compData.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No hay datos para el período seleccionado.
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="px-4 py-3 text-left font-medium">#</th>
                          <th className="px-4 py-3 text-left font-medium">Empleada</th>
                          <th className="px-4 py-3 text-right font-medium">Reportes enviados</th>
                          <th className="px-4 py-3 text-right font-medium">Total Valor</th>
                          <th className="px-4 py-3 text-right font-medium">Promedio por día</th>
                          <th className="px-4 py-3 text-left font-medium">Mejor día</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compData.map((row, idx) => (
                          <tr key={row.employee_id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-3 text-muted-foreground">
                              {medalEmoji(idx) || (idx + 1)}
                            </td>
                            <td className="px-4 py-3 font-medium">{row.full_name}</td>
                            <td className="px-4 py-3 text-right">{row.report_count}</td>
                            <td className="px-4 py-3 text-right font-semibold">{formatCOP(row.total_valor)}</td>
                            <td className="px-4 py-3 text-right">{formatCOP(Math.round(row.avg_per_day))}</td>
                            <td className="px-4 py-3 text-sm">
                              {row.best_day_date
                                ? <span>{row.best_day_date} &mdash; {formatCOP(row.best_day_valor)}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )
            )}
          </TabsContent>

          {/* ── Tab: Exportar ── */}
          <TabsContent value="exportar" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Opciones de exportación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="exp-empleada" className="text-xs">Empleada</Label>
                    <select
                      id="exp-empleada"
                      value={expEmployee}
                      onChange={e => setExpEmployee(e.target.value)}
                      className="flex h-9 w-48 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="todos">Todas</option>
                      {employees.filter(e => e.is_active).map(e => (
                        <option key={e.id} value={e.id}>{e.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="exp-desde" className="text-xs">Desde</Label>
                    <Input
                      id="exp-desde"
                      type="date"
                      value={expDesde}
                      onChange={e => setExpDesde(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="exp-hasta" className="text-xs">Hasta</Label>
                    <Input
                      id="exp-hasta"
                      type="date"
                      value={expHasta}
                      onChange={e => setExpHasta(e.target.value)}
                      className="w-40"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="gap-1"
                    onClick={handleLoadPreview}
                    disabled={expLoading}
                  >
                    {expLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Vista previa
                  </Button>
                  <Button
                    className="gap-1"
                    onClick={handleExportCSV}
                    disabled={expLoading}
                  >
                    {expLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Exportar CSV
                  </Button>
                  <Button
                    variant="secondary"
                    className="gap-1"
                    onClick={handlePrintPDF}
                    disabled={expLoading}
                  >
                    {expLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                    Imprimir / PDF
                  </Button>
                </div>
              </CardContent>
            </Card>

            {expPreview !== null && (
              expPreview.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No hay datos para el período seleccionado.
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">
                      Vista previa ({expPreview.length} filas)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="px-3 py-2 text-left font-medium">Fecha</th>
                          <th className="px-3 py-2 text-left font-medium">Empleada</th>
                          <th className="px-3 py-2 text-left font-medium">Item</th>
                          <th className="px-3 py-2 text-right font-medium">H</th>
                          <th className="px-3 py-2 text-right font-medium">M</th>
                          <th className="px-3 py-2 text-right font-medium">N</th>
                          <th className="px-3 py-2 text-right font-medium">Total</th>
                          <th className="px-3 py-2 text-right font-medium">Valor</th>
                          <th className="px-3 py-2 text-left font-medium">Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expPreview.map((row, idx) => (
                          <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-3 py-2">{row.fecha}</td>
                            <td className="px-3 py-2">{row.empleada}</td>
                            <td className="px-3 py-2">{row.item}</td>
                            <td className="px-3 py-2 text-right">{row.hombre}</td>
                            <td className="px-3 py-2 text-right">{row.mujer}</td>
                            <td className="px-3 py-2 text-right">{row.nino}</td>
                            <td className="px-3 py-2 text-right">{row.total}</td>
                            <td className="px-3 py-2 text-right">{formatCOP(row.valor)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.observaciones}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Add Employee Dialog */}
      <Dialog open={showAdd} onOpenChange={open => { if (!open) closeAddDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Empleada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input
                placeholder="Ej: Daniela Ayala"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Correo electrónico</Label>
              <Input
                type="email"
                placeholder="correo@ejemplo.com"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <div className="relative">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPassword.length > 0 && newPassword.length < 6 && (
                <p className="text-xs text-destructive">La contraseña debe tener al menos 6 caracteres.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAddDialog}>Cancelar</Button>
            <Button
              onClick={handleAddEmployee}
              disabled={adding || !newName.trim() || !newEmail.trim() || newPassword.length < 6}
            >
              {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Crear empleada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={() => setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar contraseña de {resetTarget?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nueva contraseña</Label>
            <Input
              type="text"
              placeholder="Nueva contraseña"
              value={resetPassword}
              onChange={e => setResetPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancelar</Button>
            <Button onClick={handleResetPassword} disabled={resetting || !resetPassword.trim()}>
              {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cambiar contraseña
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
