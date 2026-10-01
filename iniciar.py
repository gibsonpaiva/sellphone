#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Executável para iniciar o Sistema Apple de CRM, Estoque e Pós-Venda
Abre o servidor e o navegador automaticamente no macOS / Linux / Windows.
"""
import os
import sys
import subprocess

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.abspath(__file__))
    server_path = os.path.join(base_dir, "server.py")
    print("Iniciando o Sistema Apple iLion Store...")
    try:
        from server import run_server
        run_server()
    except Exception as e:
        print(f"Erro ao iniciar via módulo: {e}. Executando via subprocesso...")
        subprocess.run([sys.executable, server_path], cwd=base_dir)
