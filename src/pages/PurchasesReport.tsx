import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ArrowLeft, Download, Filter, FileDown, ChevronDown, Check, ChevronsUpDown, Eye, EyeOff } from "lucide-react";
import { useUserMatrix } from "@/hooks/useUserMatrix";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addPdfHeaderWithLogo, renderPdfHeader } from "@/utils/pdfHeader";
import * as XLSX from "xlsx";
import { fetchAllPaginated } from "@/utils/supabasePagination";

const PurchasesReport = () => {
  const { matrixId } = useUserMatrix();
  const navigate = useNavigate();

  const [filters, setFilters] = useState({
    payment_start: "",
    payment_end: "",
    due_start: "",
    due_end: "",
    competencia_start: "",
    competencia_end: "",
    created_start: "",
    created_end: "",
    supplier_id: "all",
    store_id: "all",
    product_id: "all",
    account_id: "all",
    group_id: "all",
    subgroup_id: "all",
    employee_id: "all",
  });

  const [accounts, setAccounts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [subgroups, setSubgroups] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [availableAccounts, setAvailableAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => {
    fetchSuppliers();
    fetchStores();
    fetchProducts();
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (matrixId) {
      fetchGroups();
    }
  }, [matrixId]);

  useEffect(() => {
    if (filters.group_id && filters.group_id !== "all") {
      fetchSubgroups(filters.group_id);
    } else {
      setSubgroups([]);
      setFilters(prev => ({ ...prev, subgroup_id: "all" }));
    }
  }, [filters.group_id]);

  useEffect(() => {
    if (filters.store_id && filters.store_id !== "all") {
      fetchAccountsForStore(filters.store_id);
    } else {
      setAvailableAccounts([]);
      setFilters(prev => ({ ...prev, account_id: "all" }));
    }
  }, [filters.store_id]);

  const fetchSuppliers = async () => {
    const { data } = await supabase.from("suppliers").select("id, name");
    setSuppliers(data || []);
  };

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
        const { data } = await supabase.from("stores").select("id, name").order('name');
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
          const { data } = await supabase.from("stores").select("id, name").in('id', storeIds).order('name');
          setStores(data || []);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar lojas:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await fetchAllPaginated<any>((from, to) =>
        supabase.from("products").select("id, name").order("name").range(from, to)
      );
      setProducts(data);
    } catch (e) {
      console.error("Erro ao carregar produtos:", e);
      setProducts([]);
    }
  };

  const fetchGroups = async () => {
    try {
      const { data: matrixData } = await supabase
        .from('matrices')
        .select('brand_id')
        .eq('id', matrixId)
        .single();

      if (!matrixData?.brand_id) {
        setGroups([]);
        return;
      }

      const { data } = await supabase
        .from("account_groups")
        .select("id, name")
        .is("parent_id", null)
        .eq("brand_id", matrixData.brand_id)
        .order("name");
      setGroups(data || []);
    } catch (error) {
      console.error('Error fetching groups:', error);
      setGroups([]);
    }
  };

  const fetchSubgroups = async (groupId: string) => {
    try {
      const { data: matrixData } = await supabase
        .from('matrices')
        .select('brand_id')
        .eq('id', matrixId)
        .single();

      if (!matrixData?.brand_id) {
        setSubgroups([]);
        return;
      }

      const { data } = await supabase
        .from("account_groups")
        .select("id, name")
        .eq("parent_id", groupId)
        .eq("brand_id", matrixData.brand_id)
        .order("name");
      setSubgroups(data || []);
    } catch (error) {
      console.error('Error fetching subgroups:', error);
      setSubgroups([]);
    }
  };

  const fetchEmployees = async () => {
    const { data } = await supabase
      .from("employees")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    setEmployees(data || []);
  };

  const fetchAccountsForStore = async (storeId: string) => {
    try {
      const allAccounts: any[] = [];

      const { data: cashAccountStores } = await supabase
        .from("cash_account_stores")
        .select("account_id, cash_accounts(id, name)")
        .eq("store_id", storeId);
      
      if (cashAccountStores) {
        cashAccountStores.forEach((cas: any) => {
          if (cas.cash_accounts) {
            allAccounts.push({ id: cas.cash_accounts.id, name: cas.cash_accounts.name, type: "Caixa" });
          }
        });
      }

      const { data: currentAccountStores } = await supabase
        .from("current_account_stores")
        .select("account_id, current_accounts(id, name)")
        .eq("store_id", storeId);
      
      if (currentAccountStores) {
        currentAccountStores.forEach((cas: any) => {
          if (cas.current_accounts) {
            allAccounts.push({ id: cas.current_accounts.id, name: cas.current_accounts.name, type: "Conta Corrente" });
          }
        });
      }

      const { data: cardAccountStores } = await supabase
        .from("card_account_stores")
        .select("account_id, card_accounts(id, name)")
        .eq("store_id", storeId);
      
      if (cardAccountStores) {
        cardAccountStores.forEach((cas: any) => {
          if (cas.card_accounts) {
            allAccounts.push({ id: cas.card_accounts.id, name: cas.card_accounts.name, type: "Cartão" });
          }
        });
      }

      setAvailableAccounts(allAccounts);
    } catch (error) {
      console.error("Error fetching accounts for store:", error);
      setAvailableAccounts([]);
    }
  };

  const hasPaymentFilter = filters.payment_start && filters.payment_end;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Pago';
      case 'partial': return 'Parcial';
      case 'pending': return 'Pendente';
      default: return status;
    }
  };

  const handleSearch = async () => {
    // Validate: need at least one complete date range
    const hasPaymentRange = filters.payment_start && filters.payment_end;
    const hasDueRange = filters.due_start && filters.due_end;
    const hasCompetenciaRange = filters.competencia_start && filters.competencia_end;
    const hasCreatedRange = filters.created_start && filters.created_end;

    if (!hasPaymentRange && !hasDueRange && !hasCompetenciaRange && !hasCreatedRange) {
      toast({
        title: "Filtro obrigatório",
        description: "Preencha pelo menos um período de datas (Pagamento, Vencimento, Competência ou Cadastro) com início e fim.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const fetchAllPaginated = async (buildQuery: () => any) => {
        const PAGE_SIZE = 1000;
        let allRows: any[] = [];
        let from = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
          if (error) throw error;
          if (data) {
            allRows = allRows.concat(data);
          }
          hasMore = (data?.length ?? 0) === PAGE_SIZE;
          from += PAGE_SIZE;
        }
        return allRows;
      };

      // Build query - if payment filter is used, only paid/partial; otherwise ALL statuses
      const buildAccountsQuery = () => {
        let q = supabase
          .from("accounts_payable")
          .select(`
            *,
            suppliers(id, name),
            employees(id, name),
            stores(id, name),
            accounts_payable_installments(*),
            accounts_payable_items(
              id,
              product_id,
              quantity,
              unit_price,
              total_price,
              products(id, name, subgroup_id, account_groups:subgroup_id(id, name, parent_id))
            )
          `);

        // If payment date filter is used, restrict to paid/partial
        if (hasPaymentFilter) {
          q = q.in('status', ['paid', 'partial']);
        }

        if (filters.store_id && filters.store_id !== "all") {
          q = q.eq('store_id', filters.store_id);
        }
        if (filters.supplier_id && filters.supplier_id !== "all") {
          q = q.eq('supplier_id', filters.supplier_id);
        }
        if (filters.employee_id && filters.employee_id !== "all") {
          q = q.eq('employee_id', filters.employee_id);
        }
        return q;
      };

      const allAccounts = await fetchAllPaginated(buildAccountsQuery);

      // Fetch payments data
      const paymentsData = await fetchAllPaginated(() =>
        supabase
          .from("accounts_payable_payments")
          .select(`
            *,
            interest_product:interest_product_id(id, name, subgroup_id, account_groups:subgroup_id(id, name)),
            discount_product:discount_product_id(id, name, subgroup_id, account_groups:subgroup_id(id, name))
          `)
      );

      const paymentsByInstallmentId: { [key: string]: any } = {};
      (paymentsData || []).forEach((payment: any) => {
        paymentsByInstallmentId[payment.installment_id] = payment;
      });

      // If filtering by account, fetch financial transactions
      let transactionsByPayable: { [key: string]: string } = {};
      if (filters.account_id && filters.account_id !== "all") {
        const { data: transactions } = await supabase
          .from("financial_transactions")
          .select("reference_id, account_id")
          .eq("reference_type", "accounts_payable")
          .eq("account_id", filters.account_id);
        
        if (transactions) {
          transactions.forEach((t: any) => {
            transactionsByPayable[t.reference_id] = t.account_id;
          });
        }
      }

      // Expand into individual rows
      let accountsData: any[] = [];
      (allAccounts || []).forEach((account: any) => {
        if (filters.account_id && filters.account_id !== "all") {
          if (!transactionsByPayable[account.id]) return;
        }
        
        if (account.accounts_payable_installments && account.accounts_payable_installments.length > 0) {
          account.accounts_payable_installments.forEach((installment: any) => {
            if (hasPaymentFilter) {
              // When payment filter is active, only show paid installments
              if (!installment.payment_date) return;
            }
            
            const payment = paymentsByInstallmentId[installment.id];
            const interestAmount = payment?.interest_amount || 0;
            const discountAmount = payment?.discount_amount || 0;
            const paidAmount = installment.payment_date 
              ? (payment?.amount_paid || (installment.amount + interestAmount - discountAmount))
              : null;
            
            accountsData.push({
              ...account,
              due_date: installment.due_date,
              amount: installment.amount,
              paid_amount: paidAmount,
              payment_date: installment.payment_date,
              installment_number: installment.installment_number,
              total_installments: account.accounts_payable_installments.length,
              installment_id: installment.id,
              payment_account_id: transactionsByPayable[account.id] || null,
              interest_amount: interestAmount,
              discount_amount: discountAmount,
              interest_product: payment?.interest_product || null,
              discount_product: payment?.discount_product || null,
              display_status: installment.payment_date ? 'paid' : 'pending',
            });
          });
        } else {
          if (hasPaymentFilter && !account.payment_date) return;
          
          accountsData.push({
            ...account,
            installment_number: 1,
            total_installments: 1,
            paid_amount: account.payment_date ? account.amount : null,
            payment_account_id: transactionsByPayable[account.id] || null,
            interest_amount: 0,
            discount_amount: 0,
            interest_product: null,
            discount_product: null,
            display_status: account.status,
          });
        }
      });

      // Apply client-side date filters
      if (filters.payment_start || filters.payment_end) {
        accountsData = accountsData.filter((account: any) => {
          if (!account.payment_date) return false;
          const paymentDate = account.payment_date;
          if (filters.payment_start && paymentDate < filters.payment_start) return false;
          if (filters.payment_end && paymentDate > filters.payment_end) return false;
          return true;
        });
      }

      if (filters.due_start || filters.due_end) {
        accountsData = accountsData.filter((account: any) => {
          if (!account.due_date) return false;
          const dueDate = account.due_date;
          if (filters.due_start && dueDate < filters.due_start) return false;
          if (filters.due_end && dueDate > filters.due_end) return false;
          return true;
        });
      }

      if (filters.competencia_start || filters.competencia_end) {
        accountsData = accountsData.filter((account: any) => {
          if (!account.data_competencia) return false;
          const competenciaDate = account.data_competencia;
          if (filters.competencia_start && competenciaDate < filters.competencia_start) return false;
          if (filters.competencia_end && competenciaDate > filters.competencia_end) return false;
          return true;
        });
      }

      if (filters.created_start || filters.created_end) {
        accountsData = accountsData.filter((account: any) => {
          if (!account.created_at) return false;
          const createdDate = new Date(account.created_at);
          const startDate = filters.created_start ? new Date(filters.created_start + "T00:00:00") : null;
          const endDate = filters.created_end ? new Date(filters.created_end + "T23:59:59") : null;
          if (startDate && createdDate < startDate) return false;
          if (endDate && createdDate > endDate) return false;
          return true;
        });
      }

      if (filters.product_id && filters.product_id !== "all") {
        accountsData = accountsData.filter((account: any) => {
          if (!account.accounts_payable_items || account.accounts_payable_items.length === 0) return false;
          return account.accounts_payable_items.some((item: any) => item.product_id === filters.product_id);
        });
      }

      if (filters.subgroup_id && filters.subgroup_id !== "all") {
        accountsData = accountsData.filter((account: any) => {
          if (!account.accounts_payable_items || account.accounts_payable_items.length === 0) return false;
          return account.accounts_payable_items.some((item: any) => item.products?.subgroup_id === filters.subgroup_id);
        });
      } else if (filters.group_id && filters.group_id !== "all") {
        accountsData = accountsData.filter((account: any) => {
          if (!account.accounts_payable_items || account.accounts_payable_items.length === 0) return false;
          return account.accounts_payable_items.some((item: any) => {
            const subgroup = item.products?.account_groups;
            if (!subgroup) return false;
            return subgroup.parent_id === filters.group_id;
          });
        });
      }

      setAccounts(accountsData);
      setShowFilters(false);
      toast({
        title: "Pesquisa realizada",
        description: `${accountsData.length} registro(s) encontrado(s)`,
      });
    } catch (error) {
      console.error("Error searching accounts:", error);
      toast({
        title: "Erro",
        description: "Erro ao buscar compras",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({
      payment_start: "",
      payment_end: "",
      due_start: "",
      due_end: "",
      competencia_start: "",
      competencia_end: "",
      created_start: "",
      created_end: "",
      supplier_id: "all",
      store_id: "all",
      product_id: "all",
      account_id: "all",
      group_id: "all",
      subgroup_id: "all",
      employee_id: "all",
    });
    setAvailableAccounts([]);
    setAccounts([]);
    setShowFilters(true);
  };

  const getFilterInfo = () => {
    let filterInfo = [];
    if (filters.payment_start || filters.payment_end) {
      const start = filters.payment_start ? new Date(filters.payment_start).toLocaleDateString("pt-BR") : "Início";
      const end = filters.payment_end ? new Date(filters.payment_end).toLocaleDateString("pt-BR") : "Hoje";
      filterInfo.push(`Pagamento: ${start} a ${end}`);
    }
    if (filters.due_start || filters.due_end) {
      const start = filters.due_start ? new Date(filters.due_start).toLocaleDateString("pt-BR") : "Início";
      const end = filters.due_end ? new Date(filters.due_end).toLocaleDateString("pt-BR") : "Hoje";
      filterInfo.push(`Vencimento: ${start} a ${end}`);
    }
    if (filters.supplier_id !== "all") {
      const supplier = suppliers.find(s => s.id === filters.supplier_id);
      if (supplier) filterInfo.push(`Fornecedor: ${supplier.name}`);
    }
    if (filters.store_id !== "all") {
      const store = stores.find(s => s.id === filters.store_id);
      if (store) filterInfo.push(`Loja: ${store.name}`);
    }
    if (filters.account_id !== "all") {
      const account = availableAccounts.find(a => a.id === filters.account_id);
      if (account) filterInfo.push(`Conta: ${account.name}`);
    }
    if (filters.group_id !== "all") {
      const group = groups.find(g => g.id === filters.group_id);
      if (group) filterInfo.push(`Grupo: ${group.name}`);
    }
    if (filters.subgroup_id !== "all") {
      const subgroup = subgroups.find(s => s.id === filters.subgroup_id);
      if (subgroup) filterInfo.push(`Subgrupo: ${subgroup.name}`);
    }
    if (filters.employee_id !== "all") {
      const employee = employees.find(e => e.id === filters.employee_id);
      if (employee) filterInfo.push(`Funcionário: ${employee.name}`);
    }
    return filterInfo;
  };

  const getSupplierOrEmployeeName = (account: any) => {
    if (account.employee_id && account.employees?.name) {
      return account.employees.name;
    }
    return account.suppliers?.name || "N/A";
  };

  const exportToPDFResumido = async () => {
    const doc = new jsPDF();
    const startY = await addPdfHeaderWithLogo(doc, "Compras - Resumido");
    const filterInfo = getFilterInfo();
    let currentY = startY;
    
    if (filterInfo.length > 0) {
      doc.setFontSize(9);
      doc.text(`Filtros: ${filterInfo.join(" | ")}`, 14, currentY);
      currentY += 6;
    }

    const tableData = accounts.map(account => [
      account.description,
      getSupplierOrEmployeeName(account),
      account.stores?.name || "N/A",
      account.due_date ? new Date(account.due_date + 'T00:00:00').toLocaleDateString("pt-BR") : "N/A",
      account.payment_date ? new Date(account.payment_date + 'T00:00:00').toLocaleDateString("pt-BR") : "-",
      getStatusLabel(account.display_status),
      account.amount?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "N/A",
      account.total_installments > 1 ? `${account.installment_number}/${account.total_installments}` : "À vista"
    ]);

    const total = accounts.reduce((sum, account) => sum + (account.amount ?? 0), 0);
    
    tableData.push([
      { content: "TOTAL", colSpan: 6, styles: { fontStyle: "bold", halign: "right" } },
      { content: total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), styles: { fontStyle: "bold" } },
      { content: `${accounts.length} registro(s)`, styles: { fontStyle: "bold" } }
    ]);

    autoTable(doc, {
      head: [["Título", "Fornecedor", "Loja", "Vencimento", "Pagamento", "Status", "Valor", "Parcelas"]],
      body: tableData,
      startY: currentY,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { top: startY, left: 14, right: 14 },
      didDrawPage: (data: any) => { if (data.pageNumber > 1) renderPdfHeader(doc, "Compras - Resumido"); }
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, doc.internal.pageSize.height - 10);
      doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 40, doc.internal.pageSize.height - 10);
    }

    doc.save("compras-resumido.pdf");
  };

  const exportToPDFDetalhado = async () => {
    const doc = new jsPDF();
    const startY = await addPdfHeaderWithLogo(doc, "Compras - Detalhado");
    const filterInfo = getFilterInfo();
    let currentY = startY;
    
    if (filterInfo.length > 0) {
      doc.setFontSize(9);
      doc.text(`Filtros: ${filterInfo.join(" | ")}`, 14, currentY);
      currentY += 6;
    }
    
    const tableData: any[] = [];
    
    accounts.forEach(account => {
      tableData.push([
        { content: account.description, styles: { fontStyle: "bold" } },
        { content: getSupplierOrEmployeeName(account), styles: { fontStyle: "bold" } },
        { content: account.stores?.name || "N/A", styles: { fontStyle: "bold" } },
        { content: account.due_date ? new Date(account.due_date + 'T00:00:00').toLocaleDateString("pt-BR") : "N/A", styles: { fontStyle: "bold" } },
        { content: account.payment_date ? new Date(account.payment_date + 'T00:00:00').toLocaleDateString("pt-BR") : "-", styles: { fontStyle: "bold" } },
        { content: getStatusLabel(account.display_status), styles: { fontStyle: "bold" } },
        { content: account.amount?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "N/A", styles: { fontStyle: "bold" } },
        { content: account.total_installments > 1 ? `${account.installment_number}/${account.total_installments}` : "À vista", styles: { fontStyle: "bold" } }
      ]);
      
      if (account.accounts_payable_items && account.accounts_payable_items.length > 0) {
        account.accounts_payable_items.forEach((item: any) => {
          const productName = item.products?.name || "Produto não encontrado";
          const subgroupName = item.products?.account_groups?.name || "-";
          const quantity = item.quantity || 0;
          const unitPrice = item.unit_price?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "R$ 0,00";
          const totalPrice = item.total_price?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "R$ 0,00";
          
          tableData.push([
            { content: "", styles: { fontSize: 8 } },
            { content: `   ${productName}`, styles: { fontSize: 8, textColor: [100, 100, 100] } },
            { content: subgroupName, styles: { fontSize: 8, textColor: [100, 100, 100] } },
            { content: `${quantity}`, styles: { fontSize: 8, textColor: [100, 100, 100] } },
            { content: "", styles: { fontSize: 8 } },
            { content: "", styles: { fontSize: 8 } },
            { content: totalPrice, styles: { fontSize: 8, textColor: [100, 100, 100] } },
            { content: unitPrice, styles: { fontSize: 8, textColor: [100, 100, 100] } }
          ]);
        });
      }
    });

    const total = accounts.reduce((sum, account) => sum + (account.amount || 0), 0);
    
    tableData.push([
      { content: "TOTAL", colSpan: 6, styles: { fontStyle: "bold", halign: "right" } },
      { content: total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), styles: { fontStyle: "bold" } },
      { content: `${accounts.length} registro(s)`, styles: { fontStyle: "bold" } }
    ]);

    autoTable(doc, {
      head: [["Título", "Fornecedor", "Loja", "Vencimento", "Pagamento", "Status", "Valor", "Parcelas"]],
      body: tableData,
      startY: currentY,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
      margin: { top: startY, left: 14, right: 14 },
      didDrawPage: (data: any) => { if (data.pageNumber > 1) renderPdfHeader(doc, "Compras - Detalhado"); }
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, doc.internal.pageSize.height - 10);
      doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 40, doc.internal.pageSize.height - 10);
    }

    doc.save("compras-detalhado.pdf");
  };

  const exportToPDFPorSubgrupo = async () => {
    const doc = new jsPDF();
    const startY = await addPdfHeaderWithLogo(doc, "Compras - Por Subgrupo");
    const filterInfo = getFilterInfo();
    let currentY = startY;
    
    if (filterInfo.length > 0) {
      doc.setFontSize(9);
      doc.text(`Filtros: ${filterInfo.join(" | ")}`, 14, currentY);
      currentY += 6;
    }
    
    const accountsBySubgroup: { [key: string]: { subgroupName: string; items: any[] } } = {};
    
    accounts.forEach(account => {
      if (account.accounts_payable_items && account.accounts_payable_items.length > 0) {
        const totalItemsValue = account.accounts_payable_items.reduce((sum: number, it: any) => sum + (it.total_price || 0), 0);
        const baseAmount = account.amount ?? 0;
        const proportion = totalItemsValue > 0 ? baseAmount / totalItemsValue : 1;

        const itemsBySubgroup: { [key: string]: { subgroupId: string; subgroupName: string; totalAmount: number } } = {};
        account.accounts_payable_items.forEach((item: any) => {
          const subgroupId = item.products?.subgroup_id || 'sem-subgrupo';
          const subgroupName = item.products?.account_groups?.name || 'Sem Subgrupo';
          const proportionalAmount = (item.total_price || 0) * proportion;

          if (!itemsBySubgroup[subgroupId]) {
            itemsBySubgroup[subgroupId] = { subgroupId, subgroupName, totalAmount: 0 };
          }
          itemsBySubgroup[subgroupId].totalAmount += proportionalAmount;
        });

        Object.values(itemsBySubgroup).forEach(({ subgroupId, subgroupName, totalAmount }) => {
          if (!accountsBySubgroup[subgroupId]) {
            accountsBySubgroup[subgroupId] = { subgroupName, items: [] };
          }
          accountsBySubgroup[subgroupId].items.push({
            description: account.description,
            supplierName: getSupplierOrEmployeeName(account),
            storeName: account.stores?.name || "N/A",
            paymentDate: account.payment_date,
            status: getStatusLabel(account.display_status),
            amount: totalAmount,
            installmentNumber: account.installment_number,
            totalInstallments: account.total_installments,
            accountId: account.id,
            installmentId: account.installment_id,
          });
        });
      }
      
      if (account.interest_amount && account.interest_amount > 0 && account.interest_product) {
        const subgroupId = account.interest_product.subgroup_id || 'sem-subgrupo';
        const subgroupName = account.interest_product.account_groups?.name || 'Sem Subgrupo';
        if (!accountsBySubgroup[subgroupId]) {
          accountsBySubgroup[subgroupId] = { subgroupName, items: [] };
        }
        accountsBySubgroup[subgroupId].items.push({
          description: `${account.description} (Juros)`,
          supplierName: getSupplierOrEmployeeName(account),
          storeName: account.stores?.name || "N/A",
          paymentDate: account.payment_date,
          status: getStatusLabel(account.display_status),
          amount: account.interest_amount,
          installmentNumber: account.installment_number,
          totalInstallments: account.total_installments,
          accountId: account.id,
          installmentId: account.installment_id,
        });
      }
      
      if (account.discount_amount && account.discount_amount > 0 && account.discount_product) {
        const subgroupId = account.discount_product.subgroup_id || 'sem-subgrupo';
        const subgroupName = account.discount_product.account_groups?.name || 'Sem Subgrupo';
        if (!accountsBySubgroup[subgroupId]) {
          accountsBySubgroup[subgroupId] = { subgroupName, items: [] };
        }
        accountsBySubgroup[subgroupId].items.push({
          description: `${account.description} (Desconto)`,
          supplierName: getSupplierOrEmployeeName(account),
          storeName: account.stores?.name || "N/A",
          paymentDate: account.payment_date,
          status: getStatusLabel(account.display_status),
          amount: -account.discount_amount,
          installmentNumber: account.installment_number,
          totalInstallments: account.total_installments,
          accountId: account.id,
          installmentId: account.installment_id,
        });
      }
      
      if ((!account.accounts_payable_items || account.accounts_payable_items.length === 0) && 
          !account.interest_amount && !account.discount_amount) {
        if (!accountsBySubgroup['sem-subgrupo']) {
          accountsBySubgroup['sem-subgrupo'] = { subgroupName: 'Sem Subgrupo', items: [] };
        }
        accountsBySubgroup['sem-subgrupo'].items.push({
          description: account.description,
          supplierName: getSupplierOrEmployeeName(account),
          storeName: account.stores?.name || "N/A",
          paymentDate: account.payment_date,
          status: getStatusLabel(account.display_status),
          amount: account.amount || 0,
          installmentNumber: account.installment_number,
          totalInstallments: account.total_installments,
          accountId: account.id,
          installmentId: account.installment_id,
        });
      }
    });
    
    const tableData: any[] = [];
    let grandTotal = 0;
    let totalItems = 0;
    
    Object.values(accountsBySubgroup).forEach(group => {
      tableData.push([
        { content: group.subgroupName, colSpan: 7, styles: { fontStyle: "bold", fillColor: [220, 220, 220], fontSize: 10 } }
      ]);
      
      let subgroupTotal = 0;
      group.items.forEach(item => {
        tableData.push([
          item.description,
          item.supplierName,
          item.storeName,
          item.paymentDate ? new Date(item.paymentDate + 'T00:00:00').toLocaleDateString("pt-BR") : "-",
          item.status,
          item.amount?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "N/A",
          item.totalInstallments > 1 ? `${item.installmentNumber}/${item.totalInstallments}` : "À vista"
        ]);
        subgroupTotal += item.amount || 0;
        totalItems++;
      });
      
      tableData.push([
        { content: `Subtotal ${group.subgroupName}`, colSpan: 5, styles: { fontStyle: "bold", halign: "right", fillColor: [240, 240, 240] } },
        { content: subgroupTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), styles: { fontStyle: "bold", fillColor: [240, 240, 240] } },
        { content: `${group.items.length} item(s)`, styles: { fontStyle: "bold", fillColor: [240, 240, 240] } }
      ]);
      
      grandTotal += subgroupTotal;
    });
    
    tableData.push([
      { content: "TOTAL GERAL", colSpan: 5, styles: { fontStyle: "bold", halign: "right", fillColor: [59, 130, 246], textColor: 255 } },
      { content: grandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), styles: { fontStyle: "bold", fillColor: [59, 130, 246], textColor: 255 } },
      { content: `${totalItems} item(s)`, styles: { fontStyle: "bold", fillColor: [59, 130, 246], textColor: 255 } }
    ]);

    autoTable(doc, {
      head: [["Título", "Fornecedor", "Loja", "Pagamento", "Status", "Valor", "Parcelas"]],
      body: tableData,
      startY: currentY,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
      margin: { top: startY, left: 14, right: 14 },
      didDrawPage: (data: any) => { if (data.pageNumber > 1) renderPdfHeader(doc, "Compras - Por Subgrupo"); }
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, doc.internal.pageSize.height - 10);
      doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 40, doc.internal.pageSize.height - 10);
    }

    doc.save("compras-por-subgrupo.pdf");
  };

  const exportToPDFPorFornecedor = async () => {
    const doc = new jsPDF();
    const startY = await addPdfHeaderWithLogo(doc, "Compras - Por Fornecedor");
    const filterInfo = getFilterInfo();
    let currentY = startY;
    
    if (filterInfo.length > 0) {
      doc.setFontSize(9);
      doc.text(`Filtros: ${filterInfo.join(" | ")}`, 14, currentY);
      currentY += 6;
    }
    
    const accountsBySupplier: { [key: string]: { supplierName: string; items: any[] } } = {};
    
    accounts.forEach(account => {
      const supplierId = account.supplier_id || account.employee_id || 'sem-fornecedor';
      const supplierName = getSupplierOrEmployeeName(account);
      
      if (!accountsBySupplier[supplierId]) {
        accountsBySupplier[supplierId] = { supplierName, items: [] };
      }
      
      accountsBySupplier[supplierId].items.push({
        description: account.description,
        storeName: account.stores?.name || "N/A",
        dueDate: account.due_date,
        paymentDate: account.payment_date,
        status: getStatusLabel(account.display_status),
        amount: account.amount ?? 0,
        installmentNumber: account.installment_number,
        totalInstallments: account.total_installments,
      });
    });
    
    const sortedSuppliers = Object.values(accountsBySupplier).sort((a, b) => 
      a.supplierName.localeCompare(b.supplierName)
    );
    
    const tableData: any[] = [];
    let grandTotal = 0;
    let totalItems = 0;
    
    sortedSuppliers.forEach(group => {
      tableData.push([
        { content: group.supplierName, colSpan: 7, styles: { fontStyle: "bold", fillColor: [220, 220, 220], fontSize: 10 } }
      ]);
      
      let supplierTotal = 0;
      group.items.forEach(item => {
        tableData.push([
          item.description,
          item.storeName,
          item.dueDate ? new Date(item.dueDate + 'T00:00:00').toLocaleDateString("pt-BR") : "N/A",
          item.paymentDate ? new Date(item.paymentDate + 'T00:00:00').toLocaleDateString("pt-BR") : "-",
          item.status,
          item.amount?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "N/A",
          item.totalInstallments > 1 ? `${item.installmentNumber}/${item.totalInstallments}` : "À vista"
        ]);
        supplierTotal += item.amount || 0;
        totalItems++;
      });
      
      tableData.push([
        { content: `Subtotal ${group.supplierName}`, colSpan: 5, styles: { fontStyle: "bold", halign: "right", fillColor: [240, 240, 240] } },
        { content: supplierTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), styles: { fontStyle: "bold", fillColor: [240, 240, 240] } },
        { content: `${group.items.length} item(s)`, styles: { fontStyle: "bold", fillColor: [240, 240, 240] } }
      ]);
      
      grandTotal += supplierTotal;
    });
    
    tableData.push([
      { content: "TOTAL GERAL", colSpan: 5, styles: { fontStyle: "bold", halign: "right", fillColor: [59, 130, 246], textColor: 255 } },
      { content: grandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), styles: { fontStyle: "bold", fillColor: [59, 130, 246], textColor: 255 } },
      { content: `${totalItems} item(s)`, styles: { fontStyle: "bold", fillColor: [59, 130, 246], textColor: 255 } }
    ]);

    autoTable(doc, {
      head: [["Título", "Loja", "Vencimento", "Pagamento", "Status", "Valor", "Parcelas"]],
      body: tableData,
      startY: currentY,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
      margin: { top: startY, left: 14, right: 14 },
      didDrawPage: (data: any) => { if (data.pageNumber > 1) renderPdfHeader(doc, "Compras - Por Fornecedor"); }
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, doc.internal.pageSize.height - 10);
      doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 40, doc.internal.pageSize.height - 10);
    }

    doc.save("compras-por-fornecedor.pdf");
  };

  const exportToExcel = () => {
    const excelData = accounts.map(account => ({
      Título: account.description,
      Fornecedor: getSupplierOrEmployeeName(account),
      Loja: account.stores?.name || "N/A",
      Vencimento: account.due_date ? new Date(account.due_date + 'T00:00:00').toLocaleDateString("pt-BR") : "N/A",
      Pagamento: account.payment_date ? new Date(account.payment_date + 'T00:00:00').toLocaleDateString("pt-BR") : "-",
      Status: getStatusLabel(account.display_status),
      Valor: account.amount ?? 0,
      Parcelas: account.total_installments > 1 ? `${account.installment_number}/${account.total_installments}` : "À vista"
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compras");
    XLSX.writeFile(wb, "compras.xlsx");
  };

  const exportToExcelPorSubgrupo = () => {
    const accountsBySubgroup: { [key: string]: { subgroupName: string; items: any[] } } = {};

    accounts.forEach(account => {
      if (account.accounts_payable_items && account.accounts_payable_items.length > 0) {
        const totalItemsValue = account.accounts_payable_items.reduce((sum: number, it: any) => sum + (it.total_price || 0), 0);
        const baseAmount = account.amount ?? 0;
        const proportion = totalItemsValue > 0 ? baseAmount / totalItemsValue : 1;

        const itemsBySubgroup: { [key: string]: { subgroupId: string; subgroupName: string; totalAmount: number } } = {};
        account.accounts_payable_items.forEach((item: any) => {
          const subgroupId = item.products?.subgroup_id || 'sem-subgrupo';
          const subgroupName = item.products?.account_groups?.name || 'Sem Subgrupo';
          const proportionalAmount = (item.total_price || 0) * proportion;

          if (!itemsBySubgroup[subgroupId]) {
            itemsBySubgroup[subgroupId] = { subgroupId, subgroupName, totalAmount: 0 };
          }
          itemsBySubgroup[subgroupId].totalAmount += proportionalAmount;
        });

        Object.values(itemsBySubgroup).forEach(({ subgroupId, subgroupName, totalAmount }) => {
          if (!accountsBySubgroup[subgroupId]) {
            accountsBySubgroup[subgroupId] = { subgroupName, items: [] };
          }
          accountsBySubgroup[subgroupId].items.push({
            description: account.description,
            supplierName: getSupplierOrEmployeeName(account),
            storeName: account.stores?.name || "N/A",
            paymentDate: account.payment_date,
            status: getStatusLabel(account.display_status),
            amount: totalAmount,
            installmentNumber: account.installment_number,
            totalInstallments: account.total_installments,
          });
        });
      }

      if (account.interest_amount && account.interest_amount > 0 && account.interest_product) {
        const subgroupId = account.interest_product.subgroup_id || 'sem-subgrupo';
        const subgroupName = account.interest_product.account_groups?.name || 'Sem Subgrupo';
        if (!accountsBySubgroup[subgroupId]) {
          accountsBySubgroup[subgroupId] = { subgroupName, items: [] };
        }
        accountsBySubgroup[subgroupId].items.push({
          description: `${account.description} (Juros)`,
          supplierName: getSupplierOrEmployeeName(account),
          storeName: account.stores?.name || "N/A",
          paymentDate: account.payment_date,
          status: getStatusLabel(account.display_status),
          amount: account.interest_amount,
          installmentNumber: account.installment_number,
          totalInstallments: account.total_installments,
        });
      }

      if (account.discount_amount && account.discount_amount > 0 && account.discount_product) {
        const subgroupId = account.discount_product.subgroup_id || 'sem-subgrupo';
        const subgroupName = account.discount_product.account_groups?.name || 'Sem Subgrupo';
        if (!accountsBySubgroup[subgroupId]) {
          accountsBySubgroup[subgroupId] = { subgroupName, items: [] };
        }
        accountsBySubgroup[subgroupId].items.push({
          description: `${account.description} (Desconto)`,
          supplierName: getSupplierOrEmployeeName(account),
          storeName: account.stores?.name || "N/A",
          paymentDate: account.payment_date,
          status: getStatusLabel(account.display_status),
          amount: -account.discount_amount,
          installmentNumber: account.installment_number,
          totalInstallments: account.total_installments,
        });
      }

      if ((!account.accounts_payable_items || account.accounts_payable_items.length === 0) &&
          !account.interest_amount && !account.discount_amount) {
        if (!accountsBySubgroup['sem-subgrupo']) {
          accountsBySubgroup['sem-subgrupo'] = { subgroupName: 'Sem Subgrupo', items: [] };
        }
        accountsBySubgroup['sem-subgrupo'].items.push({
          description: account.description,
          supplierName: getSupplierOrEmployeeName(account),
          storeName: account.stores?.name || "N/A",
          paymentDate: account.payment_date,
          status: getStatusLabel(account.display_status),
          amount: account.amount || 0,
          installmentNumber: account.installment_number,
          totalInstallments: account.total_installments,
        });
      }
    });

    const rows: any[] = [];
    rows.push(["Subgrupo", "Título", "Fornecedor", "Loja", "Pagamento", "Status", "Valor", "Parcelas"]);

    let grandTotal = 0;
    let totalItems = 0;

    Object.values(accountsBySubgroup).forEach(group => {
      rows.push([group.subgroupName, "", "", "", "", "", "", ""]);
      let subgroupTotal = 0;
      group.items.forEach(item => {
        rows.push([
          "",
          item.description,
          item.supplierName,
          item.storeName,
          item.paymentDate ? new Date(item.paymentDate + 'T00:00:00').toLocaleDateString("pt-BR") : "-",
          item.status,
          item.amount ?? 0,
          item.totalInstallments > 1 ? `${item.installmentNumber}/${item.totalInstallments}` : "À vista",
        ]);
        subgroupTotal += item.amount || 0;
        totalItems++;
      });
      rows.push([
        `Subtotal ${group.subgroupName}`,
        "",
        "",
        "",
        "",
        `${group.items.length} item(s)`,
        subgroupTotal,
        "",
      ]);
      grandTotal += subgroupTotal;
    });

    rows.push([
      "TOTAL GERAL",
      "",
      "",
      "",
      "",
      `${totalItems} item(s)`,
      grandTotal,
      "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 30 }, { wch: 35 }, { wch: 25 }, { wch: 20 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compras por Subgrupo");
    XLSX.writeFile(wb, "compras-por-subgrupo.xlsx");
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
            <h1 className="text-2xl font-bold text-primary">Compras</h1>
            <p className="text-sm text-muted-foreground">Relatório geral de compras</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filtros
                </CardTitle>
                <CardDescription>
                  Configure os filtros para o relatório
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                {showFilters ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                {showFilters ? "Ocultar" : "Exibir"}
              </Button>
            </div>
          </CardHeader>
          {showFilters && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="due_start">Data Vencimento (Início)</Label>
                <Input
                  id="due_start"
                  type="date"
                  value={filters.due_start}
                  onChange={(e) => setFilters(prev => ({...prev, due_start: e.target.value}))}
                />
              </div>
              <div>
                <Label htmlFor="due_end">Data Vencimento (Fim)</Label>
                <Input
                  id="due_end"
                  type="date"
                  value={filters.due_end}
                  onChange={(e) => setFilters(prev => ({...prev, due_end: e.target.value}))}
                />
              </div>
              <div>
                <Label htmlFor="payment_start">Data Pagamento (Início)</Label>
                <Input
                  id="payment_start"
                  type="date"
                  value={filters.payment_start}
                  onChange={(e) => setFilters(prev => ({...prev, payment_start: e.target.value}))}
                />
              </div>
              <div>
                <Label htmlFor="payment_end">Data Pagamento (Fim)</Label>
                <Input
                  id="payment_end"
                  type="date"
                  value={filters.payment_end}
                  onChange={(e) => setFilters(prev => ({...prev, payment_end: e.target.value}))}
                />
              </div>
              <div>
                <Label htmlFor="competencia_start">Data Competência (Início)</Label>
                <Input
                  id="competencia_start"
                  type="date"
                  value={filters.competencia_start}
                  onChange={(e) => setFilters(prev => ({...prev, competencia_start: e.target.value}))}
                />
              </div>
              <div>
                <Label htmlFor="competencia_end">Data Competência (Fim)</Label>
                <Input
                  id="competencia_end"
                  type="date"
                  value={filters.competencia_end}
                  onChange={(e) => setFilters(prev => ({...prev, competencia_end: e.target.value}))}
                />
              </div>
              <div>
                <Label htmlFor="created_start">Data Cadastro (Início)</Label>
                <Input
                  id="created_start"
                  type="date"
                  value={filters.created_start}
                  onChange={(e) => setFilters(prev => ({...prev, created_start: e.target.value}))}
                />
              </div>
              <div>
                <Label htmlFor="created_end">Data Cadastro (Fim)</Label>
                <Input
                  id="created_end"
                  type="date"
                  value={filters.created_end}
                  onChange={(e) => setFilters(prev => ({...prev, created_end: e.target.value}))}
                />
              </div>
              <div>
                <Label>Fornecedor</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      {filters.supplier_id !== "all"
                        ? suppliers.find((supplier) => supplier.id === filters.supplier_id)?.name || "Selecionar fornecedor"
                        : "Todos"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0">
                    <Command>
                      <CommandInput placeholder="Buscar fornecedor..." />
                      <CommandList>
                        <CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => setFilters(prev => ({...prev, supplier_id: "all"}))}
                          >
                            <Check className={cn("mr-2 h-4 w-4", filters.supplier_id === "all" ? "opacity-100" : "opacity-0")} />
                            Todos
                          </CommandItem>
                          {suppliers.map((supplier) => (
                            <CommandItem
                              key={supplier.id}
                              value={supplier.name}
                              onSelect={() => setFilters(prev => ({...prev, supplier_id: supplier.id}))}
                            >
                              <Check className={cn("mr-2 h-4 w-4", filters.supplier_id === supplier.id ? "opacity-100" : "opacity-0")} />
                              {supplier.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Loja</Label>
                <Select value={filters.store_id} onValueChange={(value) => setFilters(prev => ({...prev, store_id: value}))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar loja" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Produto</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      {filters.product_id !== "all"
                        ? products.find((product) => product.id === filters.product_id)?.name || "Selecionar produto"
                        : "Todos"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0">
                    <Command
                      filter={(value, search) => {
                        if (!search) return 1;
                        return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                      }}
                    >
                      <CommandInput placeholder="Buscar produto..." />
                      <CommandList>
                        <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => setFilters(prev => ({...prev, product_id: "all"}))}
                          >
                            <Check className={cn("mr-2 h-4 w-4", filters.product_id === "all" ? "opacity-100" : "opacity-0")} />
                            Todos
                          </CommandItem>
                          {products.map((product) => (
                            <CommandItem
                              key={product.id}
                              value={product.name}
                              onSelect={() => setFilters(prev => ({...prev, product_id: product.id}))}
                            >
                              <Check className={cn("mr-2 h-4 w-4", filters.product_id === product.id ? "opacity-100" : "opacity-0")} />
                              {product.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Conta</Label>
                <Select 
                  value={filters.account_id} 
                  onValueChange={(value) => setFilters(prev => ({...prev, account_id: value}))}
                  disabled={filters.store_id === "all"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={filters.store_id === "all" ? "Selecione uma loja primeiro" : "Selecionar conta"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {availableAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>{account.name} ({account.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Grupo</Label>
                <Select value={filters.group_id} onValueChange={(value) => setFilters(prev => ({...prev, group_id: value, subgroup_id: "all"}))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subgrupo</Label>
                <Select 
                  value={filters.subgroup_id} 
                  onValueChange={(value) => setFilters(prev => ({...prev, subgroup_id: value}))}
                  disabled={filters.group_id === "all"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={filters.group_id === "all" ? "Selecione um grupo primeiro" : "Selecionar subgrupo"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {subgroups.map((subgroup) => (
                      <SelectItem key={subgroup.id} value={subgroup.id}>{subgroup.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Funcionário</Label>
                <Select value={filters.employee_id} onValueChange={(value) => setFilters(prev => ({...prev, employee_id: value}))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar funcionário" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleSearch} disabled={loading}>
                {loading ? "Pesquisando..." : "Pesquisar"}
              </Button>
              <Button onClick={clearFilters} variant="outline">
                Limpar Filtros
              </Button>
            </div>
          </CardContent>
          )}
        </Card>

        {accounts.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Compras ({accounts.length})</CardTitle>
                <div className="flex gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <FileDown className="h-4 w-4 mr-2" />
                        PDF
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={exportToPDFResumido}>
                        Relatório Resumido
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={exportToPDFDetalhado}>
                        Relatório Detalhado
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={exportToPDFPorSubgrupo}>
                        Relatório por Subgrupo
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={exportToPDFPorFornecedor}>
                        Relatório por Fornecedor
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Excel
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={exportToExcel}>
                        Relatório Padrão
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={exportToExcelPorSubgrupo}>
                        Relatório por Subgrupo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Parcelas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account, index) => (
                    <TableRow key={`${account.id}-${account.installment_id || index}`}>
                      <TableCell>{account.description}</TableCell>
                      <TableCell>{getSupplierOrEmployeeName(account)}</TableCell>
                      <TableCell>{account.stores?.name || "N/A"}</TableCell>
                      <TableCell>{account.due_date ? new Date(account.due_date + 'T00:00:00').toLocaleDateString("pt-BR") : "N/A"}</TableCell>
                      <TableCell>
                        {account.payment_date ? new Date(account.payment_date + 'T00:00:00').toLocaleDateString("pt-BR") : "-"}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          account.display_status === 'paid' && "bg-green-100 text-green-800",
                          account.display_status === 'partial' && "bg-yellow-100 text-yellow-800",
                          account.display_status === 'pending' && "bg-red-100 text-red-800",
                        )}>
                          {getStatusLabel(account.display_status)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {account.amount?.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL"
                        }) || "N/A"}
                      </TableCell>
                      <TableCell>
                        {account.total_installments > 1 ? `${account.installment_number}/${account.total_installments}` : "À vista"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-bold bg-muted/50">
                    <TableCell colSpan={6} className="text-right">Total:</TableCell>
                    <TableCell>
                      {accounts.reduce((sum, account) => sum + (account.amount ?? 0), 0).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL"
                      })}
                    </TableCell>
                    <TableCell>{accounts.length} registro(s)</TableCell>
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

export default PurchasesReport;
