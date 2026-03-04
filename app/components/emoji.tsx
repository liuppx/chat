import EmojiPicker, { EmojiStyle, Theme as EmojiTheme } from "emoji-picker-react";

import { ModelType } from "../store";

import BotIconDefault from "../icons/llm-icons/default.svg";
import BotIconOpenAI from "../icons/llm-icons/openai.svg";
import BotIconGemini from "../icons/llm-icons/gemini.svg";
import BotIconGemma from "../icons/llm-icons/gemma.svg";
import BotIconClaude from "../icons/llm-icons/claude.svg";
import BotIconMeta from "../icons/llm-icons/meta.svg";
import BotIconMistral from "../icons/llm-icons/mistral.svg";
import BotIconDeepseek from "../icons/llm-icons/deepseek.svg";
import BotIconMoonshot from "../icons/llm-icons/moonshot.svg";
import BotIconQwen from "../icons/llm-icons/qwen.svg";
import BotIconWenxin from "../icons/llm-icons/wenxin.svg";
import BotIconGrok from "../icons/llm-icons/grok.svg";
import BotIconHunyuan from "../icons/llm-icons/hunyuan.svg";
import BotIconDoubao from "../icons/llm-icons/doubao.svg";
import BotIconChatglm from "../icons/llm-icons/chatglm.svg";
import React, { useEffect, useMemo, useState } from "react";
import { notifyError, notifySuccess } from "../plugins/show_window";
import styles from "./emoji.module.scss";
import {
  getAddressAvatarDataUrl,
  isValidAddress,
} from "../utils/address-avatar";

export function getEmojiUrl(unified: string, style: EmojiStyle) {
  // Whoever owns this Content Delivery Network (CDN), I am using your CDN to serve emojis
  // Old CDN broken, so I had to switch to this one
  // Author: https://github.com/H0llyW00dzZ
  return `https://fastly.jsdelivr.net/npm/emoji-datasource-apple/img/${style}/64/${unified}.png`;
}

function unifiedToNativeEmoji(unified?: string): string {
  if (!unified) return "";

  const codePoints = unified
    .split("-")
    .map((part) => Number.parseInt(part, 16))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (codePoints.length === 0) return "";

  try {
    return String.fromCodePoint(...codePoints);
  } catch {
    return "";
  }
}

export function AvatarPicker(props: {
  onEmojiClick: (emojiId: string) => void;
}) {
  return (
    <EmojiPicker
      width={"100%"}
      lazyLoadEmojis
      theme={EmojiTheme.AUTO}
      getEmojiUrl={getEmojiUrl}
      onEmojiClick={(e) => {
        props.onEmojiClick(e.unified);
      }}
    />
  );
}

export function Avatar(props: {
  model?: ModelType;
  avatar?: string;
  address?: string;
  size?: number;
}) {
  const size = props.size ?? 30;

  if (props.address && isValidAddress(props.address)) {
    return (
      <div className="user-avatar">
        <AddressAvatar address={props.address} size={size} />
      </div>
    );
  }

  let LlmIcon = BotIconDefault;

  if (props.model) {
    const modelName = props.model.toLowerCase();

    if (
      modelName.startsWith("gpt") ||
      modelName.startsWith("chatgpt") ||
      modelName.startsWith("dall-e") ||
      modelName.startsWith("dalle") ||
      modelName.startsWith("o1") ||
      modelName.startsWith("o3")
    ) {
      LlmIcon = BotIconOpenAI;
    } else if (modelName.startsWith("gemini")) {
      LlmIcon = BotIconGemini;
    } else if (modelName.startsWith("gemma")) {
      LlmIcon = BotIconGemma;
    } else if (modelName.startsWith("claude")) {
      LlmIcon = BotIconClaude;
    } else if (modelName.includes("llama")) {
      LlmIcon = BotIconMeta;
    } else if (
      modelName.startsWith("mixtral") ||
      modelName.startsWith("codestral")
    ) {
      LlmIcon = BotIconMistral;
    } else if (modelName.includes("deepseek")) {
      LlmIcon = BotIconDeepseek;
    } else if (modelName.startsWith("moonshot")) {
      LlmIcon = BotIconMoonshot;
    } else if (modelName.startsWith("qwen")) {
      LlmIcon = BotIconQwen;
    } else if (modelName.startsWith("ernie")) {
      LlmIcon = BotIconWenxin;
    } else if (modelName.startsWith("grok")) {
      LlmIcon = BotIconGrok;
    } else if (modelName.startsWith("hunyuan")) {
      LlmIcon = BotIconHunyuan;
    } else if (modelName.startsWith("doubao") || modelName.startsWith("ep-")) {
      LlmIcon = BotIconDoubao;
    } else if (
      modelName.includes("glm") ||
      modelName.startsWith("cogview-") ||
      modelName.startsWith("cogvideox-")
    ) {
      LlmIcon = BotIconChatglm;
    }

    return (
      <div className="no-dark">
        <LlmIcon width={size} height={size} />
      </div>
    );
  }

  if (!props.avatar) {
    return (
      <div className="no-dark">
        <BotIconDefault width={size} height={size} />
      </div>
    );
  }

  return (
    <div className="user-avatar">
      <EmojiAvatar avatar={props.avatar} />
    </div>
  );
}

export function EmojiAvatar(props: { avatar: string; size?: number }) {
  const size = props.size ?? 18;
  const [loadFailed, setLoadFailed] = useState(false);
  const nativeEmoji = useMemo(
    () => unifiedToNativeEmoji(props.avatar),
    [props.avatar],
  );

  useEffect(() => {
    setLoadFailed(false);
  }, [props.avatar]);

  if (loadFailed) {
    return (
      <span style={{ fontSize: size, lineHeight: 1 }}>
        {nativeEmoji || "🤖"}
      </span>
    );
  }

  return (
    <img
      src={getEmojiUrl(props.avatar, EmojiStyle.APPLE)}
      alt={nativeEmoji || props.avatar}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setLoadFailed(true)}
    />
  );
}

export function AddressAvatar(props: { address: string; size?: number }) {
  const size = props.size ?? 30;
  const dataUrl = useMemo(() => {
    if (!isValidAddress(props.address)) return "";
    return getAddressAvatarDataUrl(props.address, size);
  }, [props.address, size]);

  if (!dataUrl) return null;
  return <img src={dataUrl} width={size} height={size} alt="" />;
}

export function WalletAccount(props: { address?: string; title?: string }) {
  const formatAddress = (addr: string) => {
    if (!addr) return "";
    if (addr.length <= 6 + 4 + 3) return addr;
    const prefix = addr.slice(0, 6);
    const suffix = addr.slice(-6);
    return `${prefix}...${suffix}`;
  };
  const copyToClipboard = async () => {
    if (!props.address) return;
    try {
      await navigator.clipboard.writeText(props.address);
      notifySuccess("已复制");
    } catch (err) {
      console.error("复制失败:", err);
      notifyError("复制失败");
    }
  };

  return (
    <div
      className={styles["wallet-account"]}
      title={props.title || props.address}
    >
      <span className={styles["wallet-address"]}>
        {formatAddress(props.address || "")}
      </span>
      <button
        onClick={copyToClipboard}
        className={styles["wallet-copy"]}
        type="button"
      >
        复制
      </button>
    </div>
  );
}
