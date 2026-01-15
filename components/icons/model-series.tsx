import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
}

export function GrokIcon({ className }: IconProps) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      className={cn("size-4", className)}
    >
      <path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815" />
    </svg>
  );
}

export function OpenAIIcon({ className }: IconProps) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      className={cn("size-4", className)}
    >
      <path d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z" />
    </svg>
  );
}

export function ZaiIcon({ className }: IconProps) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      className={cn("size-4", className)}
    >
      <path d="M12.105 2L9.927 4.953H.653L2.83 2h9.276zM23.254 19.048L21.078 22h-9.242l2.174-2.952h9.244zM24 2L9.264 22H0L14.736 2H24z" />
    </svg>
  );
}

// Map series to inline icon component (for monochrome icons only)
const INLINE_ICON_MAP: Record<string, React.ComponentType<IconProps>> = {
  openai: OpenAIIcon,
  gpt: OpenAIIcon,
  grok: GrokIcon,
  glm: ZaiIcon,
};

// Map series to static image path (for colored icons)
const STATIC_LOGO_MAP: Record<string, string> = {
  claude: "/model-series/claude-color.svg",
  gemini: "/model-series/gemini-color.svg",
  deepseek: "/model-series/deepseek-color.svg",
  qwen: "/model-series/qwen-color.svg",
  kimi: "/model-series/kimi-color.svg",
};

export type ModelSeriesIconResult =
  | { type: "component"; Component: React.ComponentType<IconProps> }
  | { type: "image"; src: string }
  | null;

export function getModelSeriesIcon(series?: string): ModelSeriesIconResult {
  if (!series) return null;

  const InlineIcon = INLINE_ICON_MAP[series];
  if (InlineIcon) {
    return { type: "component", Component: InlineIcon };
  }

  const staticPath = STATIC_LOGO_MAP[series];
  if (staticPath) {
    return { type: "image", src: staticPath };
  }

  return null;
}
