import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, FileText, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Helper to avoid TS2589 deep type instantiation errors
const query = (table: string) => (supabase as any).from(table);
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import JSZip from "jszip";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Store {
  id: string;
  name: string;
}

interface CashAccount {
  id: string;
  name: string;
  type: "cash" | "current" | "delivery" | "card";
}

interface PaymentRecord {
  id: string;
  payment_date: string;
  amount_paid: number;
  interest_amount: number;
  discount_amount: number;
  payment_account_id: string | null;
  payment_account_type: string | null;
  description: string;
  document_number: string | null;
  supplier_name: string | null;
  employee_name: string | null;
  installment_number: number | null;
  total_installments: number | null;
  attachments: any;
  account_payable_id: string | null;
}

const AccountingExportReport = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [paymentStartDate, setPaymentStartDate] = useState("");
  const [paymentEndDate, setPaymentEndDate] = useState("");
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    if (selectedStore) {
      fetchAccounts(selectedStore);
    } else {
      setAccounts([]);
      setSelectedAccounts([]);
    }
  }, [selectedStore]);

  const fetchStores = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      let storesData: Store[] = [];

      if (profile?.role === "admin") {
        const { data } = await query("stores")
          .select("id, name")
          .order("name");
        storesData = (data || []).map((s: any) => ({ id: s.id, name: s.name }));
      } else {
        const { data: userStores } = await query("user_stores")
          .select("store_id, stores(id, name)")
          .eq("user_id", user.id);

        storesData = userStores
          ?.map((us: any) => us.stores)
          .filter((s: any) => s) || [];
      }

      setStores(storesData);
    } catch (error) {
      console.error("Erro ao buscar lojas:", error);
    }
  };

  const fetchAccounts = async (storeId: string) => {
    try {
      const allAccounts: CashAccount[] = [];

      // Buscar contas caixa vinculadas à loja
      const { data: cashAccounts } = await query("cash_accounts")
        .select(`
          id, name,
          cash_account_stores!inner (store_id)
        `)
        .eq("is_active", true)
        .eq("cash_account_stores.store_id", storeId);

      (cashAccounts || []).forEach((acc: any) => {
        allAccounts.push({ id: acc.id, name: `Caixa - ${acc.name}`, type: "cash" });
      });

      // Buscar contas correntes vinculadas à loja
      const { data: currentAccounts } = await query("current_accounts")
        .select(`
          id, name,
          current_account_stores!inner (store_id)
        `)
        .eq("is_active", true)
        .eq("current_account_stores.store_id", storeId);

      (currentAccounts || []).forEach((acc: any) => {
        allAccounts.push({ id: acc.id, name: `Corrente - ${acc.name}`, type: "current" });
      });

      // Buscar contas delivery vinculadas à loja
      const { data: deliveryAccounts } = await query("delivery_accounts")
        .select(`
          id, name,
          delivery_account_stores!inner (store_id)
        `)
        .eq("is_active", true)
        .eq("delivery_account_stores.store_id", storeId);

      (deliveryAccounts || []).forEach((acc: any) => {
        allAccounts.push({ id: acc.id, name: `Delivery - ${acc.name}`, type: "delivery" });
      });

      // Buscar contas cartão vinculadas à loja
      const { data: cardAccounts } = await query("card_accounts")
        .select(`
          id, name,
          card_account_stores!inner (store_id)
        `)
        .eq("is_active", true)
        .eq("card_account_stores.store_id", storeId);

      (cardAccounts || []).forEach((acc: any) => {
        allAccounts.push({ id: acc.id, name: `Cartão - ${acc.name}`, type: "card" });
      });

      setAccounts(allAccounts);
    } catch (error) {
      console.error("Erro ao buscar contas:", error);
    }
  };

  const handleAccountToggle = (accountId: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId]
    );
  };

  const handleSelectAllAccounts = () => {
    if (selectedAccounts.length === accounts.length) {
      setSelectedAccounts([]);
    } else {
      setSelectedAccounts(accounts.map((acc) => acc.id));
    }
  };

  const handleSearch = async () => {
    if (!selectedStore) {
      toast({ title: "Selecione uma loja", variant: "destructive" });
      return;
    }
    if (selectedAccounts.length === 0) {
      toast({ title: "Selecione pelo menos uma conta", variant: "destructive" });
      return;
    }
    if (!paymentStartDate || !paymentEndDate) {
      toast({ title: "Selecione o período de pagamento", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Buscar transações financeiras de saída (pagamentos) das contas selecionadas
      const { data: transactions, error: transError } = await supabase
        .from("financial_transactions")
        .select(`
          id,
          amount,
          transaction_date,
          description,
          reference_id,
          reference_type,
          account_id
        `)
        .eq("store_id", selectedStore)
        .in("account_id", selectedAccounts)
        .in("reference_type", ["accounts_payable", "accounts_payable_installments"])
        .eq("transaction_type", "saida")
        .gte("transaction_date", paymentStartDate)
        .lte("transaction_date", paymentEndDate)
        .order("transaction_date", { ascending: true });

      if (transError) throw transError;

      if (!transactions || transactions.length === 0) {
        setPaymentRecords([]);
        setShowResults(true);
        toast({ title: "Nenhum pagamento encontrado no período selecionado" });
        setLoading(false);
        return;
      }

      // Processar cada transação para obter os dados completos
      const paymentRecordsData: PaymentRecord[] = [];

      for (const transaction of transactions) {
        let accountPayableId: string | null = null;
        let installmentNumber: number | null = null;
        let totalInstallments: number | null = null;
        let documentNumber: string | null = null;
        let description = transaction.description || "";
        let supplierName: string | null = null;
        let employeeName: string | null = null;
        let attachments: any = null;
        let interestAmount = 0;
        let discountAmount = 0;

        if (transaction.reference_type === "accounts_payable_installments") {
          // Buscar dados da parcela e conta a pagar
          const { data: installmentData } = await supabase
            .from("accounts_payable_installments")
            .select(`
              installment_number,
              account_payable_id,
              accounts_payable!inner (
                id,
                document_number,
                description,
                attachments,
                employee_id,
                suppliers (name)
              )
            `)
            .eq("id", transaction.reference_id)
            .maybeSingle();

          if (installmentData) {
            accountPayableId = installmentData.account_payable_id;
            installmentNumber = installmentData.installment_number;
            documentNumber = (installmentData.accounts_payable as any)?.document_number || null;
            description = (installmentData.accounts_payable as any)?.description || description;
            attachments = (installmentData.accounts_payable as any)?.attachments || null;
            supplierName = (installmentData.accounts_payable as any)?.suppliers?.name || null;

            // Buscar total de parcelas
            const { data: totalInst } = await supabase
              .from("accounts_payable_installments")
              .select("installment_number")
              .eq("account_payable_id", accountPayableId)
              .order("installment_number", { ascending: false })
              .limit(1);
            totalInstallments = totalInst?.[0]?.installment_number || 1;

            // Verificar se é funcionário
            const employeeId = (installmentData.accounts_payable as any)?.employee_id;
            if (employeeId) {
              const { data: empData } = await supabase
                .from("employees")
                .select("name")
                .eq("id", employeeId)
                .maybeSingle();
              employeeName = empData?.name || null;
            }

            // Buscar juros e desconto do pagamento
            const { data: paymentData } = await supabase
              .from("accounts_payable_payments")
              .select("interest_amount, discount_amount")
              .eq("installment_id", transaction.reference_id)
              .maybeSingle();
            if (paymentData) {
              interestAmount = paymentData.interest_amount || 0;
              discountAmount = paymentData.discount_amount || 0;
            }
          }
        } else if (transaction.reference_type === "accounts_payable") {
          // Pagamento direto (sem parcelas)
          const { data: apData } = await supabase
            .from("accounts_payable")
            .select(`
              id,
              document_number,
              description,
              attachments,
              employee_id,
              suppliers (name)
            `)
            .eq("id", transaction.reference_id)
            .maybeSingle();

          if (apData) {
            accountPayableId = apData.id;
            documentNumber = apData.document_number;
            description = apData.description || description;
            attachments = apData.attachments;
            supplierName = apData.suppliers?.name || null;

            if (apData.employee_id) {
              const { data: empData } = await supabase
                .from("employees")
                .select("name")
                .eq("id", apData.employee_id)
                .maybeSingle();
              employeeName = empData?.name || null;
            }

            // Buscar juros e desconto do pagamento
            const { data: paymentData } = await supabase
              .from("accounts_payable_payments")
              .select("interest_amount, discount_amount")
              .eq("account_payable_id", transaction.reference_id)
              .maybeSingle();
            if (paymentData) {
              interestAmount = paymentData.interest_amount || 0;
              discountAmount = paymentData.discount_amount || 0;
            }
          }
        }

        paymentRecordsData.push({
          id: transaction.id,
          payment_date: transaction.transaction_date,
          amount_paid: transaction.amount,
          interest_amount: interestAmount,
          discount_amount: discountAmount,
          payment_account_id: transaction.account_id,
          payment_account_type: null,
          description,
          document_number: documentNumber,
          supplier_name: supplierName,
          employee_name: employeeName,
          installment_number: installmentNumber,
          total_installments: totalInstallments,
          attachments,
          account_payable_id: accountPayableId,
        });
      }

      setPaymentRecords(paymentRecordsData);
      setShowResults(true);

      if (paymentRecordsData.length === 0) {
        toast({ title: "Nenhum pagamento encontrado no período selecionado" });
      }
    } catch (error) {
      console.error("Erro ao buscar pagamentos:", error);
      toast({ title: "Erro ao buscar pagamentos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
  };

  const getAccountName = (accountId: string | null) => {
    if (!accountId) return "-";
    const account = accounts.find((acc) => acc.id === accountId);
    return account?.name || "-";
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const storeName = stores.find((s) => s.id === selectedStore)?.name || "";

    doc.setFontSize(16);
    doc.text("Relatório de Exportação Contabilidade", 14, 15);

    doc.setFontSize(10);
    doc.text(`Loja: ${storeName}`, 14, 25);
    doc.text(`Período: ${formatDate(paymentStartDate)} a ${formatDate(paymentEndDate)}`, 14, 30);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}`, 14, 35);

    const tableData = paymentRecords.map((record) => [
      formatDate(record.payment_date),
      record.description || "-",
      record.supplier_name || record.employee_name || "-",
      record.document_number || "-",
      record.installment_number ? `${record.installment_number}/${record.total_installments || 1}` : "1",
      getAccountName(record.payment_account_id),
      formatCurrency(record.amount_paid),
      formatCurrency(record.interest_amount),
      formatCurrency(record.discount_amount),
      formatCurrency(record.amount_paid + record.interest_amount - record.discount_amount),
    ]);

    const total = paymentRecords.reduce(
      (acc, r) => acc + r.amount_paid + r.interest_amount - r.discount_amount,
      0
    );

    tableData.push([
      "",
      "",
      "",
      "",
      "",
      "TOTAL",
      "",
      "",
      "",
      formatCurrency(total),
    ]);

    autoTable(doc, {
      head: [
        ["Data Pgto", "Descrição", "Fornecedor", "Documento", "Parcela", "Conta", "Valor", "Juros", "Desconto", "Total"],
      ],
      body: tableData,
      startY: 42,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`contabilidade_${storeName}_${paymentStartDate}_${paymentEndDate}.pdf`);
    toast({ title: "PDF exportado com sucesso!" });
  };

  const exportAttachmentsZip = async () => {
    setExporting(true);
    try {
      const zip = new JSZip();
      let hasAttachments = false;

      for (const record of paymentRecords) {
        const attachments = record.attachments;
        if (!attachments || !Array.isArray(attachments) || attachments.length === 0) continue;

        const folderName = `${formatDate(record.payment_date)}_${record.description?.substring(0, 30) || "conta"}_${record.id.substring(0, 8)}`;
        const folder = zip.folder(folderName.replace(/[/\\?%*:|"<>]/g, "_"));

        for (const attachment of attachments) {
          const filePath = attachment.url || attachment.path;
          if (!filePath) continue;

          try {
            const { data, error } = await supabase.storage
              .from("account-documents")
              .createSignedUrl(filePath, 3600);

            if (error || !data?.signedUrl) {
              console.error("Erro ao criar URL assinada:", error);
              continue;
            }

            const response = await fetch(data.signedUrl);
            if (!response.ok) continue;

            const blob = await response.blob();
            folder?.file(attachment.name || filePath.split("/").pop() || "arquivo", blob);
            hasAttachments = true;
          } catch (err) {
            console.error("Erro ao baixar anexo:", err);
          }
        }
      }

      if (!hasAttachments) {
        toast({ title: "Nenhum anexo encontrado nos pagamentos selecionados", variant: "destructive" });
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `anexos_contabilidade_${paymentStartDate}_${paymentEndDate}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({ title: "Anexos exportados com sucesso!" });
    } catch (error) {
      console.error("Erro ao exportar anexos:", error);
      toast({ title: "Erro ao exportar anexos", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center space-x-4">
          <Button onClick={() => navigate("/reports")} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-primary">Exportar Contabilidade</h1>
            <p className="text-sm text-muted-foreground">
              Exporte pagamentos e anexos para contabilidade
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>Selecione o período, loja e contas para exportação</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Data Inicial Pagamento</Label>
                <Input
                  type="date"
                  value={paymentStartDate}
                  onChange={(e) => setPaymentStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Data Final Pagamento</Label>
                <Input
                  type="date"
                  value={paymentEndDate}
                  onChange={(e) => setPaymentEndDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Loja</Label>
                <Select value={selectedStore} onValueChange={setSelectedStore}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma loja" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {accounts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Contas de Pagamento</Label>
                  <Button variant="ghost" size="sm" onClick={handleSelectAllAccounts}>
                    {selectedAccounts.length === accounts.length ? "Desmarcar Todas" : "Selecionar Todas"}
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                  {accounts.map((account) => (
                    <div key={account.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={account.id}
                        checked={selectedAccounts.includes(account.id)}
                        onCheckedChange={() => handleAccountToggle(account.id)}
                      />
                      <label
                        htmlFor={account.id}
                        className="text-sm cursor-pointer"
                      >
                        {account.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleSearch} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Buscar Pagamentos
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Resultados */}
        {showResults && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Pagamentos Encontrados</CardTitle>
                  <CardDescription>
                    {paymentRecords.length} pagamento(s) no período selecionado
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={exportToPDF} disabled={paymentRecords.length === 0}>
                    <FileText className="h-4 w-4 mr-2" />
                    Exportar PDF
                  </Button>
                  <Button onClick={exportAttachmentsZip} disabled={paymentRecords.length === 0 || exporting}>
                    {exporting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Exportar Anexos (ZIP)
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {paymentRecords.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data Pgto</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead>Documento</TableHead>
                        <TableHead>Parcela</TableHead>
                        <TableHead>Conta</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Juros</TableHead>
                        <TableHead className="text-right">Desconto</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-center">Anexos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentRecords.map((record) => {
                        const attachments = record.attachments;
                        const attachmentCount = Array.isArray(attachments) ? attachments.length : 0;
                        return (
                          <TableRow key={record.id}>
                            <TableCell>{formatDate(record.payment_date)}</TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {record.description || "-"}
                            </TableCell>
                            <TableCell>
                              {record.supplier_name || record.employee_name || "-"}
                            </TableCell>
                            <TableCell>{record.document_number || "-"}</TableCell>
                            <TableCell>
                              {record.installment_number 
                                ? `${record.installment_number}/${record.total_installments || 1}` 
                                : "1"}
                            </TableCell>
                            <TableCell>{getAccountName(record.payment_account_id)}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(record.amount_paid)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(record.interest_amount)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(record.discount_amount)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(
                                record.amount_paid + record.interest_amount - record.discount_amount
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {attachmentCount > 0 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full bg-primary text-primary-foreground">
                                  {attachmentCount}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={6}>TOTAL</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(
                            paymentRecords.reduce((acc, r) => acc + r.amount_paid, 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(
                            paymentRecords.reduce((acc, r) => acc + r.interest_amount, 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(
                            paymentRecords.reduce((acc, r) => acc + r.discount_amount, 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(
                            paymentRecords.reduce(
                              (acc, r) => acc + r.amount_paid + r.interest_amount - r.discount_amount,
                              0
                            )
                          )}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum pagamento encontrado no período selecionado.
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default AccountingExportReport;
