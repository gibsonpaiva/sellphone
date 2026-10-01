#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
==============================================================================
SISTEMA DE GESTÃO APPLE - CRM, ESTOQUE SERIALIZADO, TRADE-IN E PÓS-VENDA
Servidor HTTP & REST API nativo Python 3 (Sem dependências externas)
==============================================================================
"""

import http.server
import socketserver
import json
import sqlite3
import os
import sys
import webbrowser
import urllib.parse
from datetime import datetime, timedelta
import uuid

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "dados_sistema.sqlite3")

# ==============================================================================
# SINCRONIZAÇÃO BIDIRECIONAL / EM SEGUNDO PLANO COM SUPABASE
# ==============================================================================
def get_supabase_headers():
    env_file = os.path.join(BASE_DIR, ".env")
    if not os.path.exists(env_file):
        return None, None
    keys = {}
    try:
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    k, v = line.strip().split('=', 1)
                    keys[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        pass
    url = keys.get('SUPABASE_URL')
    key = keys.get('SUPABASE_SECRET_KEY') or keys.get('SUPABASE_ANON_KEY') or keys.get('SUPABASE_PUBLISHABLE_KEY')
    return url, key

def sync_upsert_supabase(table, data_dict):
    url, key = get_supabase_headers()
    if not url or not key or not data_dict:
        return
    try:
        import urllib.request, ssl
        ctx = ssl.create_default_context()
        endpoint = f"{url}/rest/v1/{table}"
        headers = {
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
        }
        clean_data = dict(data_dict)
        clean_data.pop('custo_total', None)
        clean_data.pop('lucro_item', None)

        if table == 'dispositivos':
            if clean_data.get('origem') not in ('Compra Fornecedor', 'Trade-In / Troca', 'Consignado'):
                clean_data['origem'] = 'Compra Fornecedor'
            if clean_data.get('condicao_grau') not in ('Novo Lacrado', 'Grau A+ (Impecável)', 'Grau A (Excelente)', 'Grau B (Leves marcas)', 'Grau C (Sinais visíveis)'):
                clean_data['condicao_grau'] = 'Grau A+ (Impecável)'
            if clean_data.get('status') not in ('Em Estoque', 'Reservado', 'Vendido', 'Em Manutenção/Revisão'):
                clean_data['status'] = 'Em Estoque'

        if 'checklist_tecnico' in clean_data and isinstance(clean_data['checklist_tecnico'], str):
            try:
                clean_data['checklist_tecnico'] = json.loads(clean_data['checklist_tecnico'])
            except Exception:
                clean_data['checklist_tecnico'] = {}

        if table == 'trocas_trade_in' and 'termo_cessao_aceito' in clean_data:
            clean_data['termo_cessao_aceito'] = bool(clean_data['termo_cessao_aceito'])

        if table == 'encomendas_desejos' and 'notificado_cliente' in clean_data:
            clean_data['notificado_cliente'] = bool(clean_data['notificado_cliente'])

        for k, v in list(clean_data.items()):
            if v == '' and ('data' in k or 'garantia_ate' in k or 'origem_id' in k or 'dispositivo_compativel_id' in k):
                clean_data[k] = None

        body = json.dumps([clean_data]).encode('utf-8')
        req = urllib.request.Request(endpoint, data=body, headers=headers, method='POST')
        with urllib.request.urlopen(req, context=ctx, timeout=4) as resp:
            pass
    except Exception as e:
        err_msg = str(e)
        if hasattr(e, 'read'):
            try:
                err_msg += f" - {e.read().decode('utf-8')}"
            except Exception:
                pass
        sys.stderr.write(f"[Supabase Upsert Aviso ({table})]: {err_msg}\n")

# Mantém retrocompatibilidade com chamadas antigas
def sync_to_supabase(table, data_dict):
    sync_upsert_supabase(table, data_dict)

def sync_delete_supabase(table, filter_col, filter_val):
    url, key = get_supabase_headers()
    if not url or not key or not filter_val:
        return
    try:
        import urllib.request, ssl, urllib.parse
        ctx = ssl.create_default_context()
        val_quoted = urllib.parse.quote(str(filter_val))
        endpoint = f"{url}/rest/v1/{table}?{filter_col}=eq.{val_quoted}"
        headers = {
            'apikey': key,
            'Authorization': f'Bearer {key}'
        }
        req = urllib.request.Request(endpoint, headers=headers, method='DELETE')
        with urllib.request.urlopen(req, context=ctx, timeout=4) as resp:
            pass
    except Exception as e:
        err_msg = str(e)
        if hasattr(e, 'read'):
            try:
                err_msg += f" - {e.read().decode('utf-8')}"
            except Exception:
                pass
        sys.stderr.write(f"[Supabase Delete Aviso ({table} {filter_col}={filter_val})]: {err_msg}\n")

def sync_pull_from_supabase(target_table=None):
    url, key = get_supabase_headers()
    if not url or not key:
        return
    import urllib.request, ssl, json
    ctx = ssl.create_default_context()
    
    if target_table == 'pedidos_venda':
        tables_to_sync = ['pedidos_venda', 'itens_venda']
    elif target_table:
        tables_to_sync = [target_table]
    else:
        tables_to_sync = ['pedidos_venda', 'itens_venda', 'trocas_trade_in', 'clientes', 'dispositivos', 'interacoes_crm', 'encomendas_desejos']
    
    # 1. Busca dados da nuvem via HTTP sem abrir transações no SQLite
    fetched_data = {}
    for table in tables_to_sync:
        try:
            endpoint = f"{url}/rest/v1/{table}?select=*"
            headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
            req = urllib.request.Request(endpoint, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=6) as resp:
                fetched_data[table] = json.loads(resp.read().decode('utf-8'))
        except Exception as fe:
            sys.stderr.write(f"[Supabase Pull Fetch Aviso ({table})]: {fe}\n")

    if not fetched_data:
        return

    # 2. Aplica atualizações no SQLite em transação rápida e isolada
    conn = get_db_connection()
    c = conn.cursor()
    try:
        for table, supa_rows in fetched_data.items():
            try:
                supa_ids = {row['id'] for row in supa_rows if 'id' in row}
                
                # Se registros foram excluídos no Supabase, exclui também do SQLite
                c.execute(f"SELECT id FROM {table}")
                local_ids = {r[0] for r in c.fetchall()}
                ids_to_delete = local_ids - supa_ids
                
                if ids_to_delete:
                    if table == 'pedidos_venda':
                        for pid in ids_to_delete:
                            c.execute("DELETE FROM itens_venda WHERE pedido_id = ?", (pid,))
                            c.execute("UPDATE trocas_trade_in SET pedido_id = NULL WHERE pedido_id = ?", (pid,))
                    
                    placeholders = ','.join(['?'] * len(ids_to_delete))
                    c.execute(f"DELETE FROM {table} WHERE id IN ({placeholders})", list(ids_to_delete))
                
                # Insere ou atualiza registros que vieram do Supabase
                c.execute(f"PRAGMA table_info({table})")
                sqlite_cols = {col[1] for col in c.fetchall()}
                for row in supa_rows:
                    clean_row = {k: v for k, v in row.items() if k in sqlite_cols}
                    if 'checklist_tecnico' in clean_row and isinstance(clean_row['checklist_tecnico'], (dict, list)):
                        clean_row['checklist_tecnico'] = json.dumps(clean_row['checklist_tecnico'])
                    cols = list(clean_row.keys())
                    if not cols:
                        continue
                    placeholders = ','.join(['?'] * len(cols))
                    col_names = ','.join(cols)
                    c.execute(f"INSERT OR REPLACE INTO {table} ({col_names}) VALUES ({placeholders})", list(clean_row.values()))
                    
            except Exception as te:
                sys.stderr.write(f"[Supabase Pull Apply Aviso ({table})]: {te}\n")
        
        conn.commit()
    finally:
        conn.close()

# ==============================================================================
# MOTOR INTELIGENTE DE MATCHING (ENCOMENDAS & ESTOQUE EM TEMPO REAL)
# ==============================================================================
import re
import unicodedata

def normalizar_capacidade(cap):
    if not cap:
        return ""
    c = str(cap).strip().upper().replace(" ", "")
    if c in ("QUALQUER", "TODAS", "QUALQUERCAPACIDADE", "SEMPREFERENCIA", "-", "NULL", "NONE"):
        return ""
    if c.isdigit():
        if int(c) in (1, 2):
            return f"{c}TB"
        return f"{c}GB"
    return c

def normalizar_texto(txt):
    if not txt:
        return ""
    nfkd = unicodedata.normalize('NFKD', str(txt))
    sem_acento = "".join([c for c in nfkd if not unicodedata.combining(c)])
    limpo = re.sub(r'[^\w\s]', ' ', sem_acento.lower())
    return " ".join(limpo.split())

def modelo_compativel(mod_desejado, mod_dispositivo):
    m_des = normalizar_texto(mod_desejado)
    m_disp = normalizar_texto(mod_dispositivo)
    if not m_des or not m_disp:
        return False
    if m_des == m_disp:
        return True
    if m_des in m_disp or m_disp in m_des:
        return True
    return False

def capacidade_compativel(cap_desejada, cap_dispositivo):
    c_des = normalizar_capacidade(cap_desejada)
    if not c_des:
        return True
    c_disp = normalizar_capacidade(cap_dispositivo)
    return c_des == c_disp

def cor_compativel(cor_desejada, cor_dispositivo):
    c_des = normalizar_texto(cor_desejada)
    if not c_des or c_des in ("qualquer", "todas", "sem preferencia", "indiferente", "padrao", "todas as cores", "-"):
        return True
    c_disp = normalizar_texto(cor_dispositivo)
    return (c_des in c_disp) or (c_disp in c_des)

def orcamento_compativel(orcamento_maximo, preco_sugerido):
    if orcamento_maximo is None or float(orcamento_maximo) <= 0:
        return True
    return float(preco_sugerido) <= float(orcamento_maximo)

def reconciliar_encomendas_atendidas(conn=None):
    close_when_done = False
    if conn is None:
        conn = get_db_connection()
        close_when_done = True
    c = conn.cursor()
    atendidos = []
    try:
        c.execute('''
            SELECT e.id as enc_id, iv.dispositivo_id, d.modelo as disp_modelo, e.modelo_desejado
            FROM encomendas_desejos e
            JOIN pedidos_venda pv ON pv.cliente_id = e.cliente_id
            JOIN itens_venda iv ON iv.pedido_id = pv.id
            JOIN dispositivos d ON d.id = iv.dispositivo_id
            WHERE e.status IN ('Aguardando', 'Compatível Encontrado')
        ''')
        rows = [dict(r) for r in c.fetchall()]
        for r in rows:
            if modelo_compativel(r.get('modelo_desejado'), r.get('disp_modelo')):
                c.execute('''
                    UPDATE encomendas_desejos
                    SET status = 'Atendido', dispositivo_compativel_id = ?
                    WHERE id = ?
                ''', (r['dispositivo_id'], r['enc_id']))
                atendidos.append(r)
        if atendidos:
            conn.commit()
    except Exception as e:
        sys.stderr.write(f"[Reconciliação Erro]: {e}\n")
    finally:
        if close_when_done:
            conn.close()

    for item in atendidos:
        sync_upsert_supabase('encomendas_desejos', {
            'id': item['enc_id'],
            'status': 'Atendido',
            'dispositivo_compativel_id': item['dispositivo_id']
        })

def recalcular_smart_matches(conn=None):
    close_when_done = False
    if conn is None:
        conn = get_db_connection()
        close_when_done = True
    c = conn.cursor()
    try:
        # Reconcilia antes para garantir que vendas concluídas retirem o cliente da lista
        reconciliar_encomendas_atendidas(conn)

        # Apenas encomendas em aberto devem ser recalculadas pelo motor de compatibilidade
        c.execute("SELECT * FROM encomendas_desejos WHERE status IN ('Aguardando', 'Compatível Encontrado')")
        encomendas = [dict(row) for row in c.fetchall()]

        c.execute('''
            SELECT id, modelo, capacidade, cor, preco_sugerido
            FROM dispositivos
            WHERE status = 'Em Estoque'
            ORDER BY preco_sugerido ASC
        ''')
        dispositivos = [dict(row) for row in c.fetchall()]

        alteracoes = []
        for enc in encomendas:
            enc_id = enc['id']
            enc_status = enc.get('status')
            enc_disp_id = enc.get('dispositivo_compativel_id')

            match_disp = None
            # 1. Tenta match completo (modelo + capacidade + cor + orçamento)
            for disp in dispositivos:
                if (modelo_compativel(enc['modelo_desejado'], disp['modelo']) and
                    capacidade_compativel(enc['capacidade_preferida'], disp['capacidade']) and
                    cor_compativel(enc['cor_preferida'], disp['cor']) and
                    orcamento_compativel(enc['orcamento_maximo'], disp['preco_sugerido'])):
                    match_disp = disp
                    break

            # 2. Se não achou com a cor, mas o modelo, capacidade e orçamento batem, também oferece
            if not match_disp:
                for disp in dispositivos:
                    if (modelo_compativel(enc['modelo_desejado'], disp['modelo']) and
                        capacidade_compativel(enc['capacidade_preferida'], disp['capacidade']) and
                        orcamento_compativel(enc['orcamento_maximo'], disp['preco_sugerido'])):
                        match_disp = disp
                        break

            if match_disp:
                novo_status = 'Compatível Encontrado'
                novo_disp_id = match_disp['id']
            else:
                novo_status = 'Aguardando'
                novo_disp_id = None

            if novo_status != enc_status or novo_disp_id != enc_disp_id:
                c.execute('''
                    UPDATE encomendas_desejos
                    SET status = ?, dispositivo_compativel_id = ?
                    WHERE id = ?
                ''', (novo_status, novo_disp_id, enc_id))
                enc_payload = dict(enc)
                enc_payload['status'] = novo_status
                enc_payload['dispositivo_compativel_id'] = novo_disp_id
                alteracoes.append(enc_payload)

        if alteracoes:
            conn.commit()
        if close_when_done:
            conn.close()
            conn = None
        if alteracoes:
            for enc_payload in alteracoes:
                sync_upsert_supabase('encomendas_desejos', enc_payload)
    finally:
        if close_when_done and conn:
            try:
                conn.close()
            except Exception:
                pass

# ==============================================================================
# INICIALIZAÇÃO DO BANCO DE DADOS LOCAL (SQLITE3)
# ==============================================================================
def get_db_connection():
    conn = sqlite3.connect(DB_FILE, timeout=15)
    conn.execute("PRAGMA busy_timeout = 10000;")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA busy_timeout = 10000;")
        conn.execute("PRAGMA synchronous = NORMAL;")
    except Exception:
        pass
    c = conn.cursor()
    
    # Clientes
    c.execute('''
    CREATE TABLE IF NOT EXISTS clientes (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        telefone_whatsapp TEXT NOT NULL,
        email TEXT,
        cpf_documento TEXT,
        endereco TEXT,
        aparelho_atual_descricao TEXT,
        observacoes TEXT,
        created_at TEXT
    )''')
    
    # Dispositivos (Estoque Serializado)
    c.execute('''
    CREATE TABLE IF NOT EXISTS dispositivos (
        id TEXT PRIMARY KEY,
        tipo TEXT NOT NULL,
        modelo TEXT NOT NULL,
        capacidade TEXT NOT NULL,
        cor TEXT NOT NULL,
        identificador_tipo TEXT NOT NULL,
        identificador_valor TEXT NOT NULL,
        saude_bateria INTEGER,
        ciclos_bateria INTEGER,
        condicao_grau TEXT NOT NULL,
        checklist_tecnico TEXT,
        status TEXT NOT NULL DEFAULT 'Em Estoque',
        custo_compra REAL NOT NULL,
        custos_adicionais REAL DEFAULT 0,
        preco_sugerido REAL NOT NULL,
        preco_minimo REAL NOT NULL,
        origem TEXT DEFAULT 'Compra Fornecedor',
        cliente_origem_id TEXT,
        notas_tecnicas TEXT,
        data_entrada TEXT,
        created_at TEXT
    )''')
    
    # Migração automática: remover restrição UNIQUE de identificador_valor se existir
    try:
        c.execute("PRAGMA index_list('dispositivos')")
        for idx in c.fetchall():
            idx_name = idx[1]
            c.execute(f"PRAGMA index_info('{idx_name}')")
            cols = [col[2] for col in c.fetchall()]
            if 'identificador_valor' in cols and idx[2] == 1:
                c.execute("PRAGMA foreign_keys=OFF")
                c.execute('''
                CREATE TABLE dispositivos_temp (
                    id TEXT PRIMARY KEY,
                    tipo TEXT NOT NULL,
                    modelo TEXT NOT NULL,
                    capacidade TEXT NOT NULL,
                    cor TEXT NOT NULL,
                    identificador_tipo TEXT NOT NULL,
                    identificador_valor TEXT NOT NULL,
                    saude_bateria INTEGER,
                    ciclos_bateria INTEGER,
                    condicao_grau TEXT NOT NULL,
                    checklist_tecnico TEXT,
                    status TEXT NOT NULL DEFAULT 'Em Estoque',
                    custo_compra REAL NOT NULL,
                    custos_adicionais REAL DEFAULT 0,
                    preco_sugerido REAL NOT NULL,
                    preco_minimo REAL NOT NULL,
                    origem TEXT DEFAULT 'Compra Fornecedor',
                    cliente_origem_id TEXT,
                    notas_tecnicas TEXT,
                    data_entrada TEXT,
                    created_at TEXT
                )''')
                c.execute("INSERT INTO dispositivos_temp SELECT * FROM dispositivos")
                c.execute("DROP TABLE dispositivos")
                c.execute("ALTER TABLE dispositivos_temp RENAME TO dispositivos")
                conn.commit()
                c.execute("PRAGMA foreign_keys=ON")
                break
    except Exception as me:
        sys.stderr.write(f"[Migração Dispositivos Aviso]: {me}\n")
    
    # Pedidos de Venda
    c.execute('''
    CREATE TABLE IF NOT EXISTS pedidos_venda (
        id TEXT PRIMARY KEY,
        numero_pedido TEXT UNIQUE NOT NULL,
        cliente_id TEXT NOT NULL,
        data_venda TEXT,
        valor_subtotal REAL,
        desconto REAL DEFAULT 0,
        valor_trade_in REAL DEFAULT 0,
        valor_total_liquido REAL,
        forma_pagamento TEXT,
        meses_garantia INTEGER DEFAULT 3,
        garantia_ate TEXT,
        custo_total_venda REAL,
        lucro_bruto REAL,
        margem_percentual REAL,
        status TEXT DEFAULT 'Concluída',
        observacoes TEXT,
        created_at TEXT,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )''')
    
    # Itens de Venda
    c.execute('''
    CREATE TABLE IF NOT EXISTS itens_venda (
        id TEXT PRIMARY KEY,
        pedido_id TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL,
        valor_unitario REAL,
        custo_aquisicao REAL,
        lucro_item REAL,
        FOREIGN KEY (pedido_id) REFERENCES pedidos_venda(id),
        FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id)
    )''')
    
    # Trocas Trade-In
    c.execute('''
    CREATE TABLE IF NOT EXISTS trocas_trade_in (
        id TEXT PRIMARY KEY,
        pedido_id TEXT,
        cliente_id TEXT NOT NULL,
        dispositivo_entrada_id TEXT NOT NULL,
        valor_avaliado REAL,
        termo_cessao_aceito INTEGER DEFAULT 1,
        termo_texto TEXT,
        status TEXT DEFAULT 'Aprovado',
        data_troca TEXT,
        created_at TEXT,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id),
        FOREIGN KEY (dispositivo_entrada_id) REFERENCES dispositivos(id)
    )''')
    
    # CRM Interações
    c.execute('''
    CREATE TABLE IF NOT EXISTS interacoes_crm (
        id TEXT PRIMARY KEY,
        cliente_id TEXT NOT NULL,
        etapa_funil TEXT NOT NULL,
        dispositivo_interesse_modelo TEXT,
        canal TEXT DEFAULT 'WhatsApp',
        notas TEXT,
        data_proximo_contato TEXT,
        created_at TEXT,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )''')
    
    # Encomendas / Lista de Espera
    c.execute('''
    CREATE TABLE IF NOT EXISTS encomendas_desejos (
        id TEXT PRIMARY KEY,
        cliente_id TEXT NOT NULL,
        modelo_desejado TEXT NOT NULL,
        capacidade_preferida TEXT,
        cor_preferida TEXT,
        orcamento_maximo REAL,
        status TEXT DEFAULT 'Aguardando',
        dispositivo_compativel_id TEXT,
        notificado_cliente INTEGER DEFAULT 0,
        created_at TEXT,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )''')
    
    # Configurações do Sistema (ex: credenciais Supabase)
    c.execute('''
    CREATE TABLE IF NOT EXISTS config_sistema (
        chave TEXT PRIMARY KEY,
        valor TEXT
    )''')

    # Catálogo Oficial de Modelos de Produtos
    c.execute('''
    CREATE TABLE IF NOT EXISTS catalogo_modelos (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL UNIQUE,
        tipo TEXT NOT NULL DEFAULT 'iPhone',
        created_at TEXT
    )''')

    c.execute('SELECT COUNT(*) FROM catalogo_modelos')
    if c.fetchone()[0] == 0:
        now_cat = datetime.now().isoformat()
        modelos_base = [
            # iPhones
            ('iPhone 11', 'iPhone'),
            ('iPhone 11 Pro', 'iPhone'),
            ('iPhone 11 Pro Max', 'iPhone'),
            ('iPhone 12', 'iPhone'),
            ('iPhone 12 mini', 'iPhone'),
            ('iPhone 12 Pro', 'iPhone'),
            ('iPhone 12 Pro Max', 'iPhone'),
            ('iPhone 13', 'iPhone'),
            ('iPhone 13 mini', 'iPhone'),
            ('iPhone 13 Pro', 'iPhone'),
            ('iPhone 13 Pro Max', 'iPhone'),
            ('iPhone 14', 'iPhone'),
            ('iPhone 14 Plus', 'iPhone'),
            ('iPhone 14 Pro', 'iPhone'),
            ('iPhone 14 Pro Max', 'iPhone'),
            ('iPhone 15', 'iPhone'),
            ('iPhone 15 Plus', 'iPhone'),
            ('iPhone 15 Pro', 'iPhone'),
            ('iPhone 15 Pro Max', 'iPhone'),
            ('iPhone 16', 'iPhone'),
            ('iPhone 16 Plus', 'iPhone'),
            ('iPhone 16 Pro', 'iPhone'),
            ('iPhone 16 Pro Max', 'iPhone'),
            ('iPhone 17 Pro', 'iPhone'),
            # MacBooks
            ('MacBook Air M1', 'MacBook'),
            ('MacBook Air M2', 'MacBook'),
            ('MacBook Air M3', 'MacBook'),
            ('MacBook Pro M1', 'MacBook'),
            ('MacBook Pro M2', 'MacBook'),
            ('MacBook Pro M3 14"', 'MacBook'),
            ('MacBook Pro M3 16"', 'MacBook'),
            ('MacBook Pro M4', 'MacBook'),
            # iPads
            ('iPad 9ª Geração', 'iPad'),
            ('iPad 10ª Geração', 'iPad'),
            ('iPad mini 6', 'iPad'),
            ('iPad Air M1', 'iPad'),
            ('iPad Air M2', 'iPad'),
            ('iPad Pro 11 M4', 'iPad'),
            ('iPad Pro 13 M4', 'iPad'),
            # Apple Watches
            ('Apple Watch SE 2', 'Apple Watch'),
            ('Apple Watch Series 8', 'Apple Watch'),
            ('Apple Watch Series 9', 'Apple Watch'),
            ('Apple Watch Series 10', 'Apple Watch'),
            ('Apple Watch Ultra', 'Apple Watch'),
            ('Apple Watch Ultra 2', 'Apple Watch'),
            # Acessórios
            ('AirPods 3', 'Acessório'),
            ('AirPods Pro 2', 'Acessório'),
            ('AirPods Max', 'Acessório'),
            ('Carregador MagSafe', 'Acessório'),
            ('Apple Pencil USB-C', 'Acessório'),
            ('Apple Pencil Pro', 'Acessório')
        ]
        c.execute('SELECT DISTINCT modelo, tipo FROM dispositivos WHERE modelo IS NOT NULL AND trim(modelo) != ""')
        for r in c.fetchall():
            m_nome = r[0].strip()
            m_tipo = r[1] if r[1] else 'iPhone'
            if m_nome and not any(mb[0].lower() == m_nome.lower() for mb in modelos_base):
                modelos_base.append((m_nome, m_tipo))

        for m_nome, m_tipo in modelos_base:
            m_id = str(uuid.uuid4())
            try:
                c.execute('INSERT OR IGNORE INTO catalogo_modelos (id, nome, tipo, created_at) VALUES (?,?,?,?)', (m_id, m_nome, m_tipo, now_cat))
            except Exception:
                pass
    
    # Reconciliação retroativa: se algum cliente já comprou o modelo desejado em venda concluída, marca o desejo como 'Atendido'
    try:
        c.execute('''
            SELECT e.id as enc_id, iv.dispositivo_id
            FROM encomendas_desejos e
            JOIN pedidos_venda pv ON pv.cliente_id = e.cliente_id
            JOIN itens_venda iv ON iv.pedido_id = pv.id
            JOIN dispositivos d ON d.id = iv.dispositivo_id
            WHERE e.status IN ('Aguardando', 'Compatível Encontrado')
              AND (lower(d.modelo) = lower(e.modelo_desejado) OR d.modelo LIKE '%' || e.modelo_desejado || '%' OR e.modelo_desejado LIKE '%' || d.modelo || '%')
        ''')
        for r in c.fetchall():
            c.execute("UPDATE encomendas_desejos SET status = 'Atendido', dispositivo_compativel_id = ? WHERE id = ?", (r['dispositivo_id'], r['enc_id']))
    except Exception as re_err:
        sys.stderr.write(f"[Reconciliação Encomendas]: {re_err}\n")

    conn.commit()
    
    # Auto-seed desativado a pedido do usuário: nenhum cliente ou produto de teste será criado automaticamente
    # c.execute('SELECT COUNT(*) FROM clientes')
    # if c.fetchone()[0] == 0:
    #     seed_sample_data(conn)
        
    conn.close()

    # Sincroniza dados da nuvem Supabase logo na inicialização
    try:
        sync_pull_from_supabase()
    except Exception as e:
        sys.stderr.write(f"[Supabase Init Sync]: {e}\n")

    # Reconciliação imediata após sync: garante que vendas concluídas retirem o cliente da lista
    try:
        reconciliar_encomendas_atendidas()
    except Exception as e:
        sys.stderr.write(f"[Supabase Post-Sync Reconciliação]: {e}\n")

def seed_sample_data(conn):
    c = conn.cursor()
    now_str = datetime.now().isoformat()
    past_date_30d = (datetime.now() - timedelta(days=30)).isoformat()
    past_date_80d = (datetime.now() - timedelta(days=80)).isoformat()
    past_date_340d = (datetime.now() - timedelta(days=340)).isoformat() # ~11 meses (ciclo de troca!)
    
    # Clientes
    clientes_data = [
        ('cli-1', 'Lucas Andrade Silva', '5511998765432', 'lucas.andrade@email.com', '345.892.128-40', 'Av. Paulista, 1000 - Bela Vista, SP', 'iPhone 13 128GB Azul', 'Cliente focado em troca anual de iPhone', now_str),
        ('cli-2', 'Mariana Costa Ferreira', '5521987654321', 'mariana.costa@email.com', '456.123.789-99', 'Rua Visconde de Pirajá, 350 - Ipanema, RJ', 'iPhone 14 Pro 128GB Roxo', 'Interessada no iPhone 15 Pro Max Titânio Natural', now_str),
        ('cli-3', 'Rafael Guimarães Mendes', '5531991234567', 'rafael.gm@email.com', '789.654.123-22', 'Rua dos Inconfidentes, 800 - Savassi, MG', 'MacBook Air M1 256GB Cinza Espacial', 'Programador, quer upgrade para MacBook Pro M3', now_str),
        ('cli-4', 'Beatriz Nogueira Lima', '5541999887766', 'beatriz.nl@email.com', '123.987.456-11', 'Av. Sete de Setembro, 2400 - Batel, PR', 'iPhone 12 Pro 256GB Dourado', 'Cliente desde 2023. Ciclo de troca ativo!', now_str)
    ]
    c.executemany('INSERT INTO clientes VALUES (?,?,?,?,?,?,?,?,?)', clientes_data)
    
    # Checklist técnico padrão (100% testado)
    default_checklist = json.dumps({
        "face_touch_id": True,
        "tela_original": True,
        "bateria_original": True,
        "true_tone": True,
        "carcaca_sem_trincas": True,
        "cameras_ok": True,
        "som_microfone_ok": True,
        "conectividade_ok": True
    })
    
    dispositivos_data = [
        ('disp-1', 'iPhone', 'iPhone 15 Pro Max', '256GB', 'Titânio Natural', 'IMEI', '352984110293841', 96, None, 'Grau A+ (Impecável)', default_checklist, 'Em Estoque', 4600.0, 120.0, 5890.0, 5650.0, 'Compra Fornecedor', None, 'Estado de novo, película 3D aplicada, cabo original.', now_str, now_str),
        ('disp-2', 'iPhone', 'iPhone 14 Pro', '128GB', 'Roxo-profundo', 'IMEI', '354921098451203', 88, None, 'Grau A (Excelente)', default_checklist, 'Em Estoque', 3400.0, 80.0, 4390.0, 4200.0, 'Trade-In / Troca', 'cli-1', 'Recebido em trade-in. Testes de estresse 100% aprovados.', now_str, now_str),
        ('disp-3', 'MacBook', 'MacBook Air M2', '512GB', 'Estelar', 'Serial', 'C02K9876Q05D', 98, 42, 'Grau A+ (Impecável)', default_checklist, 'Em Estoque', 5200.0, 150.0, 6790.0, 6400.0, 'Compra Fornecedor', None, 'Apenas 42 ciclos de bateria. Carregador MagSafe original incluso.', now_str, now_str),
        ('disp-4', 'iPhone', 'iPhone 13', '128GB', 'Meia-noite', 'IMEI', '358741092837461', 84, None, 'Grau B (Leves marcas)', default_checklist, 'Em Estoque', 2100.0, 70.0, 2990.0, 2850.0, 'Trade-In / Troca', 'cli-2', 'Micro marcas na borda de alumínio imperceptíveis com capa.', now_str, now_str),
        ('disp-5', 'Apple Watch', 'Apple Watch Ultra 2', '64GB', 'Titânio Natural', 'Serial', 'G9HKL34M2P10', 100, None, 'Novo Lacrado', default_checklist, 'Em Estoque', 4100.0, 0.0, 5290.0, 5000.0, 'Compra Fornecedor', None, 'Produto Lacrado de fábrica. Garantia mundial Apple.', now_str, now_str),
        ('disp-6', 'iPhone', 'iPhone 15', '128GB', 'Preto', 'IMEI', '359871234901823', 100, None, 'Novo Lacrado', default_checklist, 'Reservado', 3800.0, 50.0, 4790.0, 4600.0, 'Compra Fornecedor', None, 'Reservado para cliente com sinal.', now_str, now_str),
        ('disp-7', 'MacBook', 'MacBook Pro M3 14"', '512GB', 'Preto Espacial', 'Serial', 'C02MN4988KL1', 99, 18, 'Grau A+ (Impecável)', default_checklist, 'Em Estoque', 8400.0, 100.0, 10990.0, 10500.0, 'Compra Fornecedor', None, 'Máquina de altíssima performance para desenvolvedores e criadores.', now_str, now_str)
    ]
    c.executemany('INSERT INTO dispositivos VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', dispositivos_data)
    
    # Vendas Anteriores para alimentar histórico de garantia e pós-venda
    # Venda 1: Feita há 80 dias (garantia de 90 dias vencendo em 10 dias!)
    garantia_date_v1 = (datetime.now() + timedelta(days=10)).strftime('%Y-%m-%d')
    c.execute('''INSERT INTO pedidos_venda VALUES (
        'ped-1', 'PED-2026-001', 'cli-1', ?, 4200.0, 100.0, 1200.0, 2900.0,
        'PIX + Trade-In', 3, ?, 3100.0, 1000.0, 24.39, 'Concluída',
        'Venda com entrega de iPhone 11 no Trade-In', ?
    )''', (past_date_80d, garantia_date_v1, past_date_80d))
    
    # Venda 2: Feita há 340 dias (cerca de 11 meses atrás -> Alerta de Ciclo de Troca / Upgrade!)
    garantia_date_v2 = (datetime.now() - timedelta(days=250)).strftime('%Y-%m-%d')
    c.execute('''INSERT INTO pedidos_venda VALUES (
        'ped-2', 'PED-2025-089', 'cli-4', ?, 4990.0, 0.0, 0.0, 4990.0,
        'Cartão 12x', 3, ?, 3800.0, 1190.0, 23.85, 'Concluída',
        'Cliente comprou iPhone 12 Pro 256GB Dourado. Hora de oferecer upgrade!', ?
    )''', (past_date_340d, garantia_date_v2, past_date_340d))
    
    # Encomendas na Lista de Espera (com Match Automático)
    encomendas_data = [
        ('enc-1', 'cli-2', 'iPhone 15 Pro Max', '256GB', 'Titânio Natural', 6000.0, 'Compatível Encontrado', 'disp-1', 0, now_str),
        ('enc-2', 'cli-3', 'MacBook Pro M3 14"', '512GB', 'Preto Espacial', 11500.0, 'Compatível Encontrado', 'disp-7', 0, now_str),
        ('enc-3', 'cli-1', 'iPad Pro 11 M4', '256GB', 'Cinza Espacial', 5500.0, 'Aguardando', None, 0, now_str)
    ]
    c.executemany('INSERT INTO encomendas_desejos VALUES (?,?,?,?,?,?,?,?,?,?)', encomendas_data)
    
    # CRM Funil de Vendas
    crm_data = [
        ('crm-1', 'cli-1', 'Aguardando Aparelho/Trade-in', 'iPhone 15 Pro Max', 'WhatsApp', 'Cliente quer trazer o iPhone 13 para abater no 15 Pro Max.', (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d'), now_str),
        ('crm-2', 'cli-2', 'Em Negociação', 'iPhone 15 Pro Max 256GB Titânio', 'WhatsApp', 'Match encontrado no estoque! Proposta de R$ 5.890 enviada.', (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d'), now_str),
        ('crm-3', 'cli-3', 'Em Negociação', 'MacBook Pro M3 14"', 'Instagram', 'Cliente analisando condições de parcelamento em 12x.', (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d'), now_str),
        ('crm-4', 'cli-4', 'Novo Contato', 'iPhone 15 Pro', 'WhatsApp', 'Alerta de Ciclo de Troca (11 meses com iPhone 12 Pro). Proposta de recompra enviada.', (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d'), now_str)
    ]
    c.executemany('INSERT INTO interacoes_crm VALUES (?,?,?,?,?,?,?,?)', crm_data)
    
    conn.commit()

# ==============================================================================
# CONTROLADOR DE REQUISIÇÕES HTTP & REST API
# ==============================================================================
class AppleStoreHandler(http.server.SimpleHTTPRequestHandler):
    
    def log_message(self, format, *args):
        # Log mais limpo no terminal
        sys.stderr.write(f"[{datetime.now().strftime('%H:%M:%S')}] {format % args}\n")

    def send_json(self, data, status=200):
        try:
            response_bytes = json.dumps(data, ensure_ascii=False, default=str).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(response_bytes)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            self.end_headers()
            self.wfile.write(response_bytes)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Roteamento da API REST
        if path.startswith('/api/'):
            self.handle_api_get(path, query)
            return

        # Servir arquivos estáticos padrão (index.html, leao.jpg, etc.)
        if path == '/' or path == '':
            self.path = '/index.html'
            
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith('/api/'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            try:
                data = json.loads(body) if body else {}
            except Exception:
                data = {}
            self.handle_api_post(path, data)
            return

        self.send_error(404, "Endpoint não encontrado")

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        item_id = query.get('id', [None])[0]

        if not item_id:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                body = self.rfile.read(content_length).decode('utf-8')
                try:
                    data = json.loads(body)
                    item_id = data.get('id')
                except Exception:
                    pass

        conn = get_db_connection()
        c = conn.cursor()
        try:
            if path == '/api/dispositivos':
                c.execute("SELECT count(*) as total FROM itens_venda WHERE dispositivo_id = ?", (item_id,))
                if c.fetchone()['total'] > 0:
                    self.send_json({'error': 'Não é possível excluir um aparelho que possui venda registrada.'}, 400)
                    return

                # Se o aparelho estava associado a um Trade-In, remove o registro do Trade-In
                c.execute("DELETE FROM trocas_trade_in WHERE dispositivo_entrada_id = ?", (item_id,))

                # Obter serial/identificador para garantir exclusão também no Supabase
                c.execute("SELECT identificador_valor FROM dispositivos WHERE id = ?", (item_id,))
                row = c.fetchone()
                serial_val = row['identificador_valor'] if row else None

                c.execute("UPDATE encomendas_desejos SET dispositivo_compativel_id = NULL, status = 'Aguardando' WHERE dispositivo_compativel_id = ?", (item_id,))
                c.execute("DELETE FROM dispositivos WHERE id = ?", (item_id,))
                conn.commit()
                conn.close()
                conn = None

                recalcular_smart_matches()

                # Sincroniza exclusão no Supabase por ID
                sync_delete_supabase('trocas_trade_in', 'dispositivo_entrada_id', item_id)
                sync_delete_supabase('dispositivos', 'id', item_id)

                self.send_json({'success': True, 'message': 'Aparelho excluído do estoque com sucesso!'})
                return

            if path in ('/api/trade-in', '/api/trocas'):
                c.execute("SELECT * FROM trocas_trade_in WHERE id = ?", (item_id,))
                trade = c.fetchone()
                if not trade:
                    self.send_json({'error': 'Registro de Trade-In não encontrado.'}, 404)
                    return

                disp_entrada_id = trade['dispositivo_entrada_id']
                if disp_entrada_id:
                    c.execute("SELECT count(*) as total FROM itens_venda WHERE dispositivo_id = ?", (disp_entrada_id,))
                    row_venda = c.fetchone()
                    if (row_venda['total'] if isinstance(row_venda, sqlite3.Row) else row_venda[0]) > 0:
                        self.send_json({'error': 'Não é possível excluir este Trade-In pois o aparelho recebido na troca já foi vendido.'}, 400)
                        return

                c.execute("DELETE FROM trocas_trade_in WHERE id = ?", (item_id,))

                if disp_entrada_id:
                    c.execute("UPDATE encomendas_desejos SET dispositivo_compativel_id = NULL, status = 'Aguardando' WHERE dispositivo_compativel_id = ?", (disp_entrada_id,))
                    c.execute("DELETE FROM dispositivos WHERE id = ?", (disp_entrada_id,))

                conn.commit()
                conn.close()
                conn = None

                recalcular_smart_matches()

                sync_delete_supabase('trocas_trade_in', 'id', item_id)
                if disp_entrada_id:
                    sync_delete_supabase('dispositivos', 'id', disp_entrada_id)

                self.send_json({'success': True, 'message': 'Registro de Trade-In e aparelho de troca excluídos com sucesso!'})
                return

            if path == '/api/pedidos':
                # Obter IDs dos aparelhos vendidos para restaurar no estoque
                c.execute("SELECT dispositivo_id FROM itens_venda WHERE pedido_id = ?", (item_id,))
                disp_ids = [r[0] for r in c.fetchall()]

                c.execute("DELETE FROM itens_venda WHERE pedido_id = ?", (item_id,))
                c.execute("UPDATE trocas_trade_in SET pedido_id = NULL WHERE pedido_id = ?", (item_id,))
                c.execute("DELETE FROM pedidos_venda WHERE id = ?", (item_id,))

                # Devolver aparelhos vendidos ao status 'Em Estoque' e reabrir desejos
                for d_id in disp_ids:
                    c.execute("UPDATE dispositivos SET status = 'Em Estoque' WHERE id = ?", (d_id,))
                    c.execute("UPDATE encomendas_desejos SET status = 'Aguardando', dispositivo_compativel_id = NULL WHERE dispositivo_compativel_id = ? AND status = 'Atendido'", (d_id,))

                conn.commit()
                conn.close()
                conn = None

                sync_delete_supabase('itens_venda', 'pedido_id', item_id)
                sync_delete_supabase('pedidos_venda', 'id', item_id)
                for d_id in disp_ids:
                    sync_upsert_supabase('dispositivos', {'id': d_id, 'status': 'Em Estoque'})

                recalcular_smart_matches()
                self.send_json({'success': True, 'message': 'Venda e recibo excluídos com sucesso!'})
                return

            if path == '/api/crm':
                c.execute("DELETE FROM interacoes_crm WHERE id = ?", (item_id,))
                conn.commit()
                conn.close()
                conn = None

                sync_delete_supabase('interacoes_crm', 'id', item_id)
                self.send_json({'success': True, 'message': 'Negociação excluída com sucesso!'})
                return

            if path == '/api/encomendas':
                c.execute("DELETE FROM encomendas_desejos WHERE id = ?", (item_id,))
                conn.commit()
                conn.close()
                conn = None

                sync_delete_supabase('encomendas_desejos', 'id', item_id)
                self.send_json({'success': True, 'message': 'Encomenda excluída com sucesso!'})
                return

            if path == '/api/clientes':
                c.execute("SELECT count(*) as total FROM pedidos_venda WHERE cliente_id = ?", (item_id,))
                if c.fetchone()['total'] > 0:
                    self.send_json({'error': 'Não é possível excluir um cliente que possui histórico de vendas registradas.'}, 400)
                    return

                # Excluir trocas de Trade-in vinculadas a este cliente (e seus aparelhos se não foram vendidos)
                c.execute("SELECT id, dispositivo_entrada_id FROM trocas_trade_in WHERE cliente_id = ?", (item_id,))
                trades_cli = c.fetchall()
                for tr in trades_cli:
                    tr_id = tr['id'] if isinstance(tr, sqlite3.Row) else tr[0]
                    tr_disp = tr['dispositivo_entrada_id'] if isinstance(tr, sqlite3.Row) else tr[1]
                    if tr_disp:
                        c.execute("SELECT count(*) as total FROM itens_venda WHERE dispositivo_id = ?", (tr_disp,))
                        if c.fetchone()['total'] == 0:
                            c.execute("DELETE FROM dispositivos WHERE id = ?", (tr_disp,))
                            sync_delete_supabase('dispositivos', 'id', tr_disp)
                    c.execute("DELETE FROM trocas_trade_in WHERE id = ?", (tr_id,))
                    sync_delete_supabase('trocas_trade_in', 'id', tr_id)

                c.execute("SELECT cpf_documento FROM clientes WHERE id = ?", (item_id,))
                row = c.fetchone()
                cpf = row['cpf_documento'] if row else None

                c.execute("DELETE FROM interacoes_crm WHERE cliente_id = ?", (item_id,))
                c.execute("DELETE FROM encomendas_desejos WHERE cliente_id = ?", (item_id,))
                c.execute("DELETE FROM clientes WHERE id = ?", (item_id,))
                conn.commit()
                conn.close()
                conn = None

                recalcular_smart_matches()

                sync_delete_supabase('interacoes_crm', 'cliente_id', item_id)
                sync_delete_supabase('encomendas_desejos', 'cliente_id', item_id)
                sync_delete_supabase('clientes', 'id', item_id)
                if cpf:
                    sync_delete_supabase('clientes', 'cpf_documento', cpf)
                self.send_json({'success': True, 'message': 'Cliente excluído com sucesso!'})
                return

            if path == '/api/modelos':
                c.execute('DELETE FROM catalogo_modelos WHERE id = ?', (item_id,))
                conn.commit()
                conn.close()
                conn = None
                recalcular_smart_matches()
                self.send_json({'success': True, 'message': 'Modelo removido do catálogo com sucesso!'})
                return

            self.send_error(404, "Endpoint DELETE não encontrado")
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
            self.send_json({'error': str(e)}, 500)
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    def handle_api_get(self, path, query):
        if path == '/api/sync/pull':
            try:
                sync_pull_from_supabase()
                self.send_json({'success': True, 'message': 'Sincronização com Supabase concluída!'})
            except Exception as e:
                self.send_json({'error': str(e)}, 500)
            return

        if path == '/api/pedidos':
            try:
                sync_pull_from_supabase('pedidos_venda')
            except Exception:
                pass

        conn = get_db_connection()
        c = conn.cursor()

        try:
            # 1. Dashboard Overview Stats
            if path == '/api/dashboard':
                periodo = query.get('periodo', ['mes_atual'])[0] if query else 'mes_atual'

                # Estoque em quantidade e capital (estoque atual ativo à pronta entrega)
                c.execute('''
                    SELECT 
                        COUNT(*) as total_dispositivos,
                        COALESCE(SUM(custo_compra + custos_adicionais), 0) as total_investido,
                        COALESCE(SUM(preco_sugerido), 0) as total_valor_venda,
                        COALESCE(SUM(preco_sugerido - (custo_compra + custos_adicionais)), 0) as total_lucro_projetado
                    FROM dispositivos 
                    WHERE status = 'Em Estoque'
                ''')
                estoque_stats = dict(c.fetchone())

                # Filtro de período para Vendas e Trade-ins (hoje, semana, mes_atual, mes_passado, ano, todos)
                now = datetime.now()
                where_vendas = ["status = 'Concluída'"]
                where_tradeins = []
                params_vendas = []
                params_tradeins = []

                if periodo == 'hoje':
                    today_str = now.strftime('%Y-%m-%d')
                    where_vendas.append("date(data_venda) = ?")
                    params_vendas.append(today_str)
                    where_tradeins.append("date(data_troca) = ?")
                    params_tradeins.append(today_str)
                    periodo_label = "Hoje"
                elif periodo == 'semana':
                    seven_days_ago = (now - timedelta(days=7)).strftime('%Y-%m-%d')
                    where_vendas.append("date(data_venda) >= ?")
                    params_vendas.append(seven_days_ago)
                    where_tradeins.append("date(data_troca) >= ?")
                    params_tradeins.append(seven_days_ago)
                    periodo_label = "Última Semana"
                elif periodo == 'mes_passado':
                    first_of_month = now.replace(day=1)
                    last_month_end = first_of_month - timedelta(days=1)
                    last_month_str = last_month_end.strftime('%Y-%m')
                    where_vendas.append("strftime('%Y-%m', data_venda) = ?")
                    params_vendas.append(last_month_str)
                    where_tradeins.append("strftime('%Y-%m', data_troca) = ?")
                    params_tradeins.append(last_month_str)
                    periodo_label = "Mês Passado"
                elif periodo == 'ano':
                    year_str = now.strftime('%Y')
                    where_vendas.append("strftime('%Y', data_venda) = ?")
                    params_vendas.append(year_str)
                    where_tradeins.append("strftime('%Y', data_troca) = ?")
                    params_tradeins.append(year_str)
                    periodo_label = "Este Ano"
                elif periodo == 'todos':
                    periodo_label = "Todo o Período"
                else: # 'mes_atual' (padrão)
                    periodo = 'mes_atual'
                    month_str = now.strftime('%Y-%m')
                    where_vendas.append("strftime('%Y-%m', data_venda) = ?")
                    params_vendas.append(month_str)
                    where_tradeins.append("strftime('%Y-%m', data_troca) = ?")
                    params_tradeins.append(month_str)
                    periodo_label = "Este Mês"

                # Total de vendas e lucro acumulado no período
                vendas_where_str = " AND ".join(where_vendas)
                c.execute(f'''
                    SELECT 
                        COUNT(*) as total_vendas,
                        COALESCE(SUM(valor_total_liquido), 0) as faturamento_total,
                        COALESCE(SUM(lucro_bruto), 0) as lucro_total
                    FROM pedidos_venda 
                    WHERE {vendas_where_str}
                ''', params_vendas)
                vendas_stats = dict(c.fetchone())

                # Trade-ins contagem no período
                tradein_where_str = ("WHERE " + " AND ".join(where_tradeins)) if where_tradeins else ""
                c.execute(f'''
                    SELECT 
                        COUNT(*) as total_trade_ins, 
                        COALESCE(SUM(valor_avaliado), 0) as valor_total_trade_in 
                    FROM trocas_trade_in
                    {tradein_where_str}
                ''', params_tradeins)
                trade_in_stats = dict(c.fetchone())

                # Alertas de garantia (vencendo em até 15 dias)
                c.execute('''
                    SELECT p.id, p.numero_pedido, p.data_venda, p.garantia_ate, c.nome as cliente_nome, 
                           c.telefone_whatsapp, c.aparelho_atual_descricao,
                           CAST((julianday(p.garantia_ate) - julianday('now')) AS INTEGER) as dias_restantes
                    FROM pedidos_venda p
                    JOIN clientes c ON c.id = p.cliente_id
                    WHERE p.status = 'Concluída' 
                      AND date(p.garantia_ate) >= date('now')
                      AND date(p.garantia_ate) <= date('now', '+15 days')
                    ORDER BY p.garantia_ate ASC
                ''')
                alertas_garantia = [dict(row) for row in c.fetchall()]

                # Alertas de Ciclo de Troca / Upgrade (vendas entre 10 e 14 meses atrás)
                c.execute('''
                    SELECT p.id, p.numero_pedido, p.data_venda, c.nome as cliente_nome, 
                           c.telefone_whatsapp, c.aparelho_atual_descricao,
                           CAST((julianday('now') - julianday(p.data_venda)) / 30.41 AS INTEGER) as meses_desde_compra
                    FROM pedidos_venda p
                    JOIN clientes c ON c.id = p.cliente_id
                    WHERE p.status = 'Concluída'
                      AND (julianday('now') - julianday(p.data_venda)) BETWEEN 300 AND 420
                    ORDER BY p.data_venda ASC
                ''')
                alertas_upgrade = [dict(row) for row in c.fetchall()]

                # Encomendas com Matches no Estoque
                c.execute('''
                    SELECT e.*, c.nome as cliente_nome, c.telefone_whatsapp,
                           d.modelo as disp_modelo, d.capacidade as disp_capacidade, d.cor as disp_cor, d.preco_sugerido as disp_preco
                    FROM encomendas_desejos e
                    JOIN clientes c ON c.id = e.cliente_id
                    LEFT JOIN dispositivos d ON d.id = e.dispositivo_compativel_id
                    WHERE e.status = 'Compatível Encontrado'
                ''')
                matches_encomendas = [dict(row) for row in c.fetchall()]

                self.send_json({
                    'estoque': estoque_stats,
                    'vendas': vendas_stats,
                    'trade_ins': trade_in_stats,
                    'alertas_garantia': alertas_garantia,
                    'alertas_upgrade': alertas_upgrade,
                    'matches_encomendas': matches_encomendas,
                    'periodo': {
                        'chave': periodo,
                        'label': periodo_label
                    }
                })
                return

            # 2. Listar Dispositivos (Estoque Serializado)
            if path == '/api/dispositivos':
                status_filter = query.get('status', [None])[0]
                tipo_filter = query.get('tipo', [None])[0]
                search = query.get('q', [None])[0]

                sql = "SELECT * FROM dispositivos WHERE 1=1"
                params = []

                if status_filter and status_filter != 'Todos':
                    sql += " AND status = ?"
                    params.append(status_filter)

                if tipo_filter and tipo_filter != 'Todos':
                    sql += " AND tipo = ?"
                    params.append(tipo_filter)

                if search:
                    sql += " AND (modelo LIKE ? OR identificador_valor LIKE ? OR cor LIKE ?)"
                    term = f"%{search}%"
                    params.extend([term, term, term])

                sql += " ORDER BY created_at DESC"
                c.execute(sql, params)
                dispositivos = []
                for row in c.fetchall():
                    item = dict(row)
                    if item.get('checklist_tecnico'):
                        try:
                            item['checklist_tecnico'] = json.loads(item['checklist_tecnico'])
                        except Exception:
                            item['checklist_tecnico'] = {}
                    dispositivos.append(item)

                self.send_json({'dispositivos': dispositivos})
                return

            # 3. Listar Clientes
            if path == '/api/clientes':
                c.execute('SELECT * FROM clientes ORDER BY nome ASC')
                clientes = [dict(row) for row in c.fetchall()]
                self.send_json({'clientes': clientes})
                return

            # 4. Listar Pedidos de Venda
            if path == '/api/pedidos':
                c.execute('''
                    SELECT p.*, c.nome as cliente_nome, c.telefone_whatsapp, c.cpf_documento,
                           (SELECT GROUP_CONCAT(d.modelo || ' (' || d.capacidade || ' - ' || d.identificador_valor || ')', ', ')
                            FROM itens_venda iv
                            JOIN dispositivos d ON d.id = iv.dispositivo_id
                            WHERE iv.pedido_id = p.id) as dispositivos_descricao
                    FROM pedidos_venda p
                    JOIN clientes c ON c.id = p.cliente_id
                    ORDER BY p.data_venda DESC
                ''')
                pedidos = [dict(row) for row in c.fetchall()]
                self.send_json({'pedidos': pedidos})
                return

            # 5. Listar Trade-ins
            if path == '/api/trade-ins':
                c.execute('''
                    SELECT t.*, c.nome as cliente_nome, c.cpf_documento, c.telefone_whatsapp,
                           d.modelo, d.capacidade, d.cor, d.identificador_valor, d.saude_bateria, d.condicao_grau
                    FROM trocas_trade_in t
                    JOIN clientes c ON c.id = t.cliente_id
                    JOIN dispositivos d ON d.id = t.dispositivo_entrada_id
                    ORDER BY t.created_at DESC
                ''')
                trade_ins = [dict(row) for row in c.fetchall()]
                self.send_json({'trade_ins': trade_ins})
                return

            # 6. CRM Leads & Pipeline
            if path == '/api/crm':
                c.execute('''
                    SELECT crm.*, c.nome as cliente_nome, c.telefone_whatsapp, c.email, c.aparelho_atual_descricao
                    FROM interacoes_crm crm
                    JOIN clientes c ON c.id = crm.cliente_id
                    ORDER BY crm.created_at DESC
                ''')
                leads = [dict(row) for row in c.fetchall()]
                self.send_json({'leads': leads, 'crm': leads})
                return

            # 7. Encomendas / Wishlist (apenas ativas na lista de espera)
            if path == '/api/encomendas':
                c.execute('''
                    SELECT e.*, c.nome as cliente_nome, c.telefone_whatsapp,
                           d.modelo as disp_modelo, d.capacidade as disp_capacidade, d.cor as disp_cor, d.preco_sugerido as disp_preco
                    FROM encomendas_desejos e
                    JOIN clientes c ON c.id = e.cliente_id
                    LEFT JOIN dispositivos d ON d.id = e.dispositivo_compativel_id
                    WHERE e.status NOT IN ('Atendido', 'Cancelado')
                    ORDER BY e.created_at DESC
                ''')
                encomendas = [dict(row) for row in c.fetchall()]
                self.send_json({'encomendas': encomendas})
                return

            # 8. Configurações (Lê do SQLite e do arquivo .env caso exista)
            if path == '/api/config':
                c.execute('SELECT chave, valor FROM config_sistema')
                config = {row['chave']: row['valor'] for row in c.fetchall()}
                env_file = os.path.join(BASE_DIR, ".env")
                if os.path.exists(env_file):
                    try:
                        with open(env_file, 'r', encoding='utf-8') as f:
                            for line in f:
                                line = line.strip()
                                if line and not line.startswith('#') and '=' in line:
                                    k, v = line.split('=', 1)
                                    k = k.strip().lower()
                                    v = v.strip().strip('"').strip("'")
                                    if 'url' in k:
                                        config['supabase_url'] = v
                                    elif 'key' in k:
                                        config['supabase_key'] = v
                    except Exception:
                        pass
                res_config = dict(config)
                res_config['config'] = config
                self.send_json(res_config)
                return

            # 8. Catálogo de Modelos de Produtos
            if path == '/api/modelos':
                c.execute('SELECT * FROM catalogo_modelos ORDER BY tipo ASC, nome ASC')
                rows = [dict(r) for r in c.fetchall()]
                self.send_json({'modelos': rows})
                return

            self.send_error(404, "Endpoint não encontrado")
        finally:
            conn.close()

    def handle_api_post(self, path, data):
        conn = get_db_connection()
        c = conn.cursor()
        now_str = datetime.now().isoformat()

        try:
            # 1. Cadastrar / Editar Dispositivo no Estoque
            if path == '/api/dispositivos':
                disp_id = data.get('id')
                checklist_val = data.get('checklist_tecnico', {})
                checklist_json = json.dumps(checklist_val) if isinstance(checklist_val, dict) else (checklist_val or '{}')
                
                custo_compra = float(data.get('custo_compra', 0))
                custos_adicionais = float(data.get('custos_adicionais', 0))
                preco_sugerido = float(data.get('preco_sugerido', 0))
                preco_minimo = float(data.get('preco_minimo', 0))
                status_disp = data.get('status', 'Em Estoque')

                if disp_id:
                    c.execute("SELECT origem, cliente_origem_id FROM dispositivos WHERE id = ?", (disp_id,))
                    orig_row = c.fetchone()
                    origem_val = orig_row['origem'] if orig_row and orig_row['origem'] else 'Compra Fornecedor'
                    cliente_origem_val = orig_row['cliente_origem_id'] if orig_row else None

                    # Atualização de aparelho existente
                    c.execute('''
                        UPDATE dispositivos SET
                            tipo = ?, modelo = ?, capacidade = ?, cor = ?, identificador_tipo = ?,
                            identificador_valor = ?, saude_bateria = ?, ciclos_bateria = ?, condicao_grau = ?,
                            checklist_tecnico = ?, status = ?, custo_compra = ?, custos_adicionais = ?,
                            preco_sugerido = ?, preco_minimo = ?, notas_tecnicas = ?
                        WHERE id = ?
                    ''', (
                        data.get('tipo', 'iPhone'),
                        data.get('modelo', ''),
                        data.get('capacidade', '128GB'),
                        data.get('cor', 'Preto'),
                        data.get('identificador_tipo', 'IMEI'),
                        data.get('identificador_valor', '').strip(),
                        int(data.get('saude_bateria', 100)) if data.get('saude_bateria') is not None else 100,
                        int(data.get('ciclos_bateria')) if data.get('ciclos_bateria') else None,
                        data.get('condicao_grau', 'Grau A (Excelente)'),
                        checklist_json,
                        status_disp,
                        custo_compra,
                        custos_adicionais,
                        preco_sugerido,
                        preco_minimo,
                        data.get('notas_tecnicas', ''),
                        disp_id
                    ))
                    c.execute("SELECT * FROM dispositivos WHERE id = ?", (disp_id,))
                    updated_disp_row = c.fetchone()
                    conn.commit()
                    conn.close()
                    conn = None

                    # Sincronização da atualização com Supabase
                    if updated_disp_row:
                        sync_upsert_supabase('dispositivos', dict(updated_disp_row))

                    recalcular_smart_matches()
                    self.send_json({'success': True, 'id': disp_id, 'message': 'Aparelho atualizado no estoque com sucesso!'})
                    return
                else:
                    new_id = str(uuid.uuid4())
                    c.execute('''
                        INSERT INTO dispositivos (
                            id, tipo, modelo, capacidade, cor, identificador_tipo, identificador_valor,
                            saude_bateria, ciclos_bateria, condicao_grau, checklist_tecnico, status,
                            custo_compra, custos_adicionais, preco_sugerido, preco_minimo, origem,
                            cliente_origem_id, notas_tecnicas, data_entrada, created_at
                        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ''', (
                        new_id,
                        data.get('tipo', 'iPhone'),
                        data.get('modelo', ''),
                        data.get('capacidade', '128GB'),
                        data.get('cor', 'Preto'),
                        data.get('identificador_tipo', 'IMEI'),
                        data.get('identificador_valor', '').strip(),
                        int(data.get('saude_bateria', 100)) if data.get('saude_bateria') is not None else 100,
                        int(data.get('ciclos_bateria')) if data.get('ciclos_bateria') else None,
                        data.get('condicao_grau', 'Grau A (Excelente)'),
                        checklist_json,
                        status_disp,
                        custo_compra,
                        custos_adicionais,
                        preco_sugerido,
                        preco_minimo,
                        data.get('origem', 'Compra Fornecedor'),
                        data.get('cliente_origem_id'),
                        data.get('notas_tecnicas', ''),
                        now_str,
                        now_str
                    ))
                    c.execute("SELECT * FROM dispositivos WHERE id = ?", (new_id,))
                    new_disp_row = c.fetchone()
                    conn.commit()
                    conn.close()
                    conn = None

                    # Sincronização imediata com Supabase para garantir integridade de Foreign Keys
                    if new_disp_row:
                        sync_upsert_supabase('dispositivos', dict(new_disp_row))

                    recalcular_smart_matches()

                    self.send_json({'success': True, 'id': new_id, 'message': 'Dispositivo cadastrado com sucesso!'})
                    return

            # 2. Cadastrar / Editar Cliente
            if path == '/api/clientes':
                client_id = data.get('id')
                if client_id:
                    c.execute('''
                        UPDATE clientes 
                        SET nome = ?, telefone_whatsapp = ?, email = ?, cpf_documento = ?, endereco = ?, aparelho_atual_descricao = ?, observacoes = ?
                        WHERE id = ?
                    ''', (
                        data.get('nome', ''),
                        data.get('telefone_whatsapp', ''),
                        data.get('email', ''),
                        data.get('cpf_documento', ''),
                        data.get('endereco', ''),
                        data.get('aparelho_atual_descricao', ''),
                        data.get('observacoes', ''),
                        client_id
                    ))
                    c.execute("SELECT * FROM clientes WHERE id = ?", (client_id,))
                    updated_cli_row = c.fetchone()
                    conn.commit()
                    conn.close()
                    conn = None

                    if updated_cli_row:
                        sync_upsert_supabase('clientes', dict(updated_cli_row))

                    self.send_json({'success': True, 'id': client_id, 'message': 'Cliente atualizado com sucesso!'})
                    return
                else:
                    new_id = str(uuid.uuid4())
                    c.execute('''
                        INSERT INTO clientes (id, nome, telefone_whatsapp, email, cpf_documento, endereco, aparelho_atual_descricao, observacoes, created_at)
                        VALUES (?,?,?,?,?,?,?,?,?)
                    ''', (
                        new_id,
                        data.get('nome', ''),
                        data.get('telefone_whatsapp', ''),
                        data.get('email', ''),
                        data.get('cpf_documento', ''),
                        data.get('endereco', ''),
                        data.get('aparelho_atual_descricao', ''),
                        data.get('observacoes', ''),
                        now_str
                    ))
                    c.execute("SELECT * FROM clientes WHERE id = ?", (new_id,))
                    new_cli_row = c.fetchone()
                    conn.commit()
                    conn.close()
                    conn = None

                    # Sincronização com Supabase
                    if new_cli_row:
                        sync_upsert_supabase('clientes', dict(new_cli_row))

                    self.send_json({'success': True, 'id': new_id, 'message': 'Cliente cadastrado com sucesso!'})
                    return

            # 3. Processar Venda / PDV com ou sem Trade-In
            if path == '/api/pedidos':
                pedido_id = str(uuid.uuid4())
                numero_pedido = f"PED-{datetime.now().strftime('%Y%m%d')}-{pedido_id[:6].upper()}"
                
                cliente_id = data.get('cliente_id')
                dispositivo_vendido_id = data.get('dispositivo_id')
                
                # Buscar dados do dispositivo vendido
                c.execute('SELECT * FROM dispositivos WHERE id = ?', (dispositivo_vendido_id,))
                disp_row = c.fetchone()
                if not disp_row:
                    self.send_json({'error': 'Dispositivo selecionado não encontrado no estoque.'}, 400)
                    return
                
                custo_aquisicao_item = float(disp_row['custo_compra'] or 0) + float(disp_row['custos_adicionais'] or 0)
                valor_venda_item = float(data.get('valor_subtotal', disp_row['preco_sugerido'] or 0))
                desconto = float(data.get('desconto', 0))
                
                trade_in_info = data.get('trade_in')
                valor_trade_in = float(data.get('valor_trade_in', 0))
                if trade_in_info and isinstance(trade_in_info, dict) and valor_trade_in <= 0:
                    valor_trade_in = float(trade_in_info.get('valor_avaliado', 0))
                
                valor_total_liquido = max(0.0, valor_venda_item - desconto - valor_trade_in)
                lucro_bruto = valor_venda_item - desconto - custo_aquisicao_item
                margem_percentual = round((lucro_bruto / (valor_venda_item - desconto) * 100), 2) if (valor_venda_item - desconto) > 0 else 0
                
                meses_garantia = int(data.get('meses_garantia', 3))
                garantia_ate = (datetime.now() + timedelta(days=meses_garantia * 30)).strftime('%Y-%m-%d')
                
                # Inserir pedido
                c.execute('''
                    INSERT INTO pedidos_venda (
                        id, numero_pedido, cliente_id, data_venda, valor_subtotal, desconto,
                        valor_trade_in, valor_total_liquido, forma_pagamento, meses_garantia,
                        garantia_ate, custo_total_venda, lucro_bruto, margem_percentual, status, observacoes, created_at
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ''', (
                    pedido_id, numero_pedido, cliente_id, now_str, valor_venda_item, desconto,
                    valor_trade_in, valor_total_liquido, data.get('forma_pagamento', 'PIX'),
                    meses_garantia, garantia_ate, custo_aquisicao_item, lucro_bruto, margem_percentual,
                    'Concluída', data.get('observacoes', ''), now_str
                ))
                
                # Inserir item da venda
                item_venda_id = str(uuid.uuid4())
                c.execute('''
                    INSERT INTO itens_venda (id, pedido_id, dispositivo_id, valor_unitario, custo_aquisicao, lucro_item)
                    VALUES (?,?,?,?,?,?)
                ''', (item_venda_id, pedido_id, dispositivo_vendido_id, valor_venda_item - desconto, custo_aquisicao_item, lucro_bruto))
                
                # Atualizar status do dispositivo vendido para 'Vendido'
                c.execute("UPDATE dispositivos SET status = 'Vendido' WHERE id = ?", (dispositivo_vendido_id,))
                
                # Atualizar cliente com o aparelho atual
                aparelho_nome = f"{disp_row['modelo']} {disp_row['capacidade']} ({disp_row['cor']})"
                c.execute("UPDATE clientes SET aparelho_atual_descricao = ? WHERE id = ?", (aparelho_nome, cliente_id))
                c.execute("SELECT * FROM clientes WHERE id = ?", (cliente_id,))
                cli_info = c.fetchone()
                
                # PROCESSAR TRADE-IN SE HOUVER
                trade_in_id = None
                disp_entrada_id = None
                termo_gerado = None
                
                if trade_in_info and valor_trade_in > 0:
                    disp_entrada_id = str(uuid.uuid4())
                    trade_in_id = str(uuid.uuid4())
                    
                    checklist_trade_in = json.dumps(trade_in_info.get('checklist_tecnico', {
                        "face_touch_id": True, "tela_original": True, "bateria_original": True,
                        "true_tone": True, "carcaca_sem_trincas": True, "cameras_ok": True
                    }))
                    
                    # Cadastrar dispositivo de entrada no estoque imediatamente
                    c.execute('''
                        INSERT INTO dispositivos (
                            id, tipo, modelo, capacidade, cor, identificador_tipo, identificador_valor,
                            saude_bateria, ciclos_bateria, condicao_grau, checklist_tecnico, status,
                            custo_compra, custos_adicionais, preco_sugerido, preco_minimo, origem,
                            cliente_origem_id, notas_tecnicas, data_entrada, created_at
                        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ''', (
                        disp_entrada_id,
                        trade_in_info.get('tipo', 'iPhone'),
                        trade_in_info.get('modelo', 'iPhone de Troca'),
                        trade_in_info.get('capacidade', '128GB'),
                        trade_in_info.get('cor', 'Diversas'),
                        trade_in_info.get('identificador_tipo', 'IMEI'),
                        trade_in_info.get('identificador_valor', f"TRADE-{datetime.now().strftime('%H%M%S')}").strip(),
                        int(trade_in_info.get('saude_bateria', 85)),
                        int(trade_in_info.get('ciclos_bateria')) if trade_in_info.get('ciclos_bateria') else None,
                        trade_in_info.get('condicao_grau', 'Grau B (Leves marcas)'),
                        checklist_trade_in,
                        'Em Manutenção/Revisão', # Entra para revisão técnica preventiva
                        valor_trade_in, # Custo de aquisição é o valor avaliado do Trade-In!
                        0.0,
                        float(trade_in_info.get('preco_sugerido_revenda', valor_trade_in * 1.35)),
                        float(trade_in_info.get('preco_minimo_revenda', valor_trade_in * 1.20)),
                        'Trade-In / Troca',
                        cliente_id,
                        f"Entrou como Trade-In no pedido {numero_pedido}. Avaliado por R$ {valor_trade_in:.2f}",
                        now_str,
                        now_str
                    ))
                    
                    # Termo de Compra e Cessão Oficial
                    cli_nome = cli_info['nome'] if cli_info else 'Cliente'
                    cli_cpf = (cli_info['cpf_documento'] if cli_info and cli_info['cpf_documento'] else 'Não informado')
                    cli_tel = cli_info['telefone_whatsapp'] if cli_info else ''
                    termo_texto = f"""TERMO DE DECLARAÇÃO, COMPRA E CESSÃO DE APARELHO USADO (TRADE-IN)
