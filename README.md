# Pong de 2 - Jogo Multiplayer

Este é um jogo de Pong para dois jogadores que funciona através de múltiplos dispositivos (celulares ou computadores) usando WebSockets.

## Como Rodar Localmente

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Inicie o servidor:**
   ```bash
   npm start
   ```

3. **Acesse o jogo:**
   - Abra o navegador em `http://localhost:3000`
   - Abra o mesmo endereço em outro dispositivo ou aba anônima para jogar contra si mesmo.

## Como Fazer o Deploy (Colocar Online)

Recomendamos usar o **Render.com** pois é gratuito e suporta WebSockets.

### Passo 1: GitHub
1. Crie um novo repositório no GitHub (ex: `pong-de-2`).
2. Siga as instruções do GitHub para enviar este código para lá. Basicamente:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/pong-de-2.git
   git branch -M main
   git push -u origin main
   ```

### Passo 2: Render
1. Crie uma conta em [render.com](https://render.com).
2. Clique em **"New +"** e selecione **"Web Service"**.
3. Conecte sua conta do GitHub e selecione o repositório `pong-de-2`.
4. Nas configurações:
   - **Name:** Escolha um nome (ex: `pong-2-seunome`).
   - **Region:** Escolha a mais próxima (ex: Ohio ou Frankfurt).
   - **Branch:** `main`
   - **Root Directory:** Deixe em branco.
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Clique em **"Create Web Service"**.

O Render vai construir o projeto e te dar um link (ex: `https://pong-2-seunome.onrender.com`). Compartilhe esse link com seu amigo para jogar!
