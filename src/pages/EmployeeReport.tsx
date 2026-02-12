import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowLeft, FileText, Download, FileDown, FileSpreadsheet, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addPdfHeaderWithLogo, renderPdfHeader } from "@/utils/pdfHeader";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

interface Store {
  id: string;
  name: string;
  code: string;
}

interface EmployeeRow {
  name: string;
  is_registered: boolean;
  is_active: boolean;
  store_name: string;
  cpf: string;
  job_function_name: string;
  base_salary: number;
  registration_date: string;
  dismissal_date: string | null;
}

const EmployeeReport = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // all, active, inactive
  const [registrationFilter, setRegistrationFilter] = useState("all"); // all, registered, unregistered
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<EmployeeRow[]>([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, store_id')
        .eq('id', user.id)
        .single();

      if (profile?.role === 'admin') {
        const { data } = await supabase
          .from('stores')
          .select('id, name, code')
          .order('name');
        setStores(data || []);
      } else {
        const storeIds: string[] = [];
        if (profile?.store_id) storeIds.push(profile.store_id);

        const { data: userStores } = await supabase
          .from('user_stores')
          .select('store_id')
          .eq('user_id', user.id);

        userStores?.forEach((us: any) => {
          if (!storeIds.includes(us.store_id)) storeIds.push(us.store_id);
        });

        if (storeIds.length > 0) {
          const { data } = await supabase
            .from('stores')
            .select('id, name, code')
            .in('id', storeIds)
            .order('name');
          setStores(data || []);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar lojas:', error);
    }
  };

  const generateReport = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('employees')
        .select('name, is_registered, is_active, cpf, base_salary, registration_date, dismissal_date, store_id, job_function_id')
        .order('name');

      if (selectedStore !== 'all') {
        query = query.eq('store_id', selectedStore);
      }

      if (statusFilter === 'active') {
        query = query.eq('is_active', true);
      } else if (statusFilter === 'inactive') {
        query = query.eq('is_active', false);
      }

      if (registrationFilter === 'registered') {
        query = query.eq('is_registered', true);
      } else if (registrationFilter === 'unregistered') {
        query = query.eq('is_registered', false);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch stores and job_functions separately for name lookup
      const storeIds = [...new Set((data || []).map((e: any) => e.store_id).filter(Boolean))];
      const jobIds = [...new Set((data || []).map((e: any) => e.job_function_id).filter(Boolean))];

      const [storesRes, jobsRes] = await Promise.all([
        storeIds.length > 0 ? supabase.from('stores').select('id, name').in('id', storeIds) : { data: [] },
        jobIds.length > 0 ? supabase.from('job_functions').select('id, name').in('id', jobIds) : { data: [] },
      ]);

      const storeMap = Object.fromEntries((storesRes.data || []).map((s: any) => [s.id, s.name]));
      const jobMap = Object.fromEntries((jobsRes.data || []).map((j: any) => [j.id, j.name]));

      const rows: EmployeeRow[] = (data || []).map((emp: any) => ({
        name: emp.name,
        is_registered: emp.is_registered,
        is_active: emp.is_active,
        store_name: storeMap[emp.store_id] || '',
        cpf: emp.cpf || '',
        job_function_name: jobMap[emp.job_function_id] || '',
        base_salary: emp.base_salary || 0,
        registration_date: emp.registration_date,
        dismissal_date: emp.dismissal_date,
      }));

      setReportData(rows);
      setShowResults(true);
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast({
        title: "Erro",
        description: "Erro ao gerar relatório de funcionários",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr + 'T00:00:00'), 'dd/MM/yyyy');
    } catch {
      return dateStr;
    }
  };

  const getFilterLabel = () => {
    const parts: string[] = [];
    if (selectedStore === 'all') {
      parts.push('Todas as lojas');
    } else {
      const store = stores.find(s => s.id === selectedStore);
      parts.push(`Loja: ${store?.name || ''}`);
    }
    if (statusFilter === 'active') parts.push('Ativos');
    else if (statusFilter === 'inactive') parts.push('Inativos');
    else parts.push('Todos os status');

    if (registrationFilter === 'registered') parts.push('Registrados');
    else if (registrationFilter === 'unregistered') parts.push('Sem registro');
    else parts.push('Todos os registros');

    return parts.join(' | ');
  };

  const exportToPDF = async () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const title = "Relatório de Funcionários";
    const startY = await addPdfHeaderWithLogo(doc, title);

    doc.setFontSize(9);
    doc.text(getFilterLabel(), 14, startY);

    const tableData = reportData.map(row => [
      row.name,
      row.is_registered ? 'Sim' : 'Não',
      row.is_active ? 'Ativo' : 'Inativo',
      row.store_name,
      row.cpf,
      row.job_function_name,
      formatCurrency(row.base_salary),
      formatDate(row.registration_date),
      formatDate(row.dismissal_date),
    ]);

    autoTable(doc, {
      head: [['Nome', 'Registrado', 'Status', 'Loja', 'CPF', 'Cargo', 'Salário', 'Admissão', 'Demissão']],
      body: tableData,
      startY: startY + 5,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: {
        6: { halign: 'right' },
        7: { halign: 'center' },
        8: { halign: 'center' },
      },
      margin: { top: startY },
      didDrawPage: (data: any) => { if (data.pageNumber > 1) renderPdfHeader(doc, title); }
    });

    doc.save('relatorio-funcionarios.pdf');
  };

  const exportToExcel = () => {
    const data = reportData.map(row => ({
      'Nome': row.name,
      'Registrado': row.is_registered ? 'Sim' : 'Não',
      'Status': row.is_active ? 'Ativo' : 'Inativo',
      'Loja': row.store_name,
      'CPF': row.cpf,
      'Cargo': row.job_function_name,
      'Salário': row.base_salary,
      'Admissão': formatDate(row.registration_date),
      'Demissão': formatDate(row.dismissal_date),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Funcionários");
    XLSX.writeFile(wb, 'relatorio-funcionarios.xlsx');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center space-x-4">
          <Button onClick={() => navigate("/dashboard")} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-primary">Relatório de Funcionários</h1>
            <p className="text-sm text-muted-foreground">Consulte a relação de funcionários</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Filtros
            </CardTitle>
            <CardDescription>Configure os filtros para gerar o relatório</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Loja</Label>
                <Select value={selectedStore} onValueChange={setSelectedStore}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma loja" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as lojas</SelectItem>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.code} - {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="inactive">Inativos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Registro</Label>
                <Select value={registrationFilter} onValueChange={setRegistrationFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="registered">Com registro</SelectItem>
                    <SelectItem value="unregistered">Sem registro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={generateReport} disabled={loading}>
              {loading ? "Gerando..." : "Gerar Relatório"}
            </Button>
          </CardContent>
        </Card>

        {showResults && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Resultado ({reportData.length} funcionários)</CardTitle>
                {reportData.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Exportar
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={exportToPDF}>
                        <FileDown className="h-4 w-4 mr-2" />
                        PDF
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={exportToExcel}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Excel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {reportData.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum funcionário encontrado com os filtros selecionados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Registrado</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Loja</TableHead>
                        <TableHead>CPF</TableHead>
                        <TableHead>Cargo</TableHead>
                        <TableHead className="text-right">Salário</TableHead>
                        <TableHead className="text-center">Admissão</TableHead>
                        <TableHead className="text-center">Demissão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${row.is_registered ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}`}>
                              {row.is_registered ? 'Sim' : 'Não'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${row.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                              {row.is_active ? 'Ativo' : 'Inativo'}
                            </span>
                          </TableCell>
                          <TableCell>{row.store_name}</TableCell>
                          <TableCell>{row.cpf}</TableCell>
                          <TableCell>{row.job_function_name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.base_salary)}</TableCell>
                          <TableCell className="text-center">{formatDate(row.registration_date)}</TableCell>
                          <TableCell className="text-center">{formatDate(row.dismissal_date)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default EmployeeReport;
