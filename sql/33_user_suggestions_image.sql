-- Print / imagem anexada nas sugestões.
ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS image_path TEXT;

ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS image_name TEXT;
