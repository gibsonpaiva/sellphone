/**
 * ==============================================================================
 * iLION APPLE SPECIALIST - CORE APPLICATION SCRIPT (DESIGN DRIBBLE / FIGMA PRO)
 * ==============================================================================
 */

// Estado Global
const AppState = {
    dispositivos: [],
    clientes: [],
    pedidos: [],
    tradeIns: [],
    crmLeads: [],
    encomendas: [],
    dashboard: null,
    dashboardPeriodo: 'mes_atual',
    tipoFiltro: 'Todos',
    statusFiltro: 'Em Estoque',
    termoBuscaEstoque: '',
    filtroGlobal: '',
    subAbaCRM: 'kanban',
    filtroClientes: '',
    currentDocData: null,
    currentDocTab: 'recibo',
    modelos: [],
    filtroCategoriaModelo: 'Todos',
    termoBuscaModelos: '',
    fotosCadastro: [],
    galeriaAtiva: null,
    supabaseClient: null
};

// ==============================================================================
// INICIALIZAÇÃO
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    initKeyboardShortcuts();
    initDropzoneFotos();
    await checkSupabaseConfig();
    await loadAllData();
});

function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('global-search');
            if (searchInput) searchInput.focus();
        }
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.ios-modal-backdrop.active');
            if (activeModal) {
                closeModal(activeModal.id);
            }
        }
        if (e.key === 'ArrowLeft') {
            const galeriaModal = document.getElementById('modal-galeria-fotos');
            if (galeriaModal && !galeriaModal.classList.contains('hidden')) {
                navegarGaleria(-1);
            }
        }
        if (e.key === 'ArrowRight') {
            const galeriaModal = document.getElementById('modal-galeria-fotos');
            if (galeriaModal && !galeriaModal.classList.contains('hidden')) {
                navegarGaleria(1);
            }
        }
    });
}

// ==============================================================================
// NAVEGAÇÃO ENTRE ABAS & TÍTULOS DINÂMICOS
// ==============================================================================
const TabTitles = {
    dashboard: { title: "Dashboard", subtitle: "Visão integrada de estoque, faturamento e trade-ins." },
    estoque: { title: "Estoque Serializado", subtitle: "Rastreamento individual por IMEI, bateria e checklist." },
    tradein: { title: "Ponto de Venda & Trade-In", subtitle: "Entrada ágil de usados como forma de pagamento no checkout." },
    crm: { title: "CRM & Pipeline de Vendas", subtitle: "Funil de vendas simplificado com WhatsApp integrado." },
    encomendas: { title: "Lista de Espera & Encomendas", subtitle: "Alerta automático quando o aparelho desejado entra em estoque." },
    posvenda: { title: "Pós-Venda & Ciclo de Troca", subtitle: "Alertas de garantia balcão e lembrete anual de upgrade." },
    documentos: { title: "Recibos & Termos", subtitle: "Emissão de comprovantes oficiais e termos de cessão." },
    modelos: { title: "Catálogo de Produtos & Modelos", subtitle: "Padronização de modelos oficiais para seleção em todo o sistema." }
};

function switchTab(tabName) {
    const tabs = ['dashboard', 'estoque', 'tradein', 'crm', 'encomendas', 'posvenda', 'documentos', 'modelos'];
    tabs.forEach(t => {
        const viewEl = document.getElementById(`view-${t}`);
        const navEl = document.getElementById(`nav-${t}`);
        if (viewEl) {
            if (t === tabName) {
                viewEl.classList.remove('hidden');
                // Dispara animação de transição fluida do iOS
                viewEl.classList.remove('ios-view-enter');
                void viewEl.offsetWidth; // Força reflow para reiniciar a animação
                viewEl.classList.add('ios-view-enter');
            } else {
                viewEl.classList.add('hidden');
                viewEl.classList.remove('ios-view-enter');
            }
        }
        if (navEl) {
            if (t === tabName) {
                navEl.classList.add('active');
            } else {
                navEl.classList.remove('active');
            }
        }
    });

    // Atualiza cabeçalho
    if (TabTitles[tabName]) {
        document.getElementById('top-page-title').innerText = TabTitles[tabName].title;
        document.getElementById('top-page-subtitle').innerText = TabTitles[tabName].subtitle;
    }

    if (tabName === 'dashboard') renderDashboard();
    if (tabName === 'estoque') renderEstoque();
    if (tabName === 'tradein') renderTradeIns();
    if (tabName === 'crm') {
        renderCRM();
        alternarAbaCRM(AppState.subAbaCRM || 'kanban');
    }
    if (tabName === 'encomendas') renderEncomendas();
    if (tabName === 'posvenda') renderPosVenda();
    if (tabName === 'documentos') renderDocumentos();
    if (tabName === 'modelos') renderModelos();
}

function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    if (menu) menu.classList.toggle('hidden');
}

// ==============================================================================
// CARREGAMENTO DE DADOS
// ==============================================================================
async function loadAllData() {
    try {
        const [dashRes, dispRes, cliRes, pedRes, tradeRes, crmRes, encRes, modRes] = await Promise.all([
            fetch(`/api/dashboard?periodo=${AppState.dashboardPeriodo || 'mes_atual'}`).then(r => r.json()),
            fetch('/api/dispositivos').then(r => r.json()),
            fetch('/api/clientes').then(r => r.json()),
            fetch('/api/pedidos').then(r => r.json()),
            fetch('/api/trade-ins').then(r => r.json()),
            fetch('/api/crm').then(r => r.json()),
            fetch('/api/encomendas').then(r => r.json()),
            fetch('/api/modelos').then(r => r.json()).catch(() => ({ modelos: [] }))
        ]);

        AppState.dashboard = dashRes;
        AppState.dispositivos = dispRes.dispositivos || [];
        AppState.clientes = cliRes.clientes || [];
        AppState.pedidos = pedRes.pedidos || [];
        AppState.tradeIns = tradeRes.trade_ins || [];
        AppState.crmLeads = crmRes.leads || [];
        AppState.encomendas = encRes.encomendas || [];
        AppState.modelos = modRes.modelos || [];

        renderDashboard();
        renderEstoque();
        renderTradeIns();
        renderCRM();
        renderClientes();
        renderEncomendas();
        renderPosVenda();
        renderDocumentos();
        renderModelos();
        atualizarSelectsClientes();
        atualizarSelectsModelos();
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
    }
}

// ==============================================================================
// COMPONENTE: ANEL CIRCULAR DE BATERIA (INSPIRADO NA IMAGEM 2)
// ==============================================================================
function renderCircleBattery(percent, size = 44) {
    const radius = 16;
    const circumference = 2 * Math.PI * radius; // ~100.53
    const offset = circumference - (percent / 100) * circumference;

    let strokeColor = '#10b981'; // Verde padrão >= 85%
    let textColor = 'text-emerald-600';
    if (percent < 80) {
        strokeColor = '#f43f5e'; // Vermelho
        textColor = 'text-rose-600';
    } else if (percent < 85) {
        strokeColor = '#facc15'; // Amarelo
        textColor = 'text-amber-600';
    }

    return `
        <div class="relative flex items-center justify-center shrink-0" style="width: ${size}px; height: ${size}px;">
            <svg class="w-full h-full circle-progress-ring" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="${radius}" fill="none" stroke="#f1f5f9" stroke-width="3.5"/>
                <circle cx="18" cy="18" r="${radius}" fill="none" stroke="${strokeColor}" stroke-width="3.5" 
                        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
            </svg>
            <span class="absolute text-[10px] font-black ${textColor} font-mono tracking-tighter">${percent}%</span>
        </div>
    `;
}

// ==============================================================================
// ==============================================================================
// FILTROS TEMPORAIS DO DASHBOARD (HOJE, SEMANA, ESTE MÊS, MÊS PASSADO, ANO, TODOS)
// ==============================================================================
function getLabelPeriodo(periodo) {
    const labels = {
        hoje: 'Hoje',
        semana: 'Última Semana',
        mes_atual: 'Este Mês',
        mes_passado: 'Mês Passado',
        ano: 'Este Ano',
        todos: 'Todo o Período'
    };
    return labels[periodo] || 'Este Mês';
}

function filtrarPedidosPorPeriodo(pedidos, periodo) {
    if (!pedidos || !Array.isArray(pedidos)) return [];
    if (periodo === 'todos') return pedidos;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const todayDate = now.getDate();

    return pedidos.filter(p => {
        if (!p.data_venda) return false;
        const d = new Date(p.data_venda);
        if (isNaN(d.getTime())) return false;

        if (periodo === 'hoje') {
            return d.getFullYear() === currentYear && d.getMonth() === currentMonth && d.getDate() === todayDate;
        }
        if (periodo === 'semana') {
            const sevenDaysAgo = new Date(currentYear, currentMonth, todayDate - 7);
            return d >= sevenDaysAgo && d <= now;
        }
        if (periodo === 'mes_atual') {
            return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
        }
        if (periodo === 'mes_passado') {
            const targetMonth = currentMonth === 0 ? 11 : currentMonth - 1;
            const targetYear = currentMonth === 0 ? currentYear - 1 : currentYear;
            return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
        }
        if (periodo === 'ano') {
            return d.getFullYear() === currentYear;
        }
        return true;
    });
}

function filtrarTradeInsPorPeriodo(tradeIns, periodo) {
    if (!tradeIns || !Array.isArray(tradeIns)) return [];
    if (periodo === 'todos') return tradeIns;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const todayDate = now.getDate();

    return tradeIns.filter(t => {
        const dateStr = t.data_troca || t.created_at;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;

        if (periodo === 'hoje') {
            return d.getFullYear() === currentYear && d.getMonth() === currentMonth && d.getDate() === todayDate;
        }
        if (periodo === 'semana') {
            const sevenDaysAgo = new Date(currentYear, currentMonth, todayDate - 7);
            return d >= sevenDaysAgo && d <= now;
        }
        if (periodo === 'mes_atual') {
            return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
        }
        if (periodo === 'mes_passado') {
            const targetMonth = currentMonth === 0 ? 11 : currentMonth - 1;
            const targetYear = currentMonth === 0 ? currentYear - 1 : currentYear;
            return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
        }
        if (periodo === 'ano') {
            return d.getFullYear() === currentYear;
        }
        return true;
    });
}

