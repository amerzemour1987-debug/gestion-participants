-- Add optional start_time and end_time columns to rooms table
ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
