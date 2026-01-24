import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardIndicators from "@/components/DashboardIndicators";

interface PendingTask {
  id: string;
  title: string;
}

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [showPendingPopup, setShowPendingPopup] = useState(false);
  const navigate = useNavigate();

  const fetchPendingTasks = async (userId: string) => {
    try {
      const { data: memberTasks } = await supabase
        .from('task_members')
        .select('task_id')
        .eq('user_id', userId);

      if (memberTasks && memberTasks.length > 0) {
        const taskIds = memberTasks.map(mt => mt.task_id);
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, title')
          .in('id', taskIds)
          .in('status', ['open', 'active']);

        if (tasks) {
          setPendingTasks(tasks);
          return tasks.length;
        }
      }
      setPendingTasks([]);
      return 0;
    } catch (error) {
      console.error('Error fetching pending tasks:', error);
      setPendingTasks([]);
      return 0;
    }
  };

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchPendingTasks(session.user.id);
      } else {
        navigate("/auth");
      }
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUser(session.user);
          if (event === 'SIGNED_IN') {
            setTimeout(async () => {
              const count = await fetchPendingTasks(session.user.id);
              if (count > 0) {
                setShowPendingPopup(true);
              }
            }, 0);
          }
        } else {
          navigate("/auth");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <DashboardLayout user={user} pendingTasks={pendingTasks}>
      {/* Conteúdo do Dashboard */}
      <DashboardIndicators />

      {/* Popup de tarefas pendentes ao logar */}
      <Dialog open={showPendingPopup} onOpenChange={setShowPendingPopup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-destructive" />
              Tarefas Pendentes
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <p className="text-lg">
              Você possui <span className="font-bold text-destructive">{pendingTasks.length}</span> tarefa(s) pendente(s).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPendingPopup(false)}>
              Fechar
            </Button>
            <Button onClick={() => { setShowPendingPopup(false); navigate('/tasks'); }}>
              Ver Tarefas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Dashboard;
