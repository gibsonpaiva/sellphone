# 🦁 iLion Apple Specialist | Sistema Integrado de Gestão
### CRM, Controle de Estoque Serializado, PDV com Trade-In & Pós-Venda

Aplicação web completa, responsiva (desktop e mobile) desenvolvida sob medida para o nicho de compra, venda e revenda de iPhones, MacBooks, iPads, Apple Watches e dispositivos Apple novos e seminovos.

---

## 🚀 Como Executar o Projeto em 1 Clique (Entregável 4)

Você tem **3 formas simples** de rodar o sistema. O servidor iniciará e **abrirá o navegador automaticamente**:

### Opção 1: Clique Duplo no Finder do macOS (Mais fácil)
* No seu Finder (gerenciador de arquivos do Mac), basta dar um **duplo clique no arquivo `iniciar.command`**.
* O Terminal abrirá e seu navegador (Chrome ou Safari) será aberto automaticamente na página do sistema em `http://localhost:8000`.

### Opção 2: Pelo Terminal via Python 3 (Nativo)
```bash
python3 iniciar.py
```

### Opção 3: Pelo Terminal via Shell Script
```bash
./iniciar.sh
```

*(Não é necessário instalar Node.js, npm ou dependências externas! O sistema roda 100% nativo com o Python 3 padrão do macOS).*

---

## 📦 Estrutura dos Arquivos do Projeto

* 🦁 **`leao.jpg`**: Logotipo oficial da marca integrado ao cabeçalho da loja, barra lateral e aos documentos oficiais (Recibo de Venda, Termo de Garantia e Termo de Cessão de Trade-In).
* 🌐 **`index.html`**: Interface moderna com design Apple Dark Mode, efeitos de vidro (glassmorphism), tipografia fluida e componentes responsivos.
* 🎨 **`style.css`**: Design system com cores Apple (Azul Meia-noite `#191970`, Azul Elétrico `#0071E3`, Verde Bateria `#10B981`) e regras otimizadas para impressão em papel A4 e geração de PDF.
* ⚡ **`app.js`**: Motor da aplicação front-end: busca global em tempo real (IMEI/Serial/Nome), motor de matching da lista de espera, simulador de vendas e gerador de mensagens do WhatsApp.
* 🐍 **`server.py`**: Servidor nativo Python 3 com API REST e banco de dados SQLite embutido para persistência local automática.
* 🚀 **`iniciar.command`** / **`iniciar.py`** / **`iniciar.sh`**: Scripts executáveis que inicializam o servidor e abrem o navegador instantaneamente.
* 🗄️ **`supabase_schema.sql`**: Script de migração para PostgreSQL / Supabase com todas as tabelas (UUID), chaves estrangeiras, triggers automáticos, views de inteligência e políticas RLS.
* 🌱 **`supabase_seed.sql`**: Dados de demonstração realistas com estoque de iPhones 15 Pro Max, MacBooks M2/M3, clientes e pedidos.
* 📖 **`INSTRUCOES_SUPABASE.md`**: Tutorial detalhado de como criar e conectar o banco Supabase na nuvem.

---

## 🛠️ Funcionalidades e Módulos Implementados

### 1. Estoque Serializado (Rastreamento por Aparelho Único)
* **Entidade única por item**: Nunca quantidade genérica. Cada aparelho possui seu identificador próprio (IMEI de 15 dígitos ou Número de Série alfanumérico).
* **Saúde da Bateria Dinâmica**: Indicador visual inteligente (% em verde para ≥85%, amarelo para 80-84% e vermelho para <80% com recomendação de troca; contagem de ciclos para MacBooks).
* **Grau Estético**: Novo Lacrado, Grau A+ (Impecável), Grau A (Excelente), Grau B (Leves marcas) e Grau C.
* **Checklist Técnico de Entrada**: Face ID/Touch ID, Tela original, Bateria original, True Tone, Carcaça sem trincas, Câmeras e Foco, Áudio/Microfone e Conectividade.
* **Precificação e Margem**: Custo de aquisição + custos extras de revisão/acessórios = Custo Base. Cálculo automático de lucro bruto projetado e margem percentual em tempo real.

### 2. Trade-In (Aparelho na Troca no Ponto de Venda)
* **Simulador Ágil de Checkout**:
  1. Seleção do aparelho vendido e do cliente.
  2. Toggle inteligente para entrada de aparelho usado na troca.
  3. Cadastro express do aparelho recebido com IMEI, bateria, grau estético e valor avaliado.
  4. Abatimento automático do crédito no total a pagar pelo cliente.
  5. Entrada automática do item no estoque (como "Em Manutenção/Revisão") tendo o custo de aquisição igual ao valor de avaliação.
  6. **Termo de Declaração, Compra e Cessão**: Emissão automática com cláusula jurídica anti-receptação (Arts. 180 e 299 do Código Penal) e campos de assinatura.

### 3. CRM & Pipeline de Vendas
* **Kanban com 5 Etapas**: `Novo Contato` ➔ `Em Negociação` ➔ `Aguardando Aparelho/Trade-in` ➔ `Aprovado/Fechado` ➔ `Perdido`.
* **Lista de Espera com Smart Matching**: Cadastro de encomendas de clientes (ex: "Mariana procura iPhone 15 Pro Max 256GB até R$ 6.000"). Quando um aparelho correspondente entra no estoque, o sistema gera um alerta visual destacado de **MATCH ENCONTRADO** com botão direto para avisar o cliente no WhatsApp.

### 4. Pós-Venda, Garantia & Ciclo de Recompra
* **Garantia da Loja**: Prazos de 90 dias balcão, 6 meses ou 1 ano.
* **Alerta Pró-ativo de Garantia**: Avisa sobre garantias a vencer nos próximos 15 dias para realização de pesquisa de satisfação aos ~80 dias.
* **Radar do Ciclo de Upgrade (10 a 12 meses)**: Identifica clientes cuja última compra atingiu a janela de 10-12 meses para oferecer proposta de recompra/upgrade pelo modelo mais novo da Apple.

### 5. Documentos, Recibos & WhatsApp
* **Recibo de Venda Oficial**: Contém a marca do Leão (`leao.jpg`), dados da loja, dados do comprador, especificações do aparelho, IMEI, valores pagos, Trade-in abatido e garantia.
* **Termo de Garantia Apple Especializada**: Regras claras de cobertura de placa lógica e componentes internos, com exclusão expressa de contato com líquidos/umidade e quedas.
* **1-Clique WhatsApp**: Envio de mensagens formatadas com emojis, resumo do pedido, IMEI e garantia.

---

## 🔒 Integração com Supabase (PostgreSQL)

O sistema possui integração pronta para operar em nuvem com o **Supabase**:
1. Execute o script `supabase_schema.sql` no SQL Editor do Supabase.
2. Acesse a aba **"Banco Supabase"** no painel da aplicação e insira sua `Project URL` e `Anon Public Key`.
3. Veja o arquivo [`INSTRUCOES_SUPABASE.md`](INSTRUCOES_SUPABASE.md) para detalhes passo a passo.
