-- Store selected quantity details for diary entries added from food details flow.

alter table public.diary_entries add column if not exists quantity_type text;
alter table public.diary_entries add column if not exists total_grams double precision;
alter table public.diary_entries add column if not exists total_calories double precision;
alter table public.diary_entries add column if not exists total_protein_g double precision;
alter table public.diary_entries add column if not exists total_carbs_g double precision;
alter table public.diary_entries add column if not exists total_fat_g double precision;
