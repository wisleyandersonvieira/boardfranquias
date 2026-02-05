import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useFinanceiroPermissions } from "@/hooks/useFinanceiroPermissions";
import { useUserMatrix } from "@/hooks/useUserMatrix";
import { 
  ArrowLeft, 
  Upload, 
  CalendarIcon, 
  RefreshCw, 
  Check, 
  X, 
  Link2, 
  AlertCircle,
  FileText,
  Loader2,
  ChevronRight,
  Search,
  Filter
} from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { parseOFX, calculateFileHash, getDateFromOFX, OFXTransaction } from "@/utils/ofxParser";
import { findMatches, formatMatchRule, getScoreColor, InternalTransaction, MatchSuggestion, parseDatePreservingLocal } from "@/utils/reconciliationMatcher";

interface Account {
  id: string;
  name: string;
  type: 'current' | 'cash' | 'card' | 'delivery';
}

interface OFXTransactionRow {
  id: string;
  import_id: string;
  account_id: string;
  account_type: string;
  fitid: string;
  trntype: string;
  posted_at: string;
  amount: number;
  name: string | null;
  memo: string | null;
  refnum: string | null;
  is_reconciled: boolean;
  reconciled_at: string | null;
}

interface ReconciliationStats {
  total: number;
  reconciled: number;
  pending: number;
  totalAmount: number;
}

