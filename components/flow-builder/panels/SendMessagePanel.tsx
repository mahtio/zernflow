"use client";

import { useCallback, useRef } from "react";
import { Plus, X, GripVertical, Image, Type, MousePointer, MessageCircle, LayoutGrid, ExternalLink, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";
import { createMessageOptionId } from "@/lib/flow-engine/message-options";
import type { MessageInteractionMode, MessageOption } from "@/lib/flow-engine/types";

interface QuickReply {
  title: string;
  payload: string;
}

interface Button {
  title: string;
  type: "postback" | "url";
  payload?: string;
  url?: string;
}

interface CarouselElement {
  imageUrl?: string;
  title: string;
  subtitle?: string;
  buttons?: Button[];
}

interface Carousel {
  elements: CarouselElement[];
}

interface Message {
  text?: string;
  imageUrl?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio";
  interactionMode?: MessageInteractionMode;
  options?: MessageOption[];
  privateReplyButton?: {
    type: "postback" | "url";
    title: string;
    destinationUrl?: string;
    payload?: string;
  };
  quickReplies?: QuickReply[];
  buttons?: Button[];
  carousel?: Carousel;
}

interface SendMessagePanelData {
  deliveryMode?: "standard" | "private_reply";
  interactionTimeoutHours?: number;
  messages?: Message[];
  [key: string]: unknown;
}

interface SendMessagePanelProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  availableVariables?: string[];
  isCommentPrivateReply?: boolean;
}

