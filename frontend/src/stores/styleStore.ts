import { create } from 'zustand';

export interface PresetStyle {
  index: number;
  name: string;
}

// 13 built-in styles from the RNN model (indices 0-12)
export const PRESET_STYLES: PresetStyle[] = [
  { index: 0, name: 'Classic' },
  { index: 1, name: 'Cursive' },
  { index: 2, name: 'Neat' },
  { index: 3, name: 'Casual' },
  { index: 4, name: 'Bold' },
  { index: 5, name: 'Elegant' },
  { index: 6, name: 'Quick' },
  { index: 7, name: 'Compact' },
  { index: 8, name: 'Loose' },
  { index: 9, name: 'Formal' },
  { index: 10, name: 'Relaxed' },
  { index: 11, name: 'Precise' },
  { index: 12, name: 'Natural' },
];

interface StyleState {
  currentStyleIndex: number;
  bias: number; // 0.0 (messy) to 1.0 (neat)
  setStyleIndex: (index: number) => void;
  setBias: (bias: number) => void;
}

export const useStyleStore = create<StyleState>((set) => ({
  currentStyleIndex: 0,
  bias: 0.75,

  setStyleIndex: (index) => set({ currentStyleIndex: index }),
  setBias: (bias) => set({ bias: Math.max(0, Math.min(1, bias)) }),
}));
