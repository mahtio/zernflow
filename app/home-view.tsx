"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  GitBranch,
  MessageSquare,
  Users,
  Radio,
  MessageCircle,
  Zap,
  CheckCircle,
  TrendingUp,
  Heart,
  Github,
  X,
  Check,
  Sparkles,
  ListOrdered,
  Link2,
} from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { useLocale } from "@/components/locale-provider";
import { LanguageSelector } from "@/components/language-selector";

export function HomeView() {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";

  const comparisonRows = [
    { feature: pt ? "Instagram e Facebook" : "Instagram & Facebook", manychat: true, zernflow: true },
    { feature: "WhatsApp", manychat: true, zernflow: true },
    { feature: "Telegram", manychat: false, zernflow: true },
    { feature: "X / Twitter", manychat: false, zernflow: true },
    { feature: "Bluesky e Reddit", manychat: false, zernflow: true },
    { feature: pt ? "Construtor visual de fluxos" : "Visual flow builder", manychat: true, zernflow: true },
    { feature: pt ? "Respostas com IA (use sua chave)" : "AI responses (BYO key)", manychat: true, zernflow: true },
    { feature: pt ? "Escolha seu provedor de IA" : "Choose your AI provider", manychat: false, zernflow: true },
    { feature: pt ? "Do comentário para mensagem direta (DM)" : "Comment-to-DM", manychat: true, zernflow: true },
    { feature: pt ? "Caixa de entrada ao vivo" : "Live chat inbox", manychat: true, zernflow: true },
    { feature: pt ? "Sequências / campanhas de nutrição" : "Sequences / drip campaigns", manychat: true, zernflow: true },
    { feature: pt ? "CRM de contatos" : "Contact CRM", manychat: true, zernflow: true },
    { feature: pt ? "Código aberto (Open source)" : "Open source", manychat: false, zernflow: true },
    { feature: pt ? "Auto-hospedável" : "Self-hostable", manychat: false, zernflow: true },
    { feature: pt ? "Gratuito para sempre" : "Free forever", manychat: false, zernflow: true },
  ];

  const features = [
    {
      icon: MessageCircle,
      title: pt ? "Do comentário para DM" : "Comment-to-DM",
      desc: pt
        ? "Alguém comentou uma palavra-chave? Envie instantaneamente seu link, oferta ou material via mensagem direta."
        : "Someone comments a keyword? Instantly DM them your link, offer, or lead magnet.",
    },
    {
      icon: GitBranch,
      title: pt ? "Construtor visual de fluxos" : "Visual flow builder",
      desc: pt
        ? "Crie fluxos de conversa arrastando e soltando. Mensagens de boas-vindas, acompanhamentos e funis de vendas sem código."
        : "Drag-and-drop conversation flows. Welcome messages, follow-ups, sales funnels. No code.",
    },
    {
      icon: Sparkles,
      title: pt ? "Respostas com IA" : "AI responses",
      desc: pt
        ? "Deixe a inteligência artificial conduzir conversas. Escolha seu provedor: OpenAI, Anthropic ou Google."
        : "Let AI handle conversations. Pick your provider: OpenAI, Anthropic, or Google. Your API key, your choice.",
    },
    {
      icon: MessageSquare,
      title: pt ? "Caixa de entrada ao vivo" : "Live chat inbox",
      desc: pt
        ? "Todas as suas mensagens diretas em um só lugar. O bot cuida do básico e você assume quando necessário."
        : "All your DMs in one place. Bot handles the easy stuff, you jump in when it matters.",
    },
    {
      icon: Users,
      title: pt ? "CRM de contatos" : "Contact CRM",
      desc: pt
        ? "Etiquete seu público, construa segmentos e acompanhe interações. A mensagem certa para a pessoa certa."
        : "Tag your audience, build segments, track interactions. Right message to the right people.",
    },
    {
      icon: Radio,
      title: pt ? "Transmissões (Broadcasts)" : "Broadcasts",
      desc: pt
        ? "Envie novidades e ofertas para seu público. Segmente por etiquetas, plataformas ou filtros."
        : "Send promotions and updates to your audience. Target by tags, platform, or segments.",
    },
    {
      icon: ListOrdered,
      title: pt ? "Sequências" : "Sequences",
      desc: pt
        ? "Campanhas de nutrição no piloto automático. Envie mensagens com intervalos definidos e inscreva contatos."
        : "Drip campaigns that run on autopilot. Message, wait, message. Enroll contacts from flows.",
    },
    {
      icon: Link2,
      title: pt ? "Ferramentas de crescimento" : "Growth tools",
      desc: pt
        ? "Gere links de início de conversa para qualquer rede social e compartilhe onde quiser."
        : "Generate DM starter links for every platform. Share them anywhere to start conversations.",
    },
    {
      icon: Zap,
      title: pt ? "Webhooks e API" : "Webhooks & API",
      desc: pt
        ? "Conecte-se a qualquer ferramenta. Envie leads para o Google Sheets, dispare o Zapier ou chame APIs externas."
        : "Connect to any tool. Push leads to Google Sheets, trigger Zapier, call external APIs.",
    },
  ];

  const highlights = [
    {
      label: pt ? "7 plataformas, uma única ferramenta" : "7 platforms, one tool",
      detail: pt
        ? "Instagram, Facebook, WhatsApp, Telegram, X, Bluesky, Reddit. O ManyChat só suporta 3."
        : "Instagram, Facebook, WhatsApp, Telegram, X, Bluesky, Reddit. ManyChat only does 3.",
    },
    {
      label: pt ? "Gratuito para sempre" : "Free forever",
      detail: pt
        ? "Sem mensalidades, sem cobrança por conta conectada e sem limites de recursos."
        : "No monthly fees. No per-account charges. No feature limits.",
    },
    {
      label: pt ? "Auto-hospedável" : "Self-hostable",
      detail: pt
        ? "Clone o repositório, configure suas variáveis e publique. Seu servidor, suas regras."
        : "Clone the repo, set your env vars, deploy. Your server, your rules.",
    },
    {
      label: pt ? "Orientado pela comunidade" : "Community-driven",
      detail: pt
        ? "Construído abertamente. Contribuições são bem-vindas e o roteiro é moldado pelos usuários."
        : "Built in public. PRs welcome. Roadmap shaped by users, not investors.",
    },
  ];

  const steps = [
    {
      step: "1",
      icon: CheckCircle,
      title: pt ? "Conecte suas contas" : "Connect your accounts",
      desc: pt
        ? "Vincule Instagram, Facebook, WhatsApp, Telegram ou qualquer outra rede social em poucos cliques."
        : "Link your Instagram, Facebook, WhatsApp, Telegram, or any other platform in a few clicks.",
    },
    {
      step: "2",
      icon: GitBranch,
      title: pt ? "Crie um fluxo" : "Build a flow",
      desc: pt
        ? "Use o editor visual para montar sua automação. Escolha um gatilho, adicione mensagens e defina condições."
        : "Use the visual builder to create your automation. Pick a trigger, add messages, set conditions.",
    },
    {
      step: "3",
      icon: TrendingUp,
      title: pt ? "Acompanhe os resultados" : "Watch it grow",
      desc: pt
        ? "Seus fluxos rodam 24 horas por dia, 7 dias por semana. Capture leads, tire dúvidas e venda no automático."
        : "Your flows run 24/7. Capture leads, answer questions, and sell while you sleep.",
    },
  ];

  const useCases = [
    {
      icon: Heart,
      title: pt ? "Criadores de conteúdo" : "Creators",
      desc: pt
        ? "Responda automaticamente comentários, envie links por DM e expanda sua lista de contatos."
        : "Auto-reply to comments, send lead magnets via DM, and grow your email list from social.",
    },
    {
      icon: TrendingUp,
      title: pt ? "Empresas e negócios" : "Small businesses",
      desc: pt
        ? "Qualifique potenciais clientes por mensagem, responda dúvidas frequentes e agende reuniões."
        : "Qualify leads through DM conversations, answer FAQs instantly, and book appointments on autopilot.",
    },
    {
      icon: Users,
      title: pt ? "Agências" : "Agencies",
      desc: pt
        ? "Gerencie as contas de todos os seus clientes em um único espaço e reutilize automações entre marcas."
        : "Manage all your clients' accounts in one workspace. Build flows once, reuse them across brands.",
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="ZernFlow" width={28} height={28} className="rounded-lg" />
            <span className="text-base font-bold text-gray-900">ZernFlow</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSelector />
            <Link
              href="https://github.com/zernio-dev/zernflow"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-gray-900 sm:inline-flex"
            >
              <Github className="h-4 w-4" />
              {pt ? "Estrela no GitHub" : "Star on GitHub"}
            </Link>
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-gray-900"
            >
              {pt ? "Entrar" : "Log in"}
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {pt ? "Começar grátis" : "Get started free"}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-1.5">
            <span className="text-xs font-medium text-indigo-700">{pt ? "Licença MIT" : "MIT Licensed"}</span>
            <Link
              href="https://github.com/zernio-dev/zernflow"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-700"
            >
              {pt ? "Ver no GitHub" : "View on GitHub"} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            {pt ? "A Alternativa Open Source ao " : "The Open Source "}
            <span className="text-indigo-600">ManyChat</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-gray-500">
            {pt
              ? "Automatize mensagens diretas, comentários e fluxos no Instagram, Facebook, WhatsApp, Telegram, X, Bluesky e Reddit. Gratuito, auto-hospedável e feito para criadores e desenvolvedores."
              : "Automate DMs, comments, and flows across Instagram, Facebook, WhatsApp, Telegram, X, Bluesky, and Reddit. Free, self-hostable, and built for developers."}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 sm:w-auto"
            >
              {pt ? "Começar gratuitamente" : "Get started free"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="https://github.com/zernio-dev/zernflow"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 sm:w-auto"
            >
              <Github className="h-4 w-4" />
              {pt ? "Ver código-fonte" : "View source code"}
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-400">
            {pt
              ? "Licença MIT. Auto-hospede ou use nossa nuvem. Sem necessidade de cartão de crédito."
              : "MIT licensed. Self-host or use our cloud. No credit card required."}
          </p>
        </div>

        {/* Flow builder preview */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-xl">
            <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-red-300" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-300" />
              <span className="ml-3 text-xs text-gray-400">{pt ? "Fluxo de boas-vindas" : "Welcome Flow"}</span>
            </div>
            <div
              className="relative flex min-h-[300px] items-center justify-center gap-4 p-8 sm:gap-6 sm:p-12"
              style={{
                backgroundImage: "radial-gradient(circle, #e5e7eb 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            >
              {/* Trigger */}
              <div className="w-40 rounded-xl border-2 border-indigo-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50">
                    <MessageCircle className="h-3.5 w-3.5 text-indigo-600" />
                  </div>
                  <span className="text-xs font-semibold text-gray-900">{pt ? "Gatilho de comentário" : "Comment trigger"}</span>
                </div>
                <p className="text-[10px] text-gray-500">{pt ? "Palavra-chave: \"quero\"" : "Keyword: \"info\""}</p>
              </div>

              <div className="hidden h-0.5 w-6 bg-gray-300 sm:block" />

              {/* Send DM */}
              <div className="hidden w-44 rounded-xl border-2 border-emerald-200 bg-white p-4 shadow-sm sm:block">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50">
                    <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <span className="text-xs font-semibold text-gray-900">{pt ? "Enviar DM" : "Send DM"}</span>
                </div>
                <p className="text-[10px] text-gray-500">{pt ? "\"Olá! Aqui está o seu link...\"" : "\"Hey! Here's the link...\""}</p>
              </div>

              <div className="hidden h-0.5 w-6 bg-gray-300 sm:block" />

              {/* Tag */}
              <div className="w-36 rounded-xl border-2 border-amber-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50">
                    <Users className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <span className="text-xs font-semibold text-gray-900">{pt ? "Etiquetar como lead" : "Tag as lead"}</span>
                </div>
                <p className="text-[10px] text-gray-500">{pt ? "Etiqueta: \"interessado\"" : "Tag: \"interested\""}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platforms */}
      <section className="border-y border-gray-100 bg-gray-50/60 py-10">
        <div className="mx-auto max-w-6xl px-6">
          <p className="mb-4 text-center text-xs font-medium uppercase tracking-wider text-gray-400">
            {pt ? "Compatível com 7 plataformas (ManyChat suporta apenas 3)" : "Works with 7 platforms (ManyChat only supports 3)"}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {[
              { name: "Instagram", platform: "instagram" },
              { name: "Facebook", platform: "facebook" },
              { name: "WhatsApp", platform: "whatsapp" },
              { name: "Telegram", platform: "telegram" },
              { name: "X / Twitter", platform: "twitter" },
              { name: "Bluesky", platform: "bluesky" },
              { name: "Reddit", platform: "reddit" },
            ].map((p) => (
              <span key={p.platform} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500">
                <PlatformIcon platform={p.platform} size={18} />
                {p.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ManyChat comparison */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {pt ? "Por que equipes migram do ManyChat" : "Why teams switch from ManyChat"}
            </h2>
            <p className="mt-3 text-base text-gray-500">
              {pt
                ? "Os mesmos recursos que você já utiliza. Mais redes sociais. Sem mensalidades abusivas."
                : "Same features you rely on. More platforms. No monthly bill."}
            </p>
          </div>
          <div className="mx-auto mt-12 max-w-3xl">
            <div className="overflow-hidden rounded-2xl border border-gray-200">
              {/* Header */}
              <div className="grid grid-cols-3 border-b border-gray-200 bg-gray-50">
                <div className="px-6 py-4" />
                <div className="border-l border-gray-200 px-6 py-4 text-center">
                  <p className="text-sm font-semibold text-gray-400">ManyChat</p>
                </div>
                <div className="border-l border-gray-200 bg-indigo-50 px-6 py-4 text-center">
                  <p className="text-sm font-semibold text-indigo-600">ZernFlow</p>
                </div>
              </div>
              {/* Rows */}
              {comparisonRows.map((row) => (
                <div key={row.feature} className="grid grid-cols-3 border-b border-gray-100 last:border-b-0">
                  <div className="px-6 py-3">
                    <p className="text-sm text-gray-700">{row.feature}</p>
                  </div>
                  <div className="flex items-center justify-center border-l border-gray-100 px-6 py-3">
                    {row.manychat ? (
                      <Check className="h-4 w-4 text-gray-300" />
                    ) : (
                      <X className="h-4 w-4 text-gray-300" />
                    )}
                  </div>
                  <div className="flex items-center justify-center border-l border-gray-100 bg-indigo-50/30 px-6 py-3">
                    <Check className="h-4 w-4 text-indigo-600" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-gray-100 bg-gray-50/60 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {pt ? "Tudo o que você precisa para crescer nas redes" : "Everything you need to grow on social"}
            </h2>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="bg-white p-6">
                  <Icon className="mb-3 h-5 w-5 text-indigo-500" />
                  <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Open source section */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1">
                <Github className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-xs font-medium text-gray-500">{pt ? "Licença MIT" : "MIT licensed"}</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                {pt ? "Código aberto de verdade." : "Open source. Not open-washing."}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-gray-500">
                {pt
                  ? "O ZernFlow é totalmente livre sob a licença MIT. Inspecione cada linha de código, auto-hospede em sua própria infraestrutura ou faça um fork. Sem pegadinhas e sem recursos bloqueados."
                  : "ZernFlow is fully open source under the MIT license. Read every line of code, self-host on your own infrastructure, or fork it and make it yours. No \"open core\" tricks, no enterprise-only features behind a paywall."}
              </p>
              <p className="mt-3 text-base leading-relaxed text-gray-500">
                {pt
                  ? "Suas automações, seus contatos, seus dados. Você é dono de tudo, sem aprisionamento tecnológico."
                  : "Your automations, your contacts, your data. You own everything. No vendor lock-in, ever."}
              </p>
              <div className="mt-6">
                <Link
                  href="https://github.com/zernio-dev/zernflow"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  <Github className="h-4 w-4" />
                  {pt ? "Deixe uma estrela no GitHub" : "Star us on GitHub"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
            <div className="space-y-3">
              {highlights.map((item) => (
                <div key={item.label} className="rounded-xl border border-gray-200 px-5 py-4">
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="mt-0.5 text-sm text-gray-500">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-gray-100 bg-gray-50/60 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">
            {pt ? "Pronto em menos de 5 minutos" : "Up and running in 5 minutes"}
          </h2>
          <div className="mx-auto mt-14 grid max-w-3xl gap-10 sm:grid-cols-3">
            {steps.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.step} className="text-center">
                  <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50">
                    <Icon className="h-5 w-5 text-indigo-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">
            {pt ? "Feito para criadores, empresas e agências" : "Built for creators, businesses, and agencies"}
          </h2>
          <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-3">
            {useCases.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-xl border border-gray-200 bg-white p-6">
                  <Icon className="mb-3 h-5 w-5 text-indigo-500" />
                  <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="rounded-2xl bg-indigo-600 p-10 sm:p-14">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">
                {pt ? "Pare de pagar por automação de chat" : "Stop paying for chat automation"}
              </h2>
              <p className="mt-3 text-sm text-indigo-100">
                {pt
                  ? "Migre do ManyChat em minutos. Conecte suas contas, ative seus fluxos e comece agora. Gratuito, código aberto e sob licença MIT."
                  : "Switch from ManyChat in minutes. Import your flows, connect your accounts, and go live. Free forever, open source, MIT licensed."}
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-indigo-600 shadow-sm hover:bg-indigo-50"
                >
                  {pt ? "Começar gratuitamente" : "Get started free"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="https://github.com/zernio-dev/zernflow"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-indigo-400 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  <Github className="h-4 w-4" />
                  {pt ? "Estrela no GitHub" : "Star on GitHub"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">ZernFlow</span>
            <span className="text-sm text-gray-300">|</span>
            <Link
              href="https://github.com/zernio-dev/zernflow"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
            >
              <Github className="h-3.5 w-3.5" />
              GitHub
            </Link>
            <Link
              href="https://zernio.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/powered-by-zernio.svg" alt="Powered by Zernio" className="h-10" />
            </Link>
          </div>
          <p className="text-xs text-gray-400">
            {pt ? "Código aberto sob licença MIT" : "Open source, MIT licensed"}
          </p>
        </div>
      </footer>
    </div>
  );
}
