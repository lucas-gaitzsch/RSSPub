import { writable } from "svelte/store";
import type { Category, EmailConfig, Schedule } from "./types";

export const authHeader = writable<string | null>(
  localStorage.getItem("rsspub_auth"),
);
export const isAuthenticated = writable<boolean>(
  !!localStorage.getItem("rsspub_auth"),
);

authHeader.subscribe((value) => {
  if (value) {
    localStorage.setItem("rsspub_auth", value);
    isAuthenticated.set(true);
  } else {
    localStorage.removeItem("rsspub_auth");
    isAuthenticated.set(false);
  }
});

export const feeds = writable<any[]>([]);
export const categories = writable<Category[]>([]);
export const schedules = writable<Schedule[]>([]);
export const downloads = writable<string[]>([]);
export const emailConfig = writable<EmailConfig | null>(null);

export const isLoginVisible = writable<boolean>(false);
export const popup = writable<{
  visible: boolean;
  title: string;
  message: string;
  isError: boolean;
  type?: "alert" | "confirm";
  onConfirm?: () => void;
  onCancel?: () => void;
}>({
  visible: false,
  title: "",
  message: "",
  isError: false,
  type: "alert",
  onConfirm: () => { },
  onCancel: () => { },
});
