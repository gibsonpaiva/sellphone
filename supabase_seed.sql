-- ==============================================================================
-- DADOS INICIAIS (SEED) PARA DEMONSTRAÇÃO E TESTES NO SUPABASE
-- ==============================================================================

-- 1. Inserir Clientes de Demonstração
INSERT INTO clientes (id, nome, telefone_whatsapp, email, cpf_documento, endereco, aparelho_atual_descricao, observacoes)
VALUES
('a1111111-1111-1111-1111-111111111111', 'Lucas Andrade Silva', '5511998765432', 'lucas.andrade@email.com', '345.892.128-40', 'Av. Paulista, 1000 - Bela Vista, SP', 'iPhone 13 128GB Azul', 'Cliente focado em troca anual de iPhone'),
('a2222222-2222-2222-2222-222222222222', 'Mariana Costa Ferreira', '5521987654321', 'mariana.costa@email.com', '456.123.789-99', 'Rua Visconde de Pirajá, 350 - Ipanema, RJ', 'iPhone 14 Pro 128GB Roxo', 'Interessada no iPhone 15 Pro Max Titânio Natural'),
('a3333333-3333-3333-3333-333333333333', 'Rafael Guimarães Mendes', '5531991234567', 'rafael.gm@email.com', '789.654.123-22', 'Rua dos Inconfidentes, 800 - Savassi, MG', 'MacBook Air M1 256GB Cinza Espacial', 'Programador, quer upgrade para MacBook Pro M3'),
('a4444444-4444-4444-4444-444444444444', 'Beatriz Nogueira Lima', '5541999887766', 'beatriz.nl@email.com', '123.987.456-11', 'Av. Sete de Setembro, 2400 - Batel, PR', 'iPhone 12 Pro 256GB Dourado', 'Aguardando oportunidade com bateria acima de 90%')
ON CONFLICT (id) DO NOTHING;

