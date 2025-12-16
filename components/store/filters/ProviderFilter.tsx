"use client";

import { useMemo } from "react";
import { FilterPopover } from "./FilterPopover";
import { useStoreFiltersStore } from "@/store/storeFiltersStore";
import { useServiceLists } from "@/hooks/store";
import type { FilterOption } from "@/types/filters";

export function ProviderFilter() {
  const { providers, toggleProvider, setProviders } = useStoreFiltersStore();
  const { models } = useServiceLists();

  const options: FilterOption[] = useMemo(() => {
    const providerCounts = new Map<string, number>();
    models.forEach((model) => {
      // Extract provider from model ID (e.g., "openai/gpt-4" -> "openai")
      const provider = model.id?.split("/")[0] || "Unknown";
      providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
    });
    return Array.from(providerCounts.entries())
      .map(([value, count]) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1), // Capitalize
        count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [models]);

  return (
    <FilterPopover
      label="Provider"
      options={options}
      selected={providers}
      onToggle={toggleProvider}
      onClear={() => setProviders([])}
    />
  );
}
