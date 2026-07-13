import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  LineChart as LineChartIcon,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebounce } from "@/hooks/useDebounce";
import { useIsMobile } from "@/hooks/use-mobile";

interface Store {
  id: string;
  name: string;
  code: string;
}

interface RevenueRow {
  store_id: string;
  date: string;
  faturamento_total: number | null;
}

interface GoalRow {
  store_id: string;
  month: number;
  goal_value: number;
}

interface StorePerformance {
  id: string;
  name: string;
  code: string;
  revenue: number;
  goal: number;
  percentage: number;
  difference: number;
  status: "success" | "warning" | "danger" | "no-goal";
  lastCashDate: string | null;
}

interface DashboardIndicatorsProps {
  userId?: string | null;
}

const MONTHS = [
  { value: 1, label: "Janeiro", short: "Jan" },
  { value: 2, label: "Fevereiro", short: "Fev" },
  { value: 3, label: "Março", short: "Mar" },
  { value: 4, label: "Abril", short: "Abr" },
  { value: 5, label: "Maio", short: "Mai" },
  { value: 6, label: "Junho", short: "Jun" },
  { value: 7, label: "Julho", short: "Jul" },
  { value: 8, label: "Agosto", short: "Ago" },
  { value: 9, label: "Setembro", short: "Set" },
  { value: 10, label: "Outubro", short: "Out" },
  { value: 11, label: "Novembro", short: "Nov" },
  { value: 12, label: "Dezembro", short: "Dez" },
];

const today = new Date();

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);

const formatPercent = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number.isFinite(value) ? value : 0);

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

