import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CompletionScreen from "../app/components/CompletionScreen";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("CompletionScreen", () => {
  beforeEach(() => {
    mockPush.mockClear();
    // Reset sessionStorage
    Object.defineProperty(window, "sessionStorage", {
      value: { removeItem: vi.fn(), getItem: vi.fn(), setItem: vi.fn() },
      writable: true,
    });
  });

  it("shows the all finished message", () => {
    render(<CompletionScreen />);
    expect(screen.getByText(/All finished/i)).toBeInTheDocument();
    expect(screen.getByText(/Come back tomorrow/i)).toBeInTheDocument();
  });

  it("shows no sent list when sentToday is empty", () => {
    render(<CompletionScreen sentToday={[]} />);
    expect(screen.queryByText(/sent this session/i)).not.toBeInTheDocument();
  });

  it("shows sent count and lead names when sentToday has entries", () => {
    const sentToday = [
      { id: "1", name: "Alice Smith", account: { company: "Acme" } },
      { id: "2", name: "Bob Jones", account: { company: "DataCo" } },
    ];
    render(<CompletionScreen sentToday={sentToday} />);
    expect(screen.getByText(/2 sent this session/i)).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("at Acme")).toBeInTheDocument();
  });

  it("navigates to dashboard when Back button is clicked", () => {
    render(<CompletionScreen />);
    fireEvent.click(screen.getByText(/Back to Dashboard/i));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("navigates to accounts when Manage accounts is clicked", () => {
    render(<CompletionScreen />);
    fireEvent.click(screen.getByText(/Manage accounts/i));
    expect(mockPush).toHaveBeenCalledWith("/accounts");
  });
});
