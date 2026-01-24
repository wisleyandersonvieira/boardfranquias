
-- Create task_columns table for Kanban columns
CREATE TABLE public.task_columns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  position_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMP WITH TIME ZONE,
  column_id UUID NOT NULL REFERENCES public.task_columns(id) ON DELETE CASCADE,
  position_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create task_stores table (many-to-many, at least one required)
CREATE TABLE public.task_stores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(task_id, store_id)
);

-- Create task_members table (many-to-many)
CREATE TABLE public.task_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);

-- Create task_checklist_items table
CREATE TABLE public.task_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  position_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create task_comments table
CREATE TABLE public.task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create task_activities table (activity log)
CREATE TABLE public.task_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  action_type TEXT NOT NULL,
  action_description TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.task_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_activities ENABLE ROW LEVEL SECURITY;

-- Create function to check if user has access to task (at least one store in common)
CREATE OR REPLACE FUNCTION public.user_can_access_task(p_task_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admins can access all tasks
  IF get_user_role() = 'admin' THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has at least one store in common with the task
  RETURN EXISTS (
    SELECT 1 
    FROM task_stores ts
    JOIN user_stores us ON ts.store_id = us.store_id
    WHERE ts.task_id = p_task_id 
    AND us.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RLS Policies for task_columns
CREATE POLICY "Authenticated users can view columns"
  ON public.task_columns FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create columns"
  ON public.task_columns FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = created_by);

CREATE POLICY "Column creator can update"
  ON public.task_columns FOR UPDATE
  USING (auth.uid() = created_by OR get_user_role() = 'admin');

CREATE POLICY "Column creator can delete"
  ON public.task_columns FOR DELETE
  USING (auth.uid() = created_by OR get_user_role() = 'admin');

-- RLS Policies for tasks
CREATE POLICY "Users can view tasks with shared stores"
  ON public.tasks FOR SELECT
  USING (user_can_access_task(id));

CREATE POLICY "Authenticated users can create tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = created_by);

CREATE POLICY "Users with access can update tasks"
  ON public.tasks FOR UPDATE
  USING (user_can_access_task(id));

CREATE POLICY "Task creator can delete"
  ON public.tasks FOR DELETE
  USING (auth.uid() = created_by OR get_user_role() = 'admin');

-- RLS Policies for task_stores
CREATE POLICY "Users can view task stores with access"
  ON public.task_stores FOR SELECT
  USING (user_can_access_task(task_id));

CREATE POLICY "Users with access can manage task stores"
  ON public.task_stores FOR ALL
  USING (user_can_access_task(task_id));

-- RLS Policies for task_members
CREATE POLICY "Users can view task members with access"
  ON public.task_members FOR SELECT
  USING (user_can_access_task(task_id));

CREATE POLICY "Users with access can manage task members"
  ON public.task_members FOR ALL
  USING (user_can_access_task(task_id));

-- RLS Policies for task_checklist_items
CREATE POLICY "Users can view checklist items with access"
  ON public.task_checklist_items FOR SELECT
  USING (user_can_access_task(task_id));

CREATE POLICY "Users with access can manage checklist items"
  ON public.task_checklist_items FOR ALL
  USING (user_can_access_task(task_id));

-- RLS Policies for task_comments
CREATE POLICY "Users can view comments with access"
  ON public.task_comments FOR SELECT
  USING (user_can_access_task(task_id));

CREATE POLICY "Users with access can create comments"
  ON public.task_comments FOR INSERT
  WITH CHECK (user_can_access_task(task_id) AND auth.uid() = user_id);

CREATE POLICY "Comment author can update"
  ON public.task_comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Comment author can delete"
  ON public.task_comments FOR DELETE
  USING (auth.uid() = user_id OR get_user_role() = 'admin');

-- RLS Policies for task_activities
CREATE POLICY "Users can view activities with access"
  ON public.task_activities FOR SELECT
  USING (user_can_access_task(task_id));

CREATE POLICY "Users with access can create activities"
  ON public.task_activities FOR INSERT
  WITH CHECK (user_can_access_task(task_id) AND auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_tasks_column_id ON public.tasks(column_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_task_stores_task_id ON public.task_stores(task_id);
CREATE INDEX idx_task_stores_store_id ON public.task_stores(store_id);
CREATE INDEX idx_task_members_task_id ON public.task_members(task_id);
CREATE INDEX idx_task_members_user_id ON public.task_members(user_id);
CREATE INDEX idx_task_checklist_task_id ON public.task_checklist_items(task_id);
CREATE INDEX idx_task_comments_task_id ON public.task_comments(task_id);
CREATE INDEX idx_task_activities_task_id ON public.task_activities(task_id);
