import type {
  Modality,
  Session,
  SessionUpdateParams,
  TurnDetection,
} from "rt-client";

type RealtimeMessage = {
  type: string;
  [key: string]: any;
};

type QueueWaiter<T> = {
  resolve: (value: IteratorResult<T>) => void;
  reject: (error: Error) => void;
};

class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: QueueWaiter<T>[] = [];
  private closed = false;
  private error: Error | undefined;

  push(item: T) {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value: item });
      return;
    }
    this.items.push(item);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.waiters.splice(0).forEach((waiter) => {
      waiter.resolve({ done: true, value: undefined as T });
    });
  }

  fail(error: Error) {
    if (this.closed) return;
    this.closed = true;
    this.error = error;
    this.waiters.splice(0).forEach((waiter) => {
      waiter.reject(error);
    });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length > 0) {
          return Promise.resolve({
            done: false,
            value: this.items.shift() as T,
          });
        }
        if (this.error) {
          return Promise.reject(this.error);
        }
        if (this.closed) {
          return Promise.resolve({ done: true, value: undefined as T });
        }
        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiters.push({ resolve, reject });
        });
      },
      return: () => {
        this.close();
        return Promise.resolve({ done: true, value: undefined as T });
      },
    };
  }
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeRealtimePath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized.endsWith("/realtime")) return normalized;
  if (normalized.endsWith("/v1")) return `${normalized}/realtime`;
  return `${normalized || ""}/v1/realtime`;
}

export function buildRouterRealtimeUrl(endpoint: string, model: string) {
  const base =
    typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const url = new URL(endpoint, base);

  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }

  url.pathname = normalizeRealtimePath(url.pathname);
  url.searchParams.set("model", model);
  return url;
}

function buildProtocols(token: string) {
  const protocols = ["realtime"];
  if (token) {
    protocols.push(`openai-insecure-api-key.${token}`);
  }
  protocols.push("openai-beta.realtime-v1");
  return protocols;
}

export class RouterRealtimeInputAudioItem {
  type = "input_audio" as const;
  audioEndMillis: number | undefined;
  transcription: string | undefined;
  private resolveCompletion!: () => void;
  private rejectCompletion!: (error: Error) => void;
  private completion: Promise<void>;

  constructor(
    public id: string,
    public audioStartMillis: number | undefined,
    private hasTranscription: boolean,
  ) {
    this.completion = new Promise<void>((resolve, reject) => {
      this.resolveCompletion = resolve;
      this.rejectCompletion = reject;
    });

    if (!hasTranscription) {
      this.resolveCompletion();
    }
  }

  setAudioEndMillis(value?: number) {
    this.audioEndMillis = value;
    if (!this.hasTranscription) {
      this.resolveCompletion();
    }
  }

  complete(transcription?: string) {
    this.transcription = transcription;
    this.resolveCompletion();
  }

  fail(error: Error) {
    this.rejectCompletion(error);
  }

  waitForCompletion() {
    return this.completion;
  }
}

class RouterRealtimeTextContent {
  type = "text" as const;
  private chunks = new AsyncQueue<string>();
  private fullText = "";

  get text() {
    return this.fullText;
  }

  push(delta: string) {
    if (!delta) return;
    this.fullText += delta;
    this.chunks.push(delta);
  }

  done() {
    this.chunks.close();
  }

  textChunks() {
    return this.chunks;
  }
}

class RouterRealtimeAudioContent {
  type = "audio" as const;
  private audio = new AsyncQueue<Uint8Array>();
  private transcript = new AsyncQueue<string>();
  private fullTranscript = "";

  get transcriptText() {
    return this.fullTranscript;
  }

  pushAudio(delta: string) {
    if (!delta) return;
    this.audio.push(decodeBase64(delta));
  }

  pushTranscript(delta: string) {
    if (!delta) return;
    this.fullTranscript += delta;
    this.transcript.push(delta);
  }

  done() {
    this.audio.close();
    this.transcript.close();
  }

  audioChunks() {
    return this.audio;
  }

  transcriptChunks() {
    return this.transcript;
  }
}

type RouterRealtimeContent =
  | RouterRealtimeAudioContent
  | RouterRealtimeTextContent;

