import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import App from "./App";
import { api } from "./api";

vi.mock("./api", async (orig) => {
  const real = await orig<typeof import("./api")>();
  return {
    ...real,
    api: {
      listClasses: vi.fn(),
      createClass: vi.fn(),
      apply: vi.fn(),
      confirm: vi.fn(),
      cancel: vi.fn(),
      myHolds: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      getMe: vi.fn(),
      changePassword: vi.fn(),
      adminOverview: vi.fn(),
      adminClasses: vi.fn(),
      adminCreateClass: vi.fn(),
      adminUpdateClass: vi.fn(),
      adminApplications: vi.fn(),
    },
  };
});

describe("School Admission Frontend", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("shows classes with seat counts and disables apply when full", async () => {
    (api.listClasses as any).mockResolvedValue([
      { id: "c1", name: "Class 6 - Morning", totalSeats: 10, heldSeats: 2, confirmedSeats: 3, availableSeats: 5 },
      { id: "c2", name: "Class 7 - Day", totalSeats: 1, heldSeats: 1, confirmedSeats: 0, availableSeats: 0 },
    ]);
    (api.myHolds as any).mockResolvedValue([]);
    localStorage.setItem("studentId", "20150000000000001");

    render(<App />);

    await waitFor(() => expect(screen.getByText("Class 6 - Morning")).toBeInTheDocument());
    expect(screen.getByText("Seat নেই")).toBeDisabled();
    expect(screen.getByText("আবেদন করুন")).toBeEnabled();
  });

  it("shows a friendly Bengali error when server is down with retry button", async () => {
    (api.listClasses as any).mockRejectedValue(new Error("boom"));
    render(<App />);
    await waitFor(() => expect(screen.getByText("আবার চেষ্টা করুন")).toBeInTheDocument());
  });

  it("validates 17-digit student id and allows setting it", async () => {
    (api.listClasses as any).mockResolvedValue([]);
    render(<App />);

    const input = screen.getByPlaceholderText(/যেমন: 20152691234567890/);
    const setBtn = screen.getByText("সেট করুন");

    expect(setBtn).toBeDisabled();

    // 16 digits -> disabled
    fireEvent.change(input, { target: { value: "1234567890123456" } });
    expect(setBtn).toBeDisabled();

    // 17 digits -> enabled
    fireEvent.change(input, { target: { value: "20152691234567890" } });
    expect(setBtn).toBeEnabled();

    fireEvent.click(setBtn);
    await waitFor(() => {
      expect(localStorage.getItem("studentId")).toBe("20152691234567890");
    });
  });

  it("navigates to admin tab and validates class creation form", async () => {
    (api.listClasses as any).mockResolvedValue([]);
    render(<App />);

    const adminTab = screen.getByText(/Class তৈরি \(Admin\)/);
    fireEvent.click(adminTab);

    expect(screen.getByText(/নতুন Class ও Shift তৈরি/)).toBeInTheDocument();
    const createBtn = screen.getByText("Class তৈরি করুন");
    expect(createBtn).toBeDisabled();
  });

  it("navigates to login view and supports demo admin auto-fill", async () => {
    (api.listClasses as any).mockResolvedValue([]);
    render(<App />);

    const loginBtn = screen.getByText(/লগইন \(Login\)/);
    fireEvent.click(loginBtn);

    expect(screen.getByText("🔑 সিস্টেমে লগইন করুন")).toBeInTheDocument();

    const autoFillBtn = screen.getByText("অটো-ফিল");
    fireEvent.click(autoFillBtn);

    const usernameInput = screen.getByPlaceholderText(/যেমন: admin বা parent@example.com/) as HTMLInputElement;
    expect(usernameInput.value).toBe("admin");
  });

  it("navigates to registration view for parents", async () => {
    (api.listClasses as any).mockResolvedValue([]);
    render(<App />);

    const registerBtn = screen.getByText(/রেজিস্ট্রেশন \(Parent\)/);
    fireEvent.click(registerBtn);

    expect(screen.getByText("📝 অভিভাবক রেজিস্ট্রেশন")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("parent@example.com")).toBeInTheDocument();
  });
});
