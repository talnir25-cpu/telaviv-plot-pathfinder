DROP POLICY IF EXISTS "Anyone can insert plot units cache" ON public.plot_units_cache;
DROP POLICY IF EXISTS "Anyone can update plot units cache" ON public.plot_units_cache;
REVOKE INSERT, UPDATE, DELETE ON public.plot_units_cache FROM anon, authenticated;