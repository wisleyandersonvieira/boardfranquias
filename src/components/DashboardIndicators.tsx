import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Users, DollarSign, Target, TrendingUp, ChevronDown, Calendar } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface Store {
  id: string;
  name: string;
  code: string;
}

const MONTHS = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

const DashboardIndicators = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonths, setSelectedMonths] = useState<number[]>([new Date().getMonth() + 1]);
  const [loading, setLoading] = useState(true);
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
  
  // Indicators data
  const [activeEmployees, setActiveEmployees] = useState(0);
  const [unregisteredEmployees, setUnregisteredEmployees] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalGoal, setTotalGoal] = useState(0);
  const [yearlyRevenue, setYearlyRevenue] = useState(0);
  const [yearlyGoal, setYearlyGoal] = useState(0);
  const [monthlyRevenueData, setMonthlyRevenueData] = useState<any[]>([]);
  const [monthlyGoals, setMonthlyGoals] = useState<{ [key: number]: number }>({});
  const [daysSinceLastCash, setDaysSinceLastCash] = useState<number | null>(null);
  const [daysSinceLastExpense, setDaysSinceLastExpense] = useState<number | null>(null);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    if (stores.length > 0) {
      fetchIndicators();
    }
  }, [selectedStores, selectedMonths, selectedYear, stores]);

  const fetchStores = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get user's profile store
    const { data: profile } = await supabase
      .from("profiles")
      .select("store_id")
      .eq("id", user.id)
      .single();

    // Get stores from user_stores junction table
    const { data: userStores } = await supabase
      .from("user_stores")
      .select("store_id")
      .eq("user_id", user.id);

    // Combine all authorized store IDs
    const authorizedStoreIds = new Set<string>();
    if (profile?.store_id) authorizedStoreIds.add(profile.store_id);
    userStores?.forEach(us => authorizedStoreIds.add(us.store_id));

    if (authorizedStoreIds.size === 0) {
      setStores([]);
      return;
    }

    const { data } = await supabase
      .from("stores")
      .select("id, name, code")
      .in("id", Array.from(authorizedStoreIds))
      .order("name");
    
    if (data) setStores(data);
  };

  const fetchIndicators = async () => {
    setLoading(true);
    await Promise.all([
      fetchActiveEmployees(),
      fetchRevenue(),
      fetchGoals(),
      fetchMonthlyRevenue(),
      fetchLastRegistrations(),
    ]);
    setLoading(false);
  };

  const fetchLastRegistrations = async () => {
    const today = new Date();
    
    // Use selected stores or all user's authorized stores
    const storeIdsToFilter = selectedStores.length > 0 ? selectedStores : stores.map(s => s.id);
    
    if (storeIdsToFilter.length === 0) {
      setDaysSinceLastCash(null);
      setDaysSinceLastExpense(null);
      return;
    }

    // Fetch last cash control date
    const { data: cashData } = await supabase
      .from("cash_control")
      .select("date")
      .in("store_id", storeIdsToFilter)
      .order("date", { ascending: false })
      .limit(1);
    
    if (cashData && cashData.length > 0) {
      const lastCashDate = new Date(cashData[0].date);
      const diffTime = today.getTime() - lastCashDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      setDaysSinceLastCash(diffDays);
    } else {
      setDaysSinceLastCash(null);
    }

    // Fetch last expense date
    const { data: expenseData } = await supabase
      .from("cash_control_expenses")
      .select("issue_date")
      .in("store_id", storeIdsToFilter)
      .order("issue_date", { ascending: false })
      .limit(1);
    
    if (expenseData && expenseData.length > 0) {
      const lastExpenseDate = new Date(expenseData[0].issue_date);
      const diffTime = today.getTime() - lastExpenseDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      setDaysSinceLastExpense(diffDays);
    } else {
      setDaysSinceLastExpense(null);
    }
  };

  const fetchActiveEmployees = async () => {
    // Use selected stores or all user's authorized stores
    const storeIdsToFilter = selectedStores.length > 0 ? selectedStores : stores.map(s => s.id);
    
    if (storeIdsToFilter.length === 0) {
      setActiveEmployees(0);
      setUnregisteredEmployees(0);
      return;
    }

    // Fetch active employees count
    const { count: activeCount } = await supabase
      .from("employees")
      .select("id", { count: "exact" })
      .eq("is_active", true)
      .is("dismissal_date", null)
      .in("store_id", storeIdsToFilter);

    setActiveEmployees(activeCount || 0);

    // Fetch unregistered employees count (active but not registered)
    const { count: unregisteredCount } = await supabase
      .from("employees")
      .select("id", { count: "exact" })
      .eq("is_active", true)
      .eq("is_registered", false)
      .is("dismissal_date", null)
      .in("store_id", storeIdsToFilter);

    setUnregisteredEmployees(unregisteredCount || 0);
  };

  const fetchRevenue = async () => {
    // Use selected stores or all user's authorized stores
    const storeIdsToFilter = selectedStores.length > 0 ? selectedStores : stores.map(s => s.id);
    
    if (storeIdsToFilter.length === 0) {
      setTotalRevenue(0);
      setYearlyRevenue(0);
      return;
    }

    // Fetch all yearly data in a single query (instead of one query per month)
    const { data: yearlyData } = await supabase
      .from("cash_control")
      .select("date, faturamento_total")
      .gte("date", `${selectedYear}-01-01`)
      .lte("date", `${selectedYear}-12-31`)
      .in("store_id", storeIdsToFilter);

    // Calculate total for selected months in-memory
    let total = 0;
    let yearlyTotal = 0;
    
    yearlyData?.forEach((item) => {
      const month = parseInt(item.date.split('-')[1], 10);
      const value = item.faturamento_total || 0;
      yearlyTotal += value;
      
      if (selectedMonths.includes(month)) {
        total += value;
      }
    });
    
    setTotalRevenue(total);
    setYearlyRevenue(yearlyTotal);
  };

  const fetchGoals = async () => {
    // Use selected stores or all user's authorized stores
    const storeIdsToFilter = selectedStores.length > 0 ? selectedStores : stores.map(s => s.id);
    
    // If no stores available, return zeros
    if (storeIdsToFilter.length === 0) {
      setTotalGoal(0);
      setYearlyGoal(0);
      return;
    }

    const { data } = await supabase
      .from("store_goals")
      .select("goal_value")
      .eq("year", selectedYear)
      .in("month", selectedMonths)
      .in("store_id", storeIdsToFilter);

    const total = data?.reduce((sum, item) => sum + Number(item.goal_value), 0) || 0;
    setTotalGoal(total);

    // Fetch yearly goal
    const { data: yearlyGoalData } = await supabase
      .from("store_goals")
      .select("goal_value, month")
      .eq("year", selectedYear)
      .in("store_id", storeIdsToFilter);

    const yearlyGoalTotal = yearlyGoalData?.reduce((sum, item) => sum + Number(item.goal_value), 0) || 0;
    setYearlyGoal(yearlyGoalTotal);

    // Aggregate monthly goals
    const goalsByMonth: { [key: number]: number } = {};
    yearlyGoalData?.forEach((item) => {
      goalsByMonth[item.month] = (goalsByMonth[item.month] || 0) + Number(item.goal_value);
    });
    setMonthlyGoals(goalsByMonth);
  };

  useEffect(() => {
    // Update chart data when monthlyGoals changes
    if (monthlyRevenueData.length > 0) {
      const updatedData = monthlyRevenueData.map((item) => ({
        ...item,
        meta: monthlyGoals[item.month] || 0,
      }));
      setMonthlyRevenueData(updatedData);
    }
  }, [monthlyGoals]);

  const fetchMonthlyRevenue = async () => {
    const previousYear = selectedYear - 1;
    
    // Use selected stores or all user's authorized stores
    const storeIdsToFilter = selectedStores.length > 0 ? selectedStores : stores.map(s => s.id);
    
    if (storeIdsToFilter.length === 0) {
      setMonthlyRevenueData(MONTHS.map((m) => ({
        name: m.label.substring(0, 3),
        month: m.value,
        [selectedYear]: 0,
        [previousYear]: 0,
      })));
      return;
    }

    // Fetch current year data
    const queryCurrentYear = supabase
      .from("cash_control")
      .select("date, faturamento_total, store_id")
      .gte("date", `${selectedYear}-01-01`)
      .lte("date", `${selectedYear}-12-31`)
      .in("store_id", storeIdsToFilter);

    // Fetch previous year data
    const queryPreviousYear = supabase
      .from("cash_control")
      .select("date, faturamento_total, store_id")
      .gte("date", `${previousYear}-01-01`)
      .lte("date", `${previousYear}-12-31`)
      .in("store_id", storeIdsToFilter);

    const [{ data: currentYearData }, { data: previousYearData }] = await Promise.all([
      queryCurrentYear,
      queryPreviousYear,
    ]);

    // Aggregate by month for current year
    // Use string parsing to avoid timezone issues with Date constructor
    const currentYearMonthly: { [key: number]: number } = {};
    currentYearData?.forEach((item) => {
      const month = parseInt(item.date.split('-')[1], 10);
      currentYearMonthly[month] = (currentYearMonthly[month] || 0) + (item.faturamento_total || 0);
    });

    // Aggregate by month for previous year
    const previousYearMonthly: { [key: number]: number } = {};
    previousYearData?.forEach((item) => {
      const month = parseInt(item.date.split('-')[1], 10);
      previousYearMonthly[month] = (previousYearMonthly[month] || 0) + (item.faturamento_total || 0);
    });

    // Transform to chart data with both years and goals
    const chartData = MONTHS.map((m) => ({
      name: m.label.substring(0, 3),
      month: m.value,
      [selectedYear]: currentYearMonthly[m.value] || 0,
      [previousYear]: previousYearMonthly[m.value] || 0,
      meta: monthlyGoals[m.value] || 0,
    }));

    setMonthlyRevenueData(chartData);
  };

  const handleMonthToggle = (monthValue: string) => {
    const month = parseInt(monthValue);
    setSelectedMonths((prev) => {
      if (prev.includes(month)) {
        return prev.length > 1 ? prev.filter((m) => m !== month) : prev;
      }
      return [...prev, month].sort((a, b) => a - b);
    });
  };

  const handleStoreToggle = (storeId: string) => {
    setSelectedStores((prev) => {
      if (prev.includes(storeId)) {
        return prev.filter((id) => id !== storeId);
      }
      return [...prev, storeId];
    });
  };

  const handleSelectAllStores = () => {
    if (selectedStores.length === stores.length) {
      setSelectedStores([]);
    } else {
      setSelectedStores(stores.map((s) => s.id));
    }
  };

  const getStoreFilterLabel = () => {
    if (selectedStores.length === 0) return "Todas as lojas";
    if (selectedStores.length === 1) {
      const store = stores.find((s) => s.id === selectedStores[0]);
      return store ? `${store.code} - ${store.name}` : "1 loja";
    }
    return `${selectedStores.length} lojas selecionadas`;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Goal achievement pie chart data
  const goalPercentage = totalGoal > 0 ? (totalRevenue / totalGoal) * 100 : 0;
  const displayPercentage = Math.min(goalPercentage, 100); // For pie chart visual (max 100% fill)
  const pieData = [
    { name: "Atingido", value: displayPercentage },
    { name: "Restante", value: Math.max(100 - displayPercentage, 0) },
  ];
  const COLORS = goalPercentage >= 100 
    ? ["hsl(142, 76%, 36%)", "hsl(var(--muted))"] // Green when goal exceeded
    : ["hsl(var(--primary))", "hsl(var(--muted))"];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center bg-card p-4 rounded-lg border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Loja:</span>
          <Popover open={storeDropdownOpen} onOpenChange={setStoreDropdownOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[220px] justify-between">
                <span className="truncate">{getStoreFilterLabel()}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0 bg-popover z-50" align="start">
              <div className="max-h-[300px] overflow-auto">
                <div 
                  className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer border-b"
                  onClick={handleSelectAllStores}
                >
                  <Checkbox 
                    checked={selectedStores.length === stores.length && stores.length > 0}
                    onCheckedChange={handleSelectAllStores}
                  />
                  <span className="text-sm font-medium">Todas as lojas</span>
                </div>
                {stores.map((store) => (
                  <div 
                    key={store.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer"
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
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Ano:</span>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Meses:</span>
          <div className="flex flex-wrap gap-1">
            {MONTHS.map((month) => (
              <button
                key={month.value}
                onClick={() => handleMonthToggle(String(month.value))}
                className={`px-2 py-1 text-xs rounded border transition-colors ${
                  selectedMonths.includes(month.value)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {month.label.substring(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Active Employees */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Funcionários Ativos
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "..." : activeEmployees}</div>
            {!loading && unregisteredEmployees > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {unregisteredEmployees} sem registro
              </p>
            )}
          </CardContent>
        </Card>

        {/* Total Revenue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Faturamento Acumulado
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "..." : formatCurrency(totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedMonths.length === 1
                ? MONTHS.find((m) => m.value === selectedMonths[0])?.label
                : `${selectedMonths.length} meses selecionados`}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Ano {selectedYear}: {loading ? "..." : formatCurrency(yearlyRevenue)}
            </p>
          </CardContent>
        </Card>

        {/* Goal Achievement - Half Pie */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Meta Batida
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-24 h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="100%"
                      startAngle={180}
                      endAngle={0}
                      innerRadius={25}
                      outerRadius={40}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                <div className="text-2xl font-bold">{loading ? "..." : `${goalPercentage.toFixed(1)}%`}</div>
                <p className="text-xs text-muted-foreground">
                  Meta: {formatCurrency(totalGoal)}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {selectedMonths.length === 1
                ? MONTHS.find((m) => m.value === selectedMonths[0])?.label
                : `${selectedMonths.length} meses selecionados`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Ano {selectedYear}: {loading ? "..." : yearlyGoal > 0 ? `${((yearlyRevenue / yearlyGoal) * 100).toFixed(1)}%` : "0%"}
            </p>
          </CardContent>
        </Card>

        {/* Current Month vs Goal */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Diferença da Meta
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalRevenue >= totalGoal ? "text-green-600" : "text-red-600"}`}>
              {loading ? "..." : formatCurrency(totalRevenue - totalGoal)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalRevenue >= totalGoal ? "Acima da meta" : "Abaixo da meta"}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {selectedMonths.length === 1
                ? MONTHS.find((m) => m.value === selectedMonths[0])?.label
                : `${selectedMonths.length} meses selecionados`}
            </p>
            <p className={`text-xs mt-1 ${yearlyRevenue >= yearlyGoal ? "text-green-600" : "text-red-600"}`}>
              Ano {selectedYear}: {loading ? "..." : formatCurrency(yearlyRevenue - yearlyGoal)}
            </p>
          </CardContent>
        </Card>

        {/* Last Registrations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Últimos Cadastros
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div>
              <p className="text-xs text-muted-foreground">Fechamento de Caixa</p>
              <div className={`text-lg font-bold ${daysSinceLastCash !== null && daysSinceLastCash > 3 ? "text-amber-600" : ""}`}>
                {loading ? "..." : daysSinceLastCash !== null ? `${daysSinceLastCash} dia${daysSinceLastCash !== 1 ? 's' : ''}` : "Sem registros"}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Faturamento Mensal - {selectedYear} vs {selectedYear - 1}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyRevenueData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="name" 
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(value) => 
                    new Intl.NumberFormat("pt-BR", { 
                      notation: "compact",
                      compactDisplay: "short"
                    }).format(value)
                  }
                />
                <Tooltip 
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey={String(selectedYear)}
                  name={String(selectedYear)}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey={String(selectedYear - 1)}
                  name={String(selectedYear - 1)}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: "hsl(var(--muted-foreground))", strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="meta"
                  name={`Meta ${selectedYear}`}
                  stroke="hsl(24, 100%, 50%)"
                  strokeWidth={2}
                  dot={{ fill: "hsl(24, 100%, 50%)", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardIndicators;