class RouterRealtimeMessageItem implements AsyncIterable<RouterRealtimeContent> {
  type = "message" as const;
  status: "in_progress" | "completed" | "incomplete" = "in_progress";
  private contents = new Map<number, RouterRealtimeContent>();
  private contentQueue = new AsyncQueue<RouterRealtimeContent>();

  constructor(
    public responseId: string,
    public id: string,
    public role: "assistant" | "user" | "system",
    public previousItemId?: string,
  ) {}

  addContent(index: number, contentType: string): RouterRealtimeContent {
    const existing = this.contents.get(index);
    if (existing) return existing;

    const content =
      contentType === "audio"
        ? new RouterRealtimeAudioContent()
        : new RouterRealtimeTextContent();
    this.contents.set(index, content);
    this.contentQueue.push(content);
    return content;
  }

  getContent(index: number, fallbackType: string): RouterRealtimeContent {
    return this.contents.get(index) ?? this.addContent(index, fallbackType);
  }

  completeContent(index: number) {
    this.contents.get(index)?.done();
  }

  complete() {
    this.status = "completed";
    this.contents.forEach((content) => content.done());
    this.contentQueue.close();
  }

  [Symbol.asyncIterator]() {
    return this.contentQueue[Symbol.asyncIterator]();
  }
}

export class RouterRealtimeResponse implements AsyncIterable<RouterRealtimeMessageItem> {
  type = "response" as const;
  status: string;
  statusDetails: unknown;
  usage: unknown;
  output: unknown[];
  private itemsById = new Map<string, RouterRealtimeMessageItem>();
  private itemQueue = new AsyncQueue<RouterRealtimeMessageItem>();

  constructor(private response: Record<string, any>) {
    this.status = response.status ?? "in_progress";
    this.statusDetails = response.status_details;
    this.usage = response.usage;
    this.output = Array.isArray(response.output) ? response.output : [];
  }

  get id() {
    return String(this.response.id ?? "");
  }

  addOutputItem(message: RealtimeMessage) {
    const item = message.item ?? {};
    if (item.type !== "message") return;

    const id = String(item.id ?? `${this.id}-${message.output_index ?? 0}`);
    const role =
      item.role === "user" || item.role === "system" ? item.role : "assistant";
    const outputItem =
      this.itemsById.get(id) ??
      new RouterRealtimeMessageItem(
        this.id,
        id,
        role,
        message.previous_item_id,
      );
    if (!this.itemsById.has(id)) {
      this.itemsById.set(id, outputItem);
      this.itemQueue.push(outputItem);
    }

    const parts = Array.isArray(item.content) ? item.content : [];
    parts.forEach((part: any, index: number) => {
      outputItem.addContent(index, part?.type === "audio" ? "audio" : "text");
    });
  }

  addContentPart(message: RealtimeMessage) {
    const item = this.ensureMessageItem(message);
    if (!item) return;
    const part = message.part ?? {};
    item.addContent(
      Number(message.content_index ?? 0),
      part.type === "audio" ? "audio" : "text",
    );
  }

  pushTextDelta(message: RealtimeMessage) {
    const content = this.ensureContent(message, "text");
    if (content?.type === "text") {
      content.push(String(message.delta ?? ""));
    }
  }

  pushAudioDelta(message: RealtimeMessage) {
    const content = this.ensureContent(message, "audio");
    if (content?.type === "audio") {
      content.pushAudio(String(message.delta ?? ""));
    }
  }

  pushAudioTranscriptDelta(message: RealtimeMessage) {
    const content = this.ensureContent(message, "audio");
    if (content?.type === "audio") {
      content.pushTranscript(String(message.delta ?? ""));
    }
  }

  completeContent(message: RealtimeMessage) {
    const item = this.ensureMessageItem(message);
    item?.completeContent(Number(message.content_index ?? 0));
  }

  completeOutputItem(message: RealtimeMessage) {
    const itemId = String(message.item?.id ?? message.item_id ?? "");
    if (itemId) {
      this.itemsById.get(itemId)?.complete();
    }
  }

  complete(message: RealtimeMessage) {
    const nextResponse = message.response ?? {};
    this.status = nextResponse.status ?? this.status;
    this.statusDetails = nextResponse.status_details ?? this.statusDetails;
    this.usage = nextResponse.usage ?? this.usage;
    this.output = Array.isArray(nextResponse.output)
      ? nextResponse.output
      : this.output;
    this.itemsById.forEach((item) => item.complete());
    this.itemQueue.close();
  }

