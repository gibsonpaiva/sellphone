-- ==============================================================================
-- SISTEMA DE GESTÃO APPLE (CRM, ESTOQUE SERIALIZADO, TRADE-IN E PÓS-VENDA)
-- Script de Migração PostgreSQL / Supabase
-- ==============================================================================

-- 1. Habilitar extensão pgcrypto para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- TABELA: CLIENTES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    telefone_whatsapp VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    cpf_documento VARCHAR(20),
    endereco TEXT,
    aparelho_atual_descricao VARCHAR(255),
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABELA: DISPOSITIVOS (Estoque Serializado - Cada item é uma entidade única)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS dispositivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('iPhone', 'MacBook', 'iPad', 'Apple Watch', 'Acessorio')),
    modelo VARCHAR(150) NOT NULL,
    capacidade VARCHAR(50) NOT NULL,
    cor VARCHAR(100) NOT NULL,
    identificador_tipo VARCHAR(20) NOT NULL CHECK (identificador_tipo IN ('IMEI', 'Serial')),
    identificador_valor VARCHAR(100) NOT NULL,
    saude_bateria INTEGER CHECK (saude_bateria >= 0 AND saude_bateria <= 100),
    ciclos_bateria INTEGER DEFAULT NULL,
    condicao_grau VARCHAR(50) NOT NULL CHECK (condicao_grau IN ('Novo Lacrado', 'Grau A+ (Impecável)', 'Grau A (Excelente)', 'Grau B (Leves marcas)', 'Grau C (Sinais visíveis)')),
    
    -- Checklist técnico de entrada em formato JSONB
    checklist_tecnico JSONB NOT NULL DEFAULT '{
        "face_touch_id": true,
        "tela_original": true,
        "bateria_original": true,
        "true_tone": true,
        "carcaca_sem_trincas": true,
        "cameras_ok": true,
        "som_microfone_ok": true,
        "conectividade_ok": true
    }'::jsonb,
    
    status VARCHAR(50) NOT NULL DEFAULT 'Em Estoque' CHECK (status IN ('Em Estoque', 'Reservado', 'Vendido', 'Em Manutenção/Revisão')),
    
    -- Custos e Precificação
    custo_compra NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    custos_adicionais NUMERIC(10, 2) NOT NULL DEFAULT 0.00, -- Película, cabo, caixa, revisão
    custo_total NUMERIC(10, 2) GENERATED ALWAYS AS (custo_compra + custos_adicionais) STORED,
    preco_sugerido NUMERIC(10, 2) NOT NULL,
    preco_minimo NUMERIC(10, 2) NOT NULL,
    
    origem VARCHAR(50) NOT NULL DEFAULT 'Compra Fornecedor' CHECK (origem IN ('Compra Fornecedor', 'Trade-In / Troca', 'Consignado')),
    cliente_origem_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    fotos_urls TEXT[] DEFAULT '{}',
    notas_tecnicas TEXT,
    data_entrada TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABELA: PEDIDOS_VENDA (Transações de Venda com ou sem Trade-In)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS pedidos_venda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_pedido VARCHAR(50) UNIQUE NOT NULL,
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    data_venda TIMESTAMPTZ DEFAULT NOW(),
    
    valor_subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    desconto NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    valor_trade_in NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    valor_total_liquido NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    
    forma_pagamento VARCHAR(100) NOT NULL, -- 'PIX', 'Cartão 12x', 'Cartão + PIX', 'Dinheiro'
    meses_garantia INTEGER NOT NULL DEFAULT 3, -- 3 meses (90 dias), 6 meses, 12 meses
    garantia_ate DATE,
    
    custo_total_venda NUMERIC(10, 2) DEFAULT 0.00,
    lucro_bruto NUMERIC(10, 2) DEFAULT 0.00,
    margem_percentual NUMERIC(5, 2) DEFAULT 0.00,
    
    status VARCHAR(50) NOT NULL DEFAULT 'Concluída' CHECK (status IN ('Concluída', 'Pendente', 'Cancelada')),
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABELA: ITENS_VENDA (Aparelhos vendidos em cada pedido)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS itens_venda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID NOT NULL REFERENCES pedidos_venda(id) ON DELETE CASCADE,
    dispositivo_id UUID NOT NULL REFERENCES dispositivos(id) ON DELETE RESTRICT,
    valor_unitario NUMERIC(10, 2) NOT NULL,
    custo_aquisicao NUMERIC(10, 2) NOT NULL,
    lucro_item NUMERIC(10, 2) GENERATED ALWAYS AS (valor_unitario - custo_aquisicao) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABELA: TROCAS_TRADE_IN (Registro específico de Trade-in no PDV)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS trocas_trade_in (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID REFERENCES pedidos_venda(id) ON DELETE SET NULL,
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    dispositivo_entrada_id UUID NOT NULL REFERENCES dispositivos(id) ON DELETE RESTRICT,
    
    valor_avaliado NUMERIC(10, 2) NOT NULL,
    termo_cessao_aceito BOOLEAN DEFAULT TRUE,
    termo_texto TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'Aprovado' CHECK (status IN ('Aprovado', 'Em Revisão', 'Recusado')),
    data_troca TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABELA: INTERACOES_CRM (Funil de Vendas e Acompanhamento)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS interacoes_crm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    etapa_funil VARCHAR(50) NOT NULL DEFAULT 'Novo Contato' CHECK (
        etapa_funil IN ('Novo Contato', 'Em Negociação', 'Aguardando Aparelho/Trade-in', 'Aprovado/Fechado', 'Perdido')
    ),
    dispositivo_interesse_modelo VARCHAR(150),
    canal VARCHAR(50) DEFAULT 'WhatsApp' CHECK (canal IN ('WhatsApp', 'Instagram', 'Presencial', 'Telefone', 'Indicação')),
    notas TEXT,
    data_proximo_contato DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABELA: ENCOMENDAS_DESEJOS (Lista de Espera / Matching Inteligente)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS encomendas_desejos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    modelo_desejado VARCHAR(150) NOT NULL,
    capacidade_preferida VARCHAR(50),
    cor_preferida VARCHAR(100),
    orcamento_maximo NUMERIC(10, 2),
    status VARCHAR(50) NOT NULL DEFAULT 'Aguardando' CHECK (status IN ('Aguardando', 'Compatível Encontrado', 'Atendido', 'Cancelado')),
    dispositivo_compativel_id UUID REFERENCES dispositivos(id) ON DELETE SET NULL,
    notificado_cliente BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- ÍNDICES PARA CONSULTA INSTANTÂNEA E ALTA PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_dispositivos_identificador ON dispositivos(identificador_valor);
CREATE INDEX IF NOT EXISTS idx_dispositivos_status ON dispositivos(status);
CREATE INDEX IF NOT EXISTS idx_dispositivos_modelo ON dispositivos(modelo);
CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone_whatsapp);
CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf_documento);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos_venda(cliente_id);
CREATE INDEX IF NOT EXISTS idx_encomendas_status ON encomendas_desejos(status);