-- 2. Inserir Dispositivos Serializados (Estoque)
INSERT INTO dispositivos (id, tipo, modelo, capacidade, cor, identificador_tipo, identificador_valor, saude_bateria, ciclos_bateria, condicao_grau, checklist_tecnico, status, custo_compra, custos_adicionais, preco_sugerido, preco_minimo, origem, notas_tecnicas)
VALUES
(
    'b1111111-1111-1111-1111-111111111111',
    'iPhone',
    'iPhone 15 Pro Max',
    '256GB',
    'Titânio Natural',
    'IMEI',
    '352984110293841',
    96,
    NULL,
    'Grau A+ (Impecável)',
    '{"face_touch_id": true, "tela_original": true, "bateria_original": true, "true_tone": true, "carcaca_sem_trincas": true, "cameras_ok": true, "som_microfone_ok": true, "conectividade_ok": true}'::jsonb,
    'Em Estoque',
    4600.00,
    120.00,
    5890.00,
    5650.00,
    'Compra Fornecedor',
    'Aparelho em estado de zero, acompanha caixa original e cabo trançado.'
),
(
    'b2222222-2222-2222-2222-222222222222',
    'iPhone',
    'iPhone 14 Pro',
    '128GB',
    'Roxo-profundo',
    'IMEI',
    '354921098451203',
    88,
    NULL,
    'Grau A (Excelente)',
    '{"face_touch_id": true, "tela_original": true, "bateria_original": true, "true_tone": true, "carcaca_sem_trincas": true, "cameras_ok": true, "som_microfone_ok": true, "conectividade_ok": true}'::jsonb,
    'Em Estoque',
    3400.00,
    80.00,
    4390.00,
    4200.00,
    'Trade-In / Troca',
    'Entrou em troca com cliente anterior. Testes de estresse 100% aprovados.'
),
(
    'b3333333-3333-3333-3333-333333333333',
    'MacBook',
    'MacBook Air M2',
    '512GB',
    'Estelar',
    'Serial',
    'C02K9876Q05D',
    98,
    42,
    'Grau A+ (Impecável)',
    '{"face_touch_id": true, "tela_original": true, "bateria_original": true, "true_tone": true, "carcaca_sem_trincas": true, "cameras_ok": true, "som_microfone_ok": true, "conectividade_ok": true}'::jsonb,
    'Em Estoque',
    5200.00,
    150.00,
    6790.00,
    6400.00,
    'Compra Fornecedor',
    'Apenas 42 ciclos de bateria. Carregador MagSafe original 35W incluso.'
),
(
    'b4444444-4444-4444-4444-444444444444',
    'iPhone',
    'iPhone 13',
    '128GB',
    'Meia-noite',
    'IMEI',
    '358741092837461',
    84,
    NULL,
    'Grau B (Leves marcas)',
    '{"face_touch_id": true, "tela_original": true, "bateria_original": true, "true_tone": true, "carcaca_sem_trincas": true, "cameras_ok": true, "som_microfone_ok": true, "conectividade_ok": true}'::jsonb,
    'Em Estoque',
    2100.00,
    70.00,
    2990.00,
    2850.00,
    'Trade-In / Troca',
    'Micro marcas na borda de alumínio quase imperceptíveis com capa.'
),
(
    'b5555555-5555-5555-5555-555555555555',
    'Apple Watch',
    'Apple Watch Ultra 2',
    '64GB',
    'Titânio Natural',
    'Serial',
    'G9HKL34M2P10',
    100,
    NULL,
    'Novo Lacrado',
    '{"face_touch_id": true, "tela_original": true, "bateria_original": true, "true_tone": true, "carcaca_sem_trincas": true, "cameras_ok": true, "som_microfone_ok": true, "conectividade_ok": true}'::jsonb,
    'Em Estoque',
    4100.00,
    0.00,
    5290.00,
    5000.00,
    'Compra Fornecedor',
    'Produto Lacrado com 1 ano de garantia mundial Apple.'
),
(
    'b6666666-6666-6666-6666-666666666666',
    'iPhone',
    'iPhone 15',
    '128GB',
    'Preto',
    'IMEI',
    '359871234901823',
    100,
    NULL,
    'Novo Lacrado',
    '{"face_touch_id": true, "tela_original": true, "bateria_original": true, "true_tone": true, "carcaca_sem_trincas": true, "cameras_ok": true, "som_microfone_ok": true, "conectividade_ok": true}'::jsonb,
    'Reservado',
    3800.00,
    50.00,
    4790.00,
    4600.00,
    'Compra Fornecedor',
    'Reservado para cliente com sinal.'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Inserir Encomendas na Lista de Espera (para testar o matching inteligente)
INSERT INTO encomendas_desejos (id, cliente_id, modelo_desejado, capacidade_preferida, cor_preferida, orcamento_maximo, status, dispositivo_compativel_id)
VALUES
(
    'c1111111-1111-1111-1111-111111111111',
    'a2222222-2222-2222-2222-222222222222',
    'iPhone 15 Pro Max',
    '256GB',
    'Titânio Natural',
    6000.00,
    'Compatível Encontrado',
    'b1111111-1111-1111-1111-111111111111'
),
(
    'c2222222-2222-2222-2222-222222222222',
    'a4444444-4444-4444-4444-444444444444',
    'iPhone 14 Pro',
    '128GB',
    'Dourado ou Roxo',
    4500.00,
    'Compatível Encontrado',
    'b2222222-2222-2222-2222-222222222222'
)
ON CONFLICT (id) DO NOTHING;

-- 4. Inserir CRM Leads
INSERT INTO interacoes_crm (id, cliente_id, etapa_funil, dispositivo_interesse_modelo, canal, notas, data_proximo_contato)
VALUES
('d1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Aguardando Aparelho/Trade-in', 'iPhone 15 Pro Max', 'WhatsApp', 'Cliente vai trazer o iPhone 13 128GB para avaliação presencial amanhã às 14h.', CURRENT_DATE + 1),
('d2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'Em Negociação', 'iPhone 15 Pro Max 256GB', 'WhatsApp', 'Aguardando aprovação de limite no cartão de crédito.', CURRENT_DATE + 2),
('d3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', 'Novo Contato', 'MacBook Pro M3', 'Instagram', 'Pediu cotação para MacBook Pro de 14 polegadas.', CURRENT_DATE + 1)
ON CONFLICT (id) DO NOTHING;
