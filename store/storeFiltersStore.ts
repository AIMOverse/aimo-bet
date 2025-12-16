"use client";

import { create } from "zustand";
import type { StoreFilters, StoreTab } from "@/types/filters";

interface StoreFiltersState extends StoreFilters {
  setSearch: (search: string) => void;
  setProviders: (providers: string[]) => void;
  toggleProvider: (provider: string) => void;
  setCategories: (categories: string[]) => void;
  toggleCategory: (category: string) => void;
  setTab: (tab: StoreTab) => void;
  clearFilters: () => void;
}

const initialState: StoreFilters = {
  search: "",
  providers: [],
  categories: [],
  tab: "model",
};

export const useStoreFiltersStore = create<StoreFiltersState>((set, get) => ({
  ...initialState,
  setSearch: (search) => set({ search }),
  setProviders: (providers) => set({ providers }),
  toggleProvider: (provider) => {
    const current = get().providers;
    const updated = current.includes(provider)
      ? current.filter((p) => p !== provider)
      : [...current, provider];
    set({ providers: updated });
  },
  setCategories: (categories) => set({ categories }),
  toggleCategory: (category) => {
    const current = get().categories;
    const updated = current.includes(category)
      ? current.filter((c) => c !== category)
      : [...current, category];
    set({ categories: updated });
  },
  setTab: (tab) => set({ tab, providers: [], categories: [] }), // Reset filters on tab change
  clearFilters: () => set({ search: "", providers: [], categories: [] }),
}));
