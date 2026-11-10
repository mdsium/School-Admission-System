export interface ClassInfo {
  id: string;
  name: string;
  shift?: string;
  totalSeats: number;
  heldSeats: number;
  confirmedSeats: number;
  availableSeats: number;
}

export type HoldStatus = "HELD" | "CONFIRMED" | "EXPIRED" | "CANCELLED";

export interface MyHold {
  holdId: string;
  classId: string;
  className: string;
  shift?: string;
  studentId?: string;
  status: HoldStatus;
  expiresAt: string;
  createdAt?: string;
  confirmedAt?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  role: "Admin" | "Parent";
  mustChangePassword: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface AdminOverview {
  totalClasses: number;
  totalShifts: number;
  totalSeats: number;
  heldSeats: number;
  confirmedSeats: number;
  availableSeats: number;
  totalApplications: number;
}

export interface AdminApplication {
  holdId: string;
  classId: string;
  className: string;
  shift: string;
  studentId: string;
  parentName?: string;
  parentEmail?: string;
  status: HoldStatus;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string;
}

declare global {
  interface Window {
    __CONFIG__?: { API_URL?: string };
  }
}

export const API_URL: string = (window.__CONFIG__?.API_URL || "http://localhost:8080").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Bengali, user-friendly messages for known server error codes. */
const MESSAGES: Record<string, string> = {
  NO_SEATS: "দুঃখিত, এই class-এ আর কোনো seat খালি নেই।",
  ALREADY_APPLIED: "আপনি এই class-এ ইতিমধ্যে একটি সক্রিয় আবেদন বা নিশ্চিত আসন রেখেছেন।",
  HOLD_EXPIRED: "আপনার seat hold-এর মেয়াদ শেষ হয়ে গেছে। আসনটি উন্মুক্ত করা হয়েছে।",
  HOLD_CANCELLED: "এই আবেদন বাতিল করা হয়েছে।",
  ALREADY_CONFIRMED: "এই আবেদন আগেই confirm করা হয়েছে।",
  NOT_OWNER: "এই আবেদনটি আপনার নয়। অন্য শিক্ষার্থীর আবেদন পরিবর্তন করা যাবে না।",
  INVALID_STUDENT_ID: "জন্ম নিবন্ধন নম্বর অবশ্যই ১৭ অঙ্কের হতে হবে।",
  INVALID_NAME: "Class-এর নাম দিন (সর্বোচ্চ ২০০ অক্ষর)।",
  INVALID_SEATS: "Seat সংখ্যা ০-এর বেশি পূর্ণসংখ্যা হতে হবে।",
  CLASS_NOT_FOUND: "Class পাওয়া যায়নি।",
  HOLD_NOT_FOUND: "আবেদন পাওয়া যায়নি।",
  USERNAME_EXISTS: "এই ইউজারনেমটি আগে থেকেই নিবন্ধিত।",
  EMAIL_EXISTS: "এই ইমেইলটি আগে থেকেই নিবন্ধিত।",
  INVALID_CREDENTIALS: "ইউজারনেম বা পাসওয়ার্ড সঠিক নয়।",
  INVALID_CURRENT_PASSWORD: "বর্তমান পাসওয়ার্ডটি সঠিক নয়।",
  SEAT_LIMIT_CONFLICT: "বর্তমানে সক্রিয় থাকা আসনের চেয়ে আসন সংখ্যা কমিয়ে দেওয়া সম্ভব নয়।",
};

export const AUTH_STORAGE_KEY = "admission_auth_token";
export const USER_STORAGE_KEY = "admission_auth_user";

export function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_STORAGE_KEY);
}

export function getStoredUser(): User | null {
  const json = localStorage.getItem(USER_STORAGE_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function saveAuthSession(auth: AuthResponse) {
  localStorage.setItem(AUTH_STORAGE_KEY, auth.token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(auth.user));
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; studentId?: string; auth?: boolean } = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};

  if (opts.body) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.studentId) {
    headers["X-Student-Id"] = opts.studentId;
  }
  if (token && opts.auth !== false) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Server-এর সাথে যোগাযোগ করা যাচ্ছে না। Backend চালু আছে কিনা দেখুন।");
  }

  if (res.status === 204) return undefined as T;

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const code = data?.error ?? "UNKNOWN";
    throw new ApiError(
      res.status,
      code,
      MESSAGES[code] ?? data?.message ?? "কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।"
    );
  }
  return data as T;
}

export const api = {
  // Auth
  register: (body: { fullName: string; username: string; email: string; password: string; phoneNumber?: string }) =>
    request<AuthResponse>("/api/auth/register", { method: "POST", body }),
  login: (body: { username: string; password: string }) =>
    request<AuthResponse>("/api/auth/login", { method: "POST", body }),
  getMe: () => request<User>("/api/auth/me"),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<User>("/api/auth/change-password", { method: "POST", body }),

  // Parent / Public Admission Contract
  listClasses: () => request<ClassInfo[]>("/classes"),
  createClass: (name: string, totalSeats: number) =>
    request<{ id: string }>("/classes", { method: "POST", body: { name, totalSeats } }),
  apply: (classId: string, studentId: string) =>
    request<{ holdId: string }>(`/classes/${classId}/holds`, { method: "POST", studentId }),
  confirm: (holdId: string, studentId: string) =>
    request<{ status: HoldStatus }>(`/holds/${holdId}/confirm`, { method: "POST", studentId }),
  cancel: (holdId: string, studentId: string) =>
    request<void>(`/holds/${holdId}`, { method: "DELETE", studentId }),
  myHolds: (studentId: string) => request<MyHold[]>("/me/holds", { studentId }),

  // Admin APIs
  adminOverview: () => request<AdminOverview>("/api/admin/overview"),
  adminClasses: () => request<ClassInfo[]>("/api/admin/classes"),
  adminCreateClass: (name: string, shift: string, totalSeats: number) =>
    request<ClassInfo>("/api/admin/classes", { method: "POST", body: { name, shift, totalSeats } }),
  adminUpdateClass: (classId: string, name: string, shift: string, totalSeats: number) =>
    request<ClassInfo>(`/api/admin/classes/${classId}`, { method: "PUT", body: { name, shift, totalSeats } }),
  adminApplications: (status?: string) =>
    request<AdminApplication[]>(`/api/admin/applications${status ? `?status=${encodeURIComponent(status)}` : ""}`),
};
