#!/bin/bash
cd "$(dirname "$0")"

echo "=========================================================="
echo "🍏 INICIANDO SISTEMA APPLE DE GESTÃO INTEGRADA (iLion Store)"
echo "📍 Abrindo o navegador em: http://localhost:8000"
echo "=========================================================="

(sleep 1 && (open "http://localhost:8000" 2>/dev/null || xdg-open "http://localhost:8000" 2>/dev/null)) &

python3 server.py
