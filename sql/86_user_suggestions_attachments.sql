-- Múltiplos anexos em sugestões / pedidos de módulo

ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS file_attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS image_attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Compatibilidade: popular a partir dos campos únicos existentes
UPDATE public.user_suggestions
SET file_attachments = jsonb_build_array(
  jsonb_build_object('path', file_path, 'name', COALESCE(file_name, 'arquivo'))
)
WHERE file_path IS NOT NULL
  AND file_path <> ''
  AND (file_attachments IS NULL OR file_attachments = '[]'::jsonb);

UPDATE public.user_suggestions
SET image_attachments = jsonb_build_array(
  jsonb_build_object('path', image_path, 'name', COALESCE(image_name, 'print.png'))
)
WHERE image_path IS NOT NULL
  AND image_path <> ''
  AND (image_attachments IS NULL OR image_attachments = '[]'::jsonb);
