import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { useFinanceiroPermissions } from "@/hooks/useFinanceiroPermissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, CalendarIcon, FileText, Loader2, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface OFXImport {
  id: string;
  file_name: string;
  created_at: string;
  total_transactions: number | null;
  status: string;
  account_id: string;
  account_type: string;
  start_date: string | null;
  end_date: string | null;
  imported_by: string;
}

const OFXManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canView, canEdit, loading: permLoading } = useFinanceiroPermissions();

  const [userStores, setUserStores] = useState<{ id: string; name: string; code: string }[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));
  const [imports, setImports] = useState<OFXImport[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteImportId, setDeleteImportId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Account names cache
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!permLoading && canView && !canEdit) {
      toast({ variant: "destructive", title: "Acesso bloqueado", description: "Acesso bloqueado para o perfil." });
      navigate('/dashboard');
    }
  }, [permLoading, canView, canEdit, navigate, toast]);

  useEffect(() => {
    fetchUserStores();
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      loadImports();
    } else {
      setImports([]);
    }
  }, [selectedStoreId, startDate, endDate]);

  const fetchUserStores = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

      let stores: { id: string; name: string; code: string }[] = [];

      if (profile?.role === 'admin') {
        const { data: storesData } = await (supabase as any).from('stores').select('id, name, code');
        stores = (storesData || []).sort((a: any, b: any) => a.name.localeCompare(b.name));
      } else {
        const { data: userStoreLinks } = await supabase.from('user_stores').select('store_id').eq('user_id', user.id);
        if (userStoreLinks && userStoreLinks.length > 0) {
          const storeIds = userStoreLinks.map(us => us.store_id);
          const { data: storesData } = await (supabase as any).from('stores').select('id, name, code').in('id', storeIds);
          stores = (storesData || []).sort((a: any, b: any) => a.name.localeCompare(b.name));
        }
      }

      setUserStores(stores);
    } catch (error) {
      console.error('Error fetching user stores:', error);
    }
  };

  const loadImports = async () => {
    if (!selectedStoreId) return;
    setLoading(true);

    try {
      // Get account IDs linked to the store
      const [currentLinks, cashLinks, cardLinks, deliveryLinks] = await Promise.all([
        supabase.from('current_account_stores').select('account_id').eq('store_id', selectedStoreId),
        supabase.from('cash_account_stores').select('account_id').eq('store_id', selectedStoreId),
        supabase.from('card_account_stores').select('account_id').eq('store_id', selectedStoreId),
        supabase.from('delivery_account_stores').select('account_id').eq('store_id', selectedStoreId),
      ]);

      const allAccountIds = [
        ...(currentLinks.data || []).map(l => l.account_id),
        ...(cashLinks.data || []).map(l => l.account_id),
        ...(cardLinks.data || []).map(l => l.account_id),
        ...(deliveryLinks.data || []).map(l => l.account_id),
      ];

      if (allAccountIds.length === 0) {
        setImports([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('bank_ofx_imports')
        .select('id, file_name, created_at, total_transactions, status, account_id, account_type, start_date, end_date, imported_by')
        .in('account_id', allAccountIds)
        .gte('created_at', format(startDate, 'yyyy-MM-dd'))
        .lte('created_at', format(endDate, 'yyyy-MM-dd') + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setImports(data || []);

      // Load account names
      const accountIds = [...new Set((data || []).map(d => d.account_id))];
      await loadAccountNames(accountIds, data || []);

    } catch (error) {
      console.error('Error loading imports:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAccountNames = async (accountIds: string[], importsData: OFXImport[]) => {
    const names: Record<string, string> = {};

    const types = [...new Set(importsData.map(i => i.account_type))];

    for (const type of types) {
      const ids = importsData.filter(i => i.account_type === type).map(i => i.account_id);
      const uniqueIds = [...new Set(ids)];

      if (type === 'current' && uniqueIds.length > 0) {
        const { data } = await supabase.from('current_accounts').select('id, name').in('id', uniqueIds);
        (data || []).forEach(a => { names[a.id] = a.name; });
      } else if (type === 'cash' && uniqueIds.length > 0) {
        const { data } = await supabase.from('cash_accounts').select('id, name').in('id', uniqueIds);
        (data || []).forEach(a => { names[a.id] = a.name; });
      } else if (type === 'card' && uniqueIds.length > 0) {
        const { data } = await supabase.from('card_accounts').select('id, name').in('id', uniqueIds);
        (data || []).forEach(a => { names[a.id] = a.name; });
      } else if (type === 'delivery' && uniqueIds.length > 0) {
        const { data } = await supabase.from('delivery_accounts').select('id, name').in('id', uniqueIds);
        (data || []).forEach(a => { names[a.id] = a.name; });
      }
    }

    setAccountNames(names);
  };

  const getAccountTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      current: 'Conta Corrente',
      cash: 'Conta Caixa',
      card: 'Conta Cartão',
      delivery: 'Delivery',
    };
    return labels[type] || type;
  };

  const handleDeleteImport = async () => {
    if (!deleteImportId || deleting) return;
    setDeleting(true);

    try {
      // 1. Get all transaction IDs for this import
      const { data: transactions } = await supabase
        .from('bank_ofx_transactions')
        .select('id')
        .eq('import_id', deleteImportId);

      const txIds = (transactions || []).map(t => t.id);

      // 2. Delete reconciliations linked to these transactions
      if (txIds.length > 0) {
        const { error: reconError } = await supabase
          .from('bank_reconciliations')
          .delete()
          .in('ofx_transaction_id', txIds);
        if (reconError) throw reconError;
      }

      // 3. Delete the OFX transactions
      const { error: txError } = await supabase
        .from('bank_ofx_transactions')
        .delete()
        .eq('import_id', deleteImportId);
      if (txError) throw txError;

      // 4. Delete the import record
      const { error: importError } = await supabase
        .from('bank_ofx_imports')
        .delete()
        .eq('id', deleteImportId);
      if (importError) throw importError;

      toast({
        title: "Importação excluída",
        description: "O arquivo OFX e todos os dados relacionados foram excluídos com sucesso.",
      });

      await loadImports();

    } catch (error: any) {
      console.error('Error deleting OFX import:', error);
      toast({
        title: "Erro ao excluir",
        description: error.message || "Erro ao excluir a importação OFX",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteImportId(null);
    }
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
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center space-x-4">
          <Button onClick={() => navigate("/dashboard")} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-primary">Gerenciar Arquivos OFX</h1>
            <p className="text-sm text-muted-foreground">Visualize e exclua importações de extratos bancários</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Store */}
              <div className="space-y-2">
                <Label>Loja</Label>
                <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma loja" />
                  </SelectTrigger>
                  <SelectContent>
                    {userStores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.code} - {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <Label>Data Inicial (Upload)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "dd/MM/yyyy") : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} locale={ptBR} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label>Data Final (Upload)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "dd/MM/yyyy") : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} locale={ptBR} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Imports Table */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Arquivos Importados
                {imports.length > 0 && (
                  <Badge variant="secondary" className="ml-2 font-normal">{imports.length}</Badge>
                )}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !selectedStoreId ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Selecione uma loja para visualizar os arquivos OFX</p>
              </div>
            ) : imports.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhuma importação encontrada no período selecionado</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Conta</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Transações</TableHead>
                      <TableHead>Período do Extrato</TableHead>
                      <TableHead>Data do Upload</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {imports.map((imp) => (
                      <TableRow key={imp.id}>
                        <TableCell className="font-medium max-w-[200px] truncate" title={imp.file_name}>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">{imp.file_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{accountNames[imp.account_id] || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{getAccountTypeLabel(imp.account_type)}</Badge>
                        </TableCell>
                        <TableCell className="text-center">{imp.total_transactions || 0}</TableCell>
                        <TableCell>
                          {imp.start_date && imp.end_date
                            ? `${format(new Date(imp.start_date + 'T12:00:00'), "dd/MM/yyyy")} - ${format(new Date(imp.end_date + 'T12:00:00'), "dd/MM/yyyy")}`
                            : '—'}
                        </TableCell>
                        <TableCell>{format(new Date(imp.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                        <TableCell>
                          <Badge variant={imp.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                            {imp.status === 'completed' ? 'Concluído' : imp.status === 'processing' ? 'Processando' : imp.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteImportId(imp.id)}
                            title="Excluir importação"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteImportId} onOpenChange={(open) => !open && setDeleteImportId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir importação OFX</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este arquivo OFX? Esta ação irá remover:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>O registro da importação</li>
                <li>Todas as transações OFX associadas</li>
                <li>Todas as conciliações realizadas com essas transações</li>
              </ul>
              <span className="block mt-2 font-semibold text-destructive">Esta ação não pode ser desfeita.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteImport}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OFXManagement;
