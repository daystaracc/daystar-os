-- =====================================================================
-- DAYSTAR OS — fix infinite recursion in the tasks UPDATE policy  (0004)
--
-- Symptom: every UPDATE on public.tasks fails for every role with
--   42P17: infinite recursion detected in policy for relation "tasks"
-- so no task can change status, be completed, or be edited.
--
-- Cause: a policy cycle between two tables.
--   tasks_update        USING ... exists (select 1 from public.task_assignees ...)
--   task_assignees_all  USING     exists (select 1 from public.tasks ...)
-- Postgres expands tasks -> task_assignees -> tasks and refuses to plan it.
--
-- Fix: read task_assignees through a security-definer helper, exactly as the
-- role checks already do. The function runs with the owner's rights, so RLS on
-- task_assignees is not re-entered and the cycle disappears. The rule itself is
-- unchanged: managers and founders may edit any task; everyone else may edit the
-- tasks they own, are assigned (either column), or created.
-- =====================================================================

create or replace function public.is_task_assignee(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.task_assignees ta
     where ta.task_id = t and ta.profile_id = auth.uid()
  )
$$;

grant execute on function public.is_task_assignee(uuid) to authenticated;

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update
  using (
    public.is_manager_or_above(organization_id)
    or owner_id = auth.uid()
    or assignee_id = auth.uid()
    or created_by = auth.uid()
    or public.is_task_assignee(id)
  )
  with check (public.is_member(organization_id));
