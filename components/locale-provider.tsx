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
  },
};

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Messages;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const savedLocale = localStorage.getItem("locale");
    if (savedLocale === "en" || savedLocale === "pt-BR") {
      setLocaleState(savedLocale);
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