-- ==============================================================================
-- TRIGGERS E FUNÇÕES AUTOMÁTICAS
-- ==============================================================================

-- 1. Trigger: Ao inserir item na venda, marcar dispositivo como 'Vendido'
CREATE OR REPLACE FUNCTION fn_marcar_dispositivo_vendido()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE dispositivos
    SET status = 'Vendido',
        updated_at = NOW()
    WHERE id = NEW.dispositivo_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dispositivo_vendido ON itens_venda;
CREATE TRIGGER trg_dispositivo_vendido
AFTER INSERT ON itens_venda
FOR EACH ROW
EXECUTE FUNCTION fn_marcar_dispositivo_vendido();

-- 2. Trigger: Atualizar aparelho atual do cliente e data de garantia no pedido
CREATE OR REPLACE FUNCTION fn_processar_fechamento_pedido()
RETURNS TRIGGER AS $$
DECLARE
    v_primeiro_disp_nome VARCHAR(255);
BEGIN
    -- Calcula a data final da garantia com base no número de meses
    NEW.garantia_ate := (NEW.data_venda + (NEW.meses_garantia || ' months')::INTERVAL)::DATE;
    
    -- Busca modelo do primeiro item para vincular ao cliente
    SELECT modelo || ' ' || capacidade INTO v_primeiro_disp_nome
    FROM itens_venda iv
    JOIN dispositivos d ON d.id = iv.dispositivo_id
    WHERE iv.pedido_id = NEW.id
    LIMIT 1;

    IF v_primeiro_disp_nome IS NOT NULL THEN
        UPDATE clientes
        SET aparelho_atual_descricao = v_primeiro_disp_nome,
            updated_at = NOW()
        WHERE id = NEW.cliente_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fechamento_pedido ON pedidos_venda;
