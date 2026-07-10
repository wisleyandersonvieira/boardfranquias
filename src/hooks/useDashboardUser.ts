import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface PendingTask {
  id: string;
  title: string;
}

/**
 * Carrega o usuário logado e suas tarefas pendentes — os dois dados que a
 * topbar do DashboardLayout precisa. Mesma regra do sino do Dashboard:
 * tarefas em que o usuário é membro e que estão abertas ou ativas.
 */
export function useDashboardUser() {
  const [user, setUser] = useState<User | null>(null);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (cancelled) return;
      setUser(currentUser);

      if (currentUser) {
        try {
          const { data: memberTasks } = await supabase
            .from("task_members")
            .select("task_id")
            .eq("user_id", currentUser.id);

          if (memberTasks && memberTasks.length > 0) {
            const taskIds = memberTasks.map((mt) => mt.task_id);
            const { data: tasks } = await supabase
              .from("tasks")
              .select("id, title")
              .in("id", taskIds)
              .in("status", ["open", "active"]);

            if (!cancelled) setPendingTasks(tasks || []);
          } else if (!cancelled) {
            setPendingTasks([]);
          }
        } catch (error) {
          console.error("Error fetching pending tasks:", error);
          if (!cancelled) setPendingTasks([]);
        }
      }

      if (!cancelled) setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return { user, pendingTasks, loading };
}
