export interface ClassInfo {
  id: string;
  name: string;
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
  status: HoldStatus;
  expiresAt: string;
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
  ALREADY_APPLIED: "আপনি এই class-এ ইতিমধ্যে আবেদন করেছেন।",
  HOLD_EXPIRED: "আপনার seat hold-এর মেয়াদ শেষ হয়ে গেছে। আবার আবেদন করুন।",
  HOLD_CANCELLED: "এই আবেদন বাতিল করা হয়েছে।",
  ALREADY_CONFIRMED: "এই আবেদন আগেই confirm করা হয়েছে।",
  NOT_OWNER: "এই আবেদনটি আপনার নয়।",
  INVALID_STUDENT_ID: "জন্ম নিবন্ধন নম্বর অবশ্যই ১৭ অঙ্কের হতে হবে।",
  INVALID_NAME: "Class-এর নাম দিন (সর্বোচ্চ ২০০ অক্ষর)।",
  INVALID_SEATS: "Seat সংখ্যা ০-এর বেশি পূর্ণসংখ্যা হতে হবে।",
  CLASS_NOT_FOUND: "Class পাওয়া যায়নি।",
  HOLD_NOT_FOUND: "আবেদন পাওয়া যায়নি।",
};

async function request<T>(path: string, opts: { method?: string; body?: unknown; studentId?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.studentId ? { "X-Student-Id": opts.studentId } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Server-এর সাথে যোগাযোগ করা যাচ্ছে না। ইন্টারনেট বা server চালু আছে কিনা দেখুন।");
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
    throw new ApiError(res.status, code, MESSAGES[code] ?? data?.message ?? "কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।");
  }
  return data as T;
}

export const api = {
  listClasses: () => request<ClassInfo[]>("/classes"),
  createClass: (name: string, totalSeats: number) =>
    request<{ id: string }>("/classes", { method: "POST", body: { name, totalSeats } }),
  apply: (classId: string, studentId: string) =>
    request<{ holdId: string }>(`/classes/${classId}/holds`, { method: "POST", studentId }),
  confirm: (holdId: string, studentId: string) =>
    request<{ status: HoldStatus }>(`/holds/${holdId}/confirm`, { method: "POST", studentId }),
  cancel: (holdId: string, studentId: string) => request<void>(`/holds/${holdId}`, { method: "DELETE", studentId }),
  myHolds: (studentId: string) => request<MyHold[]>("/me/holds", { studentId }),
};