async function setDashboardPeriodo(periodo) {
    AppState.dashboardPeriodo = periodo;

    // Atualiza estado visual das pílulas de filtro
    const tabs = ['hoje', 'semana', 'mes_atual', 'mes_passado', 'ano', 'todos'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-periodo-${t}`);
        if (btn) {
            if (t === periodo) {
                btn.classList.add('active');
                btn.classList.remove('inactive');
            } else {
                btn.classList.remove('active');
                btn.classList.add('inactive');
            }
        }
    });

    const labelPeriodo = getLabelPeriodo(periodo);

    // 1. Cálculo instantâneo no cliente com os dados já carregados na memória
    if (AppState.pedidos && AppState.tradeIns && AppState.dashboard) {
        const vendasPeriodo = filtrarPedidosPorPeriodo(AppState.pedidos, periodo);
        const tradeInsPeriodo = filtrarTradeInsPorPeriodo(AppState.tradeIns, periodo);

        const faturamento = vendasPeriodo.reduce((acc, p) => acc + (parseFloat(p.valor_total_liquido) || 0), 0);
        const lucro = vendasPeriodo.reduce((acc, p) => acc + (parseFloat(p.lucro_bruto) || 0), 0);
        const valorTradeIn = tradeInsPeriodo.reduce((acc, t) => acc + (parseFloat(t.valor_avaliado) || 0), 0);

        AppState.dashboard.vendas = {
            total_vendas: vendasPeriodo.length,
            faturamento_total: faturamento,
            lucro_total: lucro
        };
        AppState.dashboard.trade_ins = {
            total_trade_ins: tradeInsPeriodo.length,
            valor_total_trade_in: valorTradeIn
        };
        AppState.dashboard.periodo = {
            chave: periodo,
            label: labelPeriodo
        };
        renderDashboard();
    }

    // 2. Sincroniza em segundo plano com o backend SQLite
    try {
        const res = await fetch(`/api/dashboard?periodo=${periodo}`).then(r => r.json());
        if (res && res.vendas) {
            AppState.dashboard = res;
            renderDashboard();
        }
    } catch (err) {
        console.warn("Sincronização em segundo plano do dashboard:", err);
    }
}

// ==============================================================================
// VIEW 1: DASHBOARD GERAL
// ==============================================================================
function renderDashboard() {
    if (!AppState.dashboard) return;
    const { estoque, vendas, trade_ins, alertas_garantia, alertas_upgrade, matches_encomendas, periodo } = AppState.dashboard;

    // Métricas principais de estoque (tempo real)
    document.getElementById('dash-total-dispositivos').innerText = estoque.total_dispositivos || 0;
    document.getElementById('badge-total-estoque').innerText = estoque.total_dispositivos || 0;
    document.getElementById('dash-valor-venda').innerText = formatMoeda(estoque.total_valor_venda || 0);
    document.getElementById('chart-tooltip-val').innerText = formatMoeda(estoque.total_valor_venda || 0);
    
    document.getElementById('dash-capital-empatado').innerText = formatMoeda(estoque.total_investido || 0);
    document.getElementById('dash-lucro-projetado').innerText = `+${formatMoeda(estoque.total_lucro_projetado || 0)}`;

    // Período selecionado
    const currentPeriodo = (periodo && periodo.chave) ? periodo.chave : AppState.dashboardPeriodo;
    const labelPeriodo = (periodo && periodo.label) ? periodo.label : getLabelPeriodo(currentPeriodo);

    // Atualiza pílulas e badges de período
    const badgeAtivo = document.getElementById('badge-periodo-ativo');
    if (badgeAtivo) badgeAtivo.innerText = labelPeriodo;
    const labelVendas = document.getElementById('dash-periodo-vendas-label');
    if (labelVendas) labelVendas.innerText = labelPeriodo;
    const labelTradeIn = document.getElementById('dash-periodo-tradein-label');
    if (labelTradeIn) labelTradeIn.innerText = labelPeriodo;
    const tagMiniVendas = document.getElementById('dash-mini-vendas-periodo-tag');
    if (tagMiniVendas) tagMiniVendas.innerText = labelPeriodo;

    const tabs = ['hoje', 'semana', 'mes_atual', 'mes_passado', 'ano', 'todos'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-periodo-${t}`);
        if (btn) {
            if (t === currentPeriodo) {
                btn.classList.add('active');
                btn.classList.remove('inactive');
            } else {
                btn.classList.remove('active');
                btn.classList.add('inactive');
            }
        }
    });

    // Métricas financeiras e trocas do período
    document.getElementById('dash-total-tradein').innerText = trade_ins.total_trade_ins || 0;
    document.getElementById('dash-valor-tradein').innerText = formatMoeda(trade_ins.valor_total_trade_in || 0);

    document.getElementById('dash-faturamento-total').innerText = formatMoeda(vendas.faturamento_total || 0);
    document.getElementById('dash-lucro-total').innerText = `+${formatMoeda(vendas.lucro_total || 0)}`;
    const qtdVendasEl = document.getElementById('dash-qtd-vendas-periodo');
    if (qtdVendasEl) {
        qtdVendasEl.innerText = `${vendas.total_vendas || 0} ${vendas.total_vendas === 1 ? 'venda' : 'vendas'}`;
    }

    // Mini Lista Rápida de Aparelhos Recentes (Lado direito do gráfico - Imagem 1)
    const quickListEl = document.getElementById('dash-quick-stock-list');
    const ultimosDispositivos = AppState.dispositivos.filter(d => d.status === 'Em Estoque').slice(0, 4);

    if (ultimosDispositivos.length > 0) {
        quickListEl.innerHTML = ultimosDispositivos.map(d => `
            <div class="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                <div class="flex items-center gap-3">
                    ${renderCircleBattery(d.saude_bateria || 100, 40)}
                    <div>
                        <h5 class="font-bold text-xs text-slate-900">${d.modelo}</h5>
                        <p class="text-[11px] text-slate-500">${d.capacidade} &bull; ${d.cor}</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="font-black text-xs text-slate-900 font-mono block">${formatMoeda(d.preco_sugerido)}</span>
                    <button onclick="iniciarVendaAparelho('${d.id}')" class="text-[11px] font-bold text-blue-600 hover:underline">
                        Vender &rarr;
                    </button>
                </div>
            </div>
        `).join('');
    } else {
        quickListEl.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center">Nenhum aparelho em estoque no momento.</p>`;
    }

    // Mini Vendas do Período
    const miniVendasEl = document.getElementById('dash-mini-vendas');
    const vendasDoPeriodo = filtrarPedidosPorPeriodo(AppState.pedidos, currentPeriodo);
    const ultimasVendas = vendasDoPeriodo.slice(0, 3);
    if (ultimasVendas.length > 0) {
        miniVendasEl.innerHTML = ultimasVendas.map(p => `
            <div class="p-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div class="overflow-hidden pr-2">
                    <p class="font-bold text-slate-900 truncate">${p.cliente_nome}</p>
                    <p class="text-[11px] text-slate-500 truncate">${p.dispositivos_descricao || 'Aparelho Apple'}</p>
                </div>
                <div class="text-right shrink-0">
                    <span class="font-mono font-black text-slate-900 block">${formatMoeda(p.valor_total_liquido)}</span>
                    <span class="text-[10px] text-emerald-600 font-bold font-mono">+${formatMoeda(p.lucro_bruto)}</span>
                </div>
            </div>
        `).join('');
    } else {
        miniVendasEl.innerHTML = `<p class="text-xs text-slate-400 py-3 text-center">Nenhuma venda registrada em ${labelPeriodo.toLowerCase()}.</p>`;
    }

    // Matches da Lista de Espera
    const matchBadge = document.getElementById('badge-matches');
    const matchesEl = document.getElementById('dash-list-matches');
    if (matches_encomendas && matches_encomendas.length > 0) {
        matchBadge.classList.remove('hidden');
        matchesEl.innerHTML = matches_encomendas.slice(0, 2).map(m => `
            <div class="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between gap-2">
                <div class="overflow-hidden">
                    <span class="font-bold text-emerald-900 block truncate">${m.cliente_nome}</span>
                    <p class="text-[11px] text-emerald-700 truncate">Quer: ${m.modelo_desejado}</p>
                </div>
                <button onclick="enviarWhatsAppMatchPorId('${m.id}')" 
                        class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-[11px] font-bold shrink-0">
                    <i class="fa-brands fa-whatsapp"></i> Avisar
                </button>
            </div>
        `).join('');
    } else {
        matchBadge.classList.add('hidden');
        matchesEl.innerHTML = `<p class="text-xs text-slate-400 py-3 text-center">Nenhum match pendente.</p>`;
    }

    // Radar Pós-Venda / Upgrades
    const posVendaEl = document.getElementById('dash-list-posvenda');
    if (alertas_upgrade && alertas_upgrade.length > 0) {
        posVendaEl.innerHTML = alertas_upgrade.slice(0, 2).map(u => `
            <div class="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200 flex items-center justify-between gap-2">
                <div class="overflow-hidden">
                    <span class="font-bold text-purple-900 block truncate">${u.cliente_nome}</span>
                    <p class="text-[11px] text-purple-700 truncate">${u.meses_desde_compra} meses com o aparelho</p>
                </div>
                <button onclick="enviarWhatsAppUpgrade('${u.telefone_whatsapp}', '${u.cliente_nome}', '${u.aparelho_atual_descricao}')" 
                        class="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-full text-[11px] font-bold shrink-0">
                    <i class="fa-brands fa-whatsapp"></i> Upgrade
                </button>
            </div>
        `).join('');
    } else {
        posVendaEl.innerHTML = `<p class="text-xs text-slate-400 py-3 text-center">Nenhum cliente no ciclo de 11 meses hoje.</p>`;
    }
}

// ==============================================================================
// VIEW 2: ESTOQUE SERIALIZADO (CARDS REFINADOS)
// ==============================================================================
function filtrarEstoquePorTipo(tipo) {
    AppState.tipoFiltro = tipo;
    const botoes = document.querySelectorAll('#filtro-tipo-dispositivo button');
    botoes.forEach(b => {
        if (b.innerText === tipo) {
            b.className = 'pill-tab active';
        } else {
            b.className = 'pill-tab inactive';
        }
    });
    renderEstoque();
}

function filtrarEstoque() {
    const selStatus = document.getElementById('filtro-status-dispositivo');
    if (selStatus) AppState.statusFiltro = selStatus.value;
    const inputEstoque = document.getElementById('filtro-termo-estoque');
    const term = inputEstoque ? inputEstoque.value.toLowerCase().trim() : '';
    AppState.termoBuscaEstoque = term;
    AppState.filtroGlobal = term;

    const globalSearch = document.getElementById('global-search');
    if (globalSearch && globalSearch.value !== (inputEstoque ? inputEstoque.value : '')) {
        globalSearch.value = inputEstoque ? inputEstoque.value : '';
    }
    renderEstoque();
}

function handleGlobalSearch(term) {
    const limpo = (term || '').toLowerCase().trim();
    AppState.filtroGlobal = limpo;
    AppState.termoBuscaEstoque = limpo;

    const inputEstoque = document.getElementById('filtro-termo-estoque');
    if (inputEstoque && inputEstoque.value !== (term || '')) {
        inputEstoque.value = term || '';
    }

    if (limpo.length > 0) {
        if (AppState.activeTab !== 'estoque' && AppState.activeTab !== 'crm') {
            switchTab('estoque');
        }
    }

    renderEstoque();

    // Se estiver na sub-aba de clientes cadastrados, filtra a tabela de clientes
    if (document.getElementById('crm-secao-clientes') && !document.getElementById('crm-secao-clientes').classList.contains('hidden')) {
        renderClientes(limpo);
    }
}

