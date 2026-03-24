# BRBRIEF — Servidor de Notícias ao Vivo

Agrega automaticamente as últimas 24h de:
- **Brazil Journal** (braziljournal.com)
- **NeoFeed** (neofeed.com.br)
- **Valor Econômico** (valor.globo.com)

Atualiza a cada **1 hora** automaticamente. Sem clicar em nada.

---

## Como subir no Railway (~R$ 15/mês)

### 1. Criar conta
Acesse **railway.app** e crie uma conta gratuita (pode entrar com GitHub).

### 2. Subir o código
Opção mais fácil: usar o GitHub.

1. Crie um repositório no **github.com** (pode ser privado)
2. Suba os 3 arquivos: `server.js`, `package.json`, `README.md`
3. No Railway, clique em **"New Project"** → **"Deploy from GitHub repo"**
4. Selecione o repositório
5. Railway detecta Node.js automaticamente e faz o deploy

### 3. Configurar a porta
O Railway passa a porta via variável de ambiente `PORT` — o servidor já está configurado pra isso.

### 4. Seu site está no ar
Railway gera um link tipo: `https://brbrief-production.up.railway.app`

Esse link nunca muda. Mande pro seu pai, ele abre e sempre tem as notícias do dia.

---

## Alternativa ainda mais simples: Render.com

1. Acesse **render.com**
2. Crie conta com GitHub
3. **"New Web Service"** → conecte o repositório
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. Plano **Free** (dorme após 15min inativo) ou **Starter** por ~US$ 7/mês (sempre ligado)

---

## Como funciona

- Ao iniciar, busca os RSS feeds dos 3 sites
- Filtra apenas artigos das **últimas 24 horas**
- Classifica cada artigo em: Tecnologia, Economia, Negócios ou Política
- Serve uma página HTML bonita e responsiva
- Repete a busca automaticamente a **cada 1 hora**
- O botão **"↻ Atualizar agora"** no site força uma atualização manual imediata

---

## Estrutura

```
brbrief/
├── server.js      ← servidor principal
├── package.json   ← dependências
└── README.md      ← este arquivo
```