Data: {datetime.now().strftime('%d/%m/%Y às %H:%M')}
Vendedor/Cedente: {cli_nome} | CPF/Documento: {cli_cpf} | WhatsApp: {cli_tel}
Aparelho Entregue: {trade_in_info.get('modelo')} {trade_in_info.get('capacidade')} - Cor: {trade_in_info.get('cor')}
Identificador ({trade_in_info.get('identificador_tipo')}): {trade_in_info.get('identificador_valor')}
Valor da Avaliação / Crédito Concedido: R$ {valor_trade_in:.2f}

DECLARAÇÃO DE PROCEDÊNCIA LÍCITA:
O Cedente acima qualificado declara sob as penas da lei (Art. 180 e Art. 299 do Código Penal Brasileiro) que o aparelho acima descrito é de sua legítima propriedade e posse mansa e pacífica, adquirido de forma lícita, encontrando-se totalmente livre e desembaraçado de quaisquer ônus, gravames, impedimentos judiciais, queixas de furto/roubo, bloqueios de operadora ou restrições de iCloud/Apple ID. Transfere neste ato a posse e propriedade plena à loja compradora."""
                    
                    # Registrar transação de Trade-In
                    c.execute('''
                        INSERT INTO trocas_trade_in (
                            id, pedido_id, cliente_id, dispositivo_entrada_id, valor_avaliado,
                            termo_cessao_aceito, termo_texto, status, data_troca, created_at
                        ) VALUES (?,?,?,?,?,?,?,?,?,?)
                    ''', (
                        trade_in_id, pedido_id, cliente_id, disp_entrada_id, valor_trade_in,
                        1, termo_texto, 'Aprovado', now_str, now_str
                    ))
                    termo_gerado = termo_texto

                # Se o cliente estava em CRM, atualizar etapa para 'Aprovado/Fechado'
                c.execute("UPDATE interacoes_crm SET etapa_funil = 'Aprovado/Fechado' WHERE cliente_id = ?", (cliente_id,))
                
                # ATENDIMENTO AUTOMÁTICO DE ENCOMENDAS / LISTA DE ESPERA
                # Se o cliente possuía um desejo/encomenda em aberto para este modelo (ou modelo compatível),
                # finaliza e marca como 'Atendido' para sumir imediatamente da Lista de Espera!
                desejos_atendidos_ids = []
                if cliente_id and disp_row:
                    c.execute('''
                        SELECT * FROM encomendas_desejos 
                        WHERE cliente_id = ? AND status IN ('Aguardando', 'Compatível Encontrado')
                    ''', (cliente_id,))
                    desejos_cliente = [dict(r) for r in c.fetchall()]

                    for des in desejos_cliente:
                        if modelo_compativel(des.get('modelo_desejado'), disp_row['modelo']):
                            c.execute('''
                                UPDATE encomendas_desejos
                                SET status = 'Atendido', dispositivo_compativel_id = ?
                                WHERE id = ?
                            ''', (dispositivo_vendido_id, des['id']))
                            desejos_atendidos_ids.append(des['id'])

                # Buscar negociações do cliente antes do commit
                c.execute('SELECT * FROM interacoes_crm WHERE cliente_id = ?', (cliente_id,))
                crm_rows_to_sync = [dict(r) for r in c.fetchall()]
                conn.commit()
                conn.close()
                conn = None

                # SINCRONIZAÇÃO COMPLETA COM O SUPABASE
                # 1. Pedido de venda
                sync_upsert_supabase('pedidos_venda', {
                    'id': pedido_id,
                    'numero_pedido': numero_pedido,
                    'cliente_id': cliente_id,
                    'data_venda': now_str,
                    'valor_subtotal': valor_venda_item,
                    'desconto': desconto,
                    'valor_trade_in': valor_trade_in,
                    'valor_total_liquido': valor_total_liquido,
                    'forma_pagamento': data.get('forma_pagamento', 'PIX'),
                    'meses_garantia': meses_garantia,
                    'garantia_ate': garantia_ate,
                    'custo_total_venda': custo_aquisicao_item,
                    'lucro_bruto': lucro_bruto,
                    'margem_percentual': margem_percentual,
                    'status': 'Concluída',
                    'observacoes': data.get('observacoes', ''),
                    'created_at': now_str
                })

                # 2. Item vendido
                sync_upsert_supabase('itens_venda', {
                    'id': item_venda_id,
                    'pedido_id': pedido_id,
                    'dispositivo_id': dispositivo_vendido_id,
                    'valor_unitario': valor_venda_item - desconto,
                    'custo_aquisicao': custo_aquisicao_item,
                    'created_at': now_str
                })

                # 3. Dispositivo vendido (status = Vendido)
                disp_vendido_payload = dict(disp_row)
                disp_vendido_payload['status'] = 'Vendido'
                sync_upsert_supabase('dispositivos', disp_vendido_payload)

                # 4. Cliente (atualização de aparelho)
                if cli_info:
                    cli_payload = dict(cli_info)
                    cli_payload['aparelho_atual_descricao'] = aparelho_nome
                    sync_upsert_supabase('clientes', cli_payload)

                # 5. Trade-In (se houver)
                if trade_in_info and valor_trade_in > 0 and disp_entrada_id and trade_in_id:
                    sync_upsert_supabase('dispositivos', {
                        'id': disp_entrada_id,
                        'tipo': trade_in_info.get('tipo', 'iPhone'),
                        'modelo': trade_in_info.get('modelo', 'iPhone de Troca'),
                        'capacidade': trade_in_info.get('capacidade', '128GB'),
                        'cor': trade_in_info.get('cor', 'Diversas'),
                        'identificador_tipo': trade_in_info.get('identificador_tipo', 'IMEI'),
                        'identificador_valor': trade_in_info.get('identificador_valor', f"TRADE-{datetime.now().strftime('%H%M%S')}").strip(),
                        'saude_bateria': int(trade_in_info.get('saude_bateria', 85)),
                        'ciclos_bateria': int(trade_in_info.get('ciclos_bateria')) if trade_in_info.get('ciclos_bateria') else None,
                        'condicao_grau': trade_in_info.get('condicao_grau', 'Grau B (Leves marcas)'),
                        'checklist_tecnico': trade_in_info.get('checklist_tecnico', {}),
                        'status': 'Em Manutenção/Revisão',
                        'custo_compra': valor_trade_in,
                        'custos_adicionais': 0.0,
                        'preco_sugerido': float(trade_in_info.get('preco_sugerido_revenda', valor_trade_in * 1.35)),
                        'preco_minimo': float(trade_in_info.get('preco_minimo_revenda', valor_trade_in * 1.20)),
                        'origem': 'Trade-In / Troca',
                        'cliente_origem_id': cliente_id,
                        'notas_tecnicas': f"Entrou como Trade-In no pedido {numero_pedido}. Avaliado por R$ {valor_trade_in:.2f}",
                        'data_entrada': now_str,
                        'created_at': now_str
                    })

                    sync_upsert_supabase('trocas_trade_in', {
                        'id': trade_in_id,
                        'pedido_id': pedido_id,
                        'cliente_id': cliente_id,
                        'dispositivo_entrada_id': disp_entrada_id,
                        'valor_avaliado': valor_trade_in,
                        'termo_cessao_aceito': True,
                        'termo_texto': termo_gerado,
                        'status': 'Aprovado',
                        'data_troca': now_str,
                        'created_at': now_str
                    })

                # 6. CRM (se cliente tinha negociação aberta)
                for crm_row in crm_rows_to_sync:
                    crm_row['etapa_funil'] = 'Aprovado/Fechado'
                    sync_upsert_supabase('interacoes_crm', crm_row)

                # 7. Sincronizar Encomendas Atendidas (status = 'Atendido')
                for des_id in desejos_atendidos_ids:
                    sync_upsert_supabase('encomendas_desejos', {
                        'id': des_id,
                        'status': 'Atendido',
                        'dispositivo_compativel_id': dispositivo_vendido_id
                    })

                # 8. Recalcula matches inteligentes após a venda
                recalcular_smart_matches()

                self.send_json({
                    'success': True,
                    'pedido_id': pedido_id,
                    'numero_pedido': numero_pedido,
                    'valor_liquido': valor_total_liquido,
                    'lucro_bruto': lucro_bruto,
                    'garantia_ate': garantia_ate,
                    'trade_in_id': trade_in_id,
                    'termo_cessao': termo_gerado,
                    'message': 'Venda processada com sucesso!'
                })
                return

            # 4. Criar Encomenda / Desejo de Cliente
            if path == '/api/encomendas':
                enc_id = str(uuid.uuid4())
                cliente_id = data.get('cliente_id')
                modelo = data.get('modelo_desejado', '')
                orcamento = float(data.get('orcamento_maximo', 0)) if data.get('orcamento_maximo') else None

                c.execute('''
                    INSERT INTO encomendas_desejos (
                        id, cliente_id, modelo_desejado, capacidade_preferida, cor_preferida,
                        orcamento_maximo, status, dispositivo_compativel_id, notificado_cliente, created_at
                    ) VALUES (?,?,?,?,?,?,?,?,?,?)
                ''', (
                    enc_id, cliente_id, modelo, data.get('capacidade_preferida', ''),
                    data.get('cor_preferida', ''), orcamento, 'Aguardando', None, 0, now_str
                ))
                conn.commit()

                # Recalcula matches inteligentes imediatamente
                recalcular_smart_matches(conn)

                c.execute('SELECT * FROM encomendas_desejos WHERE id = ?', (enc_id,))
                res_row = c.fetchone()
                status_enc = res_row['status'] if res_row else 'Aguardando'
                disp_match_id = res_row['dispositivo_compativel_id'] if res_row else None
                enc_dict = dict(res_row) if res_row else None
                conn.close()
                conn = None

                # Sincroniza com Supabase com status atualizado
                if enc_dict:
                    sync_upsert_supabase('encomendas_desejos', enc_dict)

                self.send_json({
                    'success': True,
                    'id': enc_id,
                    'status': status_enc,
                    'match_dispositivo_id': disp_match_id,
                    'message': 'Encomenda registrada com sucesso!'
                })
                return

            # 5. Criar / Atualizar Lead CRM
            if path == '/api/crm':
                crm_id = data.get('id')
                if crm_id:
                    c.execute('''
                        UPDATE interacoes_crm 
                        SET etapa_funil = COALESCE(?, etapa_funil),
                            dispositivo_interesse_modelo = COALESCE(?, dispositivo_interesse_modelo),
                            notas = COALESCE(?, notas)
                        WHERE id = ?
                    ''', (
                        data.get('etapa_funil'),
                        data.get('dispositivo_interesse_modelo'),
                        data.get('notas'),
                        crm_id
                    ))
                    c.execute('SELECT * FROM interacoes_crm WHERE id = ?', (crm_id,))
                    updated_crm = c.fetchone()
                    crm_payload = dict(updated_crm) if updated_crm else None
                    conn.commit()
                    conn.close()
                    conn = None

                    if crm_payload:
                        sync_upsert_supabase('interacoes_crm', crm_payload)

                    self.send_json({'success': True, 'id': crm_id, 'message': 'Lead atualizado no CRM!'})
                    return
                else:
                    new_crm_id = str(uuid.uuid4())
                    c.execute('''
                        INSERT INTO interacoes_crm (id, cliente_id, etapa_funil, dispositivo_interesse_modelo, canal, notas, data_proximo_contato, created_at)
                        VALUES (?,?,?,?,?,?,?,?)
                    ''', (
                        new_crm_id, data.get('cliente_id'), data.get('etapa_funil', 'Novo Contato'),
                        data.get('dispositivo_interesse_modelo', ''), data.get('canal', 'WhatsApp'),
                        data.get('notas', ''), data.get('data_proximo_contato', ''), now_str
                    ))
                    c.execute('SELECT * FROM interacoes_crm WHERE id = ?', (new_crm_id,))
                    new_crm = c.fetchone()
                    crm_payload = dict(new_crm) if new_crm else None
                    conn.commit()
                    conn.close()
                    conn = None

                    if crm_payload:
                        sync_upsert_supabase('interacoes_crm', crm_payload)

                    self.send_json({'success': True, 'id': new_crm_id, 'message': 'Lead registrado no CRM!'})
                    return

            # 6. Salvar Configurações (ex: Supabase)
            if path == '/api/config':
                supabase_url = data.get('supabase_url', '').strip()
                supabase_key = data.get('supabase_key', '').strip()
                c.execute("INSERT OR REPLACE INTO config_sistema (chave, valor) VALUES ('supabase_url', ?)", (supabase_url,))
                c.execute("INSERT OR REPLACE INTO config_sistema (chave, valor) VALUES ('supabase_key', ?)", (supabase_key,))
                conn.commit()
                conn.close()
                conn = None
                self.send_json({'success': True, 'message': 'Configurações salvas com sucesso!'})
                return

            # 7. Excluir Pedido / Venda
            if path == '/api/pedidos/delete':
                pedido_id = data.get('id')
                c.execute("SELECT dispositivo_id FROM itens_venda WHERE pedido_id = ?", (pedido_id,))
                disp_ids = [r[0] for r in c.fetchall()]

                c.execute("DELETE FROM itens_venda WHERE pedido_id = ?", (pedido_id,))
                c.execute("UPDATE trocas_trade_in SET pedido_id = NULL WHERE pedido_id = ?", (pedido_id,))
                c.execute("DELETE FROM pedidos_venda WHERE id = ?", (pedido_id,))

                # Devolver aparelhos vendidos ao status 'Em Estoque' e reabrir desejos
                for d_id in disp_ids:
                    c.execute("UPDATE dispositivos SET status = 'Em Estoque' WHERE id = ?", (d_id,))
                    c.execute("UPDATE encomendas_desejos SET status = 'Aguardando', dispositivo_compativel_id = NULL WHERE dispositivo_compativel_id = ? AND status = 'Atendido'", (d_id,))

                conn.commit()
                conn.close()
                conn = None

                sync_delete_supabase('itens_venda', 'pedido_id', pedido_id)
                sync_delete_supabase('pedidos_venda', 'id', pedido_id)
                for d_id in disp_ids:
                    sync_upsert_supabase('dispositivos', {'id': d_id, 'status': 'Em Estoque'})

                recalcular_smart_matches()
                self.send_json({'success': True, 'message': 'Venda e recibo excluídos com sucesso!'})
                return

            # 8. Excluir Dispositivo do Estoque
            if path == '/api/dispositivos/delete':
                disp_id = data.get('id')
                c.execute("SELECT count(*) as total FROM itens_venda WHERE dispositivo_id = ?", (disp_id,))
                row_check = c.fetchone()
                total_vendas = row_check['total'] if isinstance(row_check, sqlite3.Row) else row_check[0]
                if total_vendas > 0:
                    self.send_json({'error': 'Não é possível excluir um aparelho que possui venda registrada.'}, 400)
                    return

                # Se o aparelho estava associado a um Trade-In, remove o registro do Trade-In
                c.execute("DELETE FROM trocas_trade_in WHERE dispositivo_entrada_id = ?", (disp_id,))

                c.execute("SELECT identificador_valor FROM dispositivos WHERE id = ?", (disp_id,))
                row = c.fetchone()
                serial_val = row['identificador_valor'] if row else None

                c.execute("UPDATE encomendas_desejos SET dispositivo_compativel_id = NULL, status = 'Aguardando' WHERE dispositivo_compativel_id = ?", (disp_id,))
                c.execute("DELETE FROM dispositivos WHERE id = ?", (disp_id,))
                conn.commit()
                conn.close()
                conn = None

                recalcular_smart_matches()

                # Sincroniza exclusão no Supabase por ID
                sync_delete_supabase('trocas_trade_in', 'dispositivo_entrada_id', disp_id)
                sync_delete_supabase('dispositivos', 'id', disp_id)

                self.send_json({'success': True, 'message': 'Aparelho excluído do estoque com sucesso!'})
                return

            # 9. Excluir Trade-In
            if path in ('/api/trade-in/delete', '/api/trocas/delete'):
                trade_id = data.get('id')
                c.execute("SELECT * FROM trocas_trade_in WHERE id = ?", (trade_id,))
                trade = c.fetchone()
                if not trade:
                    self.send_json({'error': 'Registro de Trade-In não encontrado.'}, 404)
                    return

                disp_entrada_id = trade['dispositivo_entrada_id']
                if disp_entrada_id:
                    c.execute("SELECT count(*) as total FROM itens_venda WHERE dispositivo_id = ?", (disp_entrada_id,))
                    row_venda = c.fetchone()
                    if (row_venda['total'] if isinstance(row_venda, sqlite3.Row) else row_venda[0]) > 0:
                        self.send_json({'error': 'Não é possível excluir este Trade-In pois o aparelho recebido na troca já foi vendido.'}, 400)
                        return

                c.execute("DELETE FROM trocas_trade_in WHERE id = ?", (trade_id,))

                if disp_entrada_id:
                    c.execute("UPDATE encomendas_desejos SET dispositivo_compativel_id = NULL, status = 'Aguardando' WHERE dispositivo_compativel_id = ?", (disp_entrada_id,))
                    c.execute("DELETE FROM dispositivos WHERE id = ?", (disp_entrada_id,))

                conn.commit()
                conn.close()
                conn = None

                recalcular_smart_matches()

                sync_delete_supabase('trocas_trade_in', 'id', trade_id)
                if disp_entrada_id:
                    sync_delete_supabase('dispositivos', 'id', disp_entrada_id)

                self.send_json({'success': True, 'message': 'Registro de Trade-In e aparelho de troca excluídos com sucesso!'})
                return

            # 10. Excluir Negociação / Lead CRM
            if path == '/api/crm/delete':
                crm_id = data.get('id')
                c.execute("DELETE FROM interacoes_crm WHERE id = ?", (crm_id,))
                conn.commit()
                conn.close()
                conn = None

                sync_delete_supabase('interacoes_crm', 'id', crm_id)
                self.send_json({'success': True, 'message': 'Negociação excluída com sucesso!'})
                return

            # 11. Excluir Encomenda / Desejo
            if path == '/api/encomendas/delete':
                enc_id = data.get('id')
                c.execute("DELETE FROM encomendas_desejos WHERE id = ?", (enc_id,))
                conn.commit()
                conn.close()
                conn = None

                sync_delete_supabase('encomendas_desejos', 'id', enc_id)
                self.send_json({'success': True, 'message': 'Encomenda excluída com sucesso!'})
                return

            # 12. Excluir Cliente
            if path == '/api/clientes/delete':
                cli_id = data.get('id')
                c.execute("SELECT count(*) as total FROM pedidos_venda WHERE cliente_id = ?", (cli_id,))
                row_ped = c.fetchone()
                if (row_ped['total'] if isinstance(row_ped, sqlite3.Row) else row_ped[0]) > 0:
                    self.send_json({'error': 'Não é possível excluir um cliente que possui histórico de vendas registradas.'}, 400)
                    return

                # Excluir trocas de Trade-in vinculadas a este cliente (e seus aparelhos se não foram vendidos)
                c.execute("SELECT id, dispositivo_entrada_id FROM trocas_trade_in WHERE cliente_id = ?", (cli_id,))
                trades_cli = c.fetchall()
                for tr in trades_cli:
                    tr_id = tr['id'] if isinstance(tr, sqlite3.Row) else tr[0]
                    tr_disp = tr['dispositivo_entrada_id'] if isinstance(tr, sqlite3.Row) else tr[1]
                    if tr_disp:
                        c.execute("SELECT count(*) as total FROM itens_venda WHERE dispositivo_id = ?", (tr_disp,))
                        if c.fetchone()['total'] == 0:
                            c.execute("DELETE FROM dispositivos WHERE id = ?", (tr_disp,))
                            sync_delete_supabase('dispositivos', 'id', tr_disp)
                    c.execute("DELETE FROM trocas_trade_in WHERE id = ?", (tr_id,))
                    sync_delete_supabase('trocas_trade_in', 'id', tr_id)

                c.execute("SELECT cpf_documento FROM clientes WHERE id = ?", (cli_id,))
                row = c.fetchone()
                cpf = row['cpf_documento'] if row else None

                c.execute("DELETE FROM interacoes_crm WHERE cliente_id = ?", (cli_id,))
                c.execute("DELETE FROM encomendas_desejos WHERE cliente_id = ?", (cli_id,))
                c.execute("DELETE FROM clientes WHERE id = ?", (cli_id,))
                conn.commit()
                conn.close()
                conn = None

                recalcular_smart_matches()

                sync_delete_supabase('interacoes_crm', 'cliente_id', cli_id)
                sync_delete_supabase('encomendas_desejos', 'cliente_id', cli_id)
                sync_delete_supabase('clientes', 'id', cli_id)
                if cpf:
                    sync_delete_supabase('clientes', 'cpf_documento', cpf)
                self.send_json({'success': True, 'message': 'Cliente excluído com sucesso!'})
                return

            # 13. Salvar / Editar Modelo no Catálogo
            if path == '/api/modelos':
                mod_id = data.get('id')
                nome = data.get('nome', '').strip()
                tipo = data.get('tipo', 'iPhone').strip()
                if not nome:
                    self.send_json({'error': 'O nome do modelo é obrigatório.'}, 400)
                    return

                if mod_id:
                    c.execute('SELECT id FROM catalogo_modelos WHERE lower(nome) = lower(?) AND id != ?', (nome, mod_id))
                    if c.fetchone():
                        self.send_json({'error': f'Já existe outro modelo cadastrado como "{nome}".'}, 400)
                        return
                    c.execute('UPDATE catalogo_modelos SET nome = ?, tipo = ? WHERE id = ?', (nome, tipo, mod_id))
                    conn.commit()
                    conn.close()
                    conn = None
                    recalcular_smart_matches()
                    self.send_json({'success': True, 'id': mod_id, 'message': 'Modelo atualizado com sucesso!'})
                    return
                else:
                    c.execute('SELECT id FROM catalogo_modelos WHERE lower(nome) = lower(?)', (nome,))
                    if c.fetchone():
                        self.send_json({'error': f'O modelo "{nome}" já está cadastrado no catálogo.'}, 400)
                        return
                    new_id = str(uuid.uuid4())
                    c.execute('INSERT INTO catalogo_modelos (id, nome, tipo, created_at) VALUES (?,?,?,?)', (new_id, nome, tipo, now_str))
                    conn.commit()
                    conn.close()
                    conn = None
                    recalcular_smart_matches()
                    self.send_json({'success': True, 'id': new_id, 'message': 'Modelo cadastrado no catálogo com sucesso!'})
                    return

            # 14. Excluir Modelo do Catálogo
            if path == '/api/modelos/delete':
                mod_id = data.get('id')
                c.execute('DELETE FROM catalogo_modelos WHERE id = ?', (mod_id,))
                conn.commit()
                conn.close()
                conn = None
                recalcular_smart_matches()
                self.send_json({'success': True, 'message': 'Modelo removido do catálogo com sucesso!'})
                return

            self.send_error(404, "Endpoint POST não encontrado")
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
            import traceback
            sys.stderr.write(f"handle_api_post error on {path}:\n{traceback.format_exc()}\n")
            self.send_json({'error': str(e)}, 500)
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

# ==============================================================================
# INICIALIZAÇÃO DO SERVIDOR E ABERTURA AUTOMÁTICA DO NAVEGADOR
# ==============================================================================
class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

def run_server():
    init_db()
    
    # Encontrar porta disponível caso 8000 esteja ocupada
    global PORT
    server = None
    for p in range(PORT, PORT + 20):
        try:
            server = ThreadedTCPServer(("", p), AppleStoreHandler)
            PORT = p
            break
        except OSError:
            continue
            
    if not server:
        print("Erro: Não foi possível vincular nenhuma porta entre 8000 e 8020.")
        sys.exit(1)

    url = f"http://localhost:{PORT}"
    print("=" * 70)
    print(f"🚀 SISTEMA DE GESTÃO APPLE (CRM, ESTOQUE SERIALIZADO & TRADE-IN)")
    print(f"📍 Servidor ativo em: {url}")
    print(f"📱 Abrindo seu navegador automaticamente...")
    print("=" * 70)
    
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Não foi possível abrir o navegador automaticamente: {e}")
        print(f"Por favor, abra manualmente o link: {url}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor finalizado pelo usuário.")
        server.server_close()

if __name__ == '__main__':
    run_server()
