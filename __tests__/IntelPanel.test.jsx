import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IntelPanel from "../app/components/IntelPanel";

describe("IntelPanel", () => {
  it("renders nothing when researchSummary is null", () => {
    const { container } = render(<IntelPanel researchSummary={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when researchSummary is undefined", () => {
    const { container } = render(<IntelPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("renders collapsed toggle when researchSummary has content", () => {
    render(<IntelPanel researchSummary="Acme is hiring GraphQL engineers." />);
    expect(screen.getByText(/Intel Briefing/i)).toBeInTheDocument();
  });

  it("does not show summary text when collapsed (default state)", () => {
    render(<IntelPanel researchSummary="Acme is hiring GraphQL engineers." />);
    expect(screen.queryByText("Acme is hiring GraphQL engineers.")).not.toBeInTheDocument();
  });

  it("expands and shows summary text when toggle is clicked", () => {
    render(<IntelPanel researchSummary="Acme is hiring GraphQL engineers." />);
    fireEvent.click(screen.getByText(/Intel Briefing/i));
    expect(screen.getByText("Acme is hiring GraphQL engineers.")).toBeInTheDocument();
  });

  it("collapses again when toggle is clicked twice", () => {
    render(<IntelPanel researchSummary="Some insight." />);
    const btn = screen.getByText(/Intel Briefing/i);
    fireEvent.click(btn);
    expect(screen.getByText("Some insight.")).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText("Some insight.")).not.toBeInTheDocument();
  });
});
