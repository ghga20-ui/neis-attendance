import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { Checkbox, Segmented, StatusChip } from "./components";

describe("Checkbox", () => {
  it("renders its label and toggles to the opposite value on click", () => {
    const onChange = vi.fn();
    const { container } = render(<Checkbox checked={false} onChange={onChange} label="출석" />);

    expect(screen.getByText("출석")).toBeInTheDocument();
    const box = container.querySelector(".cbx-box");
    expect(box).not.toHaveClass("on");

    fireEvent.click(box!);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows the checked state via the .on class", () => {
    const { container } = render(<Checkbox checked onChange={() => {}} label="결과" />);
    expect(container.querySelector(".cbx-box")).toHaveClass("on");
  });
});

describe("Segmented", () => {
  const options = [
    { value: "manual", label: "수동" },
    { value: "neis", label: "NEIS" },
  ];

  it("marks the selected option and reports the value clicked", () => {
    const onChange = vi.fn();
    render(<Segmented value="manual" onChange={onChange} options={options} />);

    expect(screen.getByRole("button", { name: "수동" })).toHaveClass("on");
    expect(screen.getByRole("button", { name: "NEIS" })).not.toHaveClass("on");

    fireEvent.click(screen.getByRole("button", { name: "NEIS" }));
    expect(onChange).toHaveBeenCalledWith("neis");
  });
});

describe("StatusChip", () => {
  it("reflects synced, error, and default states", () => {
    const { rerender } = render(<StatusChip item={{ synced: true }} />);
    expect(screen.getByText(/NEIS 반영됨/)).toBeInTheDocument();

    rerender(<StatusChip item={{ error: "저장 실패" }} />);
    expect(screen.getByText(/오류/)).toBeInTheDocument();
    expect(screen.getByText(/저장 실패/)).toBeInTheDocument();

    rerender(<StatusChip item={{}} />);
    expect(screen.getByText("미반영")).toBeInTheDocument();
  });
});
