CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  focus_notes text NOT NULL DEFAULT '',
  wrap_up text NOT NULL DEFAULT '',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, shift_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own shifts" ON public.shifts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  client_name text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'America/New_York',
  domain_rules text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'mint',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own projects" ON public.projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_templates TO authenticated;
GRANT ALL ON public.workflow_templates TO service_role;
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own workflow templates" ON public.workflow_templates FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'done', 'blocked')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  planning_bucket text NOT NULL DEFAULT 'tonight' CHECK (planning_bucket IN ('tonight', 'tomorrow', 'next_7_days', 'next_30_days', 'backlog')),
  planned_date date,
  rollover boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  elapsed_seconds integer NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own tasks" ON public.tasks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.task_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_steps TO authenticated;
GRANT ALL ON public.task_steps TO service_role;
ALTER TABLE public.task_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own task steps" ON public.task_steps FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  client_name text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  agenda text NOT NULL DEFAULT '',
  dossier text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  action_items text[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'outlook')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own meetings" ON public.meetings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.shift_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  bucket_id text NOT NULL CHECK (bucket_id IN ('task-evidence', 'meeting-assets', 'shift-reports')),
  object_path text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  note text NOT NULL DEFAULT '',
  ocr_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_attachments TO authenticated;
GRANT ALL ON public.shift_attachments TO service_role;
ALTER TABLE public.shift_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own shift attachments" ON public.shift_attachments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX shifts_user_date_idx ON public.shifts (user_id, shift_date DESC);
CREATE INDEX tasks_user_bucket_date_idx ON public.tasks (user_id, planning_bucket, planned_date);
CREATE INDEX tasks_project_idx ON public.tasks (project_id);
CREATE INDEX task_steps_task_position_idx ON public.task_steps (task_id, position);
CREATE INDEX meetings_user_start_idx ON public.meetings (user_id, starts_at);
CREATE INDEX shift_attachments_task_idx ON public.shift_attachments (task_id);
CREATE INDEX shift_attachments_meeting_idx ON public.shift_attachments (meeting_id);

CREATE OR REPLACE FUNCTION public.set_night_tracker_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER shifts_set_updated_at BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.set_night_tracker_updated_at();
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_night_tracker_updated_at();
CREATE TRIGGER workflow_templates_set_updated_at BEFORE UPDATE ON public.workflow_templates FOR EACH ROW EXECUTE FUNCTION public.set_night_tracker_updated_at();
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_night_tracker_updated_at();
CREATE TRIGGER task_steps_set_updated_at BEFORE UPDATE ON public.task_steps FOR EACH ROW EXECUTE FUNCTION public.set_night_tracker_updated_at();
CREATE TRIGGER meetings_set_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.set_night_tracker_updated_at();
CREATE TRIGGER shift_attachments_set_updated_at BEFORE UPDATE ON public.shift_attachments FOR EACH ROW EXECUTE FUNCTION public.set_night_tracker_updated_at();