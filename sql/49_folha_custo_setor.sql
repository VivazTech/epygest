-- Setores de RH para custo da folha (exemplos operacionais).
-- O setor do funcionário vem de folha_funcionarios (cadastro persistente).

INSERT INTO public.sectors (name, code, active, budget_limit)
SELECT v.name, v.code, TRUE, 0
FROM (
  VALUES
    ('Lavanderia', 'LAV'),
    ('Cozinha', 'COZ'),
    ('Governança', 'GOV'),
    ('Recepção', 'REC'),
    ('Restaurante', 'RST')
) AS v(name, code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sectors s WHERE UPPER(TRIM(s.name)) = UPPER(TRIM(v.name))
);

INSERT INTO public.folha_setores (nome, codigo, ativo, updated_at)
SELECT s.name, s.code, TRUE, NOW()
FROM public.sectors s
WHERE s.code IN ('LAV', 'COZ', 'GOV', 'REC', 'RST')
  AND NOT EXISTS (
    SELECT 1 FROM public.folha_setores fs WHERE UPPER(TRIM(fs.nome)) = UPPER(TRIM(s.name))
  );