  [Symbol.asyncIterator]() {
    return this.itemQueue[Symbol.asyncIterator]();
  }

  private ensureMessageItem(
    message: RealtimeMessage,
  ): RouterRealtimeMessageItem | undefined {
    const itemId = String(message.item_id ?? message.item?.id ?? "");
    if (!itemId) return undefined;
    let item = this.itemsById.get(itemId);
    if (item) return item;

    item = new RouterRealtimeMessageItem(this.id, itemId, "assistant");
    this.itemsById.set(itemId, item);
    this.itemQueue.push(item);
    return item;
  }

  private ensureContent(message: RealtimeMessage, fallbackType: string) {
    const item = this.ensureMessageItem(message);
    return item?.getContent(Number(message.content_index ?? 0), fallbackType);
  }
}

export type RouterRealtimeEvent =
  | RouterRealtimeInputAudioItem
  | RouterRealtimeResponse;

export class RouterRealtimeClient {
  private socket: WebSocket | undefined;
  private connectPromise: Promise<void>;
  private sessionUpdateWaiters: Array<{
    resolve: (session: Session) => void;
    reject: (error: Error) => void;
  }> = [];
  private commitWaiters: Array<{
    resolve: (item: RouterRealtimeInputAudioItem) => void;
    reject: (error: Error) => void;
  }> = [];
  private eventsQueue = new AsyncQueue<RouterRealtimeEvent>();
  private inputItems = new Map<string, RouterRealtimeInputAudioItem>();
  private responses = new Map<string, RouterRealtimeResponse>();
  private hasTranscription = false;
  session: Session | undefined;

  constructor(
    private options: {
      endpoint: string;
      token: string;
      model: string;
    },
  ) {
    this.connectPromise = this.connect();
  }

  async configure(params: SessionUpdateParams): Promise<Session> {
    await this.init();
    this.hasTranscription = Boolean(params.input_audio_transcription);

    const session = await new Promise<Session>((resolve, reject) => {
      this.sessionUpdateWaiters.push({ resolve, reject });
      this.send({
        type: "session.update",
        session: params,
      });
    });

    this.session = session;
    return session;
  }

  async sendAudio(audio: Uint8Array): Promise<void> {
    await this.init();
    this.send({
      type: "input_audio_buffer.append",
      audio: encodeBase64(audio),
    });
  }

  async commitAudio(): Promise<RouterRealtimeInputAudioItem> {
    await this.init();
    const item = await new Promise<RouterRealtimeInputAudioItem>(
      (resolve, reject) => {
        this.commitWaiters.push({ resolve, reject });
        this.send({ type: "input_audio_buffer.commit" });
      },
    );
    return item;
  }

  async generateResponse(): Promise<RouterRealtimeResponse | undefined> {
    await this.init();
    this.send({ type: "response.create" });
    return undefined;
  }

  events(): AsyncIterable<RouterRealtimeEvent> {
    return this.eventsQueue;
  }

  async close(): Promise<void> {
    this.socket?.close();
    this.eventsQueue.close();
  }

  private init() {
    return this.connectPromise;
  }

