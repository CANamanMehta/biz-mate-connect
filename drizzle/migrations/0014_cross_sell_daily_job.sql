CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('cross-sell-daily', '30 0 * * *', $$SELECT public.generate_cross_sell_all();$$);