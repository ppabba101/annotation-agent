import { create } from 'zustand';
import type { SampleInfo } from '@/types/project';

interface StyleState {
  currentStyleId: string | null;
  styleName: string;
  isTraining: boolean;
  trainingProgress: number;
  samples: SampleInfo[];
  setStyle: (id: string, name: string) => void;
  setTrainingStatus: (training: boolean, progress: number) => void;
  addSample: (sample: SampleInfo) => void;
  removeSample: (id: string) => void;
}

export const useStyleStore = create<StyleState>((set, get) => ({
  currentStyleId: null,
  styleName: 'No Style',
  isTraining: false,
  trainingProgress: 0,
  samples: [],

  setStyle: (id, name) =>
    set({ currentStyleId: id, styleName: name }),

  setTrainingStatus: (training, progress) =>
    set({ isTraining: training, trainingProgress: progress }),

  addSample: (sample) => {
    const { samples } = get();
    set({ samples: [...samples, sample] });
  },

  removeSample: (id) => {
    const { samples } = get();
    set({ samples: samples.filter((s) => s.id !== id) });
  },
}));
