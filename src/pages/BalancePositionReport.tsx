import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, CalendarIcon, Loader2, FileDown, Download } from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface Store {
  id: string;
  name: string;
  code: string;
}

interface Account {
  id: string;
  name: string;
  type: 'current' | 'cash' | 'card' | 'delivery';
  store_id: string;
  store_name: string;
}

interface BalanceResult {
  accountId: string;
  accountName: string;
  accountType: string;
  storeName: string;
  balance: number;
}

const BalancePositionReport = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [stores, setStores] = useState<Store[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [balanceResults, setBalanceResults] = useState<BalanceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    if (selectedStores.length > 0) {
      fetchAccounts();
    } else {
      setAccounts([]);
      setSelectedAccounts([]);
    }
  }, [selectedStores]);

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
        
        userStores?.forEach(us => {
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
      console.error('Erro ao carregar lojas:', error);
    }
  };

  const fetchAccounts = async () => {
    try {
      const allAccounts: Account[] = [];

      // Fetch current accounts
      const { data: currentData } = await supabase
        .from('current_accounts')
        .select(`
          id, name,
          current_account_stores!inner (
            store_id,
            stores!inner (name)
          )
        `)
        .eq('is_active', true);

      currentData?.forEach(acc => {
        acc.current_account_stores?.forEach((store_rel: any) => {
          if (selectedStores.includes(store_rel.store_id)) {
            allAccounts.push({
              id: acc.id,
              name: acc.name,
              type: 'current',
              store_id: store_rel.store_id,
              store_name: store_rel.stores?.name || ''
            });
          }
        });
      });

      // Fetch cash accounts
      const { data: cashData } = await supabase
        .from('cash_accounts')
        .select(`
          id, name,
          cash_account_stores!inner (
            store_id,
            stores!inner (name)
          )
        `)
        .eq('is_active', true);

      cashData?.forEach(acc => {
        acc.cash_account_stores?.forEach((store_rel: any) => {
          if (selectedStores.includes(store_rel.store_id)) {
            allAccounts.push({
              id: acc.id,
              name: acc.name,
              type: 'cash',
              store_id: store_rel.store_id,
              store_name: store_rel.stores?.name || ''
            });
          }
        });
      });

      // Fetch card accounts
      const { data: cardData } = await supabase
        .from('card_accounts')
        .select(`
          id, name,
          card_account_stores!inner (
            store_id,
            stores!inner (name)
          )
        `)
        .eq('is_active', true);

      cardData?.forEach(acc => {
        acc.card_account_stores?.forEach((store_rel: any) => {
          if (selectedStores.includes(store_rel.store_id)) {
            allAccounts.push({
              id: acc.id,
              name: acc.name,
              type: 'card',
              store_id: store_rel.store_id,
              store_name: store_rel.stores?.name || ''
            });
          }
        });
      });

      // Fetch delivery accounts
      const { data: deliveryData } = await supabase
        .from('delivery_accounts')
        .select(`
          id, name,
          delivery_account_stores!inner (
            store_id,
            stores!inner (name)
          )
        `)
        .eq('is_active', true);

      deliveryData?.forEach(acc => {
        acc.delivery_account_stores?.forEach((store_rel: any) => {
          if (selectedStores.includes(store_rel.store_id)) {
            allAccounts.push({
              id: acc.id,
              name: acc.name,
              type: 'delivery',
              store_id: store_rel.store_id,
              store_name: store_rel.stores?.name || ''
            });
          }
        });
      });

      // Remove duplicates (same account in multiple stores)
      const uniqueAccounts = allAccounts.filter((acc, index, self) =>
        index === self.findIndex(a => a.id === acc.id && a.store_id === acc.store_id)
      );

      setAccounts(uniqueAccounts);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
    }
  };

  const getAccountTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      current: 'Conta Corrente',
      cash: 'Conta Caixa',
      card: 'Conta Cartão',
      delivery: 'Delivery'
    };
    return labels[type] || type;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const calculateBalance = async (account: Account, targetDate: Date): Promise<number> => {
    // Get account initial balance and date
    let initialBalance = 0;
    let initialBalanceDate: string | null = null;

    // Fetch account data based on type
    if (account.type === 'current') {
      const { data } = await supabase
        .from('current_accounts')
        .select('initial_balance, initial_balance_date')
        .eq('id', account.id)
        .maybeSingle();
      if (data) {
        initialBalance = data.initial_balance || 0;
        initialBalanceDate = data.initial_balance_date;
      }
    } else if (account.type === 'cash') {
      const { data } = await supabase
        .from('cash_accounts')
        .select('initial_balance, initial_balance_date')
        .eq('id', account.id)
        .maybeSingle();
      if (data) {
        initialBalance = data.initial_balance || 0;
        initialBalanceDate = data.initial_balance_date;
      }
    } else if (account.type === 'card') {
      const { data } = await supabase
        .from('card_accounts')
        .select('initial_balance, initial_balance_date')
        .eq('id', account.id)
        .maybeSingle();
      if (data) {
        initialBalance = data.initial_balance || 0;
        initialBalanceDate = data.initial_balance_date;
      }
    } else if (account.type === 'delivery') {
      const { data } = await supabase
        .from('delivery_accounts')
        .select('initial_balance, initial_balance_date')
        .eq('id', account.id)
        .maybeSingle();
      if (data) {
        initialBalance = data.initial_balance || 0;
        initialBalanceDate = data.initial_balance_date;
      }
    }

    let balance = initialBalance;

    if (!initialBalanceDate) {
      return balance;
    }

    // Parse the initial balance date properly (adding T12:00:00 to avoid timezone issues)
    const inicialDate = new Date(initialBalanceDate + 'T12:00:00');
    
    // If target date is before initial balance date, return initial balance
    if (targetDate < inicialDate) {
      return balance;
    }

    // Calculate all movements from initial date to target date
    // Use the original string date for queries
    const formattedInitialDate = initialBalanceDate;
    const formattedTargetDate = format(targetDate, 'yyyy-MM-dd');

    // 1. Transfers
    const { data: transfers } = await supabase
      .from('transfers')
      .select('*')
      .gte('transfer_date', formattedInitialDate)
      .lte('transfer_date', formattedTargetDate)
      .or(`source_account_id.eq.${account.id},destination_account_id.eq.${account.id}`);

    transfers?.forEach(transfer => {
      if (transfer.source_account_id === account.id) {
        balance -= transfer.amount;
      } else {
        balance += transfer.amount;
      }
    });

    // 2. Financial transactions (payables - saida)
    if (account.type === 'current' || account.type === 'cash' || account.type === 'card') {
      const { data: payableTransactions } = await supabase
        .from('financial_transactions')
        .select('amount')
        .eq('store_id', account.store_id)
        .eq('account_id', account.id)
        .eq('transaction_type', 'saida')
        .gte('transaction_date', formattedInitialDate)
        .lte('transaction_date', formattedTargetDate);

      payableTransactions?.forEach(t => {
        balance -= t.amount;
      });

      // 3. Financial transactions (receivables - entrada)
      const { data: receivableTransactions } = await supabase
        .from('financial_transactions')
        .select('amount')
        .eq('store_id', account.store_id)
        .eq('account_id', account.id)
        .eq('transaction_type', 'entrada')
        .gte('transaction_date', formattedInitialDate)
        .lte('transaction_date', formattedTargetDate);

      receivableTransactions?.forEach(t => {
        balance += t.amount;
      });
    }

    // 4. Cash control items for cash accounts
    if (account.type === 'cash') {
      const { data: cashItems } = await supabase
        .from('cash_control_cash_items')
        .select('valor, cash_control_id')
        .eq('cash_account_id', account.id);

      if (cashItems) {
        for (const item of cashItems) {
          const { data: cashControl } = await supabase
            .from('cash_control')
            .select('date')
            .eq('id', item.cash_control_id)
            .eq('store_id', account.store_id)
            .gte('date', formattedInitialDate)
            .lte('date', formattedTargetDate)
            .maybeSingle();

          if (cashControl) {
            balance += item.valor;
          }
        }
      }
    }

    // 5. Cash control items for delivery accounts
    if (account.type === 'delivery') {
      const { data: deliveryItems } = await supabase
        .from('cash_control_delivery_items')
        .select('valor, cash_control_id')
        .eq('delivery_account_id', account.id);

      if (deliveryItems) {
        for (const item of deliveryItems) {
          const { data: cashControl } = await supabase
            .from('cash_control')
            .select('date')
            .eq('id', item.cash_control_id)
            .eq('store_id', account.store_id)
            .gte('date', formattedInitialDate)
            .lte('date', formattedTargetDate)
            .maybeSingle();

          if (cashControl) {
            balance += item.valor;
          }
        }
      }
    }

    // 6. Cash control items for card accounts
    if (account.type === 'card') {
      const { data: cardItems } = await supabase
        .from('cash_control_card_items')
        .select('valor, cash_control_id')
        .eq('card_account_id', account.id);

      if (cardItems) {
        for (const item of cardItems) {
          const { data: cashControl } = await supabase
            .from('cash_control')
            .select('date')
            .eq('id', item.cash_control_id)
            .eq('store_id', account.store_id)
            .gte('date', formattedInitialDate)
            .lte('date', formattedTargetDate)
            .maybeSingle();

          if (cashControl) {
            balance += item.valor;
          }
        }
      }
    }

    // 7. Cash control items for current accounts
    if (account.type === 'current') {
      const { data: accountItems } = await supabase
        .from('cash_control_account_items')
        .select('valor, cash_control_id')
        .eq('current_account_id', account.id);

      if (accountItems) {
        for (const item of accountItems) {
          const { data: cashControl } = await supabase
            .from('cash_control')
            .select('date')
            .eq('id', item.cash_control_id)
            .eq('store_id', account.store_id)
            .gte('date', formattedInitialDate)
            .lte('date', formattedTargetDate)
            .maybeSingle();

          if (cashControl) {
            balance += item.valor;
          }
        }
      }
    }

    // 8. Partner transactions (aportes and retiradas)
    const { data: partnerTransactions } = await supabase
      .from('partner_transactions')
      .select('amount, transaction_type')
      .eq('store_id', account.store_id)
      .eq('account_id', account.id)
      .gte('payment_date', formattedInitialDate)
      .lte('payment_date', formattedTargetDate);

    partnerTransactions?.forEach(transaction => {
      if (transaction.transaction_type === 'aporte') {
        // Aporte é crédito na conta
        balance += transaction.amount;
      } else if (transaction.transaction_type === 'retirada') {
        // Retirada é débito na conta
        balance -= transaction.amount;
      }
    });

    return balance;
  };

  const generateReport = async () => {
    if (!selectedDate) {
      toast({
        title: "Erro",
        description: "Selecione uma data",
        variant: "destructive",
      });
      return;
    }

    if (selectedAccounts.length === 0) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos uma conta",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setShowResults(false);

    try {
      const results: BalanceResult[] = [];

      for (const accountId of selectedAccounts) {
        const account = accounts.find(a => a.id === accountId);
        if (!account) continue;

        const balance = await calculateBalance(account, selectedDate);

        results.push({
          accountId: account.id,
          accountName: account.name,
          accountType: getAccountTypeLabel(account.type),
          storeName: account.store_name,
          balance
        });
      }

      // Sort by store name, then account name
      results.sort((a, b) => {
        const storeCompare = a.storeName.localeCompare(b.storeName);
        if (storeCompare !== 0) return storeCompare;
        return a.accountName.localeCompare(b.accountName);
      });

      setBalanceResults(results);
      setShowResults(true);
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

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("Posição de Saldos", 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Data: ${selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: ptBR }) : ''}`, 14, 28);

    const tableData = balanceResults.map(item => [
      item.storeName,
      item.accountName,
      item.accountType,
      formatCurrency(item.balance)
    ]);

    const totalBalance = balanceResults.reduce((sum, item) => sum + item.balance, 0);
    tableData.push(['', '', 'TOTAL', formatCurrency(totalBalance)]);

    autoTable(doc, {
      head: [['Loja', 'Conta', 'Tipo', 'Saldo']],
      body: tableData,
      startY: 35,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`posicao-saldos-${format(selectedDate!, 'yyyy-MM-dd')}.pdf`);
  };

  const exportToExcel = () => {
    const data = balanceResults.map(item => ({
      'Loja': item.storeName,
      'Conta': item.accountName,
      'Tipo': item.accountType,
      'Saldo': item.balance
    }));

    const totalBalance = balanceResults.reduce((sum, item) => sum + item.balance, 0);
    data.push({
      'Loja': '',
      'Conta': '',
      'Tipo': 'TOTAL',
      'Saldo': totalBalance
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Posição de Saldos");
    XLSX.writeFile(wb, `posicao-saldos-${format(selectedDate!, 'yyyy-MM-dd')}.xlsx`);
  };

  const handleStoreToggle = (storeId: string) => {
    setSelectedStores(prev => {
      if (prev.includes(storeId)) {
        return prev.filter(id => id !== storeId);
      }
      return [...prev, storeId];
    });
    setSelectedAccounts([]);
    setShowResults(false);
  };

  const handleAccountToggle = (accountId: string) => {
    setSelectedAccounts(prev => {
      if (prev.includes(accountId)) {
        return prev.filter(id => id !== accountId);
      }
      return [...prev, accountId];
    });
    setShowResults(false);
  };

  const handleSelectAllAccounts = () => {
    if (selectedAccounts.length === accounts.length) {
      setSelectedAccounts([]);
    } else {
      setSelectedAccounts(accounts.map(a => a.id));
    }
    setShowResults(false);
  };

  const totalBalance = balanceResults.reduce((sum, item) => sum + item.balance, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center space-x-4">
          <Button onClick={() => navigate("/dashboard")} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-primary">Posição de Saldos</h1>
            <p className="text-sm text-muted-foreground">Visualize o saldo das contas em uma data específica</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filters Card */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Date Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Data *</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[280px] justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      setSelectedDate(date);
                      setShowResults(false);
                    }}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Stores Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Lojas</label>
              <div className="flex flex-wrap gap-2">
                {stores.map(store => (
                  <div
                    key={store.id}
                    className="flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover:bg-muted"
                    onClick={() => handleStoreToggle(store.id)}
                  >
                    <Checkbox
                      checked={selectedStores.includes(store.id)}
                      onCheckedChange={() => handleStoreToggle(store.id)}
                    />
                    <span className="text-sm">{store.code} - {store.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Accounts Filter */}
            {selectedStores.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Contas</label>
                  <Button variant="ghost" size="sm" onClick={handleSelectAllAccounts}>
                    {selectedAccounts.length === accounts.length ? "Desmarcar todas" : "Selecionar todas"}
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                  {accounts.map(account => (
                    <div
                      key={`${account.id}-${account.store_id}`}
                      className="flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover:bg-muted"
                      onClick={() => handleAccountToggle(account.id)}
                    >
                      <Checkbox
                        checked={selectedAccounts.includes(account.id)}
                        onCheckedChange={() => handleAccountToggle(account.id)}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{account.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {getAccountTypeLabel(account.type)} - {account.store_name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={generateReport} disabled={loading || !selectedDate || selectedAccounts.length === 0}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                "Gerar Relatório"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {showResults && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                Posição em {selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: ptBR }) : ''}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportToPDF}>
                  <FileDown className="h-4 w-4 mr-2" />
                  PDF
                </Button>
                <Button variant="outline" size="sm" onClick={exportToExcel}>
                  <Download className="h-4 w-4 mr-2" />
                  Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balanceResults.map((item, index) => (
                    <TableRow key={`${item.accountId}-${index}`}>
                      <TableCell>{item.storeName}</TableCell>
                      <TableCell className="font-medium">{item.accountName}</TableCell>
                      <TableCell>{item.accountType}</TableCell>
                      <TableCell className={cn(
                        "text-right font-medium",
                        item.balance >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {formatCurrency(item.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={3} className="text-right">TOTAL</TableCell>
                    <TableCell className={cn(
                      "text-right",
                      totalBalance >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {formatCurrency(totalBalance)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default BalancePositionReport;
