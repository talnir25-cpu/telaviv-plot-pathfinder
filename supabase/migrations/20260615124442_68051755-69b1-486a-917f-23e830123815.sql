
-- Wipe existing test rows (no auth before this change)
DELETE FROM public.analysis_jobs;

-- Add user_id, required for all new jobs
ALTER TABLE public.analysis_jobs
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX analysis_jobs_user_id_idx ON public.analysis_jobs(user_id);

-- Drop old permissive policy
DROP POLICY IF EXISTS "Anyone can read analysis jobs" ON public.analysis_jobs;

-- Remove anonymous Data API access; only authenticated + service_role
REVOKE ALL ON public.analysis_jobs FROM anon;
GRANT SELECT ON public.analysis_jobs TO authenticated;
GRANT ALL ON public.analysis_jobs TO service_role;

-- Owners can read their own jobs (covers Realtime row visibility as well)
CREATE POLICY "Users can read their own analysis jobs"
  ON public.analysis_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
