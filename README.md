# Fly Manager

SaaS V1 para agencias de viagens com a filosofia do prompt: sem modulos operacionais isolados, tudo entra pelo Upload Center e o tipo do documento define o fluxo.

## Telas

- Upload Center
- Documentos
- Vendas
- Conciliacao
- Clientes
- Dashboard
- Ajustes de marca com logo PNG/PDF editaveis

## Rodar localmente

```bash
npm install
npm --prefix frontend install
/Users/flymusic/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm --prefix backend run dev
npm --prefix frontend run dev
```

Login local:

- Email: `admin@flymanager.local`
- Senha: `flymanager`

## Deploy — Railway.app

1. Crie um repositório no GitHub e faça push deste projeto
2. No [Railway](https://railway.app), crie um novo projeto a partir do repositório
3. Adicione o plugin **PostgreSQL** ao projeto
4. Configure as variáveis de ambiente:
   - `JWT_SECRET` — uma chave secreta longa e aleatória
   - `CORS_ORIGINS` — URL pública do frontend (ex: `https://flymanager-frontend.up.railway.app`)
5. O Railway detecta automaticamente o `docker-compose.yml` e faz o deploy
6. Configure um domínio personalizado (ex: `manager.flymusicbrasil.com.br`)

### Rodar localmente

```bash
npm install
npm --prefix frontend install
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
# Terminal 1:
.venv/bin/python -m uvicorn app.main:app --port 8002
# Terminal 2:
npm --prefix frontend run dev
```

Login local: `admin@flymanager.local` / `flymanager`
