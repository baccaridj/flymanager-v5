import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  FileSearch,
  Files,
  LayoutDashboard,
  LogOut,
  Plane,
  Search,
  Settings,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import "./styles.css";

type DocumentType = "eticket" | "voucher" | "pix" | "extrato" | "fatura" | "passaporte" | "contrato" | "cotacao" | "xml_import" | "other";
type DocumentStatus = "entry" | "extraction" | "classification" | "validation" | "destination" | "action" | "done";

type DocumentRecord = {
  id: number;
  filename: string;
  classification: DocumentType;
  status: DocumentStatus;
  extracted_data: Record<string, unknown>;
  created_at: string;
};

type Sale = {
  id: number;
  passenger: string;
  locator: string;
  ticket: string;
  airline: string;
  route: string;
  dates: string;
  total: number;
  du: number;
  rav: number;
  status: string;
};

type Client = {
  id: number;
  name: string;
  email: string;
  phone: string;
  document: string;
};

type Transaction = {
  id: number;
  type: string;
  category: string;
  amount: number;
  payment_method: string;
  reconciled: boolean;
};

type Stats = {
  documents_today: number;
  active_sales: number;
  pending_reconciliation: number;
  monthly_revenue: number;
};

type View = "upload" | "documents" | "sales" | "reconciliation" | "clients" | "dashboard" | "settings";

const api = {
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem("flymanager_token");
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`/api${path}`, { ...init, headers });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || "Falha na requisição");
    }
    try {
      return await response.json() as T;
    } catch {
      throw new Error("Resposta inválida do servidor");
    }
  },
  login(email: string, password: string) {
    return this.request<{ access_token: string }>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  },
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const docLabels: Record<DocumentType, string> = {
  eticket: "E-ticket",
  voucher: "Voucher",
  pix: "PIX",
  extrato: "Extrato",
  fatura: "Fatura",
  passaporte: "Passaporte",
  contrato: "Contrato",
  cotacao: "Cotação",
  xml_import: "XML",
  other: "Outro",
};

const statusLabels: Record<DocumentStatus, string> = {
  entry: "Entrada",
  extraction: "Extração",
  classification: "Classificação",
  validation: "Validação",
  destination: "Destino",
  action: "Ação",
  done: "Concluído",
};

const saleFieldLabels: Record<string, string> = {
  passenger: "Passageiro",
  locator: "Localizador",
  ticket: "Bilhete",
  airline: "Companhia aérea",
  route: "Rota",
  dates: "Datas",
  total: "Total (R$)",
  du: "DU",
  rav: "RAV",
};

const clientFieldLabels: Record<string, string> = {
  name: "Nome completo",
  email: "E-mail",
  phone: "Telefone",
  document: "CPF / CNPJ",
};

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "upload", label: "Upload Center", icon: Upload },
  { id: "documents", label: "Documentos", icon: Files },
  { id: "sales", label: "Vendas", icon: Plane },
  { id: "reconciliation", label: "Conciliação", icon: CircleDollarSign },
  { id: "clients", label: "Clientes", icon: Users },
  { id: "settings", label: "Ajustes", icon: Settings },
] as const;

function classNames(...items: Array<string | false | undefined>) {
  return items.filter(Boolean).join(" ");
}

type ToastState = { message: string; type: "success" | "error" };