CREATE TRIGGER trg_fechamento_pedido
BEFORE INSERT OR UPDATE OF data_venda, meses_garantia ON pedidos_venda
FOR EACH ROW
EXECUTE FUNCTION fn_processar_fechamento_pedido();

-- 3. Trigger: Matching Inteligente de Encomendas ao entrar novo aparelho no estoque
CREATE OR REPLACE FUNCTION fn_matching_encomendas_estoque()
RETURNS TRIGGER AS $$
BEGIN
    -- Se o dispositivo entrou em estoque
    IF NEW.status = 'Em Estoque' THEN
        UPDATE encomendas_desejos
        SET status = 'Compatível Encontrado',
            dispositivo_compativel_id = NEW.id,
            updated_at = NOW()
        WHERE status = 'Aguardando'
          AND LOWER(modelo_desejado) = LOWER(NEW.modelo)
          AND (orcamento_maximo IS NULL OR orcamento_maximo >= NEW.preco_sugerido);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_matching_encomendas ON dispositivos;
CREATE TRIGGER trg_matching_encomendas
AFTER INSERT OR UPDATE OF status, preco_sugerido ON dispositivos
FOR EACH ROW
EXECUTE FUNCTION fn_matching_encomendas_estoque();

-- ==============================================================================
-- VIEWS DE NEGÓCIO E RELATÓRIOS INTELIGENTES
-- ==============================================================================

-- View: Resumo do Estoque por Categoria e Grau
CREATE OR REPLACE VIEW vw_resumo_estoque AS
SELECT 
    tipo,
    condicao_grau,
    COUNT(*) as total_unidades,
    SUM(custo_compra + custos_adicionais) as capital_investido,
    SUM(preco_sugerido) as valor_venda_projetado,
    SUM(preco_sugerido - (custo_compra + custos_adicionais)) as lucro_bruto_projetado
FROM dispositivos
WHERE status = 'Em Estoque'
GROUP BY tipo, condicao_grau;

-- View: Alertas de Pós-Venda (Garantias Vencendo e Ciclos de Recompra 10-12 meses)
CREATE OR REPLACE VIEW vw_alertas_pos_venda AS
SELECT 
    p.id as pedido_id,
    p.numero_pedido,
    c.id as cliente_id,
    c.nome as cliente_nome,
    c.telefone_whatsapp,
    c.aparelho_atual_descricao,
    p.data_venda,
    p.garantia_ate,
    CURRENT_DATE as data_atual,
    (p.garantia_ate - CURRENT_DATE) as dias_restantes_garantia,
    ROUND(EXTRACT(DAY FROM (NOW() - p.data_venda)) / 30.41) as meses_desde_compra,
    CASE 
        WHEN p.garantia_ate >= CURRENT_DATE AND (p.garantia_ate - CURRENT_DATE) <= 15 THEN 'Garantia Vencendo'
        WHEN p.garantia_ate < CURRENT_DATE THEN 'Garantia Expirada'
        ELSE 'Garantia Válida'
    END as status_garantia,
    CASE 
        WHEN ROUND(EXTRACT(DAY FROM (NOW() - p.data_venda)) / 30.41) BETWEEN 10 AND 14 THEN 'Alerta Ciclo de Troca / Upgrade'
        ELSE 'Normal'
    END as status_ciclo_recompra
FROM pedidos_venda p
JOIN clientes c ON c.id = p.cliente_id
WHERE p.status = 'Concluída';

-- ==============================================================================
-- POLÍTICAS DE ROW LEVEL SECURITY (RLS) PARA O SUPABASE
-- ==============================================================================
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispositivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE trocas_trade_in ENABLE ROW LEVEL SECURITY;
ALTER TABLE interacoes_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE encomendas_desejos ENABLE ROW LEVEL SECURITY;

-- Políticas para acesso anônimo/autenticado no painel da loja
CREATE POLICY "Permitir leitura total clientes" ON clientes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir leitura total dispositivos" ON dispositivos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir leitura total pedidos_venda" ON pedidos_venda FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir leitura total itens_venda" ON itens_venda FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir leitura total trocas_trade_in" ON trocas_trade_in FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir leitura total interacoes_crm" ON interacoes_crm FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir leitura total encomendas_desejos" ON encomendas_desejos FOR ALL USING (true) WITH CHECK (true);