function renderEstoque() {
    const grid = document.getElementById('grid-dispositivos');
    if (!grid) return;

    const search = (AppState.termoBuscaEstoque || AppState.filtroGlobal || '').trim().toLowerCase();

    let items = AppState.dispositivos.filter(d => {
        const matchTipo = AppState.tipoFiltro === 'Todos' || d.tipo === AppState.tipoFiltro;
        const matchStatus = AppState.statusFiltro === 'Todos' || d.status === AppState.statusFiltro;
        
        if (!search) {
            return matchTipo && matchStatus;
        }

        const modelo = (d.modelo || '').toLowerCase();
        const idValor = (d.identificador_valor || '').toLowerCase();
        const cor = (d.cor || '').toLowerCase();
        const cap = (d.capacidade || '').toLowerCase();
        const grau = (d.condicao_grau || '').toLowerCase();

        const matchSearch = modelo.includes(search) || 
                            idValor.includes(search) || 
                            cor.includes(search) ||
                            cap.includes(search) ||
                            grau.includes(search);

        return matchTipo && matchStatus && matchSearch;
    });

    if (items.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full p-12 text-center text-slate-400 bento-card">
                <i class="fa-solid fa-box-open text-3xl mb-2 text-slate-300"></i>
                <h4 class="font-bold text-slate-700 text-sm">Nenhum aparelho encontrado</h4>
                <p class="text-xs text-slate-400 mt-1">Ajuste os filtros ou adicione um novo produto.</p>
                <button onclick="openModalCadastroAparelho()" class="mt-4 btn-pill-primary">
                    + Cadastrar Aparelho
                </button>
            </div>
        `;
        return;
    }

    grid.innerHTML = items.map(d => {
        const custoTotal = (d.custo_compra || 0) + (d.custos_adicionais || 0);
        const lucro = (d.preco_sugerido || 0) - custoTotal;
        const margem = custoTotal > 0 ? ((lucro / d.preco_sugerido) * 100).toFixed(0) : 0;

        let statusClass = 'bg-slate-100 text-slate-700';
        if (d.status === 'Em Estoque') statusClass = 'bg-emerald-100/80 text-emerald-800';
        if (d.status === 'Reservado') statusClass = 'bg-amber-100/80 text-amber-800';
        if (d.status === 'Vendido') statusClass = 'bg-slate-200 text-slate-600';

        let icon = 'fa-mobile-screen';
        if (d.tipo === 'MacBook') icon = 'fa-laptop';
        if (d.tipo === 'iPad') icon = 'fa-tablet-screen-button';
        if (d.tipo === 'Apple Watch') icon = 'fa-clock';

        let fotos = d.fotos;
        if (typeof fotos === 'string') {
            try { fotos = JSON.parse(fotos); } catch (e) { fotos = []; }
        }
        fotos = Array.isArray(fotos) ? fotos : [];
        const temFotos = fotos.length > 0;
        const fotoPrincipal = temFotos ? fotos[0] : null;

        const modeloSafe = (d.modelo || 'Aparelho').replace(/'/g, "\\'");

        return `
            <div class="bento-card p-6 flex flex-col justify-between space-y-4">
                <div>
                    <!-- Topo do Card com Foto/Ícone, Modelo e Status -->
                    <div class="flex items-start justify-between gap-3 mb-3">
                        <div class="flex items-center gap-3 overflow-hidden">
                            ${fotoPrincipal ? `
                                <div onclick="abrirGaleriaFotos('${d.id}')" title="Clique para ver ${fotos.length} fotos" class="w-12 h-12 rounded-2xl overflow-hidden relative shrink-0 cursor-pointer shadow-sm border border-slate-200 group bg-slate-100">
                                    <img src="${fotoPrincipal}" alt="${d.modelo}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200">
                                    <span class="absolute bottom-0.5 right-0.5 px-1 py-0.2 bg-black/75 backdrop-blur-sm text-white text-[9px] font-bold rounded flex items-center gap-0.5">
                                        <i class="fa-solid fa-camera text-[8px]"></i> ${fotos.length}
                                    </span>
                                </div>
                            ` : `
                                <div onclick="abrirModalEditarAparelho('${d.id}')" title="Sem fotos. Clique para anexar." class="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-800 text-lg shrink-0 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <i class="fa-solid ${icon}"></i>
                                </div>
                            `}
                            <div class="overflow-hidden">
                                <h4 class="font-black text-sm text-slate-900 leading-tight truncate">${d.modelo}</h4>
                                <p class="text-xs text-slate-500 font-medium truncate">${d.capacidade} &bull; ${d.cor}</p>
                            </div>
                        </div>
                        <span class="text-[10px] font-bold px-2.5 py-0.5 rounded-full shrink-0 ${statusClass}">
                            ${d.status}
                        </span>
                    </div>

                    <!-- Identificador Serial/IMEI em Pílula -->
                    <div class="flex items-center justify-between p-2.5 bg-slate-50 rounded-2xl border border-slate-100 mb-3">
                        <div class="overflow-hidden">
                            <span class="text-[9px] uppercase font-bold text-slate-400 block">${d.identificador_tipo}</span>
                            <span class="font-mono text-xs font-bold text-slate-800 tracking-wider truncate block">${d.identificador_valor}</span>
                        </div>
                        <button onclick="copiarTexto('${d.identificador_valor}')" class="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/50">
                            <i class="fa-regular fa-copy text-xs"></i>
                        </button>
                    </div>

                    <!-- Bateria com Medidor Circular + Grau Estético -->
                    <div class="flex items-center justify-between py-2 border-y border-slate-100">
                        <div class="flex items-center gap-2.5">
                            ${renderCircleBattery(d.saude_bateria || 100, 38)}
                            <div class="text-[11px]">
                                <span class="font-bold text-slate-800 block">Saúde Bateria</span>
                                <span class="text-slate-400">${d.ciclos_bateria ? `${d.ciclos_bateria} ciclos` : 'Testada 100%'}</span>
                            </div>
                        </div>
                        <span class="text-[11px] font-bold text-slate-700 px-2.5 py-1 bg-slate-100 rounded-full">
                            ${d.condicao_grau}
                        </span>
                    </div>

                    <!-- Preço Sugerido e Margem -->
                    <div class="pt-3 flex items-baseline justify-between">
                        <div>
                            <span class="text-[10px] uppercase font-bold text-slate-400 block">Preço de Venda</span>
                            <span class="text-xl font-black text-slate-900 font-mono">${formatMoeda(d.preco_sugerido)}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-[10px] uppercase font-bold text-slate-400 block">Lucro Previsto</span>
                            <span class="text-xs font-bold text-emerald-600 font-mono">+${formatMoeda(lucro)} (${margem}%)</span>
                        </div>
                    </div>
                </div>

                <!-- Botões de Ação: Venda, Galeria, Edição e Exclusão -->
                <div class="pt-2 flex items-center gap-1.5">
                    ${d.status === 'Em Estoque' ? `
                        <button onclick="iniciarVendaAparelho('${d.id}')" class="flex-1 py-2.5 bg-[#121316] hover:bg-slate-800 text-white rounded-full text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all truncate px-2">
                            <i class="fa-solid fa-cart-shopping"></i> Vender
                        </button>
                    ` : `
                        <div class="flex-1 py-2 bg-slate-100 text-slate-400 rounded-full text-xs font-semibold text-center truncate px-2">
                            Indisponível (${d.status})
                        </div>
                    `}

                    <!-- Botão de Fotos / Galeria -->
                    ${temFotos ? `
                        <button onclick="abrirGaleriaFotos('${d.id}')" 
                                title="Visualizar ${fotos.length} fotos deste aparelho" 
                                class="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-amber-50 hover:bg-amber-100 text-amber-600 transition-colors relative">
                            <i class="fa-solid fa-camera text-xs"></i>
                            <span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
                                ${fotos.length}
                            </span>
                        </button>
                    ` : `
                        <button onclick="abrirModalEditarAparelho('${d.id}')" 
                                title="Anexar fotos deste aparelho" 
                                class="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                            <i class="fa-solid fa-camera text-xs"></i>
                        </button>
                    `}

                    <button onclick="abrirModalEditarAparelho('${d.id}')" 
                            title="Editar dados deste aparelho" 
                            class="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition-colors">
                        <i class="fa-solid fa-pen-to-square text-xs"></i>
                    </button>
                    <button onclick="excluirDispositivo('${d.id}')" 
                            title="Excluir este aparelho do estoque" 
                            class="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors">
                        <i class="fa-regular fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function abrirModalEditarAparelho(dispId) {
    const disp = AppState.dispositivos.find(d => d.id === dispId);
    if (!disp) {
        alert("Aparelho não encontrado.");
        return;
    }

    document.getElementById('form-cadastro-aparelho').reset();
    document.getElementById('disp-edit-id').value = disp.id;
    document.getElementById('modal-disp-titulo').innerText = "Editar Aparelho";
    document.getElementById('modal-disp-subtitulo').innerText = `Editando dados de ${disp.modelo}`;
    document.getElementById('modal-disp-btn-salvar').innerText = "Salvar Alterações";

    document.getElementById('cad-tipo').value = disp.tipo || 'iPhone';
    atualizarSelectsModelos(disp.modelo);
    atualizarModelosSugeridos();

    document.getElementById('cad-modelo').value = disp.modelo || '';
    document.getElementById('cad-capacidade').value = disp.capacidade || '128GB';
    document.getElementById('cad-cor').value = disp.cor || '';
    document.getElementById('cad-grau').value = disp.condicao_grau || 'Grau A+ (Impecável)';
    document.getElementById('cad-status').value = disp.status || 'Em Estoque';
    document.getElementById('cad-identificador-tipo').value = disp.identificador_tipo || 'IMEI';
    document.getElementById('cad-identificador-valor').value = disp.identificador_valor || '';

    const saude = disp.saude_bateria !== undefined && disp.saude_bateria !== null ? disp.saude_bateria : 100;
    document.getElementById('cad-bateria').value = saude;
    document.getElementById('cad-bateria-num').value = saude;
    atualizarIndicadorBateria(saude);

    if (disp.tipo === 'MacBook') {
        document.getElementById('campo-ciclos-mac').classList.remove('hidden');
        document.getElementById('cad-ciclos').value = disp.ciclos_bateria || '';
    } else {
        document.getElementById('campo-ciclos-mac').classList.add('hidden');
        document.getElementById('cad-ciclos').value = '';
    }

    // Checklist técnico
    let chk = disp.checklist_tecnico;
    if (typeof chk === 'string') {
        try { chk = JSON.parse(chk); } catch (e) { chk = {}; }
    }
    chk = chk || {};
    document.getElementById('chk-facetouch').checked = chk.face_touch_id !== false;
    document.getElementById('chk-tela').checked = chk.tela_original !== false;
    document.getElementById('chk-bateria').checked = chk.bateria_original !== false;
    document.getElementById('chk-truetone').checked = chk.true_tone !== false;

    document.getElementById('cad-custo-compra').value = (disp.custo_compra || 0).toFixed(2);
    document.getElementById('cad-custos-extras').value = (disp.custos_adicionais || 0).toFixed(2);
    document.getElementById('cad-preco-sugerido').value = (disp.preco_sugerido || 0).toFixed(2);
    document.getElementById('cad-notas-tecnicas').value = disp.notas_tecnicas || '';

    // Carregar fotos do dispositivo
    let fotos = disp.fotos;
    if (typeof fotos === 'string') {
        try { fotos = JSON.parse(fotos); } catch (e) { fotos = []; }
    }
    AppState.fotosCadastro = Array.isArray(fotos) ? [...fotos] : [];
    renderPreviewFotosCadastro();

    calcularMargensCadastro();
    openModal('modal-cadastro-aparelho');
}

async function excluirDispositivo(id) {
    const disp = AppState.dispositivos.find(d => d.id === id);
    const nome = disp ? `${disp.modelo} (${disp.capacidade})` : 'este aparelho';
    if (!confirm(`Deseja realmente excluir o aparelho "${nome}" do estoque? Esta ação removerá o item também do Supabase e não pode ser desfeita.`)) {
        return;
    }
    try {
        const res = await fetch(`/api/dispositivos?id=${id}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (result.success) {
            showToast("Aparelho excluído do estoque com sucesso!");
            await loadAllData();
        } else {
            alert(result.error || "Não foi possível excluir o aparelho.");
        }
    } catch (err) {
        alert("Erro na conexão ao excluir aparelho.");
    }
}

// ==============================================================================
// VIEW 3: TRADE-IN HISTÓRICO
// ==============================================================================
function renderTradeIns() {
    const tbody = document.getElementById('tabela-tradeins-corpo');
    if (!tbody) return;

    if (AppState.tradeIns.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">Nenhum aparelho recebido em Trade-In ainda.</td></tr>`;
        return;
    }

    tbody.innerHTML = AppState.tradeIns.map(t => `
        <tr class="hover:bg-slate-50/80 transition-colors">
            <td class="px-4 py-3.5 text-slate-500 font-medium">${formatData(t.data_troca)}</td>
            <td class="px-4 py-3.5 font-bold text-slate-900">
                ${t.cliente_nome}
                <span class="block text-[11px] text-slate-400 font-normal">CPF: ${t.cpf_documento || 'Não informado'}</span>
            </td>
            <td class="px-4 py-3.5 font-semibold text-slate-800">${t.modelo} (${t.capacidade})</td>
            <td class="px-4 py-3.5 font-mono text-slate-600 font-bold">${t.identificador_valor}</td>
            <td class="px-4 py-3.5">
                <span class="font-bold text-slate-700">${t.saude_bateria}%</span>
                <span class="text-[10px] text-slate-400 block">${t.condicao_grau}</span>
            </td>
            <td class="px-4 py-3.5 font-mono font-black text-amber-600 text-sm">${formatMoeda(t.valor_avaliado)}</td>
            <td class="px-4 py-3.5 text-right">
                <div class="inline-flex items-center gap-1.5 justify-end">
                    <button onclick="abrirTermoCessaoTradeIn('${t.id}')" class="btn-pill-secondary text-xs" title="Ver Termo de Cessão">
                        <i class="fa-solid fa-file-contract"></i> Termo
                    </button>
                    <button onclick="excluirTradeIn('${t.id}')" title="Excluir registro de Trade-In" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 inline-flex items-center justify-center transition-colors">
                        <i class="fa-solid fa-trash text-xs"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function excluirTradeIn(id) {
    const t = AppState.tradeIns.find(x => x.id === id);
    const cliente = t ? t.cliente_nome : 'este cliente';
    const aparelho = t ? `${t.modelo} (${t.capacidade})` : 'aparelho';

    if (!confirm(`Deseja realmente excluir este registro de Trade-In de "${cliente}"?\n\nAparelho entregue: ${aparelho}\n\nO registro será removido e o aparelho recebido na troca será excluído do estoque e do Supabase.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/trade-in?id=${id}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (result.success) {
            showToast("Registro de Trade-In excluído com sucesso!");
            await loadAllData();
        } else {
            alert(result.error || "Não foi possível excluir o Trade-In.");
        }
    } catch (err) {
        alert("Erro na conexão com o servidor ao excluir Trade-In.");
    }
}

// ==============================================================================
// VIEW 4: CRM & FUNIL DE VENDAS
// ==============================================================================
function renderCRM() {
    const etapas = [
        { id: 'novo', nome: 'Novo Contato' },
        { id: 'negociacao', nome: 'Em Negociação' },
        { id: 'tradein', nome: 'Aguardando Aparelho/Trade-in' },
        { id: 'fechado', nome: 'Aprovado/Fechado' },
        { id: 'perdido', nome: 'Perdido' }
    ];

    etapas.forEach(etapa => {
        const colEl = document.getElementById(`coluna-kanban-${etapa.id}`);
        const countEl = document.getElementById(`count-kanban-${etapa.id}`);
        if (!colEl) return;

        const leads = AppState.crmLeads.filter(l => l.etapa_funil === etapa.nome);
        countEl.innerText = leads.length;

        if (leads.length === 0) {
            colEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400 italic">Nenhum contato</div>`;
            return;
        }

        colEl.innerHTML = leads.map(l => `
            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2.5 text-xs">
                <div class="flex items-center justify-between">
                    <h5 class="font-bold text-slate-900">${l.cliente_nome}</h5>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${l.canal || 'WhatsApp'}</span>
                </div>
                <div class="text-[11px] font-semibold text-blue-600">
                    <i class="fa-brands fa-apple mr-1"></i>${l.dispositivo_interesse_modelo || 'iPhone'}
                </div>
                ${l.notas ? `<p class="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-xl italic">${l.notas}</p>` : ''}
                
                <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <button onclick="enviarWhatsAppLead('${l.telefone_whatsapp}', '${(l.cliente_nome || '').replace(/'/g, "\\'")}', '${(l.dispositivo_interesse_modelo || '').replace(/'/g, "\\'")}')" 
                            class="text-emerald-600 font-bold hover:underline flex items-center gap-1">
                        <i class="fa-brands fa-whatsapp text-sm"></i> Conversar
                    </button>
                    <div class="flex items-center gap-1">
                        <button onclick="moverEtapaCRM('${l.id}', 'anterior')" class="p-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px]" title="Etapa anterior">
                            <i class="fa-solid fa-chevron-left"></i>
                        </button>
                        <button onclick="moverEtapaCRM('${l.id}', 'proxima')" class="p-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px]" title="Próxima etapa">
                            <i class="fa-solid fa-chevron-right"></i>
                        </button>
                        <button onclick="excluirLeadCRM('${l.id}')" class="p-1 rounded-md bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 text-[10px] ml-0.5 transition-colors" title="Excluir negociação">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    });
}

async function moverEtapaCRM(leadId, direcao) {
    const etapasOrdem = ['Novo Contato', 'Em Negociação', 'Aguardando Aparelho/Trade-in', 'Aprovado/Fechado', 'Perdido'];
    const lead = AppState.crmLeads.find(l => l.id === leadId);
    if (!lead) return;

    let indexAtual = etapasOrdem.indexOf(lead.etapa_funil);
    if (direcao === 'proxima' && indexAtual < etapasOrdem.length - 1) {
        indexAtual++;
    } else if (direcao === 'anterior' && indexAtual > 0) {
        indexAtual--;
    }
    const novaEtapa = etapasOrdem[indexAtual];
    lead.etapa_funil = novaEtapa;
    renderCRM();

    try {
        await fetch('/api/crm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: leadId, etapa_funil: novaEtapa })
        });
    } catch (e) {
        console.error("Erro ao sincronizar etapa do lead:", e);
    }
}

async function excluirLeadCRM(leadId) {
    const lead = AppState.crmLeads.find(l => l.id === leadId);
    const clienteNome = lead ? lead.cliente_nome : 'esta negociação';
    if (!confirm(`Deseja realmente excluir a negociação com "${clienteNome}"? Esta ação removerá o registro também do Supabase.`)) {
        return;
    }
    try {
        const res = await fetch(`/api/crm?id=${leadId}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (result.success) {
            showToast("Negociação excluída com sucesso!");
            await loadAllData();
        } else {
            alert(result.error || "Erro ao excluir negociação.");
        }
    } catch (err) {
        alert("Erro na conexão ao excluir negociação.");
    }
}

// Alternar entre Funil de Vendas (Kanban) e Clientes Cadastrados
function alternarAbaCRM(subAba) {
    AppState.subAbaCRM = subAba;
    const tabKanban = document.getElementById('tab-crm-kanban');
    const tabClientes = document.getElementById('tab-crm-clientes');
    const secaoKanban = document.getElementById('crm-secao-kanban');
    const secaoClientes = document.getElementById('crm-secao-clientes');

    if (subAba === 'kanban') {
        if (tabKanban) tabKanban.className = 'pill-tab active';
        if (tabClientes) tabClientes.className = 'pill-tab inactive';
        if (secaoKanban) secaoKanban.classList.remove('hidden');
        if (secaoClientes) secaoClientes.classList.add('hidden');
    } else {
        if (tabKanban) tabKanban.className = 'pill-tab inactive';
        if (tabClientes) tabClientes.className = 'pill-tab active';
        if (secaoKanban) secaoKanban.classList.add('hidden');
        if (secaoClientes) secaoClientes.classList.remove('hidden');
        renderClientes();
    }
}

// Renderizar Tabela Completa de Clientes Cadastrados
function renderClientes(termo) {
    const tbody = document.getElementById('tabela-clientes-corpo');
    const badgeTotal = document.getElementById('badge-total-clientes');
    const labelTotal = document.getElementById('label-contagem-clientes');
    if (!tbody) return;

    if (badgeTotal) badgeTotal.innerText = AppState.clientes.length;

    const busca = (termo !== undefined ? termo : (AppState.filtroClientes || '')).toLowerCase().trim();

    const clientesFiltrados = AppState.clientes.filter(c => {
        if (!busca) return true;
        const nome = (c.nome || '').toLowerCase();
        const fone = (c.telefone_whatsapp || '').toLowerCase();
        const cpf = (c.cpf_documento || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        const aparelho = (c.aparelho_atual_descricao || '').toLowerCase();
        return nome.includes(busca) || fone.includes(busca) || cpf.includes(busca) || email.includes(busca) || aparelho.includes(busca);
    });

    if (labelTotal) {
        labelTotal.innerText = `${clientesFiltrados.length} ${clientesFiltrados.length === 1 ? 'cliente encontrado' : 'clientes encontrados'}`;
    }

    if (clientesFiltrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-slate-400">
                    <i class="fa-solid fa-user-slash text-2xl mb-2 text-slate-300 block"></i>
                    ${busca ? 'Nenhum cliente encontrado para esta busca.' : 'Nenhum cliente cadastrado ainda.'}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = clientesFiltrados.map(c => {
        const telFormatado = c.telefone_whatsapp || 'Sem telefone';
        const telLimpo = limparTelefone(c.telefone_whatsapp || '');
        const dataFormatada = c.created_at ? formatData(c.created_at) : 'Recente';
        const msgWhats = encodeURIComponent(`Olá, ${c.nome}! Aqui é da iLion Apple Specialist. Como você está?`);
        const nomeSafe = (c.nome || 'Cliente').replace(/'/g, "\\'");

        return `
            <tr class="hover:bg-slate-50/70 transition-colors">
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                            ${(c.nome || 'C').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-bold text-slate-900">${c.nome}</div>
                            ${c.email ? `<div class="text-[11px] text-slate-400">${c.email}</div>` : ''}
                            ${c.observacoes ? `<div class="text-[10px] text-slate-400 italic">${c.observacoes}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td class="p-4">
                    ${telLimpo ? `
                        <a href="https://wa.me/${telLimpo}?text=${msgWhats}" target="_blank" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-mono text-xs font-bold hover:bg-emerald-100 transition-colors">
                            <i class="fa-brands fa-whatsapp text-emerald-600"></i> ${telFormatado}
                        </a>
                    ` : `<span class="text-slate-400 text-xs">Não informado</span>`}
                </td>
                <td class="p-4 font-mono text-slate-600 font-medium">
                    ${c.cpf_documento || '<span class="text-slate-400 font-sans italic">Não informado</span>'}
                </td>
                <td class="p-4">
                    ${c.aparelho_atual_descricao ? `
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-800 text-[11px] font-semibold">
                            <i class="fa-brands fa-apple text-slate-600"></i> ${c.aparelho_atual_descricao}
                        </span>
                    ` : `<span class="text-slate-400 italic text-[11px]">Nenhum registrado</span>`}
                </td>
                <td class="p-4 text-slate-500 text-[11px] font-medium">
                    ${dataFormatada}
                </td>
                <td class="p-4 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                        <button onclick="abrirModalEditarCliente('${c.id}')" title="Editar dados do cliente" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors">
                            <i class="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                        <button onclick="excluirCliente('${c.id}')" title="Excluir cliente" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors">
                            <i class="fa-regular fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filtrarListaClientes(termo) {
    AppState.filtroClientes = termo;
    renderClientes(termo);
}

// ==============================================================================
// VIEW 5: LISTA DE ESPERA / ENCOMENDAS
// ==============================================================================
function renderEncomendas() {
    const tbody = document.getElementById('tabela-encomendas-corpo');
    if (!tbody) return;

    const ativas = (AppState.encomendas || []).filter(e => e.status !== 'Atendido' && e.status !== 'Cancelado');

    if (ativas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">Nenhuma encomenda pendente na lista de espera.</td></tr>`;
        return;
    }

    tbody.innerHTML = ativas.map(e => {
        const isMatch = e.status === 'Compatível Encontrado';
        return `
            <tr class="hover:bg-slate-50/80 transition-colors ${isMatch ? 'bg-emerald-50/40' : ''}">
                <td class="px-4 py-3.5 font-bold text-slate-900">
                    ${e.cliente_nome}
                    <span class="block text-[11px] text-slate-500 font-normal">${e.telefone_whatsapp}</span>
                </td>
                <td class="px-4 py-3.5 font-bold text-slate-800">${e.modelo_desejado}</td>
                <td class="px-4 py-3.5 text-slate-600">${e.capacidade_preferida || 'Qualquer'} &bull; ${e.cor_preferida || 'Qualquer'}</td>
                <td class="px-4 py-3.5 font-mono font-bold text-slate-900">${e.orcamento_maximo ? formatMoeda(e.orcamento_maximo) : 'Sem teto'}</td>
                <td class="px-4 py-3.5">
                    ${isMatch ? `
                        <span class="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                            <span class="w-2 h-2 rounded-full bg-emerald-500"></span> MATCH EM ESTOQUE!
                        </span>
                    ` : `
                        <span class="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">Aguardando</span>
                    `}
                </td>
                <td class="px-4 py-3.5 text-right">
                    <div class="inline-flex items-center gap-1.5 justify-end">
                        ${isMatch ? `
                            <button onclick="enviarWhatsAppMatchPorId('${e.id}')" 
                                    class="btn-pill-primary bg-emerald-600 hover:bg-emerald-500 text-white text-xs">
                                <i class="fa-brands fa-whatsapp"></i> Avisar no WhatsApp
                            </button>
                        ` : `<span class="text-xs text-slate-400">Monitorando...</span>`}
                        <button onclick="excluirEncomenda('${e.id}')" 
                                title="Excluir da lista de espera" 
                                class="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 inline-flex items-center justify-center transition-colors">
                            <i class="fa-regular fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function excluirEncomenda(encId) {
    const enc = AppState.encomendas.find(e => e.id === encId);
    const desc = enc ? `${enc.modelo_desejado} (${enc.cliente_nome})` : 'esta encomenda';
    if (!confirm(`Deseja realmente remover "${desc}" da lista de espera? Esta ação removerá o registro também do Supabase.`)) {
        return;
    }
    try {
        const res = await fetch(`/api/encomendas?id=${encId}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (result.success) {
            showToast('Encomenda removida com sucesso!');
            await loadAllData();
        } else {
            alert(result.error || 'Erro ao excluir encomenda.');
        }
    } catch (err) {
        alert('Erro na conexão com o servidor ao excluir encomenda.');
    }
}

// ==============================================================================
// VIEW 6: PÓS-VENDA & CICLO DE RECOMPRA
// ==============================================================================
function renderPosVenda() {
    const listGarantias = document.getElementById('lista-garantias-posvenda');
    const listUpgrades = document.getElementById('lista-upgrades-posvenda');
    if (!listGarantias || !listUpgrades) return;

    if (!AppState.dashboard) return;
    const { alertas_garantia, alertas_upgrade } = AppState.dashboard;

    // Garantias
    if (alertas_garantia && alertas_garantia.length > 0) {
        listGarantias.innerHTML = alertas_garantia.map(g => `
            <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div>
                    <h5 class="font-bold text-xs text-slate-900">${g.cliente_nome}</h5>
                    <p class="text-[11px] text-slate-500">${g.aparelho_atual_descricao}</p>
                    <p class="text-xs font-bold text-amber-600 mt-0.5">Vence em ${g.dias_restantes} dias (${formatData(g.garantia_ate)})</p>
                </div>
                <button onclick="enviarWhatsAppGarantia('${g.telefone_whatsapp}', '${g.cliente_nome}', '${g.aparelho_atual_descricao}')" 
                        class="btn-pill-secondary text-xs">
                    <i class="fa-brands fa-whatsapp text-emerald-600"></i> Follow-up
                </button>
            </div>
        `).join('');
    } else {
        listGarantias.innerHTML = `<p class="p-6 text-center text-xs text-slate-400">Nenhum aparelho com garantia a vencer nos próximos 15 dias.</p>`;
    }

    // Upgrades
    if (alertas_upgrade && alertas_upgrade.length > 0) {
        listUpgrades.innerHTML = alertas_upgrade.map(u => `
            <div class="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-200 flex items-center justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2">
                        <h5 class="font-bold text-xs text-purple-900">${u.cliente_nome}</h5>
                        <span class="text-[10px] font-bold text-purple-700 px-2 py-0.5 rounded-full bg-purple-200/60">${u.meses_desde_compra} meses</span>
                    </div>
                    <p class="text-[11px] text-slate-600">${u.aparelho_atual_descricao}</p>
                    <p class="text-xs font-bold text-emerald-700 mt-0.5">Janela ideal para Trade-In</p>
                </div>
                <button onclick="enviarWhatsAppUpgrade('${u.telefone_whatsapp}', '${u.cliente_nome}', '${u.aparelho_atual_descricao}')" 
                        class="btn-pill-primary bg-purple-600 hover:bg-purple-500 text-white text-xs">
                    <i class="fa-brands fa-whatsapp"></i> Proposta
                </button>
            </div>
        `).join('');
    } else {
        listUpgrades.innerHTML = `<p class="p-6 text-center text-xs text-slate-400">Nenhum cliente no ciclo de 11 meses hoje.</p>`;
    }
}

// ==============================================================================
// VIEW 7: RECIBOS & DOCUMENTOS HISTÓRICO
// ==============================================================================
function renderDocumentos() {
    const tbody = document.getElementById('tabela-vendas-corpo');
    if (!tbody) return;

    if (!AppState.pedidos || AppState.pedidos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">Nenhuma venda concluída ainda.</td></tr>`;
        return;
    }

    tbody.innerHTML = AppState.pedidos.map(p => `
        <tr class="hover:bg-slate-50/80 transition-colors">
            <td class="px-4 py-3.5 font-mono font-bold text-blue-600">${p.numero_pedido}</td>
            <td class="px-4 py-3.5 text-slate-500 font-medium">${formatData(p.data_venda)}</td>
            <td class="px-4 py-3.5 font-bold text-slate-900">
                ${p.cliente_nome || 'Cliente'}
                <span class="block text-[11px] text-slate-400 font-normal">${p.telefone_whatsapp || ''}</span>
            </td>
            <td class="px-4 py-3.5 text-slate-800 font-semibold">${p.dispositivos_descricao || 'iPhone'}</td>
            <td class="px-4 py-3.5 font-mono font-black text-slate-900">${formatMoeda(p.valor_total_liquido)}</td>
            <td class="px-4 py-3.5 font-mono text-slate-500 font-semibold">${formatData(p.garantia_ate)}</td>
            <td class="px-4 py-3.5 text-right">
                <div class="flex items-center justify-end gap-1.5">
                    <button onclick="visualizarDocumentoPedido('${p.id}')" class="btn-pill-secondary text-xs">
                        <i class="fa-solid fa-receipt"></i> Recibo
                    </button>
                    <button onclick="excluirPedido('${p.id}', '${p.numero_pedido}')" title="Excluir venda e recibo" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 inline-flex items-center justify-center transition-colors">
                        <i class="fa-regular fa-trash-can text-xs"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function excluirPedido(pedidoId, numeroPedido) {
    if (!confirm(`Deseja realmente excluir a venda ${numeroPedido || ''}? O recibo será excluído do sistema e do Supabase, e o aparelho voltará para o estoque disponível.`)) {
        return;
    }
    try {
        const res = await fetch(`/api/pedidos?id=${pedidoId}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (result.success) {
            showToast('Venda excluída e aparelho restaurado ao estoque!');
            await loadAllData();
        } else {
            alert(result.error || 'Erro ao excluir venda.');
        }
    } catch (err) {
        alert('Erro na conexão com o servidor ao excluir venda.');
    }
}

// ==============================================================================
// MODAL DE CADASTRO DE APARELHO
// ==============================================================================
function openModalCadastroAparelho() {
    document.getElementById('form-cadastro-aparelho').reset();
    document.getElementById('disp-edit-id').value = '';
    document.getElementById('modal-disp-titulo').innerText = "Novo Aparelho no Estoque";
    document.getElementById('modal-disp-subtitulo').innerText = "Cadastre item individual com IMEI e checklist.";
    document.getElementById('modal-disp-btn-salvar').innerText = "Salvar Aparelho";

    AppState.fotosCadastro = [];
    renderPreviewFotosCadastro();

    document.getElementById('cad-status').value = 'Em Estoque';
    document.getElementById('cad-bateria').value = 100;
    document.getElementById('cad-bateria-num').value = 100;
    atualizarIndicadorBateria(100);
    marcarTodosChecklist(true);
    atualizarSelectsModelos();
    atualizarModelosSugeridos();
    calcularMargensCadastro();
    openModal('modal-cadastro-aparelho');
}

function atualizarModelosSugeridos() {
    const tipo = document.getElementById('cad-tipo').value;
    const campoCiclos = document.getElementById('campo-ciclos-mac');
    if (campoCiclos) {
        if (tipo === 'MacBook') {
            campoCiclos.classList.remove('hidden');
        } else {
            campoCiclos.classList.add('hidden');
        }
    }
}

function aoSelecionarModeloCadastro() {
    const select = document.getElementById('cad-modelo');
    if (!select) return;
    const modeloNome = select.value;
    if (!modeloNome) return;

    const mod = AppState.modelos.find(m => m.nome.toLowerCase().trim() === modeloNome.toLowerCase().trim());
    if (mod) {
        const tipoSelect = document.getElementById('cad-tipo');
        if (tipoSelect && mod.tipo) {
            tipoSelect.value = mod.tipo;
        }
        atualizarModelosSugeridos();
    }
}

function atualizarIndicadorBateria(val) {
    const label = document.getElementById('label-saude-bateria');
    const range = document.getElementById('cad-bateria');
    const num = document.getElementById('cad-bateria-num');
    range.value = val;
    num.value = val;

    if (val >= 85) {
        label.className = 'px-2 py-0.5 rounded-full font-bold text-emerald-700 bg-emerald-100';
        label.innerText = `${val}% (Excelente)`;
    } else if (val >= 80) {
        label.className = 'px-2 py-0.5 rounded-full font-bold text-amber-700 bg-amber-100';
        label.innerText = `${val}% (Bom)`;
    } else {
        label.className = 'px-2 py-0.5 rounded-full font-bold text-rose-700 bg-rose-100';
        label.innerText = `${val}% (Recomendada Troca)`;
    }
}

function marcarTodosChecklist(status) {
    ['chk-facetouch', 'chk-tela', 'chk-bateria', 'chk-truetone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = status;
    });
}

function calcularMargensCadastro() {
    const custoCompra = parseFloat(document.getElementById('cad-custo-compra').value) || 0;
    const custosExtras = parseFloat(document.getElementById('cad-custos-extras').value) || 0;
    const precoSugerido = parseFloat(document.getElementById('cad-preco-sugerido').value) || 0;

    const custoBase = custoCompra + custosExtras;
    const lucro = precoSugerido - custoBase;
    const margemPct = precoSugerido > 0 ? ((lucro / precoSugerido) * 100).toFixed(1) : 0;

    document.getElementById('lbl-custo-base').innerText = formatMoeda(custoBase);
    document.getElementById('lbl-lucro-projetado').innerText = `+${formatMoeda(lucro)} (${margemPct}%)`;
}

async function salvarNovoDispositivo(e) {
    e.preventDefault();

    const editId = document.getElementById('disp-edit-id').value;

    const checklist = {
        face_touch_id: document.getElementById('chk-facetouch').checked,
        tela_original: document.getElementById('chk-tela').checked,
        bateria_original: document.getElementById('chk-bateria').checked,
        true_tone: document.getElementById('chk-truetone').checked
    };

    const payload = {
        tipo: document.getElementById('cad-tipo').value,
        modelo: document.getElementById('cad-modelo').value.trim(),
        capacidade: document.getElementById('cad-capacidade').value,
        cor: document.getElementById('cad-cor').value.trim(),
        identificador_tipo: document.getElementById('cad-identificador-tipo').value,
        identificador_valor: document.getElementById('cad-identificador-valor').value.trim(),
        saude_bateria: parseInt(document.getElementById('cad-bateria').value),
        ciclos_bateria: document.getElementById('cad-ciclos').value ? parseInt(document.getElementById('cad-ciclos').value) : null,
        condicao_grau: document.getElementById('cad-grau').value,
        checklist_tecnico: checklist,
        custo_compra: parseFloat(document.getElementById('cad-custo-compra').value) || 0,
        custos_adicionais: parseFloat(document.getElementById('cad-custos-extras').value) || 0,
        preco_sugerido: parseFloat(document.getElementById('cad-preco-sugerido').value) || 0,
        preco_minimo: (parseFloat(document.getElementById('cad-preco-sugerido').value) || 0) * 0.95,
        status: document.getElementById('cad-status').value || 'Em Estoque',
        notas_tecnicas: document.getElementById('cad-notas-tecnicas').value.trim() || null,
        fotos: AppState.fotosCadastro || []
    };

    if (editId) {
        payload.id = editId;
    } else {
        payload.origem = 'Compra Fornecedor';
    }

    try {
        const res = await fetch('/api/dispositivos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            closeModal('modal-cadastro-aparelho');
            await loadAllData();
            showToast(editId ? "Aparelho atualizado com sucesso!" : "Aparelho adicionado ao estoque!");
        } else {
            alert(result.error || "Erro ao salvar.");
        }
    } catch (err) {
        alert("Erro na conexão com o servidor.");
    }
}

// ==============================================================================
// MODAL DE CHECKOUT & TRADE-IN (PDV ÁGIL)
// ==============================================================================
function openModalVendaTradeIn() {
    atualizarSelectsAparelhosVenda();
    atualizarSelectsClientes();
    atualizarSelectsModelos();
    document.getElementById('form-venda-tradein').reset();
    document.getElementById('toggle-tradein').checked = false;
    toggleFormTradeIn(false);
    calcularCheckoutVenda();
    openModal('modal-venda-tradein');
}

function iniciarVendaAparelho(dispId) {
    openModalVendaTradeIn();
    const select = document.getElementById('venda-dispositivo-select');
    if (select) {
        select.value = dispId;
        aoSelecionarAparelhoVenda(dispId);
    }
}

function atualizarSelectsAparelhosVenda() {
    const select = document.getElementById('venda-dispositivo-select');
    if (!select) return;
    const disponiveis = AppState.dispositivos.filter(d => d.status === 'Em Estoque');

    select.innerHTML = '<option value="">-- Selecione o aparelho disponível --</option>' + 
        disponiveis.map(d => `
            <option value="${d.id}" data-preco="${d.preco_sugerido}" data-custo="${(d.custo_compra || 0) + (d.custos_adicionais || 0)}">
                ${d.modelo} ${d.capacidade} (${d.cor}) - ${formatMoeda(d.preco_sugerido)}
            </option>
        `).join('');
}

function atualizarSelectsClientes() {
    ['venda-cliente-select', 'enc-cliente', 'crm-cliente'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '<option value="">-- Selecione o cliente --</option>' + 
            AppState.clientes.map(c => `
                <option value="${c.id}">${c.nome} (${c.telefone_whatsapp})</option>
            `).join('');
    });
}

function aoSelecionarAparelhoVenda(dispId) {
    const detalheBox = document.getElementById('venda-detalhe-aparelho');
    if (!dispId) {
        detalheBox.classList.add('hidden');
        calcularCheckoutVenda();
        return;
    }

    const disp = AppState.dispositivos.find(d => d.id === dispId);
    if (disp) {
        detalheBox.classList.remove('hidden');
        document.getElementById('venda-aparelho-specs').innerText = `${disp.modelo} ${disp.capacidade} &bull; Bateria ${disp.saude_bateria}%`;
        document.getElementById('venda-aparelho-preco').innerText = formatMoeda(disp.preco_sugerido);
    }
    calcularCheckoutVenda();
}

function toggleFormTradeIn(checked) {
    const formCampos = document.getElementById('form-tradein-campos');
    if (checked) {
        formCampos.classList.remove('hidden');
    } else {
        formCampos.classList.add('hidden');
        document.getElementById('ti-valor-avaliado').value = "0.00";
    }
    calcularCheckoutVenda();
}

function calcularCheckoutVenda() {
    const dispSelect = document.getElementById('venda-dispositivo-select');
    const selectedOption = dispSelect.selectedOptions[0];

    const subtotal = selectedOption && selectedOption.dataset.preco ? parseFloat(selectedOption.dataset.preco) : 0;
    const custoBase = selectedOption && selectedOption.dataset.custo ? parseFloat(selectedOption.dataset.custo) : 0;

    const desconto = parseFloat(document.getElementById('venda-desconto').value) || 0;
    const isTradeIn = document.getElementById('toggle-tradein').checked;
    const valorTradeIn = isTradeIn ? (parseFloat(document.getElementById('ti-valor-avaliado').value) || 0) : 0;

    const totalLiquido = Math.max(0, subtotal - desconto - valorTradeIn);
    const lucroBruto = (subtotal - desconto) - custoBase;
    const margemPct = (subtotal - desconto) > 0 ? ((lucroBruto / (subtotal - desconto)) * 100).toFixed(1) : 0;

    document.getElementById('resumo-subtotal').innerText = formatMoeda(subtotal);
    document.getElementById('resumo-desconto').innerText = `- ${formatMoeda(desconto)}`;
    document.getElementById('resumo-tradein').innerText = `- ${formatMoeda(valorTradeIn)}`;
    document.getElementById('resumo-total-liquido').innerText = formatMoeda(totalLiquido);

    document.getElementById('resumo-lucro-bruto').innerText = `+ ${formatMoeda(lucroBruto)}`;
    document.getElementById('resumo-margem-pct').innerText = `${margemPct}%`;
}

async function processarVendaComTradeIn(e) {
    e.preventDefault();

    const dispId = document.getElementById('venda-dispositivo-select').value;
    const clienteId = document.getElementById('venda-cliente-select').value;
    if (!dispId || !clienteId) {
        alert("Selecione o aparelho vendido e o cliente.");
        return;
    }

    const dispSelect = document.getElementById('venda-dispositivo-select');
    const subtotal = parseFloat(dispSelect.selectedOptions[0].dataset.preco);
    const desconto = parseFloat(document.getElementById('venda-desconto').value) || 0;
    const isTradeIn = document.getElementById('toggle-tradein').checked;
    const valorTradeIn = isTradeIn ? (parseFloat(document.getElementById('ti-valor-avaliado').value) || 0) : 0;

    let tradeInPayload = null;
    if (isTradeIn && valorTradeIn > 0) {
        tradeInPayload = {
            tipo: 'iPhone',
            modelo: document.getElementById('ti-modelo').value || 'iPhone Usado',
            capacidade: '128GB',
            cor: 'Space Gray',
            identificador_tipo: 'IMEI',
            identificador_valor: document.getElementById('ti-identificador').value || `TI-${Date.now().toString().slice(-6)}`,
            saude_bateria: 85,
            condicao_grau: 'Grau B (Leves marcas)',
            preco_sugerido_revenda: valorTradeIn * 1.35,
            preco_minimo_revenda: valorTradeIn * 1.20
        };
    }

    const payload = {
        dispositivo_id: dispId,
        cliente_id: clienteId,
        valor_subtotal: subtotal,
        desconto: desconto,
        valor_trade_in: valorTradeIn,
        forma_pagamento: 'PIX / Cartão',
        meses_garantia: parseInt(document.getElementById('venda-garantia-meses').value),
        trade_in: tradeInPayload
    };

    try {
        const res = await fetch('/api/pedidos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            closeModal('modal-venda-tradein');
            await loadAllData();
            showToast("Venda realizada com sucesso!");
            visualizarDocumentoPedido(result.pedido_id);
        } else {
            alert(result.error || "Erro ao processar venda.");
        }
    } catch (err) {
        alert("Erro na conexão com o servidor ao processar venda.");
    }
}

// ==============================================================================
// MODAL DE VISUALIZAÇÃO E IMPRESSÃO DE DOCUMENTOS
// ==============================================================================
function visualizarDocumentoPedido(pedidoId) {
    const pedido = AppState.pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    AppState.currentDocData = pedido;
    AppState.currentDocTab = 'recibo';
    renderConteudoDocumento();
    openModal('modal-documento');
}

function trocarAbaDoc(aba) {
    AppState.currentDocTab = aba;
    ['recibo', 'garantia', 'cessao'].forEach(a => {
        const btn = document.getElementById(`aba-btn-${a}`);
        if (btn) {
            if (a === aba) {
                btn.className = 'pill-tab active';
            } else {
                btn.className = 'pill-tab inactive';
            }
        }
    });
    renderConteudoDocumento();
}

function renderConteudoDocumento() {
    const container = document.getElementById('printable-doc-content');
    const p = AppState.currentDocData;
    if (!container || !p) return;

    const dataFormatada = formatData(p.data_venda);
    const garantiaAteFormatada = formatData(p.garantia_ate);

    // Configurar botão WhatsApp
    const btnWhats = document.getElementById('btn-whatsapp-doc');
    if (btnWhats) {
        btnWhats.onclick = () => {
            const mensagem = `Olá, *${p.cliente_nome}*! 👋🦁\n\nAqui é da *iLion Apple Specialist*!\n\n📋 *Pedido:* ${p.numero_pedido}\n📱 *Aparelho:* ${p.dispositivos_descricao}\n💰 *Total Pago:* ${formatMoeda(p.valor_total_liquido)}\n🛡️ *Garantia Especialista:* Válida até *${garantiaAteFormatada}* (${p.meses_garantia * 30} dias balcão)\n\nQualquer dúvida, estamos à disposição! 🚀`;
            window.open(`https://wa.me/${limparTelefone(p.telefone_whatsapp)}?text=${encodeURIComponent(mensagem)}`, '_blank');
        };
    }

    if (AppState.currentDocTab === 'recibo') {
        container.innerHTML = `
            <div class="flex items-center justify-between border-b-2 border-slate-900 pb-4">
                <div class="flex items-center gap-3">
                    <img src="leao.jpg" class="w-12 h-12 rounded-xl object-cover">
                    <div>
                        <h3 class="text-lg font-black text-slate-900">iLion Apple Specialist</h3>
                        <p class="text-[11px] text-slate-500">iPhones, MacBooks e Acessórios Originais</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="font-mono text-xs font-bold bg-slate-900 text-white px-2.5 py-1 rounded-md">${p.numero_pedido}</span>
                    <p class="text-[11px] text-slate-500 mt-1">${dataFormatada}</p>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Cliente Comprador</span>
                    <strong class="text-slate-900">${p.cliente_nome}</strong>
                    <p class="text-slate-600">CPF: ${p.cpf_documento || 'Não informado'}</p>
                </div>
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Contato</span>
                    <p class="text-slate-800">${p.telefone_whatsapp}</p>
                </div>
            </div>

            <div>
                <h5 class="font-bold text-xs uppercase text-slate-400 tracking-wider mb-2">Item Serializado</h5>
                <div class="p-3 border border-slate-200 rounded-xl flex justify-between items-center">
                    <div>
                        <strong class="text-slate-900 text-sm block">${p.dispositivos_descricao}</strong>
                        <span class="text-[11px] text-slate-500">Garantia balcão de ${p.meses_garantia * 30} dias</span>
                    </div>
                    <span class="font-mono font-bold text-slate-900">${formatMoeda(p.valor_subtotal)}</span>
                </div>
            </div>

            <div class="flex justify-end pt-2">
                <div class="w-60 space-y-1.5 text-xs text-slate-600">
                    <div class="flex justify-between">
                        <span>Valor do Aparelho:</span>
                        <span class="font-mono font-bold">${formatMoeda(p.valor_subtotal)}</span>
                    </div>
                    ${p.desconto > 0 ? `<div class="flex justify-between text-rose-600"><span>(-) Desconto:</span><span class="font-mono">- ${formatMoeda(p.desconto)}</span></div>` : ''}
                    ${p.valor_trade_in > 0 ? `<div class="flex justify-between text-amber-600 font-bold"><span>(-) Crédito Trade-In:</span><span class="font-mono">- ${formatMoeda(p.valor_trade_in)}</span></div>` : ''}
                    <div class="flex justify-between pt-2 border-t-2 border-slate-900 text-slate-900 font-black text-sm">
                        <span>Total Pago:</span>
                        <span class="font-mono">${formatMoeda(p.valor_total_liquido)}</span>
                    </div>
                </div>
            </div>

            <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 text-xs flex justify-between items-center">
                <span>🛡️ Garantia Especialista até: <strong>${garantiaAteFormatada}</strong></span>
                <span class="font-bold text-[10px] bg-emerald-200 px-2 py-0.5 rounded-full uppercase">Ativa</span>
            </div>
        `;
    } else if (AppState.currentDocTab === 'garantia') {
        container.innerHTML = `
            <div class="flex items-center gap-3 border-b-2 border-slate-900 pb-3">
                <img src="leao.jpg" class="w-10 h-10 rounded-xl object-cover">
                <div>
                    <h4 class="font-black text-slate-900">CERTIFICADO DE GARANTIA ESPECIALISTA APPLE</h4>
                    <p class="text-[11px] text-slate-500">iLion Store &bull; Pedido ${p.numero_pedido}</p>
                </div>
            </div>
            <div class="space-y-3 text-xs text-slate-700 leading-relaxed text-justify">
                <p><strong>1. PRAZO:</strong> Garantia balcão de <strong>${p.meses_garantia * 30} dias</strong> referente ao aparelho <strong>${p.dispositivos_descricao}</strong>, com vigência até <strong>${garantiaAteFormatada}</strong>.</p>
                <p><strong>2. COBERTURA:</strong> Cobre defeitos de funcionamento em componentes eletrônicos internos (placa lógica, Face ID/Touch ID, câmeras, conector de carga).</p>
                <p><strong>3. EXCLUSÕES:</strong> Danos por queda, impacto mecânico, trincas na carcaça/tela ou oxidação por contato com líquidos.</p>
            </div>
        `;
    } else if (AppState.currentDocTab === 'cessao') {
        container.innerHTML = `
            <div class="flex items-center gap-3 border-b-2 border-slate-900 pb-3">
                <img src="leao.jpg" class="w-10 h-10 rounded-xl object-cover">
                <div>
                    <h4 class="font-black text-slate-900">TERMO DE DECLARAÇÃO E CESSÃO DE APARELHO (TRADE-IN)</h4>
                    <p class="text-[11px] text-slate-500">Salvaguarda Jurídica contra Procedência Ilícita &bull; Pedido ${p.numero_pedido}</p>
                </div>
            </div>
            <div class="space-y-3 text-xs text-slate-700 leading-relaxed text-justify">
                <p>O(A) Cedente <strong>${p.cliente_nome}</strong>, CPF <strong>${p.cpf_documento || 'informado em cadastro'}</strong>, declara sob as penas da lei (Arts. 180 e 299 do Código Penal Brasileiro) que o aparelho entregue como Trade-In no valor de <strong>${formatMoeda(p.valor_trade_in)}</strong> é de sua exclusiva propriedade e posse lícita, livre de queixas de furto, roubo ou bloqueio de operadora/iCloud.</p>
            </div>
        `;
    }
}

function abrirTermoCessaoTradeIn(tradeInId) {
    const trade = AppState.tradeIns.find(t => t.id === tradeInId);
    if (!trade) return;

    AppState.currentDocData = {
        numero_pedido: `TRADE-${trade.id.slice(0, 6)}`,
        data_venda: trade.data_troca,
        cliente_nome: trade.cliente_nome,
        cpf_documento: trade.cpf_documento,
        telefone_whatsapp: trade.telefone_whatsapp,
        dispositivos_descricao: `${trade.modelo} (${trade.capacidade})`,
        valor_total_liquido: 0,
        valor_trade_in: trade.valor_avaliado,
        valor_subtotal: trade.valor_avaliado,
        meses_garantia: 3,
        garantia_ate: new Date().toISOString()
    };
    AppState.currentDocTab = 'cessao';
    trocarAbaDoc('cessao');
    openModal('modal-documento');
}

// ==============================================================================
// MODAL DE NOVA ENCOMENDA
// ==============================================================================
function openModalNovaEncomenda() {
    atualizarSelectsClientes();
    atualizarSelectsModelos();
    openModal('modal-nova-encomenda');
}

async function salvarNovaEncomenda(e) {
    e.preventDefault();
    const payload = {
        cliente_id: document.getElementById('enc-cliente').value,
        modelo_desejado: document.getElementById('enc-modelo').value,
        capacidade_preferida: document.getElementById('enc-capacidade').value,
        orcamento_maximo: parseFloat(document.getElementById('enc-orcamento').value) || null
    };

    try {
        const res = await fetch('/api/encomendas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            closeModal('modal-nova-encomenda');
            await loadAllData();
            showToast("Encomenda salva na lista de espera!");
        }
    } catch (err) {
        alert("Erro ao salvar encomenda.");
    }
}

// ==============================================================================
// MODAL DE NOVO CLIENTE
// ==============================================================================
function openModalNovoCliente() {
    const titulo = document.getElementById('modal-cli-titulo');
    if (titulo) titulo.innerText = 'Novo Cliente';

    const btnSalvar = document.getElementById('modal-cli-btn-salvar');
    if (btnSalvar) btnSalvar.innerText = 'Salvar Cliente';

    document.getElementById('cli-id').value = '';
    document.getElementById('cli-nome').value = '';
    document.getElementById('cli-whatsapp').value = '';
    document.getElementById('cli-cpf').value = '';
    document.getElementById('cli-email').value = '';
    document.getElementById('cli-aparelho-atual').value = '';
    document.getElementById('cli-endereco').value = '';
    document.getElementById('cli-observacoes').value = '';

    openModal('modal-novo-cliente');
}

function abrirModalEditarCliente(clienteId) {
    const c = AppState.clientes.find(item => item.id === clienteId);
    if (!c) return;

    const titulo = document.getElementById('modal-cli-titulo');
    if (titulo) titulo.innerText = 'Editar Cliente';

    const btnSalvar = document.getElementById('modal-cli-btn-salvar');
    if (btnSalvar) btnSalvar.innerText = 'Atualizar Cliente';

    document.getElementById('cli-id').value = c.id;
    document.getElementById('cli-nome').value = c.nome || '';
    document.getElementById('cli-whatsapp').value = c.telefone_whatsapp || '';
    document.getElementById('cli-cpf').value = c.cpf_documento || '';
    document.getElementById('cli-email').value = c.email || '';
    document.getElementById('cli-aparelho-atual').value = c.aparelho_atual_descricao || '';
    document.getElementById('cli-endereco').value = c.endereco || '';
    document.getElementById('cli-observacoes').value = c.observacoes || '';

    openModal('modal-novo-cliente');
}

async function salvarNovoCliente(e) {
    e.preventDefault();
    const id = document.getElementById('cli-id').value;
    const payload = {
        id: id || undefined,
        nome: document.getElementById('cli-nome').value.trim(),
        telefone_whatsapp: document.getElementById('cli-whatsapp').value.trim(),
        cpf_documento: document.getElementById('cli-cpf').value.trim(),
        email: document.getElementById('cli-email').value.trim(),
        aparelho_atual_descricao: document.getElementById('cli-aparelho-atual').value.trim(),
        endereco: document.getElementById('cli-endereco').value.trim(),
        observacoes: document.getElementById('cli-observacoes').value.trim()
    };

    try {
        const res = await fetch('/api/clientes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            closeModal('modal-novo-cliente');
            await loadAllData();
            showToast(id ? 'Cliente atualizado com sucesso!' : 'Cliente cadastrado com sucesso!');
            if (AppState.subAbaCRM === 'clientes') {
                renderClientes();
            }
        } else {
            alert(result.error || 'Erro ao salvar cliente.');
        }
    } catch (err) {
        alert('Erro na conexão com o servidor ao salvar cliente.');
    }
}

async function excluirCliente(clienteId) {
    const c = AppState.clientes.find(item => item.id === clienteId);
    const clienteNome = c ? c.nome : 'este cliente';
    if (!confirm(`Deseja realmente excluir o cliente "${clienteNome}"? Esta ação removerá o cliente também do Supabase.`)) {
        return;
    }
    try {
        const res = await fetch(`/api/clientes?id=${clienteId}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (result.success) {
            showToast('Cliente removido com sucesso!');
            await loadAllData();
            if (AppState.subAbaCRM === 'clientes') {
                renderClientes();
            }
        } else {
            alert(result.error || 'Erro ao excluir cliente.');
        }
    } catch (err) {
        alert('Erro na conexão com o servidor ao excluir cliente.');
    }
}

// ==============================================================================
// MODAL DE NOVO LEAD CRM
// ==============================================================================
function openModalNovoLead() {
    atualizarSelectsClientes();
    atualizarSelectsModelos();
    openModal('modal-novo-lead');
}

async function salvarNovoLead(e) {
    e.preventDefault();
    const payload = {
        cliente_id: document.getElementById('crm-cliente').value,
        etapa_funil: document.getElementById('crm-etapa').value,
        dispositivo_interesse_modelo: document.getElementById('crm-modelo').value,
        notas: document.getElementById('crm-notas').value
    };

    try {
        const res = await fetch('/api/crm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            closeModal('modal-novo-lead');
            await loadAllData();
            showToast("Negociação salva no CRM!");
        }
    } catch (err) {
        alert("Erro ao salvar lead.");
    }
}

// ==============================================================================
// SUPABASE & CONFIGURAÇÕES
// ==============================================================================
async function checkSupabaseConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        if (data.config && data.config.supabase_url && data.config.supabase_key) {
            initSupabaseClient(data.config.supabase_url, data.config.supabase_key);
        }
    } catch (e) {
        console.log("Modo local ativo.");
    }
}

function initSupabaseClient(url, key) {
    if (window.supabase && url && key) {
        try {
            AppState.supabaseClient = window.supabase.createClient(url, key);
            console.log("Supabase sincronizado em segundo plano.");
        } catch (e) {
            console.error("Falha ao instanciar Supabase:", e);
        }
    }
}

async function salvarConfigSupabase() {
    const url = document.getElementById('input-supabase-url').value.trim();
    const key = document.getElementById('input-supabase-key').value.trim();

    try {
        await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ supabase_url: url, supabase_key: key })
        });
        initSupabaseClient(url, key);
        showToast("Configurações salvas!");
    } catch (e) {
        alert("Erro ao salvar.");
    }
}

async function testarConexaoSupabase() {
    const url = document.getElementById('input-supabase-url').value.trim();
    const key = document.getElementById('input-supabase-key').value.trim();
    if (!url || !key) {
        alert("Preencha a URL e a Anon Key primeiro.");
        return;
    }

    try {
        const client = window.supabase.createClient(url, key);
        const { error } = await client.from('dispositivos').select('id').limit(1);
        if (error) {
            alert(`Erro Supabase: ${error.message}`);
        } else {
            alert("✓ Conexão bem-sucedida com o Supabase!");
        }
    } catch (e) {
        alert(`Falha: ${e.message}`);
    }
}

function copiarScriptSQL() {
    fetch('supabase_schema.sql')
        .then(r => r.text())
        .then(text => {
            navigator.clipboard.writeText(text);
            showToast("Script SQL copiado com sucesso!");
        })
        .catch(() => {
            showToast("Abra o arquivo supabase_schema.sql.");
        });
}

// ==============================================================================
// WHATSAPP
// ==============================================================================
function enviarWhatsAppMatchPorId(encId) {
    const e = AppState.encomendas.find(item => item.id === encId);
    if (!e) return;
    const preco = e.disp_preco ? formatMoeda(e.disp_preco) : (e.orcamento_maximo ? formatMoeda(e.orcamento_maximo) : 'ótimo preço');
    const msg = `Olá, *${e.cliente_nome}*! 👋🦁 Aqui é da *iLion Apple Specialist*.\n\nLembra que você estava procurando um *${e.modelo_desejado}*? 📱✨\n\nAcabou de chegar uma unidade revisada no nosso estoque por *${preco}*!\n\nQuer que eu separe para você?`;
    window.open(`https://wa.me/${limparTelefone(e.telefone_whatsapp)}?text=${encodeURIComponent(msg)}`, '_blank');
}

function enviarWhatsAppMatch(telefone, nome, modelo, preco) {
    const msg = `Olá, *${nome}*! 👋🦁 Aqui é da *iLion Apple Specialist*.\n\nLembra que você estava procurando um *${modelo}*? 📱✨\n\nAcabou de chegar uma unidade revisada no nosso estoque por *${preco}*!\n\nQuer que eu separe para você?`;
    window.open(`https://wa.me/${limparTelefone(telefone)}?text=${encodeURIComponent(msg)}`, '_blank');
}

function enviarWhatsAppGarantia(telefone, nome, aparelho) {
    const msg = `Olá, *${nome}*! 👋🦁 Aqui é da equipe de pós-venda da *iLion Apple Specialist*.\n\nPassando para saber como está sua experiência com o seu *${aparelho}*! A sua garantia balcão está próxima do término e queríamos confirmar se está tudo 100% perfeito. Conte conosco!`;
    window.open(`https://wa.me/${limparTelefone(telefone)}?text=${encodeURIComponent(msg)}`, '_blank');
}

function enviarWhatsAppUpgrade(telefone, nome, aparelho) {
    const msg = `Olá, *${nome}*! Tudo bem? 🦁✨\n\nVimos que você está usando o seu *${aparelho}* há quase um ano! A iLion preparou uma condição especial de *Trade-In VIP*: você entrega seu aparelho pelo melhor valor de avaliação e sai com o modelo mais recente da Apple!\n\nPodemos fazer uma simulação rápida sem compromisso? 📱🚀`;
    window.open(`https://wa.me/${limparTelefone(telefone)}?text=${encodeURIComponent(msg)}`, '_blank');
}

function enviarWhatsAppLead(telefone, nome, interesse) {
    const msg = `Olá, *${nome}*! Tudo bem? 🦁 Aqui é da *iLion Apple Specialist*. Vi que você tem interesse no *${interesse || 'iPhone'}*. Como posso te ajudar hoje?`;
    window.open(`https://wa.me/${limparTelefone(telefone)}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ==============================================================================
// UTILITÁRIOS
// ==============================================================================
function formatMoeda(val) {
    return (parseFloat(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatData(isoStr) {
    if (!isoStr) return '--';
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? isoStr : d.toLocaleDateString('pt-BR');
}

function limparTelefone(tel) {
    return (tel || '').replace(/\D/g, '');
}

function copiarTexto(texto) {
    navigator.clipboard.writeText(texto);
    showToast(`Copiado: ${texto}`);
}

function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    
    el.classList.remove('hidden');
    el.classList.add('ios-modal-backdrop');
    
    const sheet = el.querySelector('.bg-white') || el.firstElementChild;
    if (sheet) sheet.classList.add('ios-modal-sheet');

    requestAnimationFrame(() => {
        el.classList.remove('closing');
        el.classList.add('active');
    });

    if (!el.dataset.backdropBound) {
        el.dataset.backdropBound = "true";
        el.addEventListener('click', (e) => {
            if (e.target === el) {
                closeModal(id);
            }
        });
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (!el || el.classList.contains('hidden')) return;

    el.classList.add('closing');
    el.classList.remove('active');
    setTimeout(() => {
        el.classList.add('hidden');
        el.classList.remove('closing');
    }, 240);
}

function showToast(msg, icon = 'fa-check') {
    const existing = document.querySelectorAll('.ios-toast-banner');
    existing.forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'ios-toast-banner fixed top-5 left-1/2 -translate-x-1/2 bg-[#121418]/92 text-white px-5 py-2.5 rounded-full shadow-2xl z-[9999] text-xs font-semibold flex items-center gap-2.5 backdrop-blur-xl border border-white/10 select-none';
    toast.innerHTML = `<span class="w-5 h-5 rounded-full bg-yellow-400/20 text-yellow-300 flex items-center justify-center text-[10px]"><i class="fa-solid ${icon}"></i></span> <span class="tracking-tight">${msg}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('ios-toast-leaving');
        setTimeout(() => toast.remove(), 260);
    }, 2800);
}

// ==============================================================================
// GESTÃO DO CATÁLOGO DE MODELOS / PRODUTOS PADRONIZADOS
// ==============================================================================
function renderModelos() {
    const corpo = document.getElementById('tabela-modelos-corpo');
    if (!corpo) return;

    const badge = document.getElementById('badge-total-modelos');
    const todosModelos = AppState.modelos || [];
    if (badge) badge.innerText = todosModelos.length;

    const filtroCat = AppState.filtroCategoriaModelo || 'Todos';
    const termo = (AppState.termoBuscaModelos || '').toLowerCase().trim();

    // Mapeamento de contagem em estoque e desejos
    const dispPorModelo = {};
    (AppState.dispositivos || []).forEach(d => {
        if (!d.modelo) return;
        const norm = d.modelo.toLowerCase().trim();
        if (d.status !== 'Vendido') {
            dispPorModelo[norm] = (dispPorModelo[norm] || 0) + 1;
        }
    });

    const desejosPorModelo = {};
    (AppState.encomendas || []).forEach(e => {
        const modNome = e.modelo_desejado || e.modelo;
        if (!modNome) return;
        const norm = modNome.toLowerCase().trim();
        if (e.status !== 'Atendido' && e.status !== 'Cancelado') {
            desejosPorModelo[norm] = (desejosPorModelo[norm] || 0) + 1;
        }
    });

    const filtrados = todosModelos.filter(m => {
        const matchCat = (filtroCat === 'Todos') || (m.tipo === filtroCat);
        const matchTermo = !termo || m.nome.toLowerCase().includes(termo) || (m.tipo && m.tipo.toLowerCase().includes(termo));
        return matchCat && matchTermo;
    });

    if (filtrados.length === 0) {
        corpo.innerHTML = `
            <tr>
                <td colspan="5" class="py-12 text-center text-slate-400">
                    <div class="flex flex-col items-center justify-center gap-2">
                        <i class="fa-solid fa-tags text-3xl text-slate-300"></i>
                        <p class="font-semibold text-slate-500">Nenhum modelo encontrado.</p>
                        <p class="text-[11px] text-slate-400">Tente ajustar a busca ou cadastre um novo modelo no catálogo.</p>
                        <button onclick="openModalNovoModelo()" class="btn-pill-primary mt-2">
                            <i class="fa-solid fa-plus"></i> Cadastrar Modelo
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const badgeCores = {
        'iPhone': 'bg-blue-50 text-blue-700 border-blue-200/60',
        'MacBook': 'bg-purple-50 text-purple-700 border-purple-200/60',
        'iPad': 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
        'Apple Watch': 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
        'Acessório': 'bg-amber-50 text-amber-700 border-amber-200/60',
        'Outros': 'bg-slate-100 text-slate-700 border-slate-200'
    };

    const iconesPorTipo = {
        'iPhone': 'fa-mobile-screen',
        'MacBook': 'fa-laptop',
        'iPad': 'fa-tablet-screen-button',
        'Apple Watch': 'fa-clock',
        'Acessório': 'fa-headphones'
    };

    corpo.innerHTML = filtrados.map(m => {
        const norm = m.nome.toLowerCase().trim();
        const emEstoque = dispPorModelo[norm] || 0;
        const emDesejos = desejosPorModelo[norm] || 0;
        const badgeClasse = badgeCores[m.tipo] || badgeCores['Outros'];
        const icone = iconesPorTipo[m.tipo] || 'fa-tag';

        return `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="px-4 py-3.5 whitespace-nowrap">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badgeClasse}">
                        <i class="fa-solid ${icone} text-[10px]"></i>
                        ${m.tipo || 'Geral'}
                    </span>
                </td>
                <td class="px-4 py-3.5 whitespace-nowrap">
                    <span class="font-black text-slate-800 text-xs tracking-tight">${m.nome}</span>
                </td>
                <td class="px-4 py-3.5 text-center whitespace-nowrap">
                    ${emEstoque > 0 ? `
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            ${emEstoque} em estoque
                        </span>
                    ` : `
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-400">
                            0 unidades
                        </span>
                    `}
                </td>
                <td class="px-4 py-3.5 text-center whitespace-nowrap">
                    ${emDesejos > 0 ? `
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <i class="fa-solid fa-heart text-[9px] text-amber-500"></i>
                            ${emDesejos} ${emDesejos === 1 ? 'desejo' : 'desejos'}
                        </span>
                    ` : `
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-400">
                            Nenhum
                        </span>
                    `}
                </td>
                <td class="px-4 py-3.5 text-right whitespace-nowrap">
                    <div class="inline-flex items-center gap-1">
                        <button onclick="openModalNovoModelo('${m.id}')" title="Editar Nome do Modelo" class="w-7 h-7 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center transition-colors">
                            <i class="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                        <button onclick="excluirModelo('${m.id}')" title="Excluir do Catálogo" class="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors">
                            <i class="fa-solid fa-trash text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filtrarCategoriaModelos(cat) {
    AppState.filtroCategoriaModelo = cat;
    const container = document.getElementById('filtro-categoria-modelos');
    if (container) {
        container.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-cat') === cat) {
                btn.className = 'pill-tab active';
            } else {
                btn.className = 'pill-tab inactive';
            }
        });
    }
    renderModelos();
}

function handleBuscaModelos(val) {
    AppState.termoBuscaModelos = val;
    renderModelos();
}

function openModalNovoModelo(modeloId = null, prefillTipo = null) {
    const modal = document.getElementById('modal-cadastro-modelo');
    if (!modal) return;

    const titulo = document.getElementById('modal-modelo-titulo');
    const inputId = document.getElementById('modelo-edit-id');
    const inputTipo = document.getElementById('modelo-tipo');
    const inputNome = document.getElementById('modelo-nome');

    if (modeloId) {
        const mod = (AppState.modelos || []).find(m => String(m.id) === String(modeloId));
        if (!mod) {
            showToast('Modelo não encontrado.', 'fa-triangle-exclamation');
            return;
        }
        if (titulo) titulo.innerText = 'Editar Modelo';
        if (inputId) inputId.value = mod.id;
        if (inputTipo) inputTipo.value = mod.tipo || 'iPhone';
        if (inputNome) inputNome.value = mod.nome || '';
    } else {
        if (titulo) titulo.innerText = 'Novo Produto / Modelo';
        if (inputId) inputId.value = '';
        if (inputTipo) inputTipo.value = prefillTipo || 'iPhone';
        if (inputNome) inputNome.value = '';
    }

    openModal('modal-cadastro-modelo');
    setTimeout(() => {
        if (inputNome) inputNome.focus();
    }, 120);
}

async function salvarModeloCatalogo(e) {
    e.preventDefault();
    const id = document.getElementById('modelo-edit-id').value;
    const tipo = document.getElementById('modelo-tipo').value;
    const nome = document.getElementById('modelo-nome').value.trim();

    if (!nome) {
        alert('Por favor, informe o nome oficial do modelo.');
        return;
    }

    const payload = {
        tipo: tipo,
        nome: nome
    };
    if (id) {
        payload.id = id;
    }

    try {
        const res = await fetch('/api/modelos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
            closeModal('modal-cadastro-modelo');
            
            // Recarregar modelos do backend
            const modRes = await fetch('/api/modelos').then(r => r.json()).catch(() => ({ modelos: [] }));
            AppState.modelos = modRes.modelos || [];

            renderModelos();
            atualizarSelectsModelos(nome);

            // Se o modal de cadastro de aparelho estiver aberto, selecionar o modelo recém-adicionado
            const cadSelect = document.getElementById('cad-modelo');
            if (cadSelect && !document.getElementById('modal-cadastro-aparelho').classList.contains('hidden')) {
                cadSelect.value = nome;
                aoSelecionarModeloCadastro();
            }

            // Se o modal de encomenda estiver aberto
            const encSelect = document.getElementById('enc-modelo');
            if (encSelect && !document.getElementById('modal-nova-encomenda').classList.contains('hidden')) {
                encSelect.value = nome;
            }

            // Se o modal de trade-in estiver aberto
            const tiSelect = document.getElementById('ti-modelo');
            if (tiSelect && !document.getElementById('modal-venda-tradein').classList.contains('hidden')) {
                tiSelect.value = nome;
            }

            // Se o modal de lead crm estiver aberto
            const crmSelect = document.getElementById('crm-modelo');
            if (crmSelect && !document.getElementById('modal-novo-lead').classList.contains('hidden')) {
                crmSelect.value = nome;
            }

            showToast(id ? 'Modelo atualizado com sucesso!' : 'Modelo adicionado ao catálogo!');
        } else {
            alert(data.error || 'Erro ao salvar modelo.');
        }
    } catch (err) {
        console.error('Erro ao salvar modelo:', err);
        alert('Erro de conexão ao salvar modelo.');
    }
}

async function excluirModelo(id) {
    const mod = (AppState.modelos || []).find(m => String(m.id) === String(id));
    if (!mod) return;

    if (!confirm(`Deseja realmente excluir "${mod.nome}" do catálogo de modelos?\n\nOs aparelhos já cadastrados no estoque não serão apagados, mas o modelo não aparecerá mais como sugestão para novos cadastros.`)) {
        return;
    }

    try {
        const res = await fetch('/api/modelos/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            // Recarregar modelos do backend
            const modRes = await fetch('/api/modelos').then(r => r.json()).catch(() => ({ modelos: [] }));
            AppState.modelos = modRes.modelos || [];

            renderModelos();
            atualizarSelectsModelos();
            showToast('Modelo removido do catálogo!');
        } else {
            alert(data.error || 'Erro ao excluir modelo.');
        }
    } catch (err) {
        console.error('Erro ao excluir modelo:', err);
        alert('Erro ao conectar com o servidor.');
    }
}

function atualizarSelectsModelos(valorPreferencial = null) {
    const selects = [
        { id: 'cad-modelo', placeholder: '-- Selecione o Modelo do Catálogo --' },
        { id: 'enc-modelo', placeholder: '-- Selecione o Modelo Desejado --' },
        { id: 'ti-modelo', placeholder: '-- Selecione o Modelo Entregue --' },
        { id: 'crm-modelo', placeholder: '-- Selecione o Modelo do Catálogo --' }
    ];

    const modelos = AppState.modelos || [];
    
    // Organizar por categoria/tipo
    const ordemCategorias = ['iPhone', 'MacBook', 'iPad', 'Apple Watch', 'Acessório', 'Outros'];
    const grupos = {};

    modelos.forEach(m => {
        const cat = m.tipo || 'Outros';
        if (!grupos[cat]) grupos[cat] = [];
        grupos[cat].push(m.nome);
    });

    selects.forEach(({ id, placeholder }) => {
        const el = document.getElementById(id);
        if (!el) return;

        // Se passar valorPreferencial, usa ele prioritariamente para esse select caso aplicável
        const currentVal = (valorPreferencial && typeof valorPreferencial === 'string') ? valorPreferencial : el.value;

        let html = `<option value="">${placeholder}</option>`;

        let valorExisteNoCatalogo = false;

        ordemCategorias.forEach(cat => {
            if (grupos[cat] && grupos[cat].length > 0) {
                html += `<optgroup label="${cat}s">`;
                grupos[cat].forEach(nome => {
                    const isSelected = currentVal && (currentVal.toLowerCase().trim() === nome.toLowerCase().trim());
                    if (isSelected) valorExisteNoCatalogo = true;
                    html += `<option value="${nome}" ${isSelected ? 'selected' : ''}>${nome}</option>`;
                });
                html += `</optgroup>`;
            }
        });

        // Adicionar qualquer outra categoria customizada
        Object.keys(grupos).forEach(cat => {
            if (!ordemCategorias.includes(cat) && grupos[cat].length > 0) {
                html += `<optgroup label="${cat}">`;
                grupos[cat].forEach(nome => {
                    const isSelected = currentVal && (currentVal.toLowerCase().trim() === nome.toLowerCase().trim());
                    if (isSelected) valorExisteNoCatalogo = true;
                    html += `<option value="${nome}" ${isSelected ? 'selected' : ''}>${nome}</option>`;
                });
                html += `</optgroup>`;
            }
        });

        // Se havia um valor anterior que não está cadastrado no catálogo (ex: cadastros antigos), preserva!
        if (currentVal && !valorExisteNoCatalogo) {
            html += `<optgroup label="Outro / Não Catalogado">
                <option value="${currentVal}" selected>${currentVal}</option>
            </optgroup>`;
        }

        el.innerHTML = html;
        if (currentVal) {
            el.value = currentVal;
        }
    });
}

// ==============================================================================
// GESTÃO DE FOTOS & STORAGE SUPABASE
// ==============================================================================

function initDropzoneFotos() {
    const dropzone = document.getElementById('cad-fotos-dropzone');
    if (!dropzone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('border-amber-500', 'bg-amber-50/50');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('border-amber-500', 'bg-amber-50/50');
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            processarArquivosFotos(files);
        }
    }, false);
}

function aoSelecionarFotos(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
        processarArquivosFotos(files);
    }
    // Permite selecionar novamente o mesmo arquivo se necessário
    event.target.value = '';
}

function comprimirImagem(file, maxDimension = 1400, quality = 0.82) {
    return new Promise((resolve, reject) => {
        if (!file.type || !file.type.startsWith('image/')) {
            return reject(new Error('O arquivo selecionado não é uma imagem válida.'));
        }

        const reader = new FileReader();
        reader.onload = (readerEvent) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Converte para JPEG otimizado para web e armazenamento na nuvem
                const base64 = canvas.toDataURL('image/jpeg', quality);
                const safeName = (file.name || 'foto.jpg').replace(/\.[^/.]+$/, "") + ".jpg";
                resolve({ base64, filename: safeName });
            };
            img.onerror = () => reject(new Error('Erro ao decodificar a imagem.'));
            img.src = readerEvent.target.result;
        };
        reader.onerror = () => reject(new Error('Erro ao ler arquivo do computador.'));
        reader.readAsDataURL(file);
    });
}

async function processarArquivosFotos(files) {
    if (!AppState.fotosCadastro) AppState.fotosCadastro = [];

    const loadingEl = document.getElementById('cad-fotos-loading');
    const loadingText = document.getElementById('cad-fotos-loading-text');

    if (loadingEl) loadingEl.classList.remove('hidden');

    const total = files.length;
    let enviados = 0;

    for (let i = 0; i < total; i++) {
        const file = files[i];
        if (loadingText) loadingText.innerText = `Otimizando foto ${i + 1} de ${total}...`;

        try {
            const { base64, filename } = await comprimirImagem(file);

            if (loadingText) loadingText.innerText = `Salvando foto ${i + 1} de ${total} no Supabase Storage...`;

            const res = await fetch('/api/upload-foto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: filename,
                    image_base64: base64
                })
            });

            const data = await res.json();
            if (data.success && data.url) {
                AppState.fotosCadastro.push(data.url);
                enviados++;
                renderPreviewFotosCadastro();
            } else {
                alert(`Erro ao salvar foto "${file.name}": ${data.error || 'Falha no upload'}`);
            }
        } catch (err) {
            console.error('Erro no upload de foto:', err);
            alert(`Falha ao processar "${file.name}": ${err.message}`);
        }
    }

    if (loadingEl) loadingEl.classList.add('hidden');
    if (enviados > 0) {
        showToast(`${enviados} foto(s) anexada(s) com sucesso!`);
    }
}

