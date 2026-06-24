import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

describe("mobile app", () => {
  it("shows today's lessons and saves a lesson attendance draft", async () => {
    const user = userEvent.setup();
    render(<App initialDate="2026-05-04" />);

    expect(screen.getByRole("heading", { name: "오늘 수업" })).toBeInTheDocument();
    expect(screen.getByText("3교시")).toBeInTheDocument();
    expect(screen.getByText("2-1 문학")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /2-1 문학/ }));
    expect(screen.getByRole("heading", { name: "2-1 문학" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^3번 / }));
    expect(screen.getByText("저장 전 요약")).toBeInTheDocument();
    expect(screen.getByText("3번 결과")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(screen.getByText("결과 1명")).toBeInTheDocument();
    expect(screen.getByText("동기화 대기 1건")).toBeInTheDocument();
    expect(screen.getByText("Drive 대기")).toBeInTheDocument();
    expect(screen.getByText("NEIS 미반영")).toBeInTheDocument();
    expect(screen.getByText(/마지막 저장/)).toBeInTheDocument();
  });

  it("lets the teacher change the working date", async () => {
    const user = userEvent.setup();
    render(<App initialDate="2026-05-04" />);

    await user.click(screen.getByRole("button", { name: /날짜 선택/ }));
    expect(screen.getByRole("dialog", { name: "날짜 선택" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "내일" }));

    expect(screen.getByText("5월 5일 화요일")).toBeInTheDocument();
    expect(screen.getByText("선택한 날짜에 표시할 수업이 없습니다.")).toBeInTheDocument();
  });

  it("keeps saved attendance scoped to the selected date", async () => {
    const user = userEvent.setup();
    render(<App initialDate="2026-05-04" />);

    await user.click(screen.getByRole("button", { name: /2-1 문학/ }));
    await user.click(screen.getByRole("button", { name: /^3번 / }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByText("결과 1명")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /날짜 선택/ }));
    const dateInput = screen.getByLabelText("직접 날짜 선택");
    await user.clear(dateInput);
    await user.type(dateInput, "2026-05-11");
    await user.click(screen.getByRole("button", { name: "닫기" }));

    expect(screen.getAllByText("미체크")).toHaveLength(3);
    expect(screen.queryByText("결과 1명")).not.toBeInTheDocument();
  });

  it("shows read-only timetable and roster confirmation in settings", async () => {
    const user = userEvent.setup();
    render(<App initialDate="2026-05-04" />);

    await user.click(screen.getByRole("button", { name: "설정" }));

    expect(screen.getByRole("heading", { name: "설정" })).toBeInTheDocument();
    expect(screen.getByText("편집은 PC(데스크톱 앱)에서 합니다.")).toBeInTheDocument();
    expect(screen.getByText("3교시 · 2-1 문학")).toBeInTheDocument();
    expect(screen.getByText("2-1 · 5명")).toBeInTheDocument();
    expect(screen.getByText("계정")).toBeInTheDocument();
  });

  it("loads another month's attendance when navigating across months", async () => {
    const user = userEvent.setup();
    const onLoadMonth = vi.fn().mockResolvedValue({
      "2026-04-06": {
        "mon-3": {
          absences: [{ studentNumber: 3, markType: "absent", note: "" }],
          checkedAt: "2026-04-06T10:55:00+09:00",
          source: "mobile",
          syncedToNeis: false,
          closedOnNeis: false,
        },
      },
    });
    render(<App initialDate="2026-05-04" initialMonth="2026-05" onLoadMonth={onLoadMonth} />);

    // Same-month navigation must not trigger a fetch.
    await user.click(screen.getByRole("button", { name: /날짜 선택/ }));
    const dateInput = screen.getByLabelText("직접 날짜 선택");
    await user.clear(dateInput);
    await user.type(dateInput, "2026-04-06");
    await user.click(screen.getByRole("button", { name: "닫기" }));

    await waitFor(() => expect(onLoadMonth).toHaveBeenCalledWith("2026-04"));
    // The loaded April record now renders for the selected April date.
    await waitFor(() => expect(screen.getByText("결과 1명")).toBeInTheDocument());
  });

  it("marks a save as Drive 완료 when onSaveSlot resolves", async () => {
    const user = userEvent.setup();
    const onSaveSlot = vi.fn().mockResolvedValue(undefined);
    render(<App initialDate="2026-05-04" onSaveSlot={onSaveSlot} />);

    await user.click(screen.getByRole("button", { name: /2-1 문학/ }));
    await user.click(screen.getByRole("button", { name: /^3번 / }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.getByText("Drive 완료")).toBeInTheDocument());
    expect(onSaveSlot).toHaveBeenCalledWith(
      "2026-05-04",
      "mon-3",
      expect.objectContaining({ source: "mobile", syncedToNeis: false }),
    );
  });

  it("offers a retry when onSaveSlot rejects", async () => {
    const user = userEvent.setup();
    const onSaveSlot = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    render(<App initialDate="2026-05-04" onSaveSlot={onSaveSlot} />);

    await user.click(screen.getByRole("button", { name: /2-1 문학/ }));
    await user.click(screen.getByRole("button", { name: /^3번 / }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    // The lessons-page failure banner offers the retry (the 동기화 tab is gone).
    const retry = await screen.findByRole("button", { name: "다시 시도" });
    await user.click(retry);

    await waitFor(() => expect(screen.getByText("Drive 완료")).toBeInTheDocument());
    expect(onSaveSlot).toHaveBeenCalledTimes(2);
  });
});
