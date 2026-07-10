import { ReactNode } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardUser } from "@/hooks/useDashboardUser";

interface PageLayoutProps {
  children: ReactNode;
}

/**
 * Layout principal do sistema (sidebar + topbar) já com o usuário e as tarefas
 * pendentes carregados. É o ponto de entrada para transformar uma modal em
 * página dedicada: basta renderizar o conteúdo dentro de <PageLayout>.
 */
export function PageLayout({ children }: PageLayoutProps) {
  const { user, pendingTasks } = useDashboardUser();

  return (
    <DashboardLayout user={user} pendingTasks={pendingTasks}>
      {children}
    </DashboardLayout>
  );
}

export default PageLayout;