function renderPreviewFotosCadastro() {
    const container = document.getElementById('cad-fotos-container');
    if (!container) return;

    const fotos = AppState.fotosCadastro || [];
    if (fotos.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = fotos.map((url, idx) => `
        <div class="relative group rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 aspect-square shadow-xs">
            <img src="${url}" alt="Foto ${idx + 1}" class="w-full h-full object-cover">
            
            ${idx === 0 ? `
                <span class="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-xs text-white text-[9px] font-bold">
                    Capa
                </span>
            ` : ''}

            <!-- Botão Excluir -->
            <button type="button" onclick="removerFotoCadastro(${idx})" 
                    title="Remover foto" 
                    class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center text-xs shadow-md transition-all opacity-90 hover:opacity-100">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `).join('');
}

function removerFotoCadastro(index) {
    if (AppState.fotosCadastro && AppState.fotosCadastro[index] !== undefined) {
        AppState.fotosCadastro.splice(index, 1);
        renderPreviewFotosCadastro();
    }
}

// ==============================================================================
// GALERIA LIGHTBOX DE FOTOS (VISUALIZADOR)
// ==============================================================================

function abrirGaleriaFotos(dispId, indexInicial = 0) {
    const disp = AppState.dispositivos.find(d => d.id === dispId);
    if (!disp) return;

    let fotos = disp.fotos;
    if (typeof fotos === 'string') {
        try { fotos = JSON.parse(fotos); } catch (e) { fotos = []; }
    }
    fotos = Array.isArray(fotos) ? fotos : [];

    if (fotos.length === 0) {
        alert("Este aparelho ainda não possui fotos cadastradas. Clique no ícone de lápis para editar e anexar fotos.");
        return;
    }

    AppState.galeriaAtiva = {
        dispId: disp.id,
        modelo: disp.modelo || 'Aparelho',
        detalhes: `${disp.capacidade || ''} • ${disp.cor || ''} • ${disp.identificador_tipo || 'IMEI'}: ${disp.identificador_valor || ''}`,
        fotos: fotos,
        index: (indexInicial >= 0 && indexInicial < fotos.length) ? indexInicial : 0
    };

    renderVisualizadorGaleria();
    openModal('modal-galeria-fotos');
}

function renderVisualizadorGaleria() {
    const galeria = AppState.galeriaAtiva;
    if (!galeria || !galeria.fotos || galeria.fotos.length === 0) return;

    const total = galeria.fotos.length;
    const curIdx = galeria.index;
    const currentUrl = galeria.fotos[curIdx];

    const tituloEl = document.getElementById('galeria-titulo');
    if (tituloEl) tituloEl.innerText = galeria.modelo;

    const subtituloEl = document.getElementById('galeria-subtitulo');
    if (subtituloEl) subtituloEl.innerText = galeria.detalhes;

    const imgPrincipal = document.getElementById('galeria-imagem-principal');
    if (imgPrincipal) {
        imgPrincipal.src = currentUrl;
    }

    const btnLink = document.getElementById('galeria-btn-link');
    if (btnLink) {
        btnLink.href = currentUrl;
    }

    const contador = document.getElementById('galeria-contador');
    if (contador) {
        contador.innerText = `Foto ${curIdx + 1} de ${total}`;
    }

    const btnPrev = document.getElementById('galeria-btn-prev');
    const btnNext = document.getElementById('galeria-btn-next');
    if (total <= 1) {
        if (btnPrev) btnPrev.classList.add('hidden');
        if (btnNext) btnNext.classList.add('hidden');
    } else {
        if (btnPrev) btnPrev.classList.remove('hidden');
        if (btnNext) btnNext.classList.remove('hidden');
    }

    // Miniaturas na barra inferior
    const miniaturasEl = document.getElementById('galeria-miniaturas');
    if (miniaturasEl) {
        miniaturasEl.innerHTML = galeria.fotos.map((url, i) => `
            <button type="button" onclick="irParaFotoGaleria(${i})" 
                    class="w-12 h-12 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${i === curIdx ? 'border-amber-500 scale-105 shadow-md ring-2 ring-amber-400/40' : 'border-slate-200 opacity-60 hover:opacity-100'}">
                <img src="${url}" alt="Miniatura ${i + 1}" class="w-full h-full object-cover">
            </button>
        `).join('');
    }
}

function navegarGaleria(direcao) {
    const galeria = AppState.galeriaAtiva;
    if (!galeria || !galeria.fotos || galeria.fotos.length <= 1) return;

    const total = galeria.fotos.length;
    galeria.index = (galeria.index + direcao + total) % total;
    renderVisualizadorGaleria();
}

function irParaFotoGaleria(index) {
    const galeria = AppState.galeriaAtiva;
    if (!galeria || !galeria.fotos) return;
    if (index >= 0 && index < galeria.fotos.length) {
        galeria.index = index;
        renderVisualizadorGaleria();
    }
}