function App() {
  const [token, setToken] = useState(localStorage.getItem("flymanager_token") || "");
  const [view, setView] = useState<View>("dashboard");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<Stats>({ documents_today: 0, active_sales: 0, pending_reconciliation: 0, monthly_revenue: 0 });
  const [query, setQuery] = useState("");
  const [documentFilter, setDocumentFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [brand, setBrand] = useState(() => {
    const saved = localStorage.getItem("flymanager_brand");
    return saved ? JSON.parse(saved) : { logo: "/brand/fly-logo.png", accent: "#8C9B8A", paper: "#F5F3EB" };
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function refresh() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (!localStorage.getItem("flymanager_token")) return;
    setLoading(true);
    try {
      const [docData, salesData, clientData, txData, statsData] = await Promise.all([
        api.request<DocumentRecord[]>(`/documents?search=${encodeURIComponent(query)}&classification=${documentFilter}`, { signal: ctrl.signal }),
        api.request<Sale[]>(`/sales?search=${encodeURIComponent(query)}`, { signal: ctrl.signal }),
        api.request<Client[]>(`/clients?search=${encodeURIComponent(query)}`, { signal: ctrl.signal }),
        api.request<Transaction[]>("/transactions", { signal: ctrl.signal }),
        api.request<Stats>("/stats", { signal: ctrl.signal }),
      ]);
      setDocuments(docData);
      setSales(salesData);
      setClients(clientData);
      setTransactions(txData);
      setStats(statsData);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [token, query, documentFilter]);

  async function uploadPayload(payload: FormData) {
    setBusy(true);
    try {
      const result = await api.request<DocumentRecord>("/upload", { method: "POST", body: payload });
      setToast({ message: `${docLabels[result.classification]} processado com sucesso`, type: "success" });
      await refresh();
      setView("documents");
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Erro ao processar documento", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument(id: number) {
    if (!window.confirm("Excluir este documento? Esta ação não pode ser desfeita.")) return;
    try {
      await api.request(`/documents/${id}`, { method: "DELETE" });
      setToast({ message: "Documento removido", type: "success" });
      await refresh();
    } catch {
      setToast({ message: "Erro ao remover documento", type: "error" });
    }
  }

  async function createClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.request<Client>("/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      setToast({ message: "Cliente cadastrado com sucesso", type: "success" });
      event.currentTarget.reset();
      await refresh();
    } catch {
      setToast({ message: "Erro ao cadastrar cliente", type: "error" });
    }
  }

  async function createSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form);
    try {
      await api.request<Sale>("/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          total: Number(data.total),
          du: Number(data.du || 0),
          rav: Number(data.rav || 0),
        }),
      });
      setToast({ message: "Venda registrada com sucesso", type: "success" });
      event.currentTarget.reset();
      await refresh();
    } catch {
      setToast({ message: "Erro ao registrar venda", type: "error" });
    }
  }

  if (!token) {
    return <Login onLogin={setToken} />;
  }

  return (
    <div className="min-h-screen bg-night text-ivory" style={{ ["--brand-accent" as string]: brand.accent, ["--brand-paper" as string]: brand.paper }}>
      {loading && (
        <div className="fixed left-0 right-0 top-0 z-50 h-0.5 overflow-hidden">
          <div className="h-full animate-pulse bg-[var(--brand-accent)]" />
        </div>
      )}
      <div className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)] max-lg:grid-cols-[92px_minmax(0,1fr)] max-md:block">
        <aside className="sticky top-0 flex h-screen flex-col border-r border-white/10 bg-[#101d1f] p-5 max-md:relative max-md:h-auto">
          <div className="mb-8 flex items-center gap-3 max-lg:justify-center max-md:justify-start">
            <img src={brand.logo} alt="Fly Manager" className="h-12 w-12 rounded-lg bg-ivory object-contain p-1" />
            <div className="max-lg:hidden max-md:block">
              <p className="font-display text-2xl leading-none">Fly Manager</p>
              <p className="text-xs uppercase text-sage">Agências de viagem</p>
            </div>
          </div>

          <nav className="grid gap-2 max-md:grid-cols-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={classNames(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-ivory/70 transition hover:bg-white/8 hover:text-ivory",
                    view === item.id && "bg-white/10 text-ivory ring-1 ring-white/10",
                  )}
                >
                  <Icon size={18} className="text-[var(--brand-accent)]" />
                  <span className="max-lg:hidden max-md:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto rounded-lg border border-white/10 bg-white/5 p-4 max-lg:hidden">
            <p className="text-xs uppercase text-sage">Pipeline</p>
            <p className="mt-1 text-sm text-ivory/80">Entrada → Extração → Classificação → Validação → Destino → Ação</p>
          </div>
        </aside>

        <main className="min-w-0 p-7 max-md:p-4">
          <header className="mb-7 flex items-center justify-between gap-4 max-md:flex-col max-md:items-stretch">
            <div>
              <p className="text-xs font-bold uppercase text-sage">No modules. Only documents.</p>
              <h1 className="font-display text-4xl max-md:text-3xl">{navItems.find((item) => item.id === view)?.label}</h1>
            </div>
            <div className="flex items-center gap-3 max-md:flex-col">
              <label className="flex min-h-11 w-96 max-w-full items-center gap-2 rounded-lg border border-white/10 bg-white/7 px-3 text-ivory/80 max-md:w-full">
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">Buscar</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent outline-none" placeholder="Buscar documentos, passageiros, localizadores" aria-label="Buscar documentos, passageiros, localizadores" />
              </label>
              <button
                onClick={() => {
                  localStorage.removeItem("flymanager_token");
                  setToken("");
                }}
                className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-white/7 text-ivory/80 transition hover:bg-white/12 hover:text-ivory"
                aria-label="Sair"
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>

          {toast && (
            <div
              className={classNames(
                "mb-4 rounded-lg border px-4 py-3 text-sm text-ivory",
                toast.type === "success" ? "border-sage/30 bg-sage/15" : "border-red-400/30 bg-red-400/10 text-red-200",
              )}
            >
              {toast.message}
            </div>
          )}

          {view === "dashboard" && <Dashboard stats={stats} documents={documents} sales={sales} transactions={transactions} />}
          {view === "upload" && <UploadCenter busy={busy} onUpload={uploadPayload} />}
          {view === "documents" && <Documents documents={documents} filter={documentFilter} setFilter={setDocumentFilter} onDelete={deleteDocument} />}
          {view === "sales" && <Sales sales={sales} onCreate={createSale} />}
          {view === "reconciliation" && <Reconciliation transactions={transactions} onUpload={uploadPayload} busy={busy} />}
          {view === "clients" && <Clients clients={clients} onCreate={createClient} />}
          {view === "settings" && <SettingsView brand={brand} setBrand={setBrand} />}
        </main>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api.login(String(form.get("email")), String(form.get("password")));
      localStorage.setItem("flymanager_token", result.access_token);
      onLogin(result.access_token);
    } catch {
      setError("E-mail ou senha inválidos. Verifique suas credenciais.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-night p-5 text-ivory">
      <section className="w-full max-w-5xl overflow-hidden rounded-lg border border-white/10 bg-[#101d1f] shadow-premium md:grid md:grid-cols-[1.1fr_.9fr]">
        <div className="flex min-h-[560px] flex-col justify-between bg-ivory p-10 text-night">
          <img src="/brand/fly-logo.png" alt="Fly" className="h-24 w-40 object-contain" />
          <div>
            <p className="text-sm font-bold uppercase text-olive">Flymusic 2025</p>
            <h1 className="mt-3 font-display text-6xl leading-tight max-md:text-4xl">Fly Manager</h1>
            <p className="mt-4 max-w-md text-lg text-petroleum/80">SaaS premium para agências que transformam qualquer documento em ação operacional.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="grid content-center gap-5 p-10">
          <div>
            <p className="text-xs font-bold uppercase text-sage">Acesso seguro</p>
            <h2 className="font-display text-4xl">Entrar</h2>
          </div>
          <label className="grid gap-2 text-sm font-semibold text-ivory/70">
            E-mail
            <input name="email" type="email" defaultValue="admin@flymanager.local" className="min-h-12 rounded-lg border border-white/10 bg-white/7 px-3 text-ivory outline-none transition focus:border-[var(--brand-accent)]" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-ivory/70">
            Senha
            <input name="password" type="password" defaultValue="flymanager" className="min-h-12 rounded-lg border border-white/10 bg-white/7 px-3 text-ivory outline-none transition focus:border-[var(--brand-accent)]" />
          </label>
          {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          <button disabled={loading} className="min-h-12 rounded-lg bg-[var(--brand-accent,#8C9B8A)] px-4 font-bold text-night transition hover:opacity-90 disabled:opacity-50">
            {loading ? "Entrando..." : "Entrar no Fly Manager"}
          </button>
        </form>
      </section>
    </main>
  );
}

const PIPELINE_STEPS = [
  { key: "entrada", label: "ENTRADA" },
  { key: "extracao", label: "EXTRAÇÃO" },
  { key: "classificacao", label: "CLASSIF." },
  { key: "validacao", label: "VALIDAÇÃO" },
  { key: "destino", label: "DESTINO" },
  { key: "acao", label: "AÇÃO" },
];

function Dashboard({ stats, documents, sales, transactions }: { stats: Stats; documents: DocumentRecord[]; sales: Sale[]; transactions: Transaction[] }) {
  const cards = [
    { label: "Documentos hoje", value: stats.documents_today, icon: Files },
    { label: "Vendas ativas", value: stats.active_sales, icon: Plane },
    { label: "Conciliação pendente", value: stats.pending_reconciliation, icon: FileSearch },
    { label: "Receita mensal", value: currency.format(stats.monthly_revenue), icon: BarChart3 },
  ];
  const statusOrder: DocumentStatus[] = ["entry", "extraction", "classification", "validation", "destination", "action", "done"];
  const total = documents.length || 1;
  const stepCounts = PIPELINE_STEPS.map((_, i) => {
    const stepStatus = statusOrder[i];
    return documents.filter(d => statusOrder.indexOf(d.status) >= i).length;
  });
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-4 gap-4 max-xl:grid-cols-2 max-sm:grid-cols-1">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="rounded-lg border border-white/10 bg-white/7 p-5 transition hover:bg-white/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase text-sage">{card.label}</p>
                <Icon size={18} className="text-[var(--brand-accent)]" />
              </div>
              <strong className="mt-4 block text-3xl">{card.value}</strong>
            </article>
          );
        })}
      </div>
      <div className="grid grid-cols-[1.4fr_.8fr] gap-5 max-lg:grid-cols-1">
        <Panel title="Fluxo de documentos" eyebrow="Pipeline">
          <div className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-sm:grid-cols-2">
            {PIPELINE_STEPS.map((step, index) => (
              <div key={step.key} className="rounded-lg border border-white/10 bg-night/50 p-4">
                <span className="text-xs font-bold text-sage">0{index + 1}</span>
                <p className="mt-2 break-words text-sm font-bold">{step.label}</p>
                <div className="mt-4 h-1.5 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[var(--brand-accent)]" style={{ width: `${Math.round((stepCounts[index] / total) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Últimas ações" eyebrow="Auditoria">
          <div className="grid gap-3">
            {documents.slice(0, 5).map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg bg-night/45 p-3">
                <span>
                  <strong className="block truncate">{doc.filename}</strong>
                  <span className="text-sm text-ivory/55">{docLabels[doc.classification]}</span>
                </span>
                <CheckCircle2 size={18} className="shrink-0 text-sage" />
              </div>
            ))}
            {!documents.length && <p className="text-ivory/55">Nenhum documento processado ainda.</p>}
          </div>
        </Panel>
      </div>
      <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        <DataTable
          title="Vendas recentes"
          headers={["Passageiro", "Localizador", "Total"]}
          rows={sales.slice(0, 5).map((sale) => [sale.passenger, sale.locator, currency.format(sale.total)])}
          empty="Nenhuma venda registrada."
        />
        <DataTable
          title="Financeiro"
          headers={["Categoria", "Método", "Valor"]}
          rows={transactions.slice(0, 5).map((tx) => [tx.category, tx.payment_method, currency.format(tx.amount)])}
          empty="Nenhum movimento registrado."
        />
      </div>
    </div>
  );
}

function UploadCenter({ busy, onUpload }: { busy: boolean; onUpload: (payload: FormData) => Promise<void> }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  async function process() {
    const payload = new FormData();
    if (file) payload.append("file", file);
    if (text.trim()) payload.append("text", text);
    await onUpload(payload);
    setText("");
    setFile(null);
  }

  return (
    <div className="grid grid-cols-[1.2fr_.8fr] gap-5 max-lg:grid-cols-1">
      <Panel title="Porta única" eyebrow="Upload Center">
        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            setFile(event.dataTransfer.files?.[0] || null);
          }}
          className={classNames(
            "grid min-h-72 place-items-center rounded-lg border border-dashed p-6 text-center transition",
            dragging ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/10" : "border-sage/50 bg-night/50",
          )}
        >
          <div>
            <Upload className="mx-auto text-sage" size={42} />
            <h2 className="mt-4 font-display text-3xl">Arraste arquivo, cole texto ou imagem</h2>
            <p className="mt-2 text-ivory/60">PDF, XML, texto, comprovante PIX, extrato, e-ticket, voucher ou cotação.</p>
            <label className="mt-5 inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-ivory px-4 font-bold text-night transition hover:bg-ivory/90">
              Selecionar arquivo
              <input type="file" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            {file && <p className="mt-3 text-sm text-sage">{file.name}</p>}
          </div>
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="mt-4 min-h-40 w-full rounded-lg border border-white/10 bg-night/60 p-4 text-ivory outline-none transition focus:border-[var(--brand-accent)]"
          placeholder="Cole aqui um e-ticket, cotação, PIX, extrato ou XML Wintour."
        />
        <button disabled={busy || (!file && !text.trim())} onClick={process} className="mt-4 min-h-12 w-full rounded-lg bg-[var(--brand-accent)] px-4 font-bold text-night transition hover:opacity-90 disabled:opacity-45">
          {busy ? "Processando..." : "PROCESSAR"}
        </button>
      </Panel>
      <Panel title="Amostras locais" eyebrow="Teste rápido">
        <div className="grid gap-3">
          <SampleButton path="/samples/cotacao-premium.txt" setText={setText} label="Cotação premium" />
          <SampleButton path="/samples/tabela-de-voos.txt" setText={setText} label="Tabela de voos" />
          <a className="rounded-lg border border-white/10 bg-white/7 p-4 font-semibold text-ivory transition hover:bg-white/12" href="/brand/fly-logo.pdf" target="_blank" rel="noreferrer">
            Logo PDF editável
          </a>
          <img src="/brand/fly-logo.png" alt="Logo Fly" className="rounded-lg bg-ivory p-4" />
        </div>
      </Panel>
    </div>
  );
}

function SampleButton({ path, label, setText }: { path: string; label: string; setText: (value: string) => void }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const text = await fetch(path).then((r) => r.text());
      setText(text);
    } catch {
      // sample file not available in this environment
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-lg border border-white/10 bg-white/7 p-4 text-left font-semibold text-ivory transition hover:bg-white/12 disabled:opacity-50"
    >
      {loading ? "Carregando..." : label}
    </button>
  );
}

function Documents({ documents, filter, setFilter, onDelete }: { documents: DocumentRecord[]; filter: string; setFilter: (value: string) => void; onDelete: (id: number) => void }) {
  return (
    <Panel title="Histórico com validação" eyebrow="Documentos">
      <div className="mb-4 flex items-center justify-between gap-3 max-md:flex-col max-md:items-stretch">
        <select value={filter} onChange={(event) => setFilter(event.target.value)} className="min-h-11 rounded-lg border border-white/10 bg-night px-3 text-ivory outline-none">
          <option value="all">Todos os tipos</option>
          {Object.entries(docLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {!documents.length && <p className="py-8 text-center text-ivory/55">Nenhum documento encontrado.</p>}
      <div className="grid gap-3">
        {documents.map((doc) => (
          <article key={doc.id} className="grid grid-cols-[1fr_160px_150px_44px] items-center gap-3 rounded-lg border border-white/10 bg-night/45 p-4 transition hover:bg-night/60 max-lg:grid-cols-1">
            <div>
              <strong>{doc.filename}</strong>
              <pre className="mt-2 max-h-28 overflow-auto rounded bg-black/20 p-3 text-xs text-ivory/70">{JSON.stringify(doc.extracted_data, null, 2)}</pre>
            </div>
            <span className="rounded-full bg-sage/15 px-3 py-1 text-center text-sm font-bold text-sage">{docLabels[doc.classification]}</span>
            <span className="text-sm text-ivory/60">{statusLabels[doc.status] ?? doc.status}</span>
            <button onClick={() => onDelete(doc.id)} className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 text-red-200 transition hover:border-red-400/40 hover:bg-red-400/10" aria-label="Excluir documento">
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function Sales({ sales, onCreate }: { sales: Sale[]; onCreate: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="grid gap-5">
      <Panel title="Nova venda" eyebrow="Cadastro">
        <form onSubmit={onCreate} className="grid grid-cols-4 gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
          {["passenger", "locator", "ticket", "airline", "route", "dates", "total", "du", "rav"].map((field) => (
            <label key={field} className="grid gap-1 text-xs font-semibold uppercase text-sage">
              {saleFieldLabels[field] ?? field}
              <input
                required={["passenger", "locator", "total"].includes(field)}
                name={field}
                className="min-h-11 rounded-lg border border-white/10 bg-night px-3 text-ivory outline-none transition focus:border-[var(--brand-accent)] text-sm font-normal normal-case"
              />
            </label>
          ))}
          <select name="status" className="min-h-11 rounded-lg border border-white/10 bg-night px-3 text-ivory outline-none">
            <option value="active">Ativa</option>
            <option value="issued">Emitida</option>
            <option value="cancelled">Cancelada</option>
          </select>
          <button className="min-h-11 rounded-lg bg-[var(--brand-accent)] px-4 font-bold text-night transition hover:opacity-90">Salvar venda</button>
        </form>
      </Panel>
      <DataTable
        title="Vendas"
        headers={["Passageiro", "Localizador", "Bilhete", "Cia. Aérea", "Rota", "Datas", "Total", "DU", "RAV", "Status"]}
        rows={sales.map((sale) => [sale.passenger, sale.locator, sale.ticket, sale.airline, sale.route, sale.dates, currency.format(sale.total), currency.format(sale.du), currency.format(sale.rav), sale.status])}
        empty="Nenhuma venda registrada."
      />
    </div>
  );
}

function Reconciliation({ transactions, onUpload, busy }: { transactions: Transaction[]; onUpload: (payload: FormData) => Promise<void>; busy: boolean }) {
  const [text, setText] = useState("");
  async function importStatement() {
    const payload = new FormData();
    payload.append("text", text);
    await onUpload(payload);
    setText("");
  }
  return (
    <div className="grid grid-cols-[.9fr_1.1fr] gap-5 max-lg:grid-cols-1">
      <Panel title="Importar extrato" eyebrow="OFX / CSV / Texto">
        <textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-72 w-full rounded-lg border border-white/10 bg-night p-4 text-ivory outline-none transition focus:border-[var(--brand-accent)]" placeholder="Cole EXTRATO, SALDO, PIX, valor e histórico." />
        <button disabled={busy || !text.trim()} onClick={importStatement} className="mt-4 min-h-12 w-full rounded-lg bg-[var(--brand-accent)] px-4 font-bold text-night transition hover:opacity-90 disabled:opacity-45">
          {busy ? "Importando..." : "Importar e conciliar"}
        </button>
      </Panel>
      <DataTable
        title="Movimentos"
        headers={["Tipo", "Categoria", "Método", "Valor", "Conciliado"]}
        rows={transactions.map((tx) => [tx.type, tx.category, tx.payment_method, currency.format(tx.amount), tx.reconciled ? "Sim" : "Não"])}
        empty="Nenhum movimento importado."
      />
    </div>
  );
}

function Clients({ clients, onCreate }: { clients: Client[]; onCreate: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="grid gap-5">
      <Panel title="Novo cliente" eyebrow="Cadastro">
        <form onSubmit={onCreate} className="grid grid-cols-5 gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
          {["name", "email", "phone", "document"].map((field) => (
            <label key={field} className="grid gap-1 text-xs font-semibold uppercase text-sage">
              {clientFieldLabels[field] ?? field}
              <input
                name={field}
                required={field === "name"}
                className="min-h-11 rounded-lg border border-white/10 bg-night px-3 text-ivory outline-none transition focus:border-[var(--brand-accent)] text-sm font-normal normal-case"
              />
            </label>
          ))}
          <button className="min-h-11 rounded-lg bg-[var(--brand-accent)] px-4 font-bold text-night transition hover:opacity-90">Salvar cliente</button>
        </form>
      </Panel>
      {!clients.length && <p className="py-8 text-center text-ivory/55">Nenhum cliente cadastrado ainda.</p>}
      <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
        {clients.map((client) => (
          <article key={client.id} className="rounded-lg border border-white/10 bg-white/7 p-5 transition hover:bg-white/10">
            <h3 className="font-display text-2xl">{client.name}</h3>
            <p className="mt-2 text-ivory/60">{client.email || "Sem e-mail"}</p>
            <p className="text-ivory/60">{client.phone || "Sem telefone"}</p>
            <p className="mt-4 rounded bg-night/45 p-3 text-sm text-sage">{client.document || "Documento não informado"}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function SettingsView({ brand, setBrand }: { brand: { logo: string; accent: string; paper: string }; setBrand: (value: { logo: string; accent: string; paper: string }) => void }) {
  function update(next: typeof brand) {
    setBrand(next);
    localStorage.setItem("flymanager_brand", JSON.stringify(next));
  }
  function readLogo(file: File) {
    const reader = new FileReader();
    reader.onload = () => update({ ...brand, logo: String(reader.result) });
    reader.readAsDataURL(file);
  }
  return (
    <div className="grid grid-cols-[.8fr_1.2fr] gap-5 max-lg:grid-cols-1">
      <Panel title="Identidade editável" eyebrow="Brand">
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-ivory/70">
            Logo PNG
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && readLogo(event.target.files[0])} className="rounded-lg border border-white/10 bg-night p-3 text-ivory/70" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-ivory/70">
            Cor de destaque
            <input type="color" value={brand.accent} onChange={(event) => update({ ...brand, accent: event.target.value })} className="h-12 w-full rounded-lg border border-white/10 bg-night p-1" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-ivory/70">
            Off-white
            <input type="color" value={brand.paper} onChange={(event) => update({ ...brand, paper: event.target.value })} className="h-12 w-full rounded-lg border border-white/10 bg-night p-1" />
          </label>
          <a className="rounded-lg border border-white/10 bg-white/7 p-4 font-semibold text-ivory transition hover:bg-white/12" href="/brand/fly-logo.pdf" target="_blank" rel="noreferrer">
            Abrir logo em PDF editável
          </a>
        </div>
      </Panel>
      <Panel title="Preview" eyebrow="Flymusic">
        <div className="rounded-lg p-8" style={{ background: brand.paper }}>
          <img src={brand.logo} alt="Logo atual" className="h-40 w-full object-contain" />
        </div>
        <div className="mt-5 rounded-lg border border-white/10 bg-night/45 p-5">
          <p className="text-xs font-bold uppercase text-sage">Tipografia</p>
          <h2 className="font-display text-5xl">Noto Serif Display</h2>
          <p className="mt-2 text-ivory/65">Sora para interface, descrições e conteúdo funcional.</p>
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/7 p-5 shadow-premium">
      <p className="text-xs font-bold uppercase text-sage">{eyebrow}</p>
      <h2 className="mb-5 font-display text-3xl">{title}</h2>
      {children}
    </section>
  );
}

function DataTable({ title, headers, rows, empty }: { title: string; headers: string[]; rows: Array<Array<string | number>>; empty?: string }) {
  return (
    <Panel title={title} eyebrow="Tabela">
      {!rows.length && empty ? (
        <p className="py-6 text-center text-ivory/55">{empty}</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header} className="border-b border-white/10 px-3 py-3 text-xs uppercase text-sage">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="transition hover:bg-white/4">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border-b border-white/8 px-3 py-3 text-sm text-ivory/80">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