const dateFromParts = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const diffInDays = (date: string) => {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

const getStatus = (percentage: number, goal: number): StorePerformance["status"] => {
  if (goal <= 0) return "no-goal";
  if (percentage >= 100) return "success";
  if (percentage >= 80) return "warning";
  return "danger";
};

const statusClasses: Record<StorePerformance["status"], string> = {
  success: "bg-green-100 text-green-700 border-green-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  danger: "bg-red-100 text-red-700 border-red-200",
  "no-goal": "bg-muted text-muted-foreground border-border",
};

const statusLabels: Record<StorePerformance["status"], string> = {
  success: "Meta batida",
  warning: "Atenção",
  danger: "Abaixo de 80%",
  "no-goal": "Sem meta",
};

const DashboardIndicators = ({ userId }: DashboardIndicatorsProps) => {
  const isMobile = useIsMobile();
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonths, setSelectedMonths] = useState<number[]>([today.getMonth() + 1]);
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const debouncedStores = useDebounce(selectedStores, 400);
  const debouncedMonths = useDebounce(selectedMonths, 400);
  const debouncedYear = useDebounce(selectedYear, 400);

  const { data: stores = [], isLoading: storesLoading } = useQuery({
    queryKey: ["dashboard-stores", userId],
    queryFn: async () => {
      if (!userId) return [];

      const [profileResult, userStoresResult] = await Promise.all([
        supabase.from("profiles").select("store_id").eq("id", userId).single(),
        supabase.from("user_stores").select("store_id").eq("user_id", userId),
      ]);

      const authorizedStoreIds = new Set<string>();
      if (profileResult.data?.store_id) authorizedStoreIds.add(profileResult.data.store_id);
      userStoresResult.data?.forEach((userStore) => authorizedStoreIds.add(userStore.store_id));

      if (authorizedStoreIds.size === 0) return [];

      const { data } = await supabase
        .from("stores")
        .select("id, name, code")
        .in("id", Array.from(authorizedStoreIds))
        .order("name");

      return data || [];
    },
    enabled: Boolean(userId),
    staleTime: 10 * 60 * 1000,
  });

  const authorizedStoreIds = useMemo(() => new Set(stores.map((store) => store.id)), [stores]);

  useEffect(() => {
    setSelectedStores((currentStores) => {
      const filteredStores = currentStores.filter((storeId) => authorizedStoreIds.has(storeId));
      return filteredStores.length === currentStores.length ? currentStores : filteredStores;
    });
  }, [authorizedStoreIds, userId]);

  const storeIdsToFilter = useMemo(() => {
    const selectedAuthorizedStores = debouncedStores.filter((storeId) => authorizedStoreIds.has(storeId));
    return selectedAuthorizedStores.length > 0 ? selectedAuthorizedStores : stores.map((store) => store.id);
  }, [authorizedStoreIds, debouncedStores, stores]);

  const periodLabel = useMemo(() => {
    if (debouncedMonths.length === 1) {
      return MONTHS.find((month) => month.value === debouncedMonths[0])?.label || "Período";
    }

    const ordered = [...debouncedMonths].sort((a, b) => a - b);
    const first = MONTHS.find((month) => month.value === ordered[0])?.short;
    const last = MONTHS.find((month) => month.value === ordered[ordered.length - 1])?.short;
    return `${first} a ${last} (${ordered.length} meses)`;
  }, [debouncedMonths]);

  const selectedPeriodRange = useMemo(() => {
    const orderedMonths = [...debouncedMonths].sort((a, b) => a - b);
    const firstMonth = orderedMonths[0];
    const lastMonth = orderedMonths[orderedMonths.length - 1];

    return {
      start: dateFromParts(debouncedYear, firstMonth, 1),
      end: dateFromParts(debouncedYear, lastMonth, daysInMonth(debouncedYear, lastMonth)),
    };
  }, [debouncedMonths, debouncedYear]);

  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["dashboard-employees", storeIdsToFilter],
    queryFn: async () => {
      if (storeIdsToFilter.length === 0) return { active: 0, unregistered: 0 };

      const [activeResult, unregisteredResult] = await Promise.all([
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .is("dismissal_date", null)
          .in("store_id", storeIdsToFilter),
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .eq("is_registered", false)
          .is("dismissal_date", null)
          .in("store_id", storeIdsToFilter),
      ]);

      return {
        active: activeResult.count || 0,
        unregistered: unregisteredResult.count || 0,
      };
    },
    enabled: storeIdsToFilter.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ["dashboard-revenue", storeIdsToFilter, debouncedYear],
    queryFn: async () => {
      if (storeIdsToFilter.length === 0) return { currentYear: [], previousYear: [] };

      const previousYear = debouncedYear - 1;
      const [currentYearResult, previousYearResult] = await Promise.all([
        supabase
          .from("cash_control")
          .select("store_id, date, faturamento_total")
          .gte("date", `${debouncedYear}-01-01`)
          .lte("date", `${debouncedYear}-12-31`)
          .in("store_id", storeIdsToFilter),
        supabase
          .from("cash_control")
          .select("store_id, date, faturamento_total")
          .gte("date", `${previousYear}-01-01`)
          .lte("date", `${previousYear}-12-31`)
          .in("store_id", storeIdsToFilter),
      ]);

      return {
        currentYear: (currentYearResult.data || []) as RevenueRow[],
        previousYear: (previousYearResult.data || []) as RevenueRow[],
      };
    },
    enabled: storeIdsToFilter.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: goalsData, isLoading: goalsLoading } = useQuery({
    queryKey: ["dashboard-goals", storeIdsToFilter, debouncedYear],
    queryFn: async () => {
      if (storeIdsToFilter.length === 0) return [];

      const { data } = await supabase
        .from("store_goals")
        .select("store_id, goal_value, month")
        .eq("year", debouncedYear)
        .in("store_id", storeIdsToFilter);

      return (data || []) as GoalRow[];
    },
    enabled: storeIdsToFilter.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: performanceRevenueData = [], isLoading: performanceRevenueLoading } = useQuery({
    queryKey: ["dashboard-store-performance-revenue", storeIdsToFilter, debouncedYear, debouncedMonths],
    queryFn: async () => {
      if (storeIdsToFilter.length === 0) return [];

      const selectedMonthSet = new Set(debouncedMonths);
      const { data } = await supabase
        .from("cash_control")
        .select("store_id, date, faturamento_total")
        .gte("date", selectedPeriodRange.start)
        .lte("date", selectedPeriodRange.end)
        .in("store_id", storeIdsToFilter);

      return ((data || []) as RevenueRow[]).filter((item) =>
        selectedMonthSet.has(Number(item.date.split("-")[1])),
      );
    },
    enabled: storeIdsToFilter.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const { data: performanceGoalsData = [], isLoading: performanceGoalsLoading } = useQuery({
    queryKey: ["dashboard-store-performance-goals", storeIdsToFilter, debouncedYear, debouncedMonths],
    queryFn: async () => {
      if (storeIdsToFilter.length === 0) return [];

      const { data } = await supabase
        .from("store_goals")
        .select("store_id, goal_value, month")
        .eq("year", debouncedYear)
        .in("month", debouncedMonths)
        .in("store_id", storeIdsToFilter);

      return (data || []) as GoalRow[];
    },
    enabled: storeIdsToFilter.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const { data: lastCashByStore = {}, isLoading: lastCashLoading } = useQuery({
    queryKey: ["dashboard-last-cash-by-store", storeIdsToFilter],
    queryFn: async () => {
      if (storeIdsToFilter.length === 0) return {};

      const { data } = await supabase
        .from("cash_control")
        .select("store_id, date")
        .in("store_id", storeIdsToFilter)
        .order("date", { ascending: false });

      return (data || []).reduce<Record<string, string>>((acc, item) => {
        if (!acc[item.store_id]) acc[item.store_id] = item.date;
        return acc;
      }, {});
    },
    enabled: storeIdsToFilter.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const computedValues = useMemo(() => {
    const selectedMonthSet = new Set(debouncedMonths);
    const currentYearMonthly: Record<number, number> = {};
    const previousYearMonthly: Record<number, number> = {};

    let totalRevenue = 0;
    let previousPeriodRevenue = 0;
    let yearlyRevenue = 0;

    revenueData?.currentYear?.forEach((item) => {
      const month = Number(item.date.split("-")[1]);
      const value = Number(item.faturamento_total || 0);
      yearlyRevenue += value;
      currentYearMonthly[month] = (currentYearMonthly[month] || 0) + value;

      if (selectedMonthSet.has(month)) {
        totalRevenue += value;
      }
    });

    revenueData?.previousYear?.forEach((item) => {
      const month = Number(item.date.split("-")[1]);
      const value = Number(item.faturamento_total || 0);
      previousYearMonthly[month] = (previousYearMonthly[month] || 0) + value;
      if (selectedMonthSet.has(month)) previousPeriodRevenue += value;
    });

    let totalGoal = 0;
    let yearlyGoal = 0;
    const monthlyGoals: Record<number, number> = {};

    goalsData?.forEach((item) => {
      const value = Number(item.goal_value || 0);
      yearlyGoal += value;
      monthlyGoals[item.month] = (monthlyGoals[item.month] || 0) + value;

      if (selectedMonthSet.has(item.month)) {
        totalGoal += value;
      }
    });

    const chartData = MONTHS.map((month) => {
      const isFutureMonth = debouncedYear > currentYear || (debouncedYear === currentYear && month.value > currentMonth);
      const revenue = currentYearMonthly[month.value];

      return {
        name: month.short,
        month: month.value,
        selected: selectedMonthSet.has(month.value),
        realizado: isFutureMonth && revenue == null ? null : revenue || 0,
        anterior: previousYearMonthly[month.value] || 0,
        meta: monthlyGoals[month.value] || null,
        diferenca: (revenue || 0) - (monthlyGoals[month.value] || 0),
      };
    });

    return {
      totalRevenue,
      previousPeriodRevenue,
      totalGoal,
      yearlyRevenue,
      yearlyGoal,
      chartData,
    };
  }, [
    currentMonth,
    currentYear,
    debouncedMonths,
    debouncedYear,
    goalsData,
    revenueData,
  ]);

  const loading =
    storesLoading ||
    employeesLoading ||
    revenueLoading ||
    goalsLoading ||
    lastCashLoading ||
    performanceRevenueLoading ||
    performanceGoalsLoading;
  const {
    totalRevenue,
    previousPeriodRevenue,
    totalGoal,
    yearlyRevenue,
    yearlyGoal,
    chartData,
  } = computedValues;

  const storePerformance = useMemo(() => {
    const selectedRevenueByStore = performanceRevenueData.reduce<Record<string, number>>((acc, item) => {
      acc[item.store_id] = (acc[item.store_id] || 0) + Number(item.faturamento_total || 0);
      return acc;
    }, {});

    const selectedGoalByStore = performanceGoalsData.reduce<Record<string, number>>((acc, item) => {
      acc[item.store_id] = (acc[item.store_id] || 0) + Number(item.goal_value || 0);
      return acc;
    }, {});

    return stores
      .filter((store) => storeIdsToFilter.includes(store.id))
      .map<StorePerformance>((store) => {
        const revenue = selectedRevenueByStore[store.id] || 0;
        const goal = selectedGoalByStore[store.id] || 0;
        const percentage = goal > 0 ? (revenue / goal) * 100 : 0;

        return {
          id: store.id,
          name: store.name,
          code: store.code,
          revenue,
          goal,
          percentage,
          difference: revenue - goal,
          status: getStatus(percentage, goal),
          lastCashDate: lastCashByStore[store.id] || null,
        };
      })
      .sort((left, right) => right.percentage - left.percentage || right.revenue - left.revenue);
  }, [lastCashByStore, performanceGoalsData, performanceRevenueData, storeIdsToFilter, stores]);

  const goalPercentage = totalGoal > 0 ? (totalRevenue / totalGoal) * 100 : 0;
  const goalDifference = totalRevenue - totalGoal;
  const previousVariation = previousPeriodRevenue > 0 ? ((totalRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100 : 0;
  const completedRegistrationPercentage =
    employeesData?.active && employeesData.active > 0
      ? ((employeesData.active - employeesData.unregistered) / employeesData.active) * 100
      : 0;

  const projection = useMemo(() => {
    const selectedMonthSet = new Set(debouncedMonths);
    const hasCurrentMonth = debouncedYear === currentYear && selectedMonthSet.has(currentMonth);

    if (!hasCurrentMonth) {
      return {
        value: totalRevenue,
        label: "Período fechado",
        difference: totalRevenue - totalGoal,
      };
    }

    const closedMonths = debouncedMonths.filter((month) => month !== currentMonth);
    const closedMonthsRevenue = chartData
      .filter((month) => closedMonths.includes(month.month))
      .reduce((sum, month) => sum + Number(month.realizado || 0), 0);
    const currentMonthRevenue = Number(chartData.find((month) => month.month === currentMonth)?.realizado || 0);
    const elapsedDays = Math.max(1, today.getDate());
    const monthTotalDays = daysInMonth(debouncedYear, currentMonth);
    const projectedCurrentMonth = (currentMonthRevenue / elapsedDays) * monthTotalDays;
    const projectedValue = closedMonthsRevenue + projectedCurrentMonth;

    return {
      value: projectedValue,
      label: `${elapsedDays}/${monthTotalDays} dias`,
      difference: projectedValue - totalGoal,
    };
  }, [chartData, currentMonth, currentYear, debouncedMonths, debouncedYear, totalGoal, totalRevenue]);

  const dailyAverage = useMemo(() => {
    const elapsedDays = debouncedMonths.reduce((sum, month) => {
      const isCurrentMonth = debouncedYear === currentYear && month === currentMonth;
      const isFutureMonth = debouncedYear > currentYear || (debouncedYear === currentYear && month > currentMonth);
      if (isFutureMonth) return sum;
      return sum + (isCurrentMonth ? today.getDate() : daysInMonth(debouncedYear, month));
    }, 0);

    const totalPeriodDays = debouncedMonths.reduce((sum, month) => sum + daysInMonth(debouncedYear, month), 0);
    const remainingDays = Math.max(totalPeriodDays - elapsedDays, 0);

    return {
      realized: elapsedDays > 0 ? totalRevenue / elapsedDays : 0,
      needed: goalDifference >= 0 ? 0 : Math.abs(goalDifference) / Math.max(remainingDays, 1),
      remainingDays,
    };
  }, [currentMonth, currentYear, debouncedMonths, debouncedYear, goalDifference, totalRevenue]);

  const alerts = useMemo(() => {
    const belowTargetStores = storePerformance.filter((store) => store.status === "danger");
    const storesWithoutRecentCash = storePerformance.filter(
      (store) => !store.lastCashDate || diffInDays(store.lastCashDate) > 3,
    );
    const storesWithoutGoal = storePerformance.filter((store) => store.goal <= 0);
    const storesWithoutRevenue = storePerformance.filter((store) => store.revenue <= 0);
    const unregisteredEmployees = employeesData?.unregistered || 0;

    return [
      {
        key: "below-target",
        title: "Lojas abaixo de 80% da meta",
        value: belowTargetStores.length,
        description: belowTargetStores.map((store) => store.code).join(", ") || "Nenhuma loja",
        tone: belowTargetStores.length > 0 ? "danger" : "success",
      },
      {
        key: "cash",
        title: "Sem fechamento de caixa recente",
        value: storesWithoutRecentCash.length,
        description: storesWithoutRecentCash.map((store) => store.code).join(", ") || "Fechamentos em dia",
        tone: storesWithoutRecentCash.length > 0 ? "warning" : "success",
      },
      {
        key: "employees",
        title: "Funcionários sem registro completo",
        value: unregisteredEmployees,
        description: unregisteredEmployees > 0 ? "Regularizar cadastros" : "Cadastros completos",
        tone: unregisteredEmployees > 0 ? "warning" : "success",
      },
      {
        key: "goals",
        title: "Lojas sem meta cadastrada",
        value: storesWithoutGoal.length,
        description: storesWithoutGoal.map((store) => store.code).join(", ") || "Todas com meta",
        tone: storesWithoutGoal.length > 0 ? "warning" : "success",
      },
      {
        key: "revenue",
        title: "Sem faturamento lançado no período",
        value: storesWithoutRevenue.length,
        description: storesWithoutRevenue.map((store) => store.code).join(", ") || "Todas com lançamento",
        tone: storesWithoutRevenue.length > 0 ? "danger" : "success",
      },
    ];
  }, [employeesData?.unregistered, storePerformance]);

  const handleMonthToggle = (monthValue: string) => {
    const month = Number(monthValue);
    setSelectedMonths((prev) => {
      if (prev.includes(month)) return prev.length > 1 ? prev.filter((item) => item !== month) : prev;
      return [...prev, month].sort((a, b) => a - b);
    });
  };

  const handleStoreToggle = (storeId: string) => {
    if (!authorizedStoreIds.has(storeId)) return;
    setSelectedStores((prev) => (prev.includes(storeId) ? prev.filter((id) => id !== storeId) : [...prev, storeId]));
  };

  const handleSelectAllStores = () => {
    if (selectedStores.length === stores.length) setSelectedStores([]);
    else setSelectedStores(stores.map((store) => store.id));
  };

  const getStoreFilterLabel = () => {
    if (selectedStores.length === 0) return "Todas as lojas";
    if (selectedStores.length === 1) {
      const store = stores.find((item) => item.id === selectedStores[0]);
      return store ? `${store.code} - ${store.name}` : "1 loja";
    }
    return `${selectedStores.length} lojas selecionadas`;
  };

  const variationColor = previousVariation >= 0 ? "text-green-600" : "text-red-600";
  const differenceColor = goalDifference >= 0 ? "text-green-600" : "text-red-600";
  const projectionColor = projection.difference >= 0 ? "text-green-600" : "text-red-600";

  return (
    <div className="space-y-4 md:space-y-6 max-w-full">
      <div className="rounded-lg border bg-card p-3 shadow-sm md:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_120px_minmax(280px,2fr)]">
          <div className="space-y-2">
            <span className="text-sm font-medium">Loja</span>
            <Popover open={storeDropdownOpen} onOpenChange={setStoreDropdownOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="truncate">{getStoreFilterLabel()}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-0 bg-popover z-50" align="start">
                <div className="max-h-[320px] overflow-auto">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 border-b px-3 py-2 text-left hover:bg-muted"
                    onClick={handleSelectAllStores}
                  >
                    <Checkbox checked={selectedStores.length === stores.length && stores.length > 0} />
                    <span className="text-sm font-medium">Todas as lojas vinculadas</span>
                  </button>
                  {stores.map((store) => (
                    <button
                      type="button"
                      key={store.id}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                      onClick={() => handleStoreToggle(store.id)}
                    >
                      <Checkbox checked={selectedStores.includes(store.id)} />
                      <span className="text-sm">{store.code} - {store.name}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Ano</span>
            <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
              <SelectTrigger className="w-full">
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

          <div className="space-y-2">
            <span className="text-sm font-medium">Meses</span>
            <div className="grid grid-cols-4 gap-1 sm:grid-cols-6 xl:grid-cols-12">
              {MONTHS.map((month) => (
                <button
                  key={month.value}
                  type="button"
                  onClick={() => handleMonthToggle(String(month.value))}
                  className={`h-8 rounded-md border text-xs font-medium transition-colors md:h-9 ${
                    selectedMonths.includes(month.value)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {month.short}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground md:text-sm">Faturamento do período</CardTitle>
            <DollarSign className="h-4 w-4 shrink-0 text-primary" />
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl font-bold md:text-2xl">{loading ? "..." : formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">{periodLabel} de {debouncedYear}</p>
            <div className={`flex items-center gap-1 text-sm font-medium ${variationColor}`}>
              {previousVariation >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {previousPeriodRevenue > 0 ? `${formatPercent(previousVariation)}% vs ${debouncedYear - 1}` : "Sem base no ano anterior"}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground md:text-sm">Meta do período</CardTitle>
            <Target className="h-4 w-4 shrink-0 text-primary" />
          </CardHeader>
          <CardContent className="space-y-3 p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl font-bold md:text-2xl">{loading ? "..." : `${formatPercent(goalPercentage)}%`}</div>
            <Progress value={Math.min(goalPercentage, 100)} className="h-2" />
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>Meta: {formatCurrency(totalGoal)}</span>
              <span>Realizado: {formatCurrency(totalRevenue)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground md:text-sm">Diferença para meta</CardTitle>
            <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className={`text-xl font-bold md:text-2xl ${differenceColor}`}>
              {loading ? "..." : formatCurrency(goalDifference)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {goalDifference >= 0 ? "Excedente no período selecionado" : "Faltante para atingir a meta"}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground md:text-sm">Projeção de fechamento</CardTitle>
            <LineChartIcon className="h-4 w-4 shrink-0 text-primary" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl font-bold md:text-2xl">{loading ? "..." : formatCurrency(projection.value)}</div>
            <p className="mt-1 text-xs text-muted-foreground">{projection.label}</p>
            <p className={`mt-2 text-xs font-medium md:text-sm ${projectionColor}`}>
              {projection.difference >= 0 ? "Acima da meta" : "Abaixo da meta"} em {formatCurrency(Math.abs(projection.difference))}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground md:text-sm">Média diária</CardTitle>
            <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl font-bold md:text-2xl">{loading ? "..." : formatCurrency(dailyAverage.realized)}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              {goalDifference >= 0
                ? "Meta superada no período"
                : `Necessária: ${formatCurrency(dailyAverage.needed)} por dia`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="p-3 pb-2 md:p-6">
          <CardTitle className="text-base md:text-lg">Faturamento Mensal - {debouncedYear} vs {debouncedYear - 1}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <div className="overflow-x-auto">
            <div className="h-64 min-w-[700px] md:h-80 md:min-w-[720px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: isMobile ? 11 : undefined }} />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: isMobile ? 11 : undefined }}
                    tickFormatter={(value) =>
                      new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "short" }).format(value)
                    }
                  />
                  <Tooltip
                    formatter={(value: number | null, name: string) => [
                      value == null ? "Sem dados" : formatCurrency(Number(value)),
                      name,
                    ]}
                    labelFormatter={(label) => {
                      const item = chartData.find((month) => month.name === label);
                      return item
                        ? `${label} | Diferença da meta: ${formatCurrency(item.diferenca)}`
                        : label;
                    }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  {debouncedMonths.map((month) => (
                    <ReferenceArea
                      key={month}
                      x1={MONTHS.find((item) => item.value === month)?.short}
                      x2={MONTHS.find((item) => item.value === month)?.short}
                      strokeOpacity={0}
                      fill="hsl(var(--primary))"
                      fillOpacity={0.08}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="realizado"
                    name={`Faturamento ${debouncedYear}`}
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    connectNulls={false}
                    dot={(props) => {
                      const payload = props.payload as { selected?: boolean };
                      return (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={payload.selected ? 6 : 4}
                          fill="hsl(var(--primary))"
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                        />
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="anterior"
                    name={`Faturamento ${debouncedYear - 1}`}
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: "hsl(var(--muted-foreground))", strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="meta"
                    name="Meta mensal"
                    stroke="hsl(38, 92%, 50%)"
                    strokeWidth={2}
                    connectNulls={false}
                    dot={{ fill: "hsl(38, 92%, 50%)", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="p-3 pb-2 md:p-6">
          <CardTitle className="text-base md:text-lg">Desempenho por Loja</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {/* Lista em cards (mobile) */}
          <div className="space-y-2 md:hidden">
            {storePerformance.map((store) => (
              <div key={store.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium break-words">{store.code} - {store.name}</p>
                  <Badge variant="outline" className={`${statusClasses[store.status]} shrink-0`}>
                    {statusLabels[store.status]}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Faturamento</span>
                  <span className="text-right">{formatCurrency(store.revenue)}</span>
                  <span className="text-muted-foreground">Meta</span>
                  <span className="text-right">{formatCurrency(store.goal)}</span>
                  <span className="text-muted-foreground">% Meta</span>
                  <span className="text-right">{store.goal > 0 ? `${formatPercent(store.percentage)}%` : "-"}</span>
                  <span className="text-muted-foreground">Diferença</span>
                  <span className={`text-right font-medium ${store.difference >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(store.difference)}
                  </span>
                </div>
              </div>
            ))}
            {storePerformance.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma loja vinculada ao usuário logado.
              </p>
            )}
          </div>

          {/* Tabela (desktop) */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-3 pr-4 font-medium">Loja</th>
                  <th className="py-3 pr-4 font-medium">Faturamento</th>
                  <th className="py-3 pr-4 font-medium">Meta</th>
                  <th className="py-3 pr-4 font-medium">% Meta</th>
                  <th className="py-3 pr-4 font-medium">Diferença</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {storePerformance.map((store) => (
                  <tr key={store.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">{store.code} - {store.name}</td>
                    <td className="py-3 pr-4">{formatCurrency(store.revenue)}</td>
                    <td className="py-3 pr-4">{formatCurrency(store.goal)}</td>
                    <td className="py-3 pr-4">{store.goal > 0 ? `${formatPercent(store.percentage)}%` : "-"}</td>
                    <td className={`py-3 pr-4 font-medium ${store.difference >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(store.difference)}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant="outline" className={statusClasses[store.status]}>
                        {statusLabels[store.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {storePerformance.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      Nenhuma loja vinculada ao usuário logado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card className="shadow-sm">
          <CardHeader className="p-3 pb-2 md:p-6">
            <CardTitle className="text-base md:text-lg">Alertas de Gestão</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 p-3 pt-0 md:grid-cols-2 md:gap-3 md:p-6 md:pt-0">
            {alerts.map((alert) => (
              <div key={alert.key} className="flex items-start gap-2 rounded-lg border p-2.5 md:gap-3 md:p-3">
                {alert.tone === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 md:h-5 md:w-5" />
                ) : (
                  <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 md:h-5 md:w-5 ${alert.tone === "danger" ? "text-red-600" : "text-amber-600"}`} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 md:gap-3">
                    <p className="text-sm font-medium md:text-base">{alert.title}</p>
                    <span className="shrink-0 text-base font-bold md:text-lg">{loading ? "..." : alert.value}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground md:text-sm">{alert.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="p-3 pb-2 md:p-6">
            <CardTitle className="text-base md:text-lg">Operacional</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-3 pt-0 md:space-y-4 md:p-6 md:pt-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground md:text-sm">Funcionários ativos</p>
                <p className="text-xl font-bold md:text-2xl">{loading ? "..." : employeesData?.active || 0}</p>
              </div>
              <Users className="h-5 w-5 shrink-0 text-primary md:h-6 md:w-6" />
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-2.5 md:p-3">
              <div>
                <p className="text-xs text-muted-foreground">Sem registro</p>
                <p className="text-base font-semibold text-amber-700 md:text-lg">{employeesData?.unregistered || 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cadastros completos</p>
                <p className="text-base font-semibold md:text-lg">{formatPercent(completedRegistrationPercentage)}%</p>
              </div>
            </div>
            <Progress value={completedRegistrationPercentage} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Ano {debouncedYear}: {formatCurrency(yearlyRevenue)} realizados de {formatCurrency(yearlyGoal)} em metas cadastradas.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardIndicators;
