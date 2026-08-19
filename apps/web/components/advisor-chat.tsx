"use client";

import {
  Archive,
  Bot,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileText,
  Menu,
  MessageSquarePlus,
  MapPin,
  PackageSearch,
  Search,
  Send,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createChatSession, streamChatMessage } from "@/lib/chat-api";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: string;
}

const suggestions = [
  {
    icon: PackageSearch,
    title: "Buscar productos",
    description:
      "Consulta catálogo y disponibilidad por marca o característica.",
    prompt: "Muéstrame productos de la marca TECLAM",
    accent: "blue",
  },
  {
    icon: FileText,
    title: "Ver fichas técnicas",
    description: "Consulta especificaciones respaldadas por datasheets.",
    prompt: "Quiero consultar la ficha técnica de un producto",
    accent: "neutral",
  },
  {
    icon: Sparkles,
    title: "Comparar productos",
    description:
      "Analiza diferencias informativas entre opciones del catálogo.",
    prompt: "Ayúdame a comparar productos del catálogo",
    accent: "violet",
  },
  {
    icon: MapPin,
    title: "Sucursales",
    description: "Consulta información y disponibilidad por sucursal.",
    prompt: "Quiero consultar información de las sucursales",
    accent: "neutral",
  },
] as const;

export function AdvisorChat() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const busy = progress !== null;

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, progress]);

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;
    const created = await createChatSession();
    setSessionId(created);
    return created;
  }

  async function sendMessage(content: string) {
    const normalized = content.trim();
    if (!normalized || busy) return;
    setInput("");
    setError(null);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: normalized },
    ]);
    setProgress("Iniciando consulta…");

    try {
      const activeSession = await ensureSession();
      const result = await streamChatMessage(
        activeSession,
        normalized,
        setProgress,
      );
      const stockMeta =
        result.stockAgeSeconds === null
          ? `${result.processingTimeMs} ms`
          : `Stock hace ${result.stockAgeSeconds}s · ${result.processingTimeMs} ms`;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.reply,
          meta: stockMeta,
        },
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo completar la consulta.",
      );
    } finally {
      setProgress(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  function newConversation() {
    if (busy) return;
    setSessionId(null);
    setMessages([]);
    setInput("");
    setError(null);
    setMobileMenu(false);
  }

  return (
    <div className="app-shell">
      <Sidebar
        open={mobileMenu}
        onClose={() => setMobileMenu(false)}
        onNew={newConversation}
      />
      <main className="main-canvas">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setMobileMenu(true)}
            aria-label="Abrir menú"
          >
            <Menu size={24} />
          </button>
          <div className="topbar-title">Nexus</div>
          <div className="avatar" aria-label="Perfil del asesor">
            DA
          </div>
        </header>

        {messages.length === 0 ? (
          <Welcome
            input={input}
            setInput={setInput}
          submit={submit}
          onKeyDown={handleComposerKeyDown}
          busy={busy}
          sendMessage={sendMessage}
          />
        ) : (
          <section className="conversation" aria-live="polite">
            <div className="conversation-heading">
              <div>
                <span className="eyebrow">Consulta activa</span>
                <h1>Asistente informativo</h1>
              </div>
              <button
                className="ghost-button"
                onClick={newConversation}
                disabled={busy}
              >
                <MessageSquarePlus size={18} /> Nueva consulta
              </button>
            </div>
            <div className="message-list">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {progress ? <ProgressMessage text={progress} /> : null}
              {error ? (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              ) : null}
              <div ref={threadEndRef} />
            </div>
            <div className="conversation-composer">
              <Composer
                input={input}
                setInput={setInput}
                submit={submit}
                onKeyDown={handleComposerKeyDown}
                busy={busy}
                compact
              />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Sidebar({
  open,
  onClose,
  onNew,
}: {
  open: boolean;
  onClose: () => void;
  onNew: () => void;
}) {
  return (
    <>
      {open ? (
        <button
          className="sidebar-backdrop"
          onClick={onClose}
          aria-label="Cerrar menú"
        />
      ) : null}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div>
            <div className="brand">Nexus AI</div>
            <div className="brand-subtitle">Asistente informativo</div>
          </div>
          <button
            className="icon-button mobile-only"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
            <X size={22} />
          </button>
        </div>
        <nav className="nav-list" aria-label="Navegación principal">
          <button className="nav-item nav-active" onClick={onNew}>
            <MessageSquarePlus />
            <span>Nueva consulta</span>
          </button>
          <button
            className="nav-item"
            disabled
            title="Disponible con la integración de Google Drive"
          >
            <Archive />
            <span>Mis archivos</span>
            <small>Próximamente</small>
          </button>
          <button
            className="nav-item"
            disabled
            title="Disponible en una siguiente fase"
          >
            <Clock3 />
            <span>Historial</span>
            <small>Próximamente</small>
          </button>
        </nav>
        <nav className="nav-list nav-bottom" aria-label="Navegación secundaria">
          <button className="nav-item" disabled>
            <Settings />
            <span>Configuración</span>
          </button>
          <button className="nav-item" disabled>
            <CircleHelp />
            <span>Ayuda</span>
          </button>
        </nav>
      </aside>
    </>
  );
}

function Welcome({
  input,
  setInput,
  submit,
  onKeyDown,
  busy,
  sendMessage,
}: {
  input: string;
  setInput: (value: string) => void;
  submit: (event: FormEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  busy: boolean;
  sendMessage: (message: string) => Promise<void>;
}) {
  return (
    <section className="welcome">
      <div className="welcome-content">
        <div className="status-chip">
          <CheckCircle2 size={15} /> Catálogo y disponibilidad conectados
        </div>
        <h1>
          <span>Hola,</span> ¿en qué te ayudo?
        </h1>
        <p>
          Consulta productos, disponibilidad y especificaciones técnicas con
          información del catálogo autorizado.
        </p>
        <Composer
          input={input}
          setInput={setInput}
          submit={submit}
          onKeyDown={onKeyDown}
          busy={busy}
        />
        <div className="suggestion-grid">
          {suggestions.map((suggestion) => {
            const Icon = suggestion.icon;
            return (
              <button
                key={suggestion.title}
                className="suggestion-card"
                onClick={() => void sendMessage(suggestion.prompt)}
                disabled={busy}
              >
                <span className={`suggestion-icon ${suggestion.accent}`}>
                  <Icon size={23} />
                </span>
                <strong>{suggestion.title}</strong>
                <span>{suggestion.description}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="knowledge-status">
        <span /> Base de conocimientos: catálogo conectado
      </div>
    </section>
  );
}

function Composer({
  input,
  setInput,
  submit,
  busy,
  compact = false,
  onKeyDown,
}: {
  input: string;
  setInput: (value: string) => void;
  submit: (event: FormEvent) => void;
  busy: boolean;
  compact?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <form
      className={`composer ${compact ? "composer-compact" : ""} ${busy ? "composer-busy" : ""}`}
      onSubmit={submit}
    >
      <Search className="composer-search" size={25} />
      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Escribe aquí tu consulta o pregunta…"
        rows={1}
        maxLength={2000}
        disabled={busy}
        aria-label="Mensaje para el asistente"
      />
      <button
        className="send-button"
        type="submit"
        disabled={busy || !input.trim()}
        aria-label="Enviar mensaje"
      >
        <Send size={21} />
      </button>
    </form>
  );
}

function MessageBubble({ message }: { message: UiMessage }) {
  if (message.role === "user") {
    return (
      <div className="user-message">
        <div>{message.content}</div>
      </div>
    );
  }
  return (
    <article className="assistant-message">
      <div className="assistant-mark">
        <Bot size={19} />
      </div>
      <div className="assistant-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.content}
        </ReactMarkdown>
        {message.meta ? (
          <div className="message-meta">{message.meta}</div>
        ) : null}
      </div>
    </article>
  );
}

function ProgressMessage({ text }: { text: string }) {
  return (
    <div className="progress-message">
      <div className="assistant-mark">
        <Bot size={19} />
      </div>
      <div>
        <div className="progress-label">{text}</div>
        <div className="progress-line" />
      </div>
    </div>
  );
}
