"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Locale = "en" | "pt-BR";

type Messages = {
  flows: string;
  inbox: string;
  contacts: string;
  broadcasts: string;
  sequences: string;
  analytics: string;
  growth: string;
  channels: string;
  settings: string;
  lightMode: string;
  darkMode: string;
  signOut: string;
  welcomeBack: string;
  signInToAccount: string;
  password: string;
  passwordPlaceholder: string;
  signingIn: string;
  signIn: string;
  orContinueWith: string;
  noAccount: string;
  signUp: string;
  createAccount: string;
  getStarted: string;
  name: string;
  namePlaceholder: string;
  minCharacters: string;
  creatingAccount: string;
  alreadyHaveAccount: string;
  language: string;
  contactsInWorkspace: (count: number) => string;
  searchContacts: string;
  segment: string;
  all: string;
  noContactsFound: string;
  contactsEmptyDescription: string;
  tableName: string;
  tableEmail: string;
  lastInteraction: string;
  tags: string;
  subscribed: string;
  noEmail: string;
  noTags: string;
  yes: string;
  no: string;
  never: string;
  today: string;
  yesterday: string;
  daysAgo: (days: number) => string;
  contactInfo: string;
  noConversationsYet: string;
  inboxEmptyDescription: string;
  syncConversations: string;
  syncing: string;
  syncFailed: string;
  syncConnectionFailed: string;
};

const messages: Record<Locale, Messages> = {
  en: {
    flows: "Flows",
    inbox: "Inbox",
    contacts: "Contacts",
    broadcasts: "Broadcasts",
    sequences: "Sequences",
    analytics: "Analytics",
    growth: "Growth",
    channels: "Channels",
    settings: "Settings",
    lightMode: "Light mode",
    darkMode: "Dark mode",
    signOut: "Sign out",
    welcomeBack: "Welcome back",
    signInToAccount: "Sign in to your account",
    password: "Password",
    passwordPlaceholder: "Your password",
    signingIn: "Signing in...",
    signIn: "Sign in",
    orContinueWith: "Or continue with",
    noAccount: "Don't have an account?",
    signUp: "Sign up",
    createAccount: "Create your account",
    getStarted: "Get started with ZernFlow",
    name: "Name",
    namePlaceholder: "Your name",
    minCharacters: "Min. 6 characters",
    creatingAccount: "Creating account...",
    alreadyHaveAccount: "Already have an account?",
    language: "Language",
    contactsInWorkspace: (count) => `${count} contact${count !== 1 ? "s" : ""} in your workspace`,
    searchContacts: "Search by name or email...",
    segment: "Segment",
    all: "All",
    noContactsFound: "No contacts found",
    contactsEmptyDescription: "Contacts are created automatically when someone messages your channels",
    tableName: "Name",
    tableEmail: "Email",
    lastInteraction: "Last Interaction",
    tags: "Tags",
    subscribed: "Subscribed",
    noEmail: "No email",
    noTags: "No tags",
    yes: "Yes",
    no: "No",
    never: "Never",
    today: "Today",
    yesterday: "Yesterday",
    daysAgo: (days) => `${days}d ago`,
    contactInfo: "Contact info",
    noConversationsYet: "No conversations yet",
    inboxEmptyDescription: "If you already have conversations in Zernio, sync them to bring them into your inbox.",
    syncConversations: "Sync conversations",
    syncing: "Syncing...",
    syncFailed: "Sync failed",
    syncConnectionFailed: "Failed to sync. Check your connection.",
  },
  "pt-BR": {
    flows: "Fluxos",
    inbox: "Caixa de entrada",
    contacts: "Contatos",
    broadcasts: "Transmissões",
    sequences: "Sequências",
    analytics: "Análises",
    growth: "Crescimento",
    channels: "Canais",
    settings: "Configurações",
    lightMode: "Modo claro",
    darkMode: "Modo escuro",
    signOut: "Sair",
    welcomeBack: "Boas-vindas de volta",
    signInToAccount: "Entre na sua conta",
    password: "Senha",
    passwordPlaceholder: "Sua senha",
    signingIn: "Entrando...",
    signIn: "Entrar",
    orContinueWith: "Ou continue com",
    noAccount: "Ainda não tem uma conta?",
    signUp: "Criar conta",
    createAccount: "Crie sua conta",
    getStarted: "Comece a usar o ZernFlow",
    name: "Nome",
    namePlaceholder: "Seu nome",
    minCharacters: "Mínimo de 6 caracteres",
    creatingAccount: "Criando conta...",
    alreadyHaveAccount: "Já tem uma conta?",
    language: "Idioma",
    contactsInWorkspace: (count) => `${count} contato${count !== 1 ? "s" : ""} no seu espaço de trabalho`,
    searchContacts: "Buscar por nome ou e-mail...",
    segment: "Segmento",
    all: "Todos",
    noContactsFound: "Nenhum contato encontrado",
    contactsEmptyDescription: "Os contatos são criados automaticamente quando alguém envia uma mensagem pelos seus canais",
    tableName: "Nome",
    tableEmail: "E-mail",
    lastInteraction: "Última interação",
    tags: "Etiquetas",
    subscribed: "Inscrito",
    noEmail: "Sem e-mail",
    noTags: "Sem etiquetas",
    yes: "Sim",
    no: "Não",
    never: "Nunca",
    today: "Hoje",
    yesterday: "Ontem",
    daysAgo: (days) => `há ${days} dia${days !== 1 ? "s" : ""}`,
    contactInfo: "Informações do contato",
    noConversationsYet: "Ainda não há conversas",
    inboxEmptyDescription: "Se você já tem conversas no Zernio, sincronize-as para exibi-las na sua caixa de entrada.",
    syncConversations: "Sincronizar conversas",
    syncing: "Sincronizando...",
    syncFailed: "Falha na sincronização",
    syncConnectionFailed: "Não foi possível sincronizar. Verifique sua conexão.",
  },
};

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Messages;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("pt-BR");

  useEffect(() => {
    const savedLocale = localStorage.getItem("locale");
    if (savedLocale === "en" || savedLocale === "pt-BR") {
      setLocaleState(savedLocale);
    } else {
      localStorage.setItem("locale", "pt-BR");
    }
  }, []);

  function setLocale(nextLocale: Locale) {
    localStorage.setItem("locale", nextLocale);
    document.documentElement.lang = nextLocale;
    setLocaleState(nextLocale);
  }

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t: messages[locale] }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}