const BankReconciliation = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canView, canAdmin, loading: permLoading } = useFinanceiroPermissions();
  const { matrixId } = useUserMatrix();

  // State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [selectedAccountType, setSelectedAccountType] = useState<string>("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // OFX Data
  const [ofxTransactions, setOfxTransactions] = useState<OFXTransactionRow[]>([]);
  const [selectedOfxId, setSelectedOfxId] = useState<string | null>(null);
  const [ofxFilter, setOfxFilter] = useState<'all' | 'pending' | 'reconciled'>('pending');
  const [ofxSearch, setOfxSearch] = useState("");

  // Internal Transactions
  const [internalTransactions, setInternalTransactions] = useState<InternalTransaction[]>([]);
  const [internalSearch, setInternalSearch] = useState("");
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestion[]>([]);

  // Reconciliation
  const [reconciliationNote, setReconciliationNote] = useState("");
  const [reconciling, setReconciling] = useState(false);

  // Stats
  const stats = useMemo<ReconciliationStats>(() => {
    const reconciled = ofxTransactions.filter(t => t.is_reconciled).length;
    const pending = ofxTransactions.filter(t => !t.is_reconciled).length;
    const totalAmount = ofxTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return { total: ofxTransactions.length, reconciled, pending, totalAmount };
  }, [ofxTransactions]);

  // Load accounts on mount
  useEffect(() => {
    fetchAccounts();
  }, []);

  // Load OFX transactions when account or dates change
  useEffect(() => {
    if (selectedAccount && startDate && endDate) {
      loadOfxTransactions();
      loadInternalTransactions();
    }
  }, [selectedAccount, startDate, endDate]);

  // Find matches when an OFX transaction is selected
  useEffect(() => {
    if (selectedOfxId && internalTransactions.length > 0) {
      const ofxTx = ofxTransactions.find(t => t.id === selectedOfxId);
      if (ofxTx) {
        const matches = findMatches(
          {
            id: ofxTx.id,
            posted_at: parseDatePreservingLocal(ofxTx.posted_at),
            amount: ofxTx.amount,
            name: ofxTx.name,
            memo: ofxTx.memo,
            trntype: ofxTx.trntype,
          },
          internalTransactions
        );
        setMatchSuggestions(matches);
      }
    } else {
      setMatchSuggestions([]);
    }
  }, [selectedOfxId, internalTransactions, ofxTransactions]);

  const fetchAccounts = async () => {
    try {
      const [currentResult, cashResult, cardResult, deliveryResult] = await Promise.all([
        supabase.from('current_accounts').select('id, name').eq('is_active', true),
        supabase.from('cash_accounts').select('id, name').eq('is_active', true),
        supabase.from('card_accounts').select('id, name').eq('is_active', true),
        supabase.from('delivery_accounts').select('id, name').eq('is_active', true),
      ]);

      const allAccounts: Account[] = [
        ...(currentResult.data || []).map(a => ({ ...a, type: 'current' as const })),
        ...(cashResult.data || []).map(a => ({ ...a, type: 'cash' as const })),
        ...(cardResult.data || []).map(a => ({ ...a, type: 'card' as const })),
        ...(deliveryResult.data || []).map(a => ({ ...a, type: 'delivery' as const })),
      ];

      setAccounts(allAccounts);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const loadOfxTransactions = async () => {
    if (!selectedAccount || !startDate || !endDate) return;

    try {
      const { data, error } = await supabase
        .from('bank_ofx_transactions')
        .select('*')
        .eq('account_id', selectedAccount)
        .eq('account_type', selectedAccountType)
        .gte('posted_at', format(startDate, 'yyyy-MM-dd'))
        .lte('posted_at', format(endDate, 'yyyy-MM-dd') + 'T23:59:59')
        .order('posted_at', { ascending: false });

      if (error) throw error;
      setOfxTransactions(data || []);
    } catch (error) {
      console.error('Error loading OFX transactions:', error);
    }
  };

  const loadInternalTransactions = async () => {
    if (!selectedAccount || !startDate || !endDate) return;

    try {
      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');
      
      // Get linked stores for this account
      let linkedStoreIds: string[] = [];
      
      if (selectedAccountType === 'current') {
        const { data } = await supabase.from('current_account_stores').select('store_id').eq('account_id', selectedAccount);
        linkedStoreIds = data?.map(s => s.store_id) || [];
      } else if (selectedAccountType === 'cash') {
        const { data } = await supabase.from('cash_account_stores').select('store_id').eq('account_id', selectedAccount);
        linkedStoreIds = data?.map(s => s.store_id) || [];
      } else if (selectedAccountType === 'card') {
        const { data } = await supabase.from('card_account_stores').select('store_id').eq('account_id', selectedAccount);
        linkedStoreIds = data?.map(s => s.store_id) || [];
      } else if (selectedAccountType === 'delivery') {
        const { data } = await supabase.from('delivery_account_stores').select('store_id').eq('account_id', selectedAccount);
        linkedStoreIds = data?.map(s => s.store_id) || [];
      }

      if (linkedStoreIds.length === 0) {
        setInternalTransactions([]);
        return;
      }

      // Load financial transactions
      const { data: financialTrans } = await supabase
        .from('financial_transactions')
        .select('id, amount, transaction_date, description, reference_id, reference_type, transaction_type')
        .eq('account_id', selectedAccount)
        .in('store_id', linkedStoreIds)
        .gte('transaction_date', startDateStr)
        .lte('transaction_date', endDateStr);

      // Load suppliers and creditors for entity names
      const [suppliersRes, creditorsRes] = await Promise.all([
        supabase.from('suppliers').select('id, name'),
        supabase.from('creditors').select('id, name'),
      ]);

      const suppliersMap = new Map((suppliersRes.data || []).map(s => [s.id, s.name]));
      const creditorsMap = new Map((creditorsRes.data || []).map(c => [c.id, c.name]));

      // Transform to internal transactions
      const internal: InternalTransaction[] = (financialTrans || []).map(t => {
        let type: InternalTransaction['type'] = 'accounts_payable';
        let entityName = '';
        
        if (t.reference_type === 'accounts_payable') {
          type = 'accounts_payable';
        } else if (t.reference_type === 'accounts_receivable') {
          type = 'accounts_receivable';
        } else if (t.reference_type === 'transfer') {
          type = 'transfer';
        } else if (t.reference_type === 'partner_transaction') {
          type = 'partner_transaction';
        }

        return {
          id: t.id,
          date: parseDatePreservingLocal(t.transaction_date),
          amount: t.amount,
          description: t.description,
          type,
          table: 'financial_transactions',
          entityName,
        };
      });

      // Also load transfers directly
      const { data: transfers } = await supabase
        .from('transfers')
        .select('*')
        .or(`source_account_id.eq.${selectedAccount},destination_account_id.eq.${selectedAccount}`)
        .gte('transfer_date', startDateStr)
        .lte('transfer_date', endDateStr);

      if (transfers) {
        for (const t of transfers) {
          const isSource = t.source_account_id === selectedAccount;
          internal.push({
            id: t.id,
            date: parseDatePreservingLocal(t.transfer_date),
            amount: isSource ? -t.amount : t.amount,
            description: t.description || 'Transferência',
            type: 'transfer',
            table: 'transfers',
          });
        }
      }

      // Load partner transactions
      const { data: partnerTrans } = await supabase
        .from('partner_transactions')
        .select('id, amount, payment_date, transaction_type, notes, partners:partner_id(name)')
        .in('store_id', linkedStoreIds)
        .eq('account_id', selectedAccount)
        .gte('payment_date', startDateStr)
        .lte('payment_date', endDateStr);

      if (partnerTrans) {
        for (const t of partnerTrans) {
          const partner = (t.partners as any);
          internal.push({
            id: t.id,
            date: parseDatePreservingLocal(t.payment_date),
            amount: t.transaction_type === 'aporte' ? t.amount : -t.amount,
            description: t.notes || (t.transaction_type === 'aporte' ? 'Aporte de Sócio' : 'Retirada de Sócio'),
            type: 'partner_transaction',
            table: 'partner_transactions',
            entityName: partner?.name || '',
          });
        }
      }

      setInternalTransactions(internal);
    } catch (error) {
      console.error('Error loading internal transactions:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedAccount || !selectedAccountType) {
      toast({ title: "Erro", description: "Selecione uma conta antes de importar o arquivo", variant: "destructive" });
      return;
    }

    if (!matrixId) {
      toast({ title: "Erro", description: "Matriz não identificada", variant: "destructive" });
      return;
    }

    setLoading(true);
    setImportProgress(10);

    try {
      // Read file content
      const content = await file.text();
      setImportProgress(20);

      // Calculate hash to check for duplicates
      const fileHash = await calculateFileHash(content);
      
      // Check if already imported
      const { data: existing } = await supabase
        .from('bank_ofx_imports')
        .select('id')
        .eq('file_hash', fileHash)
        .eq('account_id', selectedAccount)
        .single();

      if (existing) {
        toast({ title: "Arquivo já importado", description: "Este arquivo OFX já foi importado anteriormente", variant: "destructive" });
        setLoading(false);
        setImportProgress(0);
        return;
      }

      setImportProgress(30);

      // Parse OFX file
      const parseResult = parseOFX(content);
      
      if (!parseResult.success) {
        toast({ title: "Erro ao processar OFX", description: parseResult.error, variant: "destructive" });
        setLoading(false);
        setImportProgress(0);
        return;
      }

      if (parseResult.transactions.length === 0) {
        toast({ title: "Arquivo vazio", description: "Nenhuma transação encontrada no arquivo", variant: "destructive" });
        setLoading(false);
        setImportProgress(0);
        return;
      }

      setImportProgress(50);

      // Get user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Create import record
      const { data: importRecord, error: importError } = await supabase
        .from('bank_ofx_imports')
        .insert({
          account_id: selectedAccount,
          account_type: selectedAccountType,
          file_name: file.name,
          file_hash: fileHash,
          start_date: parseResult.startDate ? format(parseResult.startDate, 'yyyy-MM-dd') : null,
          end_date: parseResult.endDate ? format(parseResult.endDate, 'yyyy-MM-dd') : null,
          total_transactions: parseResult.transactions.length,
          imported_by: user.id,
          status: 'processing',
          matrix_id: matrixId,
        })
        .select()
        .single();

      if (importError) throw importError;

      setImportProgress(60);

      // Insert transactions (in batches to avoid timeout)
      const batchSize = 50;
      const transactions = parseResult.transactions;
      let inserted = 0;

      for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, i + batchSize);
        
        const transactionsToInsert = batch.map(t => ({
          import_id: importRecord.id,
          account_id: selectedAccount,
          account_type: selectedAccountType,
          fitid: t.fitid,
          trntype: t.trntype,
          posted_at: getDateFromOFX(t.dtposted)?.toISOString() || new Date().toISOString(),
          amount: t.amount,
          name: t.name,
          memo: t.memo,
          refnum: t.refnum,
          raw_payload: t.raw,
          matrix_id: matrixId,
        }));

        const { error: txError } = await supabase
          .from('bank_ofx_transactions')
          .upsert(transactionsToInsert, {
            onConflict: 'account_id,account_type,fitid',
            ignoreDuplicates: true,
          });

        if (txError) {
          console.error('Error inserting batch:', txError);
        }

        inserted += batch.length;
        setImportProgress(60 + Math.round((inserted / transactions.length) * 30));
      }

      // Update import status
      await supabase
        .from('bank_ofx_imports')
        .update({ status: 'completed' })
        .eq('id', importRecord.id);

      setImportProgress(100);

      // Update dates from OFX
      if (parseResult.startDate) setStartDate(parseResult.startDate);
      if (parseResult.endDate) setEndDate(parseResult.endDate);

      // Reload transactions
      await loadOfxTransactions();
      await loadInternalTransactions();

      toast({
        title: "Importação concluída",
        description: `${transactions.length} transações importadas com sucesso`,
      });

    } catch (error: any) {
      console.error('Error importing OFX:', error);
      toast({
        title: "Erro na importação",
        description: error.message || "Erro ao processar arquivo OFX",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setImportProgress(0);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleReconcile = async (internalTx: InternalTransaction, matchRule: string, score: number) => {
    if (!selectedOfxId || reconciling) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !matrixId) return;

    setReconciling(true);

    try {
      // Create reconciliation record
      const { error: reconcError } = await supabase
        .from('bank_reconciliations')
        .insert({
          account_id: selectedAccount,
          account_type: selectedAccountType,
          ofx_transaction_id: selectedOfxId,
          internal_type: internalTx.type,
          internal_id: internalTx.id,
          internal_table: internalTx.table,
          matched_rule: matchRule,
          match_score: score,
          notes: reconciliationNote || null,
          matrix_id: matrixId,
          created_by: user.id,
        });

      if (reconcError) throw reconcError;

      // Mark OFX transaction as reconciled
      const { error: updateError } = await supabase
        .from('bank_ofx_transactions')
        .update({
          is_reconciled: true,
          reconciled_at: new Date().toISOString(),
          reconciled_by: user.id,
        })
        .eq('id', selectedOfxId);

      if (updateError) throw updateError;

      toast({ title: "Conciliado!", description: "Transação conciliada com sucesso" });

      // Move to next pending
      const nextPending = ofxTransactions.find(t => !t.is_reconciled && t.id !== selectedOfxId);
      setSelectedOfxId(nextPending?.id || null);
      setReconciliationNote("");
      
      // Reload transactions
      await loadOfxTransactions();

    } catch (error: any) {
      console.error('Error reconciling:', error);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setReconciling(false);
    }
  };

  const handleUndoReconciliation = async (ofxId: string) => {
    if (reconciling) return;

    setReconciling(true);

    try {
      // Delete reconciliation record
      await supabase
        .from('bank_reconciliations')
        .delete()
        .eq('ofx_transaction_id', ofxId);

      // Mark OFX transaction as not reconciled
      await supabase
        .from('bank_ofx_transactions')
        .update({
          is_reconciled: false,
          reconciled_at: null,
          reconciled_by: null,
        })
        .eq('id', ofxId);

      toast({ title: "Desconciliado", description: "Conciliação desfeita" });
      
      await loadOfxTransactions();

    } catch (error: any) {
      console.error('Error undoing reconciliation:', error);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setReconciling(false);
    }
  };

  const handleMarkNotIdentified = async () => {
    if (!selectedOfxId || reconciling) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !matrixId) return;

    setReconciling(true);

    try {
      await supabase
        .from('bank_reconciliations')
        .insert({
          account_id: selectedAccount,
          account_type: selectedAccountType,
          ofx_transaction_id: selectedOfxId,
          internal_type: 'other',
          matched_rule: 'not_identified',
          match_score: 0,
          notes: reconciliationNote || 'Não identificado',
          matrix_id: matrixId,
          created_by: user.id,
        });

      await supabase
        .from('bank_ofx_transactions')
        .update({
          is_reconciled: true,
          reconciled_at: new Date().toISOString(),
          reconciled_by: user.id,
        })
        .eq('id', selectedOfxId);

      toast({ title: "Marcado", description: "Transação marcada como não identificada" });

      const nextPending = ofxTransactions.find(t => !t.is_reconciled && t.id !== selectedOfxId);
      setSelectedOfxId(nextPending?.id || null);
      setReconciliationNote("");
      
      await loadOfxTransactions();

    } catch (error: any) {
      console.error('Error marking as not identified:', error);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setReconciling(false);
    }
  };

  const handleAutoReconcile = async () => {
    if (loading || !selectedAccount || ofxTransactions.length === 0) return;

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !matrixId) return;

      let reconciled = 0;
      const pending = ofxTransactions.filter(t => !t.is_reconciled);

      for (const ofxTx of pending) {
        const matches = findMatches(
          {
            id: ofxTx.id,
            posted_at: parseDatePreservingLocal(ofxTx.posted_at),
            amount: ofxTx.amount,
            name: ofxTx.name,
            memo: ofxTx.memo,
            trntype: ofxTx.trntype,
          },
          internalTransactions
        );

        const exactMatch = matches.find(m => m.matchRule === 'auto_exact');
        if (exactMatch) {
          await supabase.from('bank_reconciliations').insert({
            account_id: selectedAccount,
            account_type: selectedAccountType,
            ofx_transaction_id: ofxTx.id,
            internal_type: exactMatch.internalTransaction.type,
            internal_id: exactMatch.internalTransaction.id,
            internal_table: exactMatch.internalTransaction.table,
            matched_rule: 'auto_exact',
            match_score: exactMatch.score,
            notes: 'Conciliação automática',
            matrix_id: matrixId,
            created_by: user.id,
          });

          await supabase.from('bank_ofx_transactions').update({
            is_reconciled: true,
            reconciled_at: new Date().toISOString(),
            reconciled_by: user.id,
          }).eq('id', ofxTx.id);

          reconciled++;
        }
      }

      await loadOfxTransactions();

      toast({
        title: "Conciliação automática concluída",
        description: `${reconciled} de ${pending.length} transações conciliadas automaticamente`,
      });

    } catch (error: any) {
      console.error('Error in auto reconciliation:', error);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Filtered OFX transactions
  const filteredOfxTransactions = useMemo(() => {
    let filtered = ofxTransactions;

    if (ofxFilter === 'pending') {
      filtered = filtered.filter(t => !t.is_reconciled);
    } else if (ofxFilter === 'reconciled') {
      filtered = filtered.filter(t => t.is_reconciled);
    }

    if (ofxSearch) {
      const search = ofxSearch.toLowerCase();
      filtered = filtered.filter(t =>
        t.name?.toLowerCase().includes(search) ||
        t.memo?.toLowerCase().includes(search) ||
        t.fitid.toLowerCase().includes(search) ||
        t.amount.toString().includes(search)
      );
    }

    return filtered;
  }, [ofxTransactions, ofxFilter, ofxSearch]);

  // Filtered internal transactions
  const filteredInternalTransactions = useMemo(() => {
    if (!internalSearch) return internalTransactions;
    
    const search = internalSearch.toLowerCase();
    return internalTransactions.filter(t =>
      t.description.toLowerCase().includes(search) ||
      t.entityName?.toLowerCase().includes(search) ||
      t.amount.toString().includes(search)
    );
  }, [internalTransactions, internalSearch]);

  const selectedOfxTransaction = useMemo(() => 
    ofxTransactions.find(t => t.id === selectedOfxId),
    [ofxTransactions, selectedOfxId]
  );

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

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      accounts_payable: 'Conta a Pagar',
      accounts_receivable: 'Conta a Receber',
      transfer: 'Transferência',
      cash_control: 'Controle de Caixa',
      partner_transaction: 'Aporte/Retirada',
      adjustment: 'Ajuste',
      other: 'Outro',
    };
    return labels[type] || type;
  };

  if (permLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6">
          <p className="text-muted-foreground">Você não tem permissão para acessar este módulo.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button onClick={() => navigate("/dashboard")} variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-primary">Conciliação Bancária</h1>
              <p className="text-sm text-muted-foreground">Compare extratos OFX com lançamentos do sistema</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filters Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Filtros e Importação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Account Select */}
              <div className="space-y-2">
                <Label>Conta</Label>
                <Select
                  value={`${selectedAccount}|${selectedAccountType}`}
                  onValueChange={(value) => {
                    const [accId, accType] = value.split('|');
                    setSelectedAccount(accId);
                    setSelectedAccountType(accType);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={`${acc.id}-${acc.type}`} value={`${acc.id}|${acc.type}`}>
                        [{getAccountTypeLabel(acc.type)}] {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <Label>Data Inicial</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "dd/MM/yyyy") : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label>Data Final</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "dd/MM/yyyy") : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <Label>Arquivo OFX</Label>
                <div className="relative">
                  <Input
                    type="file"
                    accept=".ofx,.OFX"
                    onChange={handleFileUpload}
                    disabled={loading || !selectedAccount}
                    className="cursor-pointer"
                  />
                </div>
              </div>

              {/* Auto Reconcile */}
              <div className="space-y-2">
                <Label>&nbsp;</Label>
                <Button
                  onClick={handleAutoReconcile}
                  disabled={loading || !selectedAccount || ofxTransactions.length === 0}
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Auto Conciliar
                </Button>
              </div>
            </div>

            {/* Import Progress */}
            {loading && importProgress > 0 && (
              <div className="mt-4">
                <Progress value={importProgress} className="h-2" />
                <p className="text-sm text-muted-foreground mt-1">Importando... {importProgress}%</p>
              </div>
            )}

            {/* Stats */}
            {stats.total > 0 && (
              <div className="mt-4 flex gap-4 flex-wrap">
                <Badge variant="outline" className="text-sm py-1">
                  Total: {stats.total}
                </Badge>
                <Badge variant="default" className="text-sm py-1 bg-green-600">
                  Conciliados: {stats.reconciled}
                </Badge>
                <Badge variant="secondary" className="text-sm py-1">
                  Pendentes: {stats.pending}
                </Badge>
                <Badge variant="outline" className="text-sm py-1">
                  Valor Total: {formatCurrency(stats.totalAmount)}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Two Panel Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel - OFX Transactions */}
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Transações OFX</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant={ofxFilter === 'pending' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setOfxFilter('pending')}
                  >
                    Pendentes
                  </Button>
                  <Button
                    variant={ofxFilter === 'reconciled' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setOfxFilter('reconciled')}
                  >
                    Conciliados
                  </Button>
                  <Button
                    variant={ofxFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setOfxFilter('all')}
                  >
                    Todos
                  </Button>
                </div>
              </div>
              <div className="relative mt-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por descrição, valor..."
                  value={ofxSearch}
                  onChange={(e) => setOfxSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-2">
                  {filteredOfxTransactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma transação encontrada</p>
                      <p className="text-sm">Importe um arquivo OFX para começar</p>
                    </div>
                  ) : (
                    filteredOfxTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        onClick={() => setSelectedOfxId(tx.id)}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-colors",
                          selectedOfxId === tx.id ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                          tx.is_reconciled && "opacity-60"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {format(new Date(tx.posted_at), "dd/MM/yyyy")}
                              </span>
                              <Badge variant={tx.amount < 0 ? "destructive" : "default"} className="text-xs">
                                {tx.trntype}
                              </Badge>
                              {tx.is_reconciled && (
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                                  <Check className="h-3 w-3 mr-1" />
                                  Conciliado
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate mt-1">
                              {tx.name || tx.memo || tx.refnum || 'Sem descrição'}
                            </p>
                          </div>
                          <div className="text-right ml-4">
                            <p className={cn("font-semibold", tx.amount < 0 ? "text-red-600" : "text-green-600")}>
                              {formatCurrency(tx.amount)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right Panel - Internal Transactions & Matching */}
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                {selectedOfxTransaction ? "Sugestões de Match" : "Lançamentos do Sistema"}
              </CardTitle>
              {selectedOfxTransaction && (
                <div className="mt-2 p-3 bg-muted rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {format(new Date(selectedOfxTransaction.posted_at), "dd/MM/yyyy")} - {selectedOfxTransaction.trntype}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {selectedOfxTransaction.name || selectedOfxTransaction.memo || selectedOfxTransaction.fitid}
                      </p>
                    </div>
                    <p className={cn("font-bold", selectedOfxTransaction.amount < 0 ? "text-red-600" : "text-green-600")}>
                      {formatCurrency(selectedOfxTransaction.amount)}
                    </p>
                  </div>
                </div>
              )}
              <div className="relative mt-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar lançamentos..."
                  value={internalSearch}
                  onChange={(e) => setInternalSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-2">
                  {/* Match Suggestions */}
                  {selectedOfxTransaction && matchSuggestions.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-muted-foreground mb-2">Sugestões de Match</p>
                      {matchSuggestions.map((match) => (
                        <div
                          key={match.internalTransaction.id}
                          className="p-3 rounded-lg border bg-card mb-2"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Badge className={cn("text-xs", getScoreColor(match.score))}>
                                  Score: {match.score}%
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {formatMatchRule(match.matchRule)}
                                </Badge>
                              </div>
                              <p className="text-sm font-medium mt-1">
                                {format(match.internalTransaction.date, "dd/MM/yyyy")} - {getTypeLabel(match.internalTransaction.type)}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {match.internalTransaction.description}
                                {match.internalTransaction.entityName && ` - ${match.internalTransaction.entityName}`}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {match.reasons.join(' • ')}
                              </p>
                            </div>
                            <div className="text-right ml-4">
                              <p className={cn("font-semibold", match.internalTransaction.amount < 0 ? "text-red-600" : "text-green-600")}>
                                {formatCurrency(match.internalTransaction.amount)}
                              </p>
                              <Button
                                size="sm"
                                className="mt-2"
                                onClick={() => handleReconcile(match.internalTransaction, match.matchRule, match.score)}
                                disabled={reconciling}
                              >
                                {reconciling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
                                Conciliar
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action Buttons for Selected OFX */}
                  {selectedOfxTransaction && !selectedOfxTransaction.is_reconciled && (
                    <div className="mb-4 p-3 border rounded-lg space-y-3">
                      <Textarea
                        placeholder="Notas (opcional)..."
                        value={reconciliationNote}
                        onChange={(e) => setReconciliationNote(e.target.value)}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleMarkNotIdentified}
                          disabled={reconciling}
                        >
                          <AlertCircle className="h-4 w-4 mr-1" />
                          Não Identificado
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Undo for Reconciled */}
                  {selectedOfxTransaction?.is_reconciled && (
                    <div className="mb-4 p-3 border rounded-lg bg-green-50">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-green-700">Esta transação já foi conciliada</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUndoReconciliation(selectedOfxTransaction.id)}
                          disabled={reconciling}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Desfazer
                        </Button>
                      </div>
                    </div>
                  )}

                  <Separator className="my-4" />

                  {/* All Internal Transactions */}
                  <p className="text-sm font-medium text-muted-foreground mb-2">Todos os Lançamentos</p>
                  {filteredInternalTransactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Nenhum lançamento encontrado no período</p>
                    </div>
                  ) : (
                    filteredInternalTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                        onClick={() => {
                          if (selectedOfxTransaction && !selectedOfxTransaction.is_reconciled) {
                            handleReconcile(tx, 'manual', 50);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {format(tx.date, "dd/MM/yyyy")}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {getTypeLabel(tx.type)}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground truncate mt-1">
                              {tx.description}
                              {tx.entityName && ` - ${tx.entityName}`}
                            </p>
                          </div>
                          <div className="text-right ml-4">
                            <p className={cn("font-semibold", tx.amount < 0 ? "text-red-600" : "text-green-600")}>
                              {formatCurrency(tx.amount)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default BankReconciliation;
