# 🍏 Guia Completo de Integração com o Supabase (PostgreSQL)
### Sistema iLion Apple Specialist | CRM, Estoque Serializado & Trade-In

Este documento explica em detalhes **tudo o que você precisa criar do lado do banco de dados (Supabase)** e como conectar sua aplicação web à nuvem em poucos minutos.

---

## 1. O que precisa ser criado no Supabase?

Toda a arquitetura relacional de dados da loja já está estruturada no arquivo **`supabase_schema.sql`** presente na pasta do projeto. 

Ela cria no seu banco de dados PostgreSQL:

### A. Tabelas Principais (com Chaves Primárias UUID e Integridade Referencial)
1. **`clientes`**:
   - Cadastro completo (Nome, WhatsApp, E-mail, CPF, Endereço).
   - Rastreamento ativo: armazena qual o `aparelho_atual_descricao` que o cliente está utilizando no momento para facilitar o ciclo de troca/upgrade.
2. **`dispositivos` (Estoque Serializado)**:
   - Cada aparelho é uma entidade individual (nunca quantidade genérica).
   - Tipo (`iPhone`, `MacBook`, `iPad`, `Apple Watch`, `Acessorio`).
   - Modelo, Capacidade (ex: 256GB), Cor (ex: Titânio Natural).
   - Identificador único com restrição de unicidade (`IMEI` ou `Serial`).
   - Saúde da Bateria (`%`) e Ciclos de Carga (para MacBooks).
   - Grau estético (`Novo Lacrado`, `Grau A+ Impecável`, `Grau A`, `Grau B`, `Grau C`).
   - **`checklist_tecnico` (JSONB)**: Face ID/Touch ID, Tela original, Bateria original, True Tone, Carcaça, Câmeras, Som, Conectividade.
   - Status (`Em Estoque`, `Reservado`, `Vendido`, `Em Manutenção/Revisão`).
   - Custos e Precificação: Custo de compra, Custos adicionais (película, cabo, caixa, revisão), Preço sugerido, Preço mínimo, Custo total calculado.
3. **`pedidos_venda`**:
   - Número do pedido gerado, cliente, data, valor subtotal, desconto concedido, valor de abatimento por Trade-in, valor total líquido.
   - Prazo de garantia concedido pela loja (90 dias, 6 meses, 1 ano) e data exata de vencimento.
   - Cálculo automático de lucro bruto e margem líquida da venda.
4. **`itens_venda`**:
   - Vínculo n-para-n entre o pedido e os dispositivos vendidos.
5. **`trocas_trade_in`**:
   - Registro detalhado da entrada de aparelhos usados como base de troca.
   - Valor avaliado pela loja.
   - Texto jurídico do **Termo de Declaração, Compra e Cessão de Aparelho Usado** com declaração de procedência lícita (salvaguarda legal contra receptação culposa/dolosa).
6. **`interacoes_crm`**:
   - Funil de Vendas Kanban: `Novo Contato` ➔ `Em Negociação` ➔ `Aguardando Aparelho/Trade-in` ➔ `Aprovado/Fechado` ➔ `Perdido`.
   - Canal de origem (WhatsApp, Instagram, etc.), aparelho de interesse e agendamento de follow-up.
7. **`encomendas_desejos` (Lista de Espera / Smart Matching)**:
   - Registro do que o cliente procura (modelo, capacidade, cor e teto de orçamento).
   - Status de correspondência com o estoque.

---

### B. Triggers e Funções Automatizadas no Banco
* **`trg_dispositivo_vendido`**: Assim que uma venda é registrada em `itens_venda`, o status do aparelho em `dispositivos` é automaticamente alterado para **`Vendido`**.
* **`trg_fechamento_pedido`**: Atualiza a data final da garantia e atualiza automaticamente o campo `aparelho_atual_descricao` no cadastro do cliente comprador.
* **`trg_matching_encomendas`**: Sempre que um aparelho entra em estoque (seja por compra nova ou por Trade-in aprovado), o banco pesquisa encomendas pendentes com aquele modelo e teto de preço e marca a encomenda como **`Compatível Encontrado`**.

---

### C. Views de Inteligência de Negócio
* **`vw_resumo_estoque`**: Agrupa o estoque por tipo e grau, calculando o total de unidades, capital total investido e lucro projetado.
* **`vw_alertas_pos_venda`**: Identifica automaticamente clientes com garantia vencendo nos próximos 15 dias e clientes cujo tempo de compra atingiu a janela de 10 a 14 meses (momento do **Ciclo de Upgrade / Recompra**).

---

## 2. Passo a Passo para Criar no Supabase

1. Acesse **[supabase.com](https://supabase.com)** e faça login ou crie uma conta gratuita.
2. Clique em **"New Project"**, dê um nome (ex: `ilion-apple-store`), defina uma senha segura para o banco e selecione a região mais próxima (ex: *São Paulo - South America*).
3. No menu lateral esquerdo do Supabase, clique no ícone **SQL Editor** (ou pressione a tecla de atalho).
4. Abra o arquivo **`supabase_schema.sql`** que está na pasta deste projeto, copie todo o seu conteúdo e cole no SQL Editor do Supabase.
5. Clique no botão verde **Run** (Executar). Em menos de 2 segundos todas as tabelas, índices, triggers, views e políticas de RLS estarão criadas!
6. *(Opcional)* Se desejar dados de demonstração (iPhones 15 Pro Max, MacBooks M2/M3, clientes e pedidos), copie e execute também o arquivo **`supabase_seed.sql`**.

---

## 3. Onde pegar as Chaves e Conectar no Sistema?

1. No painel do Supabase, clique no ícone de engrenagem **Project Settings** no canto inferior esquerdo.
2. Acesse a aba **API**.
3. Copie os seguintes valores:
   - **Project URL** (ex: `https://xyzprojectid.supabase.co`)
   - **Project API Keys** ➔ copie a chave **`anon` `public`** (chave pública de cliente)
4. Abra o seu sistema web (que já está rodando localmente) e clique na aba **"Banco Supabase"** na barra lateral.
5. Cole a **URL** e a **Anon Key** nos campos correspondentes e clique em **"Salvar Credenciais"**.
6. Clique em **"Testar Conexão"** e pronto! Sua aplicação estará comunicando diretamente com o Supabase.

> **Nota:** O sistema possui arquitetura de tolerância a falhas. Mesmo sem o Supabase configurado, ele opera 100% de forma local, offline e independente utilizando o banco de dados SQLite nativo embutido no servidor Python!