  private connect() {
    return new Promise<void>((resolve, reject) => {
      const url = buildRouterRealtimeUrl(
        this.options.endpoint,
        this.options.model,
      );
      const socket = new WebSocket(
        url,
        buildProtocols(this.options.token.trim()),
      );
      this.socket = socket;

      let resolved = false;
      const rejectOnce = (error: Error) => {
        if (resolved) return;
        resolved = true;
        reject(error);
      };
      const resolveOnce = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as RealtimeMessage;
          this.handleMessage(message, resolveOnce, rejectOnce);
        } catch (error) {
          this.handleError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      };
      socket.onerror = () => {
        rejectOnce(new Error("Router realtime websocket error"));
      };
      socket.onclose = () => {
        this.eventsQueue.close();
      };
    });
  }

  private send(message: RealtimeMessage) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Router realtime websocket is not open");
    }
    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(
    message: RealtimeMessage,
    resolveConnect: () => void,
    rejectConnect: (error: Error) => void,
  ) {
    switch (message.type) {
      case "session.created":
        this.session = message.session;
        resolveConnect();
        break;
      case "session.updated":
        this.session = message.session;
        this.sessionUpdateWaiters.shift()?.resolve(message.session);
        break;
      case "input_audio_buffer.speech_started":
        this.handleSpeechStarted(message);
        break;
      case "input_audio_buffer.speech_stopped":
        this.inputItems
          .get(String(message.item_id ?? ""))
          ?.setAudioEndMillis(message.audio_end_ms);
        break;
      case "input_audio_buffer.committed":
        this.handleCommitted(message);
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.inputItems
          .get(String(message.item_id ?? ""))
          ?.complete(String(message.transcript ?? ""));
        break;
      case "conversation.item.input_audio_transcription.failed":
        this.inputItems
          .get(String(message.item_id ?? ""))
          ?.fail(new Error(message.error?.message || "Transcription failed"));
        break;
      case "response.created":
        this.handleResponseCreated(message);
        break;
      case "response.output_item.added":
        this.responses
          .get(String(message.response_id ?? ""))
          ?.addOutputItem(message);
        break;
      case "response.content_part.added":
        this.responses
          .get(String(message.response_id ?? ""))
          ?.addContentPart(message);
        break;
      case "response.text.delta":
        this.responses
          .get(String(message.response_id ?? ""))
          ?.pushTextDelta(message);
        break;
      case "response.audio.delta":
        this.responses
          .get(String(message.response_id ?? ""))
          ?.pushAudioDelta(message);
        break;
      case "response.audio_transcript.delta":
        this.responses
          .get(String(message.response_id ?? ""))
          ?.pushAudioTranscriptDelta(message);
        break;
      case "response.content_part.done":
        this.responses
          .get(String(message.response_id ?? ""))
          ?.completeContent(message);
        break;
      case "response.output_item.done":
        this.responses
          .get(String(message.response_id ?? ""))
          ?.completeOutputItem(message);
        break;
      case "response.done":
        this.handleResponseDone(message);
        break;
      case "error":
        this.handleError(new Error(message.error?.message || "Realtime error"));
        rejectConnect(new Error(message.error?.message || "Realtime error"));
        break;
    }
  }

  private handleSpeechStarted(message: RealtimeMessage) {
    const itemId = String(message.item_id ?? "");
    if (!itemId) return;
    const item = new RouterRealtimeInputAudioItem(
      itemId,
      message.audio_start_ms,
      this.hasTranscription,
    );
    this.inputItems.set(itemId, item);
    this.eventsQueue.push(item);
  }

  private handleCommitted(message: RealtimeMessage) {
    const itemId = String(message.item_id ?? "");
    let item = this.inputItems.get(itemId);
    if (!item) {
      item = new RouterRealtimeInputAudioItem(
        itemId,
        undefined,
        this.hasTranscription,
      );
      this.inputItems.set(itemId, item);
    }
    this.commitWaiters.shift()?.resolve(item);
  }

  private handleResponseCreated(message: RealtimeMessage) {
    const response = new RouterRealtimeResponse(message.response ?? {});
    this.responses.set(response.id, response);
    this.eventsQueue.push(response);
  }

  private handleResponseDone(message: RealtimeMessage) {
    const responseId = String(
      message.response?.id ?? message.response_id ?? "",
    );
    const response = this.responses.get(responseId);
    response?.complete(message);
    if (responseId) {
      this.responses.delete(responseId);
    }
  }

  private handleError(error: Error) {
    this.sessionUpdateWaiters.splice(0).forEach((waiter) => {
      waiter.reject(error);
    });
    this.commitWaiters.splice(0).forEach((waiter) => {
      waiter.reject(error);
    });
    this.inputItems.forEach((item) => item.fail(error));
    this.responses.forEach((response) => response.complete({ type: "error" }));
    this.eventsQueue.fail(error);
  }
}

export function createRouterSessionParams(input: {
  voice: string;
  temperature: number;
  modality: string;
  useVAD: boolean;
}): SessionUpdateParams {
  const modalities: Modality[] =
    input.modality === "audio" ? ["text", "audio"] : ["text"];
  const turnDetection: TurnDetection = input.useVAD
    ? { type: "server_vad" }
    : null;

  return {
    instructions: "",
    voice: input.voice as any,
    input_audio_transcription: { model: "whisper-1" },
    turn_detection: turnDetection,
    tools: [],
    temperature: input.temperature,
    modalities,
  };
}
