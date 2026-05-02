import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
};

interface FinancialData {
  accountsPayable?: any;
  accountsReceivable?: any;
  accountsPayableByDueDate?: any;
  accountsReceivableByDueDate?: any;
  cashControl?: any;
  stores?: any[];
  employees?: any;
  faturamento?: any;
  summary?: any;
}

// Busca os grupos que compõem o parâmetro de faturamento
async function getFaturamentoParameterGroups(supabase: any): Promise<string[]> {
  const { data, error } = await supabase
    .from('system_parameters')
    .select('group_id, subgroup_id')
    .eq('parameter_key', 'faturamento');
  
  if (error) return [];
  
  const groupIds: string[] = [];
  data?.forEach((param: any) => {
    if (param.group_id && !groupIds.includes(param.group_id)) {
      groupIds.push(param.group_id);
    }
    if (param.subgroup_id && !groupIds.includes(param.subgroup_id)) {
      groupIds.push(param.subgroup_id);
    }
  });
  
  return groupIds;
}

// Calcula o faturamento baseado nos parâmetros configurados
async function getFaturamentoCompleto(
  supabase: any, 
  storeIds: string[], 
  faturamentoGroupIds: string[],
  startDate?: string, 
  endDate?: string
) {
  const currentDate = new Date();
  const targetStartDate = startDate || `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
  const targetEndDate = endDate || currentDate.toISOString().split('T')[0];

  // 1. Faturamento do Controle de Caixa (usando data_competencia/date)
  const { data: cashControlData, error: cashError } = await supabase
    .from('cash_control')
    .select('id, date, store_id, faturamento_total, faturamento_dinheiro, faturamento_cartao, faturamento_delivery, faturamento_conta')
    .in('store_id', storeIds)
    .gte('date', targetStartDate)
    .lte('date', targetEndDate)
    .order('date', { ascending: false });

  if (cashError) {
    // Keep partial analytics available without logging tenant financial context.
  }

  const cashControlTotal = cashControlData?.reduce((sum: number, c: any) => sum + (c.faturamento_total || 0), 0) || 0;
  const cashControlDinheiro = cashControlData?.reduce((sum: number, c: any) => sum + (c.faturamento_dinheiro || 0), 0) || 0;
  const cashControlCartao = cashControlData?.reduce((sum: number, c: any) => sum + (c.faturamento_cartao || 0), 0) || 0;
  const cashControlDelivery = cashControlData?.reduce((sum: number, c: any) => sum + (c.faturamento_delivery || 0), 0) || 0;
  const cashControlConta = cashControlData?.reduce((sum: number, c: any) => sum + (c.faturamento_conta || 0), 0) || 0;

  // 2. Faturamento de Contas a Receber (produtos relacionados aos grupos de faturamento)
  let contasReceberFaturamento = 0;
  let contasReceberItems: any[] = [];

  if (faturamentoGroupIds.length > 0) {
    // Busca os produtos que pertencem aos grupos de faturamento
    const { data: faturamentoProducts, error: prodError } = await supabase
      .from('products')
      .select('id, name, group_id, subgroup_id')
      .or(`group_id.in.(${faturamentoGroupIds.join(',')}),subgroup_id.in.(${faturamentoGroupIds.join(',')})`);

    if (prodError) {
      // Continue with the other summaries when parameter products cannot be loaded.
    }

    const productIds = faturamentoProducts?.map((p: any) => p.id) || [];

    if (productIds.length > 0) {
      // Busca contas a receber com esses produtos, usando data_competencia
      const { data: arData, error: arError } = await supabase
        .from('accounts_receivable')
        .select(`
          id, 
          description, 
          amount, 
          data_competencia, 
          status, 
          store_id,
          accounts_receivable_items!inner(
            id,
            product_id,
            quantity,
            total_price
          )
        `)
        .in('store_id', storeIds)
        .gte('data_competencia', targetStartDate)
        .lte('data_competencia', targetEndDate);

      if (arError) {
        // Continue with cash-control faturamento only.
      }

      // Filtra apenas os itens com produtos de faturamento
      arData?.forEach((ar: any) => {
        ar.accounts_receivable_items?.forEach((item: any) => {
          if (productIds.includes(item.product_id)) {
            contasReceberFaturamento += item.total_price || 0;
            contasReceberItems.push({
              account_id: ar.id,
              description: ar.description,
              data_competencia: ar.data_competencia,
              status: ar.status,
              product_id: item.product_id,
              quantity: item.quantity,
              total_price: item.total_price
            });
          }
        });
      });
    }
  }

  // 3. Resumo por dia
  const dailyBreakdown: any[] = [];
  cashControlData?.forEach((cc: any) => {
    dailyBreakdown.push({
      date: cc.date,
      store_id: cc.store_id,
      cash_control_total: cc.faturamento_total || 0,
      dinheiro: cc.faturamento_dinheiro || 0,
      cartao: cc.faturamento_cartao || 0,
      delivery: cc.faturamento_delivery || 0,
      conta: cc.faturamento_conta || 0
    });
  });

  return {
    periodo: {
      inicio: targetStartDate,
      fim: targetEndDate
    },
    totalGeral: cashControlTotal + contasReceberFaturamento,
    controleCaixa: {
      total: cashControlTotal,
      dinheiro: cashControlDinheiro,
      cartao: cashControlCartao,
      delivery: cashControlDelivery,
      conta: cashControlConta,
      diasRegistrados: cashControlData?.length || 0
    },
    contasReceber: {
      total: contasReceberFaturamento,
      quantidadeItens: contasReceberItems.length,
      items: contasReceberItems.slice(0, 20) // Limita para não sobrecarregar
    },
    gruposConfigurados: faturamentoGroupIds.length,
    resumoDiario: dailyBreakdown.slice(0, 30) // Últimos 30 dias
  };
}

// Funções seguras para buscar dados específicos
async function getAccountsPayableSummary(supabase: any, storeIds: string[], startDate?: string, endDate?: string) {
  let query = supabase
    .from('accounts_payable')
    .select('id, description, amount, due_date, payment_date, status, store_id, supplier_id, data_competencia, created_at')
    .in('store_id', storeIds);
  
  if (startDate) query = query.gte('data_competencia', startDate);
  if (endDate) query = query.lte('data_competencia', endDate);
  
  const { data, error } = await query.limit(500);
  if (error) throw error;
  
  const pending = data?.filter((a: any) => a.status === 'pending') || [];
  const paid = data?.filter((a: any) => a.status === 'paid') || [];
  
  return {
    total: data?.length || 0,
    pending: pending.length,
    paid: paid.length,
    totalPendingAmount: pending.reduce((sum: number, a: any) => sum + (a.amount || 0), 0),
    totalPaidAmount: paid.reduce((sum: number, a: any) => sum + (a.amount || 0), 0),
    recentEntries: data?.slice(0, 10) || []
  };
}

// Busca contas a pagar com detalhes de vencimento (parcelas e conta principal)
async function getAccountsPayableByDueDate(supabase: any, storeIds: string[]) {
  const currentDate = new Date();
  const today = currentDate.toISOString().split('T')[0];
  
  // Próximos 30 dias
  const next30Days = new Date(currentDate);
  next30Days.setDate(next30Days.getDate() + 30);
  const endDate = next30Days.toISOString().split('T')[0];
  
  // Próximos 7 dias para destaque
  const next7Days = new Date(currentDate);
  next7Days.setDate(next7Days.getDate() + 7);
  const weekEndDate = next7Days.toISOString().split('T')[0];

  // Buscar contas a pagar pendentes com suas parcelas
  const { data: accountsData, error: accountsError } = await supabase
    .from('accounts_payable')
    .select(`
      id, 
      description, 
      amount, 
      due_date, 
      status, 
      store_id,
      supplier_id,
      suppliers(name)
    `)
    .in('store_id', storeIds)
    .eq('status', 'pending')
    .gte('due_date', today)
    .lte('due_date', endDate)
    .order('due_date', { ascending: true })
    .limit(100);

  if (accountsError) {
    // Continue with installments only.
  }

  // Buscar parcelas pendentes
  const { data: installmentsData, error: installmentsError } = await supabase
    .from('accounts_payable_installments')
    .select(`
      id,
      account_payable_id,
      installment_number,
      amount,
      due_date,
      payment_date,
      accounts_payable!inner(
        id,
        description,
        store_id,
        status,
        supplier_id,
        suppliers(name)
      )
    `)
    .is('payment_date', null)
    .gte('due_date', today)
    .lte('due_date', endDate)
    .order('due_date', { ascending: true })
    .limit(100);

  if (installmentsError) {
    // Continue with main accounts only.
  }

  // Filtrar parcelas por lojas acessíveis
  const filteredInstallments = installmentsData?.filter((inst: any) => 
    storeIds.includes(inst.accounts_payable?.store_id)
  ) || [];

  // Separar por período
  const dueSoon = (accountsData || []).filter((a: any) => a.due_date <= weekEndDate);
  const dueThisMonth = (accountsData || []).filter((a: any) => a.due_date > weekEndDate);

  const installmentsDueSoon = filteredInstallments.filter((i: any) => i.due_date <= weekEndDate);
  const installmentsDueThisMonth = filteredInstallments.filter((i: any) => i.due_date > weekEndDate);

  return {
    contasPrincipais: {
      proximaSemana: {
        quantidade: dueSoon.length,
        total: dueSoon.reduce((sum: number, a: any) => sum + (a.amount || 0), 0),
        items: dueSoon.map((a: any) => ({
          descricao: a.description,
          valor: a.amount,
          vencimento: a.due_date,
          fornecedor: a.suppliers?.name || 'Não informado'
        }))
      },
      proximoMes: {
        quantidade: dueThisMonth.length,
        total: dueThisMonth.reduce((sum: number, a: any) => sum + (a.amount || 0), 0),
        items: dueThisMonth.slice(0, 20).map((a: any) => ({
          descricao: a.description,
          valor: a.amount,
          vencimento: a.due_date,
          fornecedor: a.suppliers?.name || 'Não informado'
        }))
      }
    },
    parcelas: {
      proximaSemana: {
        quantidade: installmentsDueSoon.length,
        total: installmentsDueSoon.reduce((sum: number, i: any) => sum + (i.amount || 0), 0),
        items: installmentsDueSoon.map((i: any) => ({
          descricao: `${i.accounts_payable?.description} - Parcela ${i.installment_number}`,
          valor: i.amount,
          vencimento: i.due_date,
          fornecedor: i.accounts_payable?.suppliers?.name || 'Não informado'
        }))
      },
      proximoMes: {
        quantidade: installmentsDueThisMonth.length,
        total: installmentsDueThisMonth.reduce((sum: number, i: any) => sum + (i.amount || 0), 0),
        items: installmentsDueThisMonth.slice(0, 20).map((i: any) => ({
          descricao: `${i.accounts_payable?.description} - Parcela ${i.installment_number}`,
          valor: i.amount,
          vencimento: i.due_date,
          fornecedor: i.accounts_payable?.suppliers?.name || 'Não informado'
        }))
      }
    },
    periodoConsultado: {
      inicio: today,
      fimSemana: weekEndDate,
      fimMes: endDate
    }
  };
}

// Busca contas a receber com detalhes de vencimento
async function getAccountsReceivableByDueDate(supabase: any, storeIds: string[]) {
  const currentDate = new Date();
  const today = currentDate.toISOString().split('T')[0];
  
  const next30Days = new Date(currentDate);
  next30Days.setDate(next30Days.getDate() + 30);
  const endDate = next30Days.toISOString().split('T')[0];
  
  const next7Days = new Date(currentDate);
  next7Days.setDate(next7Days.getDate() + 7);
  const weekEndDate = next7Days.toISOString().split('T')[0];

  // Buscar contas a receber pendentes
  const { data: accountsData, error } = await supabase
    .from('accounts_receivable')
    .select(`
      id, 
      description, 
      amount, 
      due_date, 
      status, 
      store_id,
      creditor_id,
      creditors(name)
    `)
    .in('store_id', storeIds)
    .eq('status', 'pending')
    .gte('due_date', today)
    .lte('due_date', endDate)
    .order('due_date', { ascending: true })
    .limit(100);

  if (error) {
    // Continue with receivable installments only.
  }

  // Buscar parcelas de contas a receber
  const { data: installmentsData, error: installmentsError } = await supabase
    .from('accounts_receivable_installments')
    .select(`
      id,
      account_receivable_id,
      installment_number,
      amount,
      due_date,
      payment_date,
      accounts_receivable!inner(
        id,
        description,
        store_id,
        status,
        creditor_id,
        creditors(name)
      )
    `)
    .is('payment_date', null)
    .gte('due_date', today)
    .lte('due_date', endDate)
    .order('due_date', { ascending: true })
    .limit(100);

  if (installmentsError) {
    // Continue with main receivable accounts only.
  }

  const filteredInstallments = installmentsData?.filter((inst: any) => 
    storeIds.includes(inst.accounts_receivable?.store_id)
  ) || [];

  const dueSoon = (accountsData || []).filter((a: any) => a.due_date <= weekEndDate);
  const dueThisMonth = (accountsData || []).filter((a: any) => a.due_date > weekEndDate);

  const installmentsDueSoon = filteredInstallments.filter((i: any) => i.due_date <= weekEndDate);
  const installmentsDueThisMonth = filteredInstallments.filter((i: any) => i.due_date > weekEndDate);

  return {
    contasPrincipais: {
      proximaSemana: {
        quantidade: dueSoon.length,
        total: dueSoon.reduce((sum: number, a: any) => sum + (a.amount || 0), 0),
        items: dueSoon.map((a: any) => ({
          descricao: a.description,
          valor: a.amount,
          vencimento: a.due_date,
          cliente: a.creditors?.name || 'Não informado'
        }))
      },
      proximoMes: {
        quantidade: dueThisMonth.length,
        total: dueThisMonth.reduce((sum: number, a: any) => sum + (a.amount || 0), 0),
        items: dueThisMonth.slice(0, 20).map((a: any) => ({
          descricao: a.description,
          valor: a.amount,
          vencimento: a.due_date,
          cliente: a.creditors?.name || 'Não informado'
        }))
      }
    },
    parcelas: {
      proximaSemana: {
        quantidade: installmentsDueSoon.length,
        total: installmentsDueSoon.reduce((sum: number, i: any) => sum + (i.amount || 0), 0),
        items: installmentsDueSoon.map((i: any) => ({
          descricao: `${i.accounts_receivable?.description} - Parcela ${i.installment_number}`,
          valor: i.amount,
          vencimento: i.due_date,
          cliente: i.accounts_receivable?.creditors?.name || 'Não informado'
        }))
      },
      proximoMes: {
        quantidade: installmentsDueThisMonth.length,
        total: installmentsDueThisMonth.reduce((sum: number, i: any) => sum + (i.amount || 0), 0),
        items: installmentsDueThisMonth.slice(0, 20).map((i: any) => ({
          descricao: `${i.accounts_receivable?.description} - Parcela ${i.installment_number}`,
          valor: i.amount,
          vencimento: i.due_date,
          cliente: i.accounts_receivable?.creditors?.name || 'Não informado'
        }))
      }
    },
    periodoConsultado: {
      inicio: today,
      fimSemana: weekEndDate,
      fimMes: endDate
    }
  };
}

async function getAccountsReceivableSummary(supabase: any, storeIds: string[], startDate?: string, endDate?: string) {
  let query = supabase
    .from('accounts_receivable')
    .select('id, description, amount, due_date, payment_date, status, store_id, creditor_id, data_competencia, created_at')
    .in('store_id', storeIds);
  
  if (startDate) query = query.gte('data_competencia', startDate);
  if (endDate) query = query.lte('data_competencia', endDate);
  
  const { data, error } = await query.limit(500);
  if (error) throw error;
  
  const pending = data?.filter((a: any) => a.status === 'pending') || [];
  const received = data?.filter((a: any) => a.status === 'paid') || [];
  
  return {
    total: data?.length || 0,
    pending: pending.length,
    received: received.length,
    totalPendingAmount: pending.reduce((sum: number, a: any) => sum + (a.amount || 0), 0),
    totalReceivedAmount: received.reduce((sum: number, a: any) => sum + (a.amount || 0), 0),
    recentEntries: data?.slice(0, 10) || []
  };
}

async function getCashControlSummary(supabase: any, storeIds: string[], month?: number, year?: number) {
  const currentDate = new Date();
  const targetYear = year || currentDate.getFullYear();
  const targetMonth = month || (currentDate.getMonth() + 1);
  
  const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
  const endDate = new Date(targetYear, targetMonth, 0).toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('cash_control')
    .select('id, date, store_id, faturamento_total, faturamento_dinheiro, faturamento_cartao, faturamento_delivery, faturamento_conta, despesas_pagas, diferenca')
    .in('store_id', storeIds)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .limit(100);
  
  if (error) throw error;
  
  return {
    totalDays: data?.length || 0,
    totalRevenue: data?.reduce((sum: number, c: any) => sum + (c.faturamento_total || 0), 0) || 0,
    totalCash: data?.reduce((sum: number, c: any) => sum + (c.faturamento_dinheiro || 0), 0) || 0,
    totalCard: data?.reduce((sum: number, c: any) => sum + (c.faturamento_cartao || 0), 0) || 0,
    totalDelivery: data?.reduce((sum: number, c: any) => sum + (c.faturamento_delivery || 0), 0) || 0,
    totalExpenses: data?.reduce((sum: number, c: any) => sum + (c.despesas_pagas || 0), 0) || 0,
    averageDailyRevenue: data?.length ? data.reduce((sum: number, c: any) => sum + (c.faturamento_total || 0), 0) / data.length : 0,
    recentEntries: data?.slice(0, 10) || []
  };
}

async function getStoresSummary(supabase: any, storeIds: string[]) {
  const { data, error } = await supabase
    .from('stores')
    .select('id, name, code')
    .in('id', storeIds);
  
  if (error) throw error;
  return data || [];
}

async function getEmployeesSummary(supabase: any, storeIds: string[]) {
  const { data, error } = await supabase
    .from('employees')
    .select('id, name, is_active, store_id, base_salary, registration_date')
    .in('store_id', storeIds)
    .limit(200);
  
  if (error) throw error;
  
  const active = data?.filter((e: any) => e.is_active) || [];
  const totalSalary = active.reduce((sum: number, e: any) => sum + (e.base_salary || 0), 0);
  
  return {
    total: data?.length || 0,
    active: active.length,
    inactive: (data?.length || 0) - active.length,
    totalSalaryBudget: totalSalary,
    averageSalary: active.length ? totalSalary / active.length : 0
  };
}

async function getUserStoreIds(supabase: any, userId: string): Promise<string[]> {
  // Check if admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, store_id')
    .eq('id', userId)
    .single();
  
  if (profile?.role === 'admin') {
    const { data: allStores } = await supabase
      .from('stores')
      .select('id');
    return allStores?.map((s: any) => s.id) || [];
  }
  
  const storeIds: string[] = [];
  if (profile?.store_id) storeIds.push(profile.store_id);
  
  const { data: userStores } = await supabase
    .from('user_stores')
    .select('store_id')
    .eq('user_id', userId);
  
  userStores?.forEach((us: any) => {
    if (!storeIds.includes(us.store_id)) {
      storeIds.push(us.store_id);
    }
  });
  
  return storeIds;
}

async function checkUserPermission(supabase: any, userId: string): Promise<boolean> {
  // Check if admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, profile_id')
    .eq('id', userId)
    .single();
  
  if (profile?.role === 'admin') return true;
  
  // Check profile permissions - verifica tanto 'assistente_ia' quanto 'ia_analitica' para compatibilidade
  if (profile?.profile_id) {
    const { data: profilePerm } = await supabase
      .from('profile_permissions')
      .select('permission')
      .eq('profile_id', profile.profile_id)
      .in('module', ['assistente_ia', 'ia_analitica']);
    
    if (profilePerm && profilePerm.length > 0) {
      const hasAccess = profilePerm.some((p: any) => p.permission === 'admin');
      if (hasAccess) return true;
    }
  }
  
  // Check user permissions
  const { data: userPerm } = await supabase
    .from('user_permissions')
    .select('permission')
    .eq('user_id', userId)
    .in('module', ['assistente_ia', 'ia_analitica']);
  
  if (userPerm && userPerm.length > 0) {
    return userPerm.some((p: any) => p.permission === 'admin');
  }
  
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "User not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check permissions
    const hasPermission = await checkUserPermission(supabase, user.id);
    if (!hasPermission) {
      return new Response(JSON.stringify({ error: "Access denied to AI Analytics" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, query } = await req.json();
    const userMessage = query || messages?.[messages.length - 1]?.content || '';

    // Get user's accessible stores
    const storeIds = await getUserStoreIds(supabase, user.id);
    if (storeIds.length === 0) {
      return new Response(JSON.stringify({ error: "No stores accessible" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse dates from query if mentioned
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // Busca os grupos configurados para faturamento
    const faturamentoGroupIds = await getFaturamentoParameterGroups(supabase);

    // Fetch relevant data based on the query context
    const financialData: FinancialData = {};
    
    // Always fetch summary data for context
    financialData.stores = await getStoresSummary(supabase, storeIds);
    financialData.accountsPayable = await getAccountsPayableSummary(supabase, storeIds);
    financialData.accountsReceivable = await getAccountsReceivableSummary(supabase, storeIds);
    financialData.accountsPayableByDueDate = await getAccountsPayableByDueDate(supabase, storeIds);
    financialData.accountsReceivableByDueDate = await getAccountsReceivableByDueDate(supabase, storeIds);
    financialData.cashControl = await getCashControlSummary(supabase, storeIds, currentMonth, currentYear);
    financialData.employees = await getEmployeesSummary(supabase, storeIds);
    
    // Busca faturamento completo (controle de caixa + contas a receber com produtos de faturamento)
    financialData.faturamento = await getFaturamentoCompleto(supabase, storeIds, faturamentoGroupIds);

    // Build context for AI
    const dataContext = `
## Dados Financeiros Disponíveis (${new Date().toLocaleDateString('pt-BR')})

### Lojas Acessíveis (${financialData.stores?.length || 0}):
${financialData.stores?.map((s: any) => `- ${s.code}: ${s.name}`).join('\n') || 'Nenhuma loja encontrada'}

### FATURAMENTO (Período: ${financialData.faturamento.periodo.inicio} a ${financialData.faturamento.periodo.fim}):
**IMPORTANTE: O faturamento é calculado com base nos grupos configurados no parâmetro "faturamento" do sistema.**
- **Faturamento Total Geral: R$ ${financialData.faturamento.totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**
- Grupos de produtos configurados para faturamento: ${financialData.faturamento.gruposConfigurados}

#### Do Controle de Caixa:
- Total: R$ ${financialData.faturamento.controleCaixa.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Dinheiro: R$ ${financialData.faturamento.controleCaixa.dinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Cartão: R$ ${financialData.faturamento.controleCaixa.cartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Delivery: R$ ${financialData.faturamento.controleCaixa.delivery.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Conta: R$ ${financialData.faturamento.controleCaixa.conta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Dias registrados: ${financialData.faturamento.controleCaixa.diasRegistrados}

#### De Contas a Receber (produtos dos grupos de faturamento):
- Total: R$ ${financialData.faturamento.contasReceber.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Itens encontrados: ${financialData.faturamento.contasReceber.quantidadeItens}

### Contas a Pagar (por data de competência):
- Total de registros: ${financialData.accountsPayable.total}
- Pendentes: ${financialData.accountsPayable.pending} (R$ ${financialData.accountsPayable.totalPendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
- Pagas: ${financialData.accountsPayable.paid} (R$ ${financialData.accountsPayable.totalPaidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})

### CONTAS A PAGAR POR VENCIMENTO (Período: ${financialData.accountsPayableByDueDate.periodoConsultado.inicio} a ${financialData.accountsPayableByDueDate.periodoConsultado.fimMes}):

#### Próxima Semana (até ${financialData.accountsPayableByDueDate.periodoConsultado.fimSemana}):
**Contas Principais:**
- Quantidade: ${financialData.accountsPayableByDueDate.contasPrincipais.proximaSemana.quantidade}
- Total: R$ ${financialData.accountsPayableByDueDate.contasPrincipais.proximaSemana.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
${financialData.accountsPayableByDueDate.contasPrincipais.proximaSemana.items.map((i: any) => `  - ${i.vencimento}: ${i.descricao} - R$ ${i.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${i.fornecedor})`).join('\n')}

**Parcelas:**
- Quantidade: ${financialData.accountsPayableByDueDate.parcelas.proximaSemana.quantidade}
- Total: R$ ${financialData.accountsPayableByDueDate.parcelas.proximaSemana.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
${financialData.accountsPayableByDueDate.parcelas.proximaSemana.items.map((i: any) => `  - ${i.vencimento}: ${i.descricao} - R$ ${i.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${i.fornecedor})`).join('\n')}

#### Próximos 30 dias (após próxima semana):
**Contas Principais:**
- Quantidade: ${financialData.accountsPayableByDueDate.contasPrincipais.proximoMes.quantidade}
- Total: R$ ${financialData.accountsPayableByDueDate.contasPrincipais.proximoMes.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
${financialData.accountsPayableByDueDate.contasPrincipais.proximoMes.items.slice(0, 10).map((i: any) => `  - ${i.vencimento}: ${i.descricao} - R$ ${i.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${i.fornecedor})`).join('\n')}

**Parcelas:**
- Quantidade: ${financialData.accountsPayableByDueDate.parcelas.proximoMes.quantidade}
- Total: R$ ${financialData.accountsPayableByDueDate.parcelas.proximoMes.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
${financialData.accountsPayableByDueDate.parcelas.proximoMes.items.slice(0, 10).map((i: any) => `  - ${i.vencimento}: ${i.descricao} - R$ ${i.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${i.fornecedor})`).join('\n')}

### Contas a Receber (por data de competência):
- Total de registros: ${financialData.accountsReceivable.total}
- Pendentes: ${financialData.accountsReceivable.pending} (R$ ${financialData.accountsReceivable.totalPendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
- Recebidas: ${financialData.accountsReceivable.received} (R$ ${financialData.accountsReceivable.totalReceivedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})

### CONTAS A RECEBER POR VENCIMENTO (Período: ${financialData.accountsReceivableByDueDate.periodoConsultado.inicio} a ${financialData.accountsReceivableByDueDate.periodoConsultado.fimMes}):

#### Próxima Semana (até ${financialData.accountsReceivableByDueDate.periodoConsultado.fimSemana}):
**Contas Principais:**
- Quantidade: ${financialData.accountsReceivableByDueDate.contasPrincipais.proximaSemana.quantidade}
- Total: R$ ${financialData.accountsReceivableByDueDate.contasPrincipais.proximaSemana.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
${financialData.accountsReceivableByDueDate.contasPrincipais.proximaSemana.items.map((i: any) => `  - ${i.vencimento}: ${i.descricao} - R$ ${i.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${i.cliente})`).join('\n')}

**Parcelas:**
- Quantidade: ${financialData.accountsReceivableByDueDate.parcelas.proximaSemana.quantidade}
- Total: R$ ${financialData.accountsReceivableByDueDate.parcelas.proximaSemana.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
${financialData.accountsReceivableByDueDate.parcelas.proximaSemana.items.map((i: any) => `  - ${i.vencimento}: ${i.descricao} - R$ ${i.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${i.cliente})`).join('\n')}

#### Próximos 30 dias (após próxima semana):
**Contas Principais:**
- Quantidade: ${financialData.accountsReceivableByDueDate.contasPrincipais.proximoMes.quantidade}
- Total: R$ ${financialData.accountsReceivableByDueDate.contasPrincipais.proximoMes.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
${financialData.accountsReceivableByDueDate.contasPrincipais.proximoMes.items.slice(0, 10).map((i: any) => `  - ${i.vencimento}: ${i.descricao} - R$ ${i.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${i.cliente})`).join('\n')}

**Parcelas:**
- Quantidade: ${financialData.accountsReceivableByDueDate.parcelas.proximoMes.quantidade}
- Total: R$ ${financialData.accountsReceivableByDueDate.parcelas.proximoMes.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
${financialData.accountsReceivableByDueDate.parcelas.proximoMes.items.slice(0, 10).map((i: any) => `  - ${i.vencimento}: ${i.descricao} - R$ ${i.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${i.cliente})`).join('\n')}

### Controle de Caixa (${String(currentMonth).padStart(2, '0')}/${currentYear}):
- Dias registrados: ${financialData.cashControl.totalDays}
- Faturamento Total: R$ ${financialData.cashControl.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Faturamento em Dinheiro: R$ ${financialData.cashControl.totalCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Faturamento em Cartão: R$ ${financialData.cashControl.totalCard.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Faturamento Delivery: R$ ${financialData.cashControl.totalDelivery.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Despesas Pagas: R$ ${financialData.cashControl.totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Média Diária: R$ ${financialData.cashControl.averageDailyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

### Funcionários:
- Total cadastrados: ${financialData.employees.total}
- Ativos: ${financialData.employees.active}
- Inativos: ${financialData.employees.inactive}
- Folha salarial total: R$ ${financialData.employees.totalSalaryBudget.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Salário médio: R$ ${financialData.employees.averageSalary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
`;

    const systemPrompt = `Você é um assistente de análise financeira e gestão empresarial especializado. Você tem acesso aos dados financeiros do sistema e deve responder perguntas de forma clara, objetiva e em português brasileiro.

IMPORTANTE SOBRE FATURAMENTO:
- O faturamento é calculado com base nos grupos de produtos configurados no parâmetro "faturamento" do sistema.
- O faturamento total é composto por:
  1. Faturamento diário registrado no Controle de Caixa
  2. Contas a Receber que possuem produtos relacionados aos grupos configurados no parâmetro "faturamento"
- Sempre utilize a DATA DE COMPETÊNCIA para filtrar e exibir os dados de faturamento.
- Quando o usuário perguntar sobre faturamento, use os dados da seção "FATURAMENTO" acima.

${dataContext}

Instruções:
1. Sempre responda em português brasileiro
2. Use os dados fornecidos acima para responder às perguntas
3. Formate valores monetários no padrão brasileiro (R$ X.XXX,XX)
4. Se uma pergunta não puder ser respondida com os dados disponíveis, explique o que você tem e sugira como obter a informação
5. Seja conciso mas completo nas respostas
6. Para análises, use bullet points e formatação clara
7. Se o usuário pedir algo fora do escopo financeiro/gestão, educadamente redirecione para o foco do sistema`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...(messages?.slice(-10) || []),
      ...(query ? [{ role: "user", content: query }] : [])
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal analytics error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
