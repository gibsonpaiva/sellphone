#!/bin/bash
# ==============================================================================
# Script de Inicialização Rápida no macOS (Clique duplo no Finder)
# ==============================================================================
cd "$(dirname "$0")"

echo "=========================================================="
echo "🍏 INICIANDO SISTEMA APPLE DE GESTÃO INTEGRADA (iLion Store)"
echo "📍 Abrindo o navegador em: http://localhost:8000"
echo "=========================================================="

# Aguarda 1 segundo e abre o navegador padrão no macOS
(sleep 1 && open "http://localhost:8000") &

# Executa o servidor nativo em Python 3
python3 server.py
