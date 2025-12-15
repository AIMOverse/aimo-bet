"use client";

import { useMemo } from "react";
import { MODELS, getModelById } from "@/config/models";
import { useModelStore } from "@/store/modelStore";
import type { ModelDefinition } from "@/types/models";

interface UseModelsReturn {
  /** All available models */
  models: ModelDefinition[];
  /** Currently selected model */
  selectedModel: ModelDefinition | null;
  /** Selected model ID */
  selectedModelId: string;
  /** Set the selected model */
  setSelectedModel: (id: string) => void;
  /** Get model by ID */
  getModel: (id: string) => ModelDefinition | undefined;
}

export function useModels(): UseModelsReturn {
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setSelectedModel = useModelStore((s) => s.setSelectedModel);

  const selectedModel = useMemo(
    () => getModelById(selectedModelId) ?? null,
    [selectedModelId]
  );

  return {
    models: MODELS,
    selectedModel,
    selectedModelId,
    setSelectedModel,
    getModel: getModelById,
  };
}
