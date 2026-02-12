import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowLeft, FileText, Download, X, FileDown, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addPdfHeaderWithLogo, renderPdfHeader } from "@/utils/pdfHeader";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";

const formatCurrency = (value: number) => {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const TurnoverReport = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [stores, setStores] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);

  // Buscar lojas
  useEffect(() => {
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
          const { data, error } = await supabase
            .from('stores')
            .select('id, name, code')
            .order('name');

          if (error) throw error;
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
            const { data, error } = await supabase
              .from('stores')
              .select('id, name, code')
              .in('id', storeIds)
              .order('name');

            if (error) throw error;
            setStores(data || []);
          }
        }
      } catch (error) {
        console.error('Erro ao buscar lojas:', error);
        toast({
          title: "Erro",
          description: "Erro ao carregar lojas",
          variant: "destructive",
        });
      }
    };

    fetchStores();
  }, [toast]);

  // Buscar contas quando loja é selecionada
  useEffect(() => {
    if (!selectedStore) {
      setAccounts([]);
      return;
    }

    const fetchAccounts = async () => {
      try {
        // Buscar IDs das contas associadas à loja
        const cashStores = await supabase
          .from('cash_account_stores')
          .select('account_id')
          .eq('store_id', selectedStore);

        const cardStores = await supabase
          .from('card_account_stores')
          .select('account_id')
          .eq('store_id', selectedStore);

        const currentStores = await supabase
          .from('current_account_stores')
          .select('account_id')
          .eq('store_id', selectedStore);

        const deliveryStores = await supabase
          .from('delivery_account_stores')
          .select('account_id')
          .eq('store_id', selectedStore);

        // Extrair os IDs
        const cashIds = cashStores.data?.map(item => item.account_id) || [];
        const cardIds = cardStores.data?.map(item => item.account_id) || [];
        const currentIds = currentStores.data?.map(item => item.account_id) || [];
        const deliveryIds = deliveryStores.data?.map(item => item.account_id) || [];

        // Buscar as contas usando os IDs
        const allAccounts = [];

        if (cashIds.length > 0) {
          const { data } = await supabase
            .from('cash_accounts')
            .select('id, name')
            .eq('is_active', true)
            .in('id', cashIds);

          if (data) {
            data.forEach(acc => allAccounts.push({ ...acc, type: 'cash' }));
          }
        }

        if (cardIds.length > 0) {
          const { data } = await supabase
            .from('card_accounts')
            .select('id, name')
            .eq('is_active', true)
            .in('id', cardIds);

          if (data) {
            data.forEach(acc => allAccounts.push({ ...acc, type: 'card' }));
          }
        }

        if (currentIds.length > 0) {
          const { data } = await supabase
            .from('current_accounts')
            .select('id, name')
            .eq('is_active', true)
            .in('id', currentIds);

          if (data) {
            data.forEach(acc => allAccounts.push({ ...acc, type: 'current' }));
          }
        }

        if (deliveryIds.length > 0) {
          const { data } = await supabase
            .from('delivery_accounts')
            .select('id, name')
            .eq('is_active', true)
            .in('id', deliveryIds);

          if (data) {
            data.forEach(acc => allAccounts.push({ ...acc, type: 'delivery' }));
          }
        }

        setAccounts(allAccounts);
      } catch (error) {
        console.error('Erro ao buscar contas:', error);
        toast({
          title: "Erro",
          description: "Erro ao carregar contas",
          variant: "destructive",
        });
      }
    };

    fetchAccounts();
  }, [selectedStore, toast]);

  const handleAccountSelect = (accountId) => {
    setSelectedAccounts(prev => 
      prev.includes(accountId) 
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const removeAccount = (accountId) => {
    setSelectedAccounts(prev => prev.filter(id => id !== accountId));
  };

  const fetchContasRecebidas = async (): Promise<Record<string, number>> => {
    try {
      // 1. Get faturamento subgroup IDs from system_parameters
      const { data: params } = await supabase
        .from('system_parameters')
        .select('subgroup_id')
        .in('parameter_key', ['venda_dinheiro', 'venda_cartao', 'venda_contas', 'venda_delivery']);

      const subgroupIds = [...new Set((params || []).map(p => p.subgroup_id).filter(Boolean))] as string[];
      if (subgroupIds.length === 0) return {};

      // 2. Get product IDs that belong to those subgroups
      const { data: products } = await supabase
        .from('products')
        .select('id')
        .in('subgroup_id', subgroupIds);

      const productIds = (products || []).map(p => p.id);
      if (productIds.length === 0) return {};

      // 3. Get accounts_receivable IDs for the selected store that have items with those products
      const { data: items } = await supabase
        .from('accounts_receivable_items')
        .select('account_receivable_id')
        .eq('store_id', selectedStore)
        .in('product_id', productIds);

      const receivableIds = [...new Set((items || []).map(i => i.account_receivable_id))];
      if (receivableIds.length === 0) return {};

      // 4. Get payments for those receivables, grouped by payment_date
      let paymentQuery = supabase
        .from('accounts_receivable_payments')
        .select('payment_date, amount_paid')
        .in('account_receivable_id', receivableIds);

      if (startDate) paymentQuery = paymentQuery.gte('payment_date', startDate);
      if (endDate) paymentQuery = paymentQuery.lte('payment_date', endDate);

      const { data: payments } = await paymentQuery;

      // 5. Group by date
      const dateMap: Record<string, number> = {};
      (payments || []).forEach(p => {
        const date = p.payment_date;
        dateMap[date] = (dateMap[date] || 0) + (p.amount_paid || 0);
      });

      return dateMap;
    } catch (error) {
      console.error('Erro ao buscar contas recebidas:', error);
      return {};
    }
  };

  const generateReport = async () => {
    if (!selectedStore) {
      toast({
        title: "Erro",
        description: "Selecione uma loja",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
      // Fetch cash control data and contas recebidas in parallel
      let query = supabase
        .from('cash_control')
        .select(`
          date,
          faturamento_dinheiro,
          faturamento_cartao,
          faturamento_conta,
          faturamento_delivery,
          faturamento_total,
          cash_control_card_items(valor, card_account_id),
          cash_control_account_items(valor, current_account_id),
          cash_control_delivery_items(valor, delivery_account_id)
        `)
        .eq('store_id', selectedStore)
        .order('date');

      if (startDate) {
        query = query.gte('date', startDate);
      }
      
      if (endDate) {
        query = query.lte('date', endDate);
      }

      const [{ data, error }, contasRecebidasMap] = await Promise.all([
        query,
        fetchContasRecebidas()
      ]);

      if (error) throw error;

      // Collect all dates (from cash_control and from contas recebidas)
      const allDates = new Set<string>();
      (data || []).forEach(item => allDates.add(item.date));
      Object.keys(contasRecebidasMap).forEach(date => allDates.add(date));

      const cashControlMap = new Map<string, any>();
      (data || []).forEach(item => cashControlMap.set(item.date, item));

      const processedData = Array.from(allDates).sort().map(date => {
        const item = cashControlMap.get(date);
        
        let dinheiro = 0;
        let cartao = 0;
        let contas = 0;
        let delivery = 0;

        if (item) {
          dinheiro = item.faturamento_dinheiro || 0;

          if (selectedAccounts.length > 0) {
            cartao = (item.cash_control_card_items || [])
              .filter((cardItem: any) => selectedAccounts.includes(cardItem.card_account_id))
              .reduce((sum: number, cardItem: any) => sum + (cardItem.valor || 0), 0);

            contas = (item.cash_control_account_items || [])
              .filter((accountItem: any) => selectedAccounts.includes(accountItem.current_account_id))
              .reduce((sum: number, accountItem: any) => sum + (accountItem.valor || 0), 0);

            delivery = (item.cash_control_delivery_items || [])
              .filter((deliveryItem: any) => selectedAccounts.includes(deliveryItem.delivery_account_id))
              .reduce((sum: number, deliveryItem: any) => sum + (deliveryItem.valor || 0), 0);

            const cashAccountSelected = selectedAccounts.some(accountId => 
              accounts.find(acc => acc.id === accountId && acc.type === 'cash')
            );
            
            if (!cashAccountSelected) {
              dinheiro = 0;
            }
          } else {
            cartao = item.faturamento_cartao || 0;
            contas = item.faturamento_conta || 0;
            delivery = item.faturamento_delivery || 0;
          }
        }

        const contasRecebidas = contasRecebidasMap[date] || 0;
        const total = dinheiro + cartao + contas + delivery + contasRecebidas;

        return {
          date,
          dinheiro,
          cartao,
          contas,
          delivery,
          contasRecebidas,
          total
        };
      });

      setReportData(processedData);
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast({
        title: "Erro",
        description: "Erro ao gerar relatório",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = () => {
    return reportData.reduce(
      (acc, row) => ({
        dinheiro: acc.dinheiro + row.dinheiro,
        cartao: acc.cartao + row.cartao,
        contas: acc.contas + row.contas,
        delivery: acc.delivery + row.delivery,
        contasRecebidas: acc.contasRecebidas + row.contasRecebidas,
        total: acc.total + row.total
      }),
      { dinheiro: 0, cartao: 0, contas: 0, delivery: 0, contasRecebidas: 0, total: 0 }
    );
  };

  const totals = calculateTotals();

  const storeName = stores.find(s => s.id === selectedStore)?.name || '';
  const periodLabel = startDate && endDate 
    ? `${new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR')}`
    : startDate ? `A partir de ${new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')}`
    : endDate ? `Até ${new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR')}`
    : 'Todos';

  const pdfColumns = ['Data', 'Dinheiro', 'Cartão', 'Contas', 'Delivery', 'Ctas Recebidas', 'Total'];

  const exportPDFDetalhado = async () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const title = "Faturamento - Detalhado";
    const startY = await addPdfHeaderWithLogo(doc, title);

    doc.setFontSize(9);
    doc.text(`Loja: ${storeName} | Período: ${periodLabel}`, 14, startY);

    const tableData = reportData.map(row => [
      format(parseISO(row.date), "dd/MM/yyyy"),
      formatCurrency(row.dinheiro),
      formatCurrency(row.cartao),
      formatCurrency(row.contas),
      formatCurrency(row.delivery),
      formatCurrency(row.contasRecebidas),
      formatCurrency(row.total),
    ]);
    tableData.push([
      { content: 'TOTAL', styles: { fontStyle: 'bold' } } as any,
      ...['dinheiro','cartao','contas','delivery','contasRecebidas','total'].map(k => 
        ({ content: formatCurrency(totals[k as keyof typeof totals]), styles: { fontStyle: 'bold' } }) as any
      )
    ]);

    autoTable(doc, {
      head: [pdfColumns],
      body: tableData,
      startY: startY + 5,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: { 1:{halign:'right'},2:{halign:'right'},3:{halign:'right'},4:{halign:'right'},5:{halign:'right'},6:{halign:'right'} },
      margin: { top: startY },
      didDrawPage: (data: any) => { if (data.pageNumber > 1) renderPdfHeader(doc, title); }
    });

    doc.save('faturamento-detalhado.pdf');
  };

  const exportPDFResumidoDia = async () => {
    const doc = new jsPDF();
    const title = "Faturamento - Resumo/Dia";
    const startY = await addPdfHeaderWithLogo(doc, title);

    doc.setFontSize(9);
    doc.text(`Loja: ${storeName} | Período: ${periodLabel}`, 14, startY);

    const tableData = reportData.map(row => [
      format(parseISO(row.date), "dd/MM/yyyy"),
      formatCurrency(row.total),
    ]);
    tableData.push([
      { content: 'TOTAL', styles: { fontStyle: 'bold' } } as any,
      { content: formatCurrency(totals.total), styles: { fontStyle: 'bold' } } as any,
    ]);

    autoTable(doc, {
      head: [['Data', 'Total']],
      body: tableData,
      startY: startY + 5,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: { 1: { halign: 'right' } },
      margin: { top: startY },
      didDrawPage: (data: any) => { if (data.pageNumber > 1) renderPdfHeader(doc, title); }
    });

    doc.save('faturamento-resumo-dia.pdf');
  };

  const exportPDFResumidoMes = async () => {
    const doc = new jsPDF();
    const title = "Faturamento - Resumo/Mês";
    const startY = await addPdfHeaderWithLogo(doc, title);

    doc.setFontSize(9);
    doc.text(`Loja: ${storeName} | Período: ${periodLabel}`, 14, startY);

    // Agrupar por mês
    const monthMap = new Map<string, { dinheiro: number; cartao: number; contas: number; delivery: number; contasRecebidas: number; total: number }>();
    reportData.forEach(row => {
      const monthKey = row.date.substring(0, 7); // yyyy-MM
      const existing = monthMap.get(monthKey) || { dinheiro: 0, cartao: 0, contas: 0, delivery: 0, contasRecebidas: 0, total: 0 };
      existing.dinheiro += row.dinheiro;
      existing.cartao += row.cartao;
      existing.contas += row.contas;
      existing.delivery += row.delivery;
      existing.contasRecebidas += row.contasRecebidas;
      existing.total += row.total;
      monthMap.set(monthKey, existing);
    });

    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const tableData = Array.from(monthMap.entries()).map(([key, val]) => {
      const [y, m] = key.split('-');
      return [
        `${months[parseInt(m) - 1]}/${y}`,
        formatCurrency(val.dinheiro),
        formatCurrency(val.cartao),
        formatCurrency(val.contas),
        formatCurrency(val.delivery),
        formatCurrency(val.contasRecebidas),
        formatCurrency(val.total),
      ];
    });
    tableData.push([
      { content: 'TOTAL', styles: { fontStyle: 'bold' } } as any,
      ...['dinheiro','cartao','contas','delivery','contasRecebidas','total'].map(k => 
        ({ content: formatCurrency(totals[k as keyof typeof totals]), styles: { fontStyle: 'bold' } }) as any
      )
    ]);

    autoTable(doc, {
      head: [['Mês', 'Dinheiro', 'Cartão', 'Contas', 'Delivery', 'Ctas Recebidas', 'Total']],
      body: tableData,
      startY: startY + 5,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: { 1:{halign:'right'},2:{halign:'right'},3:{halign:'right'},4:{halign:'right'},5:{halign:'right'},6:{halign:'right'} },
      margin: { top: startY },
      didDrawPage: (data: any) => { if (data.pageNumber > 1) renderPdfHeader(doc, title); }
    });

    doc.save('faturamento-resumo-mes.pdf');
  };

  const exportToExcel = () => {
    const data = reportData.map(row => ({
      'Data': format(parseISO(row.date), "dd/MM/yyyy"),
      'Dinheiro': row.dinheiro,
      'Cartão': row.cartao,
      'Contas': row.contas,
      'Delivery': row.delivery,
      'Contas Recebidas': row.contasRecebidas,
      'Total': row.total,
    }));
    data.push({
      'Data': 'TOTAL',
      'Dinheiro': totals.dinheiro,
      'Cartão': totals.cartao,
      'Contas': totals.contas,
      'Delivery': totals.delivery,
      'Contas Recebidas': totals.contasRecebidas,
      'Total': totals.total,
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Faturamento");
    XLSX.writeFile(wb, 'faturamento.xlsx');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center space-x-4">
          <Button onClick={() => navigate("/dashboard")} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-primary">Relatório de Faturamento</h1>
            <p className="text-sm text-muted-foreground">Visualize o faturamento por período</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Filtros
            </CardTitle>
            <CardDescription>Configure os filtros para gerar o relatório</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Loja - Obrigatório */}
            <div className="space-y-2">
              <Label htmlFor="store">Loja *</Label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma loja" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.code} - {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data Inicial e Final */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Data Inicial</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Data Final</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Contas */}
            {selectedStore && (
              <div className="space-y-2">
                <Label>Contas</Label>
                <Select onValueChange={handleAccountSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione contas para filtrar" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem 
                        key={account.id} 
                        value={account.id}
                        disabled={selectedAccounts.includes(account.id)}
                      >
                        {account.name} ({account.type === 'cash' ? 'Caixa' : 
                                     account.type === 'card' ? 'Cartão' : 
                                     account.type === 'current' ? 'Conta Corrente' : 'Delivery'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Contas Selecionadas */}
                {selectedAccounts.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedAccounts.map(accountId => {
                      const account = accounts.find(acc => acc.id === accountId);
                      return account ? (
                        <Badge key={accountId} variant="secondary" className="flex items-center gap-1">
                          {account.name}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-0 ml-1"
                            onClick={() => removeAccount(accountId)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            )}

            <Button onClick={generateReport} disabled={loading || !selectedStore}>
              {loading ? "Gerando..." : "Gerar Relatório"}
            </Button>
          </CardContent>
        </Card>

        {/* Relatório */}
        {reportData.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Relatório de Faturamento</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Exportar
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={exportPDFDetalhado}>
                      <FileDown className="h-4 w-4 mr-2" />
                      PDF Detalhado
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportPDFResumidoDia}>
                      <FileDown className="h-4 w-4 mr-2" />
                      PDF Resumido/Dia
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportPDFResumidoMes}>
                      <FileDown className="h-4 w-4 mr-2" />
                      PDF Resumido/Mês
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={exportToExcel}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Dinheiro</TableHead>
                      <TableHead className="text-right">Cartão</TableHead>
                      <TableHead className="text-right">Contas</TableHead>
                      <TableHead className="text-right">Delivery</TableHead>
                      <TableHead className="text-right">Contas Recebidas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell>
                          {format(parseISO(row.date), "dd/MM/yyyy", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.dinheiro)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.cartao)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.contas)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.delivery)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.contasRecebidas)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(row.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Linha de Totais */}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell className="font-bold">TOTAL</TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(totals.dinheiro)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(totals.cartao)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(totals.contas)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(totals.delivery)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(totals.contasRecebidas)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(totals.total)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default TurnoverReport;