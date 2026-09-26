import { create } from "zustand";
import type { ImageInput } from "@rizz/shared";

/** Profile-review input: up to 3 of the user's own photos + bio. */
export const useProfileDraft = create<{
  images: ImageInput[];
  bio: string;
  roast: boolean;
  setImages: (i: ImageInput[]) => void;
  setBio: (b: string) => void;
  setRoast: (r: boolean) => void;
}>((set) => ({
  images: [],
  bio: "",
  roast: false,
  setImages: (images) => set({ images }),
  setBio: (bio) => set({ bio }),
  setRoast: (roast) => set({ roast }),
}));

/** Opener-mode input (profile screenshot + bio). In memory only — images are large. */
export const useOpenerDraft = create<{
  openerImage: ImageInput | null;
  openerBio: string;
  setOpenerImage: (i: ImageInput | null) => void;
  setOpenerBio: (b: string) => void;
}>((set) => ({
  openerImage: null,
  openerBio: "",
  setOpenerImage: (openerImage) => set({ openerImage }),
  setOpenerBio: (openerBio) => set({ openerBio }),
}));
