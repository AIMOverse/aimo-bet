"use client";

import { useMemo } from "react";
import { FilterPopover } from "./FilterPopover";
import { useStoreFiltersStore } from "@/store/storeFiltersStore";
import { useServiceLists } from "@/hooks/store";
import type { FilterOption } from "@/types/filters";

export function CategoryFilter() {
  const { categories, toggleCategory, setCategories } = useStoreFiltersStore();
  const { tools } = useServiceLists();

  const options: FilterOption[] = useMemo(() => {
    const categoryCounts = new Map<string, number>();
    tools.forEach((tool) => {
      const category = tool.metadata?.category || "Uncategorized";
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    });
    return Array.from(categoryCounts.entries())
      .map(([value, count]) => ({
        value,
        label: value,
        count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tools]);

  return (
    <FilterPopover
      label="Category"
      options={options}
      selected={categories}
      onToggle={toggleCategory}
      onClear={() => setCategories([])}
    />
  );
}
