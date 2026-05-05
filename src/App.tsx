import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import CashControl from "./pages/CashControl";
import Cadastros from "./pages/Cadastros";
import Suppliers from "./pages/Suppliers";
import Stores from "./pages/Stores";
import Users from "./pages/Users";
import Profiles from "./pages/Profiles";
import Products from "./pages/Products";
import DRE from "./pages/DRE";
import DRECompetencia from "./pages/DRECompetencia";
import DRECaixa from "./pages/DRECaixa";
import DREConfiavel from "./pages/DREConfiavel";
import Reports from "./pages/Reports";
import StockModule from "./pages/StockModule";
import StockControl from "./pages/StockControl";
import NotFound from "./pages/NotFound";
import AccountsPayableModule from "./pages/AccountsPayableModule";
import AccountsPayableReport from "./pages/AccountsPayableReport";
import PaidAccountsReport from "./pages/PaidAccountsReport";
import AccountsReceivableModule from "./pages/AccountsReceivableModule";
import AccountsReceivableReport from "./pages/AccountsReceivableReport";
import ReceivedAccountsReport from "./pages/ReceivedAccountsReport";
import TurnoverReport from "./pages/TurnoverReport";
import TurnoverChartReport from "./pages/TurnoverChartReport";
import Extratos from "./pages/Extratos";
import Tasks from "./pages/Tasks";
import IncomeExpenseReport from "./pages/IncomeExpenseReport";
import Goals from "./pages/Goals";
import BalancePositionReport from "./pages/BalancePositionReport";
import MyAccount from "./pages/MyAccount";
import AIAssistant from "./pages/AIAssistant";
import AccountingExportReport from "./pages/AccountingExportReport";
import BankReconciliation from "./pages/BankReconciliation";
import OFXManagement from "./pages/OFXManagement";
import EmployeeReport from "./pages/EmployeeReport";
import PurchasesReport from "./pages/PurchasesReport";
import ProductAnalysisReport from "./pages/ProductAnalysisReport";
import ProtectedRoute from "./components/ProtectedRoute";
import NfeImport from "./pages/NfeImport";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      // 5 minutes
      retry: 1
    }
  }
});
function App() {
  const protect = (element: React.ReactElement) => (
    <ProtectedRoute>{element}</ProtectedRoute>
  );

  return <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TooltipProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/dashboard" element={protect(<Dashboard />)} />
              <Route path="/cash-control/:storeId" element={protect(<CashControl />)} />
              <Route path="/cadastros" element={protect(<Cadastros />)} />
              <Route path="/suppliers" element={protect(<Suppliers />)} />
              <Route path="/products" element={protect(<Products />)} />
              <Route path="/stores" element={protect(<Stores />)} />
              <Route path="/users" element={protect(<Users />)} />
              <Route path="/profiles" element={protect(<Profiles />)} />
              <Route path="/dre" element={protect(<DRE />)} />
              <Route path="/dre/competencia" element={protect(<DRECompetencia />)} />
              <Route path="/dre/caixa" element={protect(<DRECaixa />)} />
              <Route path="/dre/confiavel" element={protect(<DREConfiavel />)} />
              <Route path="/reports" element={protect(<Reports />)} />
              <Route path="/stock" element={protect(<StockModule />)} />
              <Route path="/stock/:storeId" element={protect(<StockControl />)} />
              <Route path="/reports/accounts-payable" element={protect(<AccountsPayableModule />)} />
              <Route path="/reports/accounts-payable/pending" element={protect(<AccountsPayableReport />)} />
              <Route path="/reports/accounts-payable/paid" element={protect(<PaidAccountsReport />)} />
              <Route path="/reports/accounts-receivable" element={protect(<AccountsReceivableModule />)} />
              <Route path="/reports/accounts-receivable/pending" element={protect(<AccountsReceivableReport />)} />
              <Route path="/reports/accounts-receivable/received" element={protect(<ReceivedAccountsReport />)} />
              <Route path="/reports/turnover" element={protect(<TurnoverReport />)} />
              <Route path="/reports/turnover-chart" element={protect(<TurnoverChartReport />)} />
              <Route path="/reports/extratos" element={protect(<Extratos />)} />
              <Route path="/reports/income-expense" element={protect(<IncomeExpenseReport />)} />
              <Route path="/reports/balance-position" element={protect(<BalancePositionReport />)} />
              <Route path="/reports/accounting-export" element={protect(<AccountingExportReport />)} />
              <Route path="/tasks" element={protect(<Tasks />)} />
              <Route path="/goals" element={protect(<Goals />)} />
              <Route path="/my-account" element={protect(<MyAccount />)} />
              <Route path="/ai-assistant" element={protect(<AIAssistant />)} />
              <Route path="/bank-reconciliation" element={protect(<BankReconciliation />)} />
              <Route path="/ofx-management" element={protect(<OFXManagement />)} />
              <Route path="/reports/employees" element={protect(<EmployeeReport />)} />
              <Route path="/reports/purchases" element={protect(<PurchasesReport />)} />
              <Route path="/reports/product-analysis" element={protect(<ProductAnalysisReport />)} />
              <Route path="/relatorios/analise-produto" element={protect(<ProductAnalysisReport />)} />
              <Route path="/nfe-import" element={protect(<NfeImport />)} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <Toaster />
            <Sonner />
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>;
}
export default App;