function VariablePicker({
  variables,
  onInsert,
}: {
  variables: string[];
  onInsert: (variable: string) => void;
}) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";

  return (
    <div className="mt-1.5">
      <p className="text-[11px] text-muted-foreground/60">
        {pt
          ? "Clique para inserir uma variável. Caminhos com ponto como {{myvar.data.name}} leem campos de respostas JSON."
          : "Click to insert a variable. Dot paths like {{myvar.data.name}} read fields from JSON responses."}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {variables.map((variable) => (
          <button
            key={variable}
            type="button"
            onClick={() => onInsert(variable)}
            className="rounded px-1.5 py-0.5 font-mono text-[11px] font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950"
          >
            {`{{${variable}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SendMessagePanel({ data: rawData, onChange, availableVariables, isCommentPrivateReply }: SendMessagePanelProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const data = rawData as SendMessagePanelData;
  const messages = data.messages || [];

  const updateMessage = useCallback(
    (index: number, updated: Message) => {
      const msgs = [...messages];
      msgs[index] = updated;
      onChange({ ...data, messages: msgs });
    },
    [data, messages, onChange]
  );

  const addMessage = useCallback(() => {
    onChange({ ...data, messages: [...messages, { text: "" }] });
  }, [data, messages, onChange]);

  const removeMessage = useCallback(
    (index: number) => {
      onChange({ ...data, messages: messages.filter((_, i) => i !== index) });
    },
    [data, messages, onChange]
  );

  if (isCommentPrivateReply) {
    return (
      <PrivateReplyEditor
        data={data}
        onChange={onChange}
        availableVariables={availableVariables || []}
      />
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message, msgIndex) => (
        <MessageEditor
          key={msgIndex}
          index={msgIndex}
          message={message}
          onChange={(updated) => updateMessage(msgIndex, updated)}
          onRemove={() => removeMessage(msgIndex)}
          canRemove={messages.length > 1}
          availableVariables={availableVariables}
        />
      ))}

      <button
        type="button"
        onClick={addMessage}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-blue-400 hover:text-blue-500"
      >
        <Plus className="h-4 w-4" />
        {pt ? "Adicionar mensagem" : "Add Message"}
      </button>

      {messages.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {pt ? "Adicione pelo menos uma mensagem para enviar." : "Add at least one message to send."}
        </p>
      )}

      {/* Platform hints */}
      <div className="rounded-lg border border-border bg-muted p-3">
        <p className="text-xs font-medium text-muted-foreground">{pt ? "Notas sobre as plataformas" : "Platform notes"}</p>
        <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
          <li>{pt ? "Facebook/Instagram/WhatsApp: Máximo de 3 botões por mensagem" : "Facebook/Instagram/WhatsApp: Max 3 buttons per message"}</li>
          <li>{pt ? "Telegram: Botões aparecem como teclado inline" : "Telegram: Buttons appear as inline keyboards"}</li>
          <li>{pt ? "Respostas rápidas desaparecem após a interação do usuário" : "Quick replies disappear after user responds"}</li>
          <li>{pt ? "Carrosséis: Nativos no Facebook/Instagram, alternativa em texto nas demais" : "Carousels: Native on Facebook/Instagram, text fallback elsewhere"}</li>
          <li>
            {pt
              ? "WhatsApp: A Meta aceita mensagens livres apenas dentro da janela de 24h da última mensagem do contato"
              : "WhatsApp: Meta only accepts free-form messages within 24h of the contact's last message"}
          </li>
        </ul>
      </div>
    </div>
  );
}

function PrivateReplyEditor({
  data,
  onChange,
  availableVariables,
}: {
  data: SendMessagePanelData;
  onChange: (data: Record<string, unknown>) => void;
  availableVariables: string[];
}) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const message = data.messages?.[0] || { text: "", interactionMode: "none", options: [] };
  const button = message.options?.[0];
  const update = (nextMessage: Message) => onChange({
    ...data,
    deliveryMode: "private_reply",
    interactionTimeoutHours: 24,
    messages: [nextMessage],
  });
  const setButtonEnabled = (enabled: boolean) => update({
    ...message,
    interactionMode: enabled ? "buttons" : "none",
    options: enabled ? [button || { id: createMessageOptionId(), title: "Continuar", kind: "postback" }] : [],
  });
  const insertVariable = (variable: string) => {
    const token = `{{${variable}}}`;
    const text = message.text || "";
    const caret = textareaRef.current?.selectionStart ?? text.length;
    update({ ...message, text: text.slice(0, caret) + token + text.slice(caret) });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
        <p className="font-semibold">{pt ? "Primeira mensagem do comentário" : "First comment message"}</p>
        <p className="mt-1">{pt
          ? "O Instagram permite somente uma resposta privada antes da interação do contato."
          : "Instagram allows only one private reply before the contact interacts."}</p>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{pt ? "Texto da mensagem" : "Message text"}</label>
        <textarea
          ref={textareaRef}
          value={message.text || ""}
          onChange={(event) => update({ ...message, text: event.target.value })}
          rows={4}
          className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={pt ? "Digite a resposta privada..." : "Type the private reply..."}
        />
        <VariablePicker variables={availableVariables} onInsert={insertVariable} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{pt ? "Imagem opcional por URL" : "Optional image URL"}</label>
        <input
          type="url"
          value={message.mediaUrl || ""}
          onChange={(event) => update({ ...message, mediaUrl: event.target.value || undefined, mediaType: event.target.value ? "image" : undefined })}
          placeholder="https://example.com/image.jpg"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{pt ? "A publicação avisará caso o canal não aceite imagem na resposta privada." : "Publishing will report if the channel does not support private-reply images."}</p>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={Boolean(button)} onChange={(event) => setButtonEnabled(event.target.checked)} />
        {pt ? "Adicionar botão" : "Add button"}
      </label>
      {button && (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{pt ? "Texto do botão" : "Button text"}</label>
            <input type="text" value={button.title} maxLength={20} onChange={(event) => update({ ...message, options: [{ ...button, title: event.target.value }] })} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{pt ? "Ação do botão" : "Button action"}</label>
            <select value={button.kind} onChange={(event) => update({ ...message, options: [{ ...button, kind: event.target.value as "postback" | "url", destinationUrl: event.target.value === "url" ? button.destinationUrl : undefined }] })} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="postback">{pt ? "Continuar no fluxo" : "Continue flow"}</option>
              <option value="url">{pt ? "Abrir página" : "Open page"}</option>
            </select>
          </div>
          {button.kind === "url" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{pt ? "URL HTTPS de destino" : "HTTPS destination URL"}</label>
              <input type="url" value={button.destinationUrl || ""} onChange={(event) => update({ ...message, options: [{ ...button, destinationUrl: event.target.value }] })} placeholder="https://example.com" className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          )}
        </>
      )}
      <div className="rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
        {!button
          ? (pt ? "Sem botão, somente Lógica/Ações sem envio de mensagem podem continuar imediatamente." : "Without a button, only Logic/Actions that do not send messages may continue immediately.")
          : button.kind === "postback"
            ? (pt ? "O fluxo aguarda o clique. O postback recebido abre/renova a janela de mensagens e libera a continuação." : "The flow waits for the click. A received postback opens/renews the messaging window.")
            : (pt ? "O clique é rastreado, não abre a janela da Meta e só pode seguir por Lógica/Ações sem envio." : "The click is tracked, does not open Meta's window, and may only continue through non-sending Logic/Actions.")}
      </div>
    </div>
  );
}

function MessageEditor({
  index,
  message,
  onChange,
  onRemove,
  canRemove,
  availableVariables,
}: {
  index: number;
  message: Message;
  onChange: (m: Message) => void;
  onRemove: () => void;
  canRemove: boolean;
  availableVariables?: string[];
}) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const isCarouselMode = !!message.carousel;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertVariable = useCallback(
    (variable: string) => {
      const token = `{{${variable}}}`;
      const textarea = textareaRef.current;
      const text = message.text || "";
      const caret = textarea?.selectionStart ?? text.length;
      onChange({
        ...message,
        text: text.slice(0, caret) + token + text.slice(caret),
      });
      requestAnimationFrame(() => {
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(caret + token.length, caret + token.length);
      });
    },
    [message, onChange]
  );

  const toggleMode = useCallback(() => {
    if (isCarouselMode) {
      const { carousel: _, ...rest } = message;
      onChange({ ...rest, text: rest.text || "" });
    } else {
      onChange({
        carousel: {
          elements: [{ title: "", subtitle: "", imageUrl: "" }],
        },
      });
    }
  }, [isCarouselMode, message, onChange]);

  // Quick replies
  const addQuickReply = useCallback(() => {
    const replies = message.quickReplies || [];
    onChange({ ...message, quickReplies: [...replies, { title: "", payload: "" }] });
  }, [message, onChange]);

  const updateQuickReply = useCallback(
    (i: number, updated: QuickReply) => {
      const replies = [...(message.quickReplies || [])];
      replies[i] = updated;
      onChange({ ...message, quickReplies: replies });
    },
    [message, onChange]
  );

  const removeQuickReply = useCallback(
    (i: number) => {
      const replies = (message.quickReplies || []).filter((_, idx) => idx !== i);
      onChange({ ...message, quickReplies: replies.length > 0 ? replies : undefined });
    },
    [message, onChange]
  );

  // Buttons
  const addButton = useCallback(() => {
    const buttons = message.buttons || [];
    onChange({ ...message, buttons: [...buttons, { title: "", type: "postback", payload: "" }] });
  }, [message, onChange]);

  const updateButton = useCallback(
    (i: number, updated: Button) => {
      const buttons = [...(message.buttons || [])];
      buttons[i] = updated;
      onChange({ ...message, buttons });
    },
    [message, onChange]
  );

  const removeButton = useCallback(
    (i: number) => {
      const buttons = (message.buttons || []).filter((_, idx) => idx !== i);
      onChange({ ...message, buttons: buttons.length > 0 ? buttons : undefined });
    },
    [message, onChange]
  );

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Message header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span className="text-xs font-semibold text-muted-foreground">
            {pt ? "Mensagem" : "Message"} {index + 1}
          </span>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => isCarouselMode && toggleMode()}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
            !isCarouselMode
              ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
              : "text-muted-foreground/60 hover:text-muted-foreground"
          )}
        >
          <Type className="h-3 w-3" />
          {pt ? "Texto" : "Text"}
        </button>
        <button
          type="button"
          onClick={() => !isCarouselMode && toggleMode()}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
            isCarouselMode
              ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
              : "text-muted-foreground/60 hover:text-muted-foreground"
          )}
        >
          <LayoutGrid className="h-3 w-3" />
          {pt ? "Carrossel" : "Carousel"}
        </button>
      </div>

      <div className="space-y-4 p-3">
        {isCarouselMode ? (
          <CarouselEditor
            carousel={message.carousel!}
            onChange={(carousel) => onChange({ ...message, carousel })}
          />
        ) : (
          <>
            {/* Text */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Type className="h-3 w-3 text-muted-foreground/60" />
                <label className="text-xs font-medium text-muted-foreground">{pt ? "Texto" : "Text"}</label>
              </div>
              <textarea
                ref={textareaRef}
                value={message.text || ""}
                onChange={(e) => onChange({ ...message, text: e.target.value })}
                placeholder={pt ? "Digite sua mensagem... Insira variáveis abaixo" : "Type your message... Insert variables below"}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {availableVariables && availableVariables.length > 0 ? (
                <VariablePicker
                  variables={availableVariables}
                  onInsert={insertVariable}
                />
              ) : (
                <p className="text-[11px] text-muted-foreground/60">
                  {pt ? "Use {{variavel}} para conteúdo dinâmico" : "Use {{variable}} for dynamic content"}
                </p>
              )}
            </div>

            {/* Media (image / video / audio) */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Image className="h-3 w-3 text-muted-foreground/60" />
                <label className="text-xs font-medium text-muted-foreground">{pt ? "URL de mídia" : "Media URL"}</label>
              </div>
              <div className="flex gap-2">
                <select
                  value={message.mediaType || "image"}
                  onChange={(e) =>
                    onChange({
                      ...message,
                      mediaType: e.target.value as "image" | "video" | "audio",
                    })
                  }
                  className="rounded-lg border border-border bg-card px-2 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="image">{pt ? "Imagem" : "Image"}</option>
                  <option value="video">{pt ? "Vídeo" : "Video"}</option>
                  <option value="audio">{pt ? "Áudio" : "Audio"}</option>
                </select>
                <input
                  type="url"
                  value={message.mediaUrl ?? message.imageUrl ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...message,
                      mediaUrl: e.target.value || undefined,
                      mediaType: message.mediaType || "image",
                      imageUrl: undefined,
                    })
                  }
                  placeholder="https://example.com/file.mp4"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground/60">
                {pt ? "Envia uma imagem, vídeo ou áudio junto a esta mensagem." : "Sends an image, video, or audio file with this message."}
              </p>
            </div>

            <InteractionOptionsEditor message={message} onChange={onChange} pt={pt} />
          </>
        )}
      </div>
    </div>
  );
}

function InteractionOptionsEditor({ message, onChange, pt }: { message: Message; onChange: (message: Message) => void; pt: boolean }) {
  const mode = message.interactionMode ?? ((message.buttons?.length ?? 0) > 0 ? "buttons" : (message.quickReplies?.length ?? 0) > 0 ? "quick_replies" : "none");
  const options = message.options ?? [];
  const changeMode = (next: MessageInteractionMode) => {
    if (next === mode) return;
    if (options.length > 0 && !window.confirm(pt ? "Trocar o modo remove as opções e pode invalidar conexões. Continuar?" : "Changing mode removes options and may invalidate connections. Continue?")) return;
    onChange({ ...message, interactionMode: next, options: [], buttons: undefined, quickReplies: undefined });
  };
  const max = mode === "buttons" ? 3 : 10;
  const addOption = () => {
    if (mode === "none" || options.length >= max) return;
    onChange({ ...message, options: [...options, { id: createMessageOptionId(), title: "", kind: mode === "buttons" ? "postback" : "quick_reply" }] });
  };
  const updateOption = (index: number, option: MessageOption) => {
    const next = [...options];
    next[index] = option;
    onChange({ ...message, options: next });
  };
  const removeOption = (index: number) => {
    if (!window.confirm(pt ? "Remover esta opção também removerá sua saída conectada ao salvar. Continuar?" : "Removing this option also removes its connected output when saved. Continue?")) return;
    onChange({ ...message, options: options.filter((_, itemIndex) => itemIndex !== index) });
  };
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{pt ? "Opções interativas" : "Interactive options"}</label>
        <select value={mode} onChange={(event) => changeMode(event.target.value as MessageInteractionMode)} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <option value="none">{pt ? "Sem opções" : "No options"}</option>
          <option value="buttons">{pt ? "Botões (até 3)" : "Buttons (up to 3)"}</option>
          <option value="quick_replies">{pt ? "Respostas rápidas (até 10)" : "Quick replies (up to 10)"}</option>
        </select>
      </div>
      {mode !== "none" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">{mode === "quick_replies"
              ? (pt ? "Temporárias, ideais para menus. Respostas livres com outro gatilho trocam de fluxo; as demais mantêm esta espera." : "Temporary and ideal for menus. Free replies matching another trigger switch flows; others keep this wait.")
              : (pt ? "Botões permanecem anexados à mensagem." : "Buttons remain attached to the message.")}</p>
            <span className="ml-2 shrink-0 text-[11px] font-medium">{options.length}/{max}</span>
          </div>
          {options.map((option, index) => (
            <div key={option.id} className="rounded-lg border border-border bg-muted p-2.5">
              <div className="flex gap-2">
                <input value={option.title} maxLength={20} onChange={(event) => updateOption(index, { ...option, title: event.target.value })} placeholder={pt ? "Texto (máx. 20)" : "Text (max 20)"} className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1.5 text-xs" />
                <button type="button" onClick={() => removeOption(index)} className="rounded p-1 text-muted-foreground hover:bg-card"><X className="h-3.5 w-3.5" /></button>
              </div>
              {mode === "buttons" && (
                <div className="mt-2 space-y-2">
                  <select value={option.kind} onChange={(event) => updateOption(index, { ...option, kind: event.target.value as "postback" | "url", destinationUrl: event.target.value === "url" ? option.destinationUrl : undefined })} className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs">
                    <option value="postback">↳ {pt ? "Continuar no fluxo" : "Continue flow"}</option>
                    <option value="url">↗ {pt ? "Abrir página" : "Open page"}</option>
                  </select>
                  {option.kind === "url" && <input type="url" value={option.destinationUrl || ""} onChange={(event) => updateOption(index, { ...option, destinationUrl: event.target.value })} placeholder="https://..." className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs" />}
                </div>
              )}
              <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                {option.kind === "url" ? <ExternalLink className="h-3 w-3" /> : option.kind === "quick_reply" ? <MessageCircle className="h-3 w-3" /> : <GitBranch className="h-3 w-3" />}
                {pt ? "Saída no canvas" : "Canvas output"}: option:{option.id.slice(0, 10)}…
              </p>
            </div>
          ))}
          {options.length < max && <button type="button" onClick={addOption} className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-blue-500"><Plus className="h-3.5 w-3.5" />{pt ? "Adicionar opção" : "Add option"}</button>}
        </>
      )}
    </div>
  );
}

function CarouselEditor({
  carousel,
  onChange,
}: {
  carousel: Carousel;
  onChange: (c: Carousel) => void;
}) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const elements = carousel.elements || [];

  const addCard = useCallback(() => {
    onChange({
      elements: [...elements, { title: "", subtitle: "", imageUrl: "" }],
    });
  }, [elements, onChange]);

  const updateCard = useCallback(
    (i: number, updated: CarouselElement) => {
      const els = [...elements];
      els[i] = updated;
      onChange({ elements: els });
    },
    [elements, onChange]
  );

  const removeCard = useCallback(
    (i: number) => {
      onChange({ elements: elements.filter((_, idx) => idx !== i) });
    },
    [elements, onChange]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <LayoutGrid className="h-3 w-3 text-muted-foreground/60" />
          <label className="text-xs font-medium text-muted-foreground">
            {pt ? "Cartões" : "Cards"} ({elements.length})
          </label>
        </div>
        <button
          type="button"
          onClick={addCard}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950"
        >
          <Plus className="h-3 w-3" />
          {pt ? "Adicionar cartão" : "Add Card"}
        </button>
      </div>

      {elements.map((el, i) => (
        <CarouselCardEditor
          key={i}
          index={i}
          element={el}
          onChange={(updated) => updateCard(i, updated)}
          onRemove={() => removeCard(i)}
          canRemove={elements.length > 1}
        />
      ))}

      {elements.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {pt ? "Adicione pelo menos um cartão ao carrossel." : "Add at least one card to the carousel."}
        </p>
      )}
    </div>
  );
}

function CarouselCardEditor({
  index,
  element,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  element: CarouselElement;
  onChange: (el: CarouselElement) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const buttons = element.buttons || [];

  const addButton = useCallback(() => {
    if (buttons.length >= 3) return;
    onChange({
      ...element,
      buttons: [...buttons, { title: "", type: "postback", payload: "" }],
    });
  }, [element, buttons, onChange]);

  const updateButton = useCallback(
    (i: number, updated: Button) => {
      const btns = [...buttons];
      btns[i] = updated;
      onChange({ ...element, buttons: btns });
    },
    [element, buttons, onChange]
  );

  const removeButton = useCallback(
    (i: number) => {
      const btns = buttons.filter((_, idx) => idx !== i);
      onChange({ ...element, buttons: btns.length > 0 ? btns : undefined });
    },
    [element, buttons, onChange]
  );

  return (
    <div className="rounded-lg border border-border bg-muted p-2.5">
      {/* Card header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground">
          {pt ? "Cartão" : "Card"} {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {/* Image URL */}
        <div>
          <div className="mb-1 flex items-center gap-1">
            <Image className="h-2.5 w-2.5 text-muted-foreground/60" />
            <label className="text-[11px] font-medium text-muted-foreground">{pt ? "URL da imagem" : "Image URL"}</label>
          </div>
          <input
            type="url"
            value={element.imageUrl || ""}
            onChange={(e) =>
              onChange({ ...element, imageUrl: e.target.value || undefined })
            }
            placeholder="https://example.com/image.png"
            className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Title */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            {pt ? "Título" : "Title"}
          </label>
          <input
            type="text"
            value={element.title}
            onChange={(e) => onChange({ ...element, title: e.target.value })}
            placeholder={pt ? "Título do cartão (máx 80 caracteres)" : "Card title (max 80 chars)"}
            maxLength={80}
            className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Subtitle */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            {pt ? "Subtítulo" : "Subtitle"}
          </label>
          <input
            type="text"
            value={element.subtitle || ""}
            onChange={(e) =>
              onChange({ ...element, subtitle: e.target.value || undefined })
            }
            placeholder={pt ? "Subtítulo do cartão" : "Card subtitle"}
            className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Buttons */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <MousePointer className="h-2.5 w-2.5 text-muted-foreground/60" />
              <label className="text-[11px] font-medium text-muted-foreground">
                {pt ? "Botões" : "Buttons"} ({buttons.length}/3)
              </label>
            </div>
            {buttons.length < 3 && (
              <button
                type="button"
                onClick={addButton}
                className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950"
              >
                <Plus className="h-2.5 w-2.5" />
                {pt ? "Adicionar" : "Add"}
              </button>
            )}
          </div>
          {buttons.map((btn, i) => (
            <div
              key={i}
              className="mb-1.5 rounded border border-border bg-card p-2"
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <input
                  type="text"
                  value={btn.title}
                  onChange={(e) =>
                    updateButton(i, { ...btn, title: e.target.value })
                  }
                  placeholder={pt ? "Rótulo do botão" : "Button label"}
                  className="flex-1 rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => removeButton(i)}
                  className="rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={btn.type}
                  onChange={(e) => {
                    const type = e.target.value as "postback" | "url";
                    updateButton(i, {
                      ...btn,
                      type,
                      payload:
                        type === "postback" ? btn.payload || "" : undefined,
                      url: type === "url" ? btn.url || "" : undefined,
                    });
                  }}
                  className="rounded border border-border bg-card px-1.5 py-1 text-[11px] text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="postback">{pt ? "Postback" : "Postback"}</option>
                  <option value="url">{pt ? "Link (URL)" : "URL"}</option>
                </select>
                {btn.type === "postback" ? (
                  <input
                    type="text"
                    value={btn.payload || ""}
                    onChange={(e) =>
                      updateButton(i, { ...btn, payload: e.target.value })
                    }
                    placeholder={pt ? "Valor do payload" : "Payload value"}
                    className="flex-1 rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                ) : (
                  <input
                    type="url"
                    value={btn.url || ""}
                    onChange={(e) =>
                      updateButton(i, { ...btn, url: e.target.value })
                    }
                    placeholder="https://..."
                    className="flex-1 rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
