# NK C2 FullStack Kit

Pacote completo de Comando e Controle (C2) pronto para Deploy no Render.

## Conteúdo
1. **Backend (server.js)**: Servidor Node.js com Socket.io.
2. **Frontend (public/)**: Interface Web estática servida pelo backend.
3. **Agente (agent.py)**: Script Python para execução de comandos remotos.

## Como fazer Deploy no Render.com (Grátis)

1. **Baixe este ZIP** e extraia os arquivos.
2. Crie um repositório no **GitHub** e suba os arquivos (exceto `agent.py` se quiser segurança).
3. Vá no [Render.com](https://render.com) e crie um **Web Service**.
4. Conecte seu repositório GitHub.
5. O Render detectará automaticamente o ambiente **Node**.
6. Clique em **Deploy**.
7. Copie a URL gerada (ex: `https://nk-c2-xyz.onrender.com`).

## Como Conectar o Agente

1. Abra o arquivo `agent.py` no seu editor.
2. Mude a variável `SERVER_URL` para a URL do seu Render.
3. Instale a lib necessária:
   `pip install "python-socketio[client]"`
4. Rode o agente na máquina alvo (ou na sua):
   `python agent.py`

## Uso
Acesse a URL do Render. Você verá o painel preto e verde. Digite comandos (ex: `dir`, `ls`, `whoami`) e veja a resposta do agente em tempo real.

**Disclaimer:** Ferramenta educacional. Use com responsabilidade.
