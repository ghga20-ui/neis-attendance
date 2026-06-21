from __future__ import annotations

from datetime import date as date_type

import customtkinter as ctk
from CTkMessagebox import CTkMessagebox

from regions import DEFAULT_REGION, REGION_LIST
from subject_teacher.drive.schemas import SCHEMA_VERSION, StudentEntry, Students, Timetable, TimetableSlot
from subject_teacher.local_store import load_local_students, save_local_students
from subject_teacher.state import build_store, default_settings


DAY_OPTIONS = [("월", 1), ("화", 2), ("수", 3), ("목", 4), ("금", 5)]
DAY_LABEL_TO_NUMBER = {label: number for label, number in DAY_OPTIONS}
DAY_NUMBER_TO_LABEL = {number: label for label, number in DAY_OPTIONS}


class SetupTab(ctk.CTkFrame):
    def __init__(
        self,
        master,
        app,
        colors: dict[str, str],
        main_font: tuple[str, int],
        bold_font: tuple[str, int, str],
    ):
        super().__init__(master, fg_color="transparent")
        self.app = app
        self.colors = colors
        self.main_font = main_font
        self.bold_font = bold_font

        today = date_type.today()
        self.region_var = ctk.StringVar(value=DEFAULT_REGION)
        self.year_var = ctk.StringVar(value=str(today.year))
        self.term_var = ctk.StringVar(value="1")
        self.effective_from_var = ctk.StringVar(value=f"{today.year}-03-02")
        self.close_by_default_var = ctk.BooleanVar(value=False)

        self.student_class_var = ctk.StringVar(value="2-1")
        self.student_cache: dict[str, list[dict[str, str]]] = {"2-1": []}
        self.timetable_rows: list[dict[str, object]] = []
        self.student_rows: list[dict[str, object]] = []

        self.timetable_count_label: ctk.CTkLabel | None = None
        self.student_count_label: ctk.CTkLabel | None = None
        self.student_class_summary_label: ctk.CTkLabel | None = None

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1)

        self._build()

    def _build(self) -> None:
        shell = self._card(self, accent=True)
        shell.grid(row=0, column=0, padx=18, pady=18, sticky="nsew")
        shell.grid_columnconfigure(1, weight=1)
        shell.grid_rowconfigure(0, weight=1)

        self._build_side_rail(shell)

        content = ctk.CTkFrame(shell, fg_color="transparent")
        content.grid(row=0, column=1, padx=(0, 24), pady=24, sticky="nsew")
        content.grid_columnconfigure(0, weight=1)
        content.grid_rowconfigure(2, weight=1)
        content.grid_rowconfigure(3, weight=1)

        self._build_header(content)
        self._build_settings_strip(content)
        self._build_timetable_card(content)
        self._build_students_card(content)

        self.add_timetable_row()
        self._load_student_rows_for_current_class()
        self._refresh_timetable_summary()
        self._refresh_student_summary()

    def _build_side_rail(self, parent) -> None:
        rail = ctk.CTkFrame(
            parent,
            fg_color=self.colors["surface"],
            corner_radius=0,
            width=190,
        )
        rail.grid(row=0, column=0, sticky="nsw")
        rail.grid_propagate(False)
        rail.grid_rowconfigure(5, weight=1)
        rail.grid_columnconfigure(0, weight=1)

        brand = ctk.CTkFrame(rail, fg_color="transparent")
        brand.grid(row=0, column=0, padx=18, pady=(22, 18), sticky="ew")
        ctk.CTkLabel(
            brand,
            text="설정",
            font=("Noto Sans KR", 13, "bold"),
            text_color=self.colors["base03"],
        ).grid(row=0, column=0, sticky="w")
        ctk.CTkLabel(
            brand,
            text="학기 시작 전 준비",
            font=("Noto Sans KR", 11),
            text_color=self.colors["base00"],
        ).grid(row=1, column=0, pady=(4, 0), sticky="w")

        self._rail_button(rail, "설정", selected=True, command=lambda: self._select_tab("설정")).grid(
            row=1, column=0, padx=14, pady=(0, 8), sticky="ew"
        )
        self._rail_button(rail, "실행", command=lambda: self._select_tab("실행")).grid(
            row=2, column=0, padx=14, pady=(0, 14), sticky="ew"
        )

        divider = ctk.CTkFrame(rail, fg_color=self.colors["line"], height=1, corner_radius=0)
        divider.grid(row=3, column=0, padx=18, pady=(0, 16), sticky="ew")

        shortcuts = ctk.CTkFrame(rail, fg_color="transparent")
        shortcuts.grid(row=4, column=0, padx=14, sticky="ew")
        shortcuts.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(
            shortcuts,
            text="바로 작업",
            font=("Noto Sans KR", 11, "bold"),
            text_color=self.colors["base00"],
        ).grid(row=0, column=0, padx=4, pady=(0, 8), sticky="w")
        self._side_action_button(shortcuts, "Drive에서 불러오기", self.load_from_drive).grid(
            row=1, column=0, pady=(0, 8), sticky="ew"
        )
        self._side_action_button(shortcuts, "샘플값 채우기", self.fill_sample_values).grid(
            row=2, column=0, pady=(0, 8), sticky="ew"
        )
        self._side_action_button(shortcuts, "실행 탭으로 이동", lambda: self._select_tab("실행")).grid(
            row=3, column=0, pady=(0, 8), sticky="ew"
        )

        status = ctk.CTkFrame(rail, fg_color="transparent")
        status.grid(row=6, column=0, padx=18, pady=(0, 20), sticky="ew")
        ctk.CTkLabel(
            status,
            text="Drive 설정 관리",
            font=("Noto Sans KR", 11),
            text_color=self.colors["base00"],
        ).grid(row=0, column=0, sticky="w")
        ctk.CTkLabel(
            status,
            text="연결되면 설정, 시간표, 학생 명부를 각각 저장할 수 있습니다.",
            justify="left",
            wraplength=145,
            font=("Noto Sans KR", 11),
            text_color=self.colors["base00"],
        ).grid(row=1, column=0, pady=(6, 0), sticky="w")

    def _build_header(self, parent) -> None:
        header = ctk.CTkFrame(parent, fg_color="transparent")
        header.grid(row=0, column=0, sticky="ew")
        header.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            header,
            text="설정",
            font=("Noto Sans KR", 34, "bold"),
            text_color=self.colors["base03"],
        ).grid(row=0, column=0, sticky="w")
        ctk.CTkLabel(
            header,
            text="출결 관리에 필요한 기본 정보와 시간표, 학생 명부를 한 화면에서 정리합니다.",
            font=("Noto Sans KR", 13),
            text_color=self.colors["base00"],
        ).grid(row=1, column=0, pady=(6, 0), sticky="w")

        actions = ctk.CTkFrame(header, fg_color="transparent")
        actions.grid(row=0, column=1, rowspan=2, padx=(18, 0), sticky="e")
        actions.grid_columnconfigure((0, 1, 2), weight=1)
        self._secondary_button(actions, "Drive에서 불러오기", self.load_from_drive).grid(
            row=0, column=0, padx=4, sticky="ew"
        )
        self._secondary_button(actions, "기본 설정 저장", self.save_settings_to_drive).grid(
            row=0, column=1, padx=4, sticky="ew"
        )
        self._secondary_button(actions, "샘플값 채우기", self.fill_sample_values).grid(
            row=0, column=2, padx=4, sticky="ew"
        )

    def _build_settings_strip(self, parent) -> None:
        card = self._card(parent)
        card.grid(row=1, column=0, pady=(18, 14), sticky="ew")
        for column in range(4):
            card.grid_columnconfigure(column, weight=1)

        ctk.CTkLabel(
            card,
            text="기본 정보",
            font=("Noto Sans KR", 18, "bold"),
            text_color=self.colors["base03"],
        ).grid(row=0, column=0, columnspan=4, padx=20, pady=(18, 4), sticky="w")
        ctk.CTkLabel(
            card,
            text="실행 탭에서 재사용될 값입니다.",
            font=("Noto Sans KR", 12),
            text_color=self.colors["base00"],
        ).grid(row=1, column=0, columnspan=4, padx=20, pady=(0, 10), sticky="w")

        self._field_label(card, "교육청", 2, 0, padx=(20, 8))
        ctk.CTkOptionMenu(
            card,
            variable=self.region_var,
            values=REGION_LIST,
            font=self.main_font,
            height=40,
            fg_color=self.colors["surface"],
            button_color=self.colors["surface_alt"],
            button_hover_color=self.colors["line"],
            dropdown_fg_color=self.colors["base2"],
            dropdown_hover_color=self.colors["surface_alt"],
            text_color=self.colors["base03"],
        ).grid(row=3, column=0, padx=(20, 8), pady=(0, 14), sticky="ew")

        self._field_label(card, "학년도", 2, 1)
        ctk.CTkEntry(
            card,
            textvariable=self.year_var,
            font=self.main_font,
            height=40,
            fg_color=self.colors["surface"],
            border_color=self.colors["line"],
            text_color=self.colors["base03"],
        ).grid(row=3, column=1, padx=8, pady=(0, 14), sticky="ew")

        self._field_label(card, "학기", 2, 2)
        ctk.CTkOptionMenu(
            card,
            variable=self.term_var,
            values=["1", "2"],
            font=self.main_font,
            height=40,
            fg_color=self.colors["surface"],
            button_color=self.colors["surface_alt"],
            button_hover_color=self.colors["line"],
            dropdown_fg_color=self.colors["base2"],
            dropdown_hover_color=self.colors["surface_alt"],
            text_color=self.colors["base03"],
        ).grid(row=3, column=2, padx=8, pady=(0, 14), sticky="ew")

        self._field_label(card, "적용 시작일", 2, 3, padx=(8, 20))
        ctk.CTkEntry(
            card,
            textvariable=self.effective_from_var,
            font=self.main_font,
            height=40,
            fg_color=self.colors["surface"],
            border_color=self.colors["line"],
            text_color=self.colors["base03"],
        ).grid(row=3, column=3, padx=(8, 20), pady=(0, 14), sticky="ew")

        ctk.CTkCheckBox(
            card,
            text="실행 탭에서 출결마감까지 자동 실행을 기본으로 켭니다.",
            variable=self.close_by_default_var,
            font=self.main_font,
            text_color=self.colors["base01"],
            fg_color=self.colors["blue"],
            hover_color="#0066cc",
            checkmark_color=self.colors["base2"],
        ).grid(row=4, column=0, columnspan=4, padx=20, pady=(0, 18), sticky="w")

    def _build_timetable_card(self, parent) -> None:
        card = self._card(parent)
        card.grid(row=2, column=0, pady=(0, 14), sticky="nsew")
        card.grid_columnconfigure(0, weight=1)
        card.grid_rowconfigure(1, weight=1)

        header = ctk.CTkFrame(card, fg_color="transparent")
        header.grid(row=0, column=0, padx=20, pady=(18, 10), sticky="ew")
        header.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            header,
            text="시간표",
            font=("Noto Sans KR", 20, "bold"),
            text_color=self.colors["base03"],
        ).grid(row=0, column=0, sticky="w")
        ctk.CTkLabel(
            header,
            text="수업 슬롯을 표처럼 정리하고 Drive용 시간표로 저장합니다.",
            font=("Noto Sans KR", 12),
            text_color=self.colors["base00"],
        ).grid(row=1, column=0, pady=(4, 0), sticky="w")

        actions = ctk.CTkFrame(header, fg_color="transparent")
        actions.grid(row=0, column=1, rowspan=2, padx=(16, 0), sticky="e")
        actions.grid_columnconfigure((0, 1, 2, 3), weight=1)
        self.timetable_count_label = self._pill(actions, "0개 수업")
        self.timetable_count_label.grid(row=0, column=0, padx=4, sticky="ew")
        self._secondary_button(actions, "행 추가", self.add_timetable_row).grid(row=0, column=1, padx=4, sticky="ew")
        self._secondary_button(actions, "선택 삭제", self.remove_selected_timetable_rows).grid(
            row=0, column=2, padx=4, sticky="ew"
        )
        self._primary_button(actions, "시간표 저장", self.save_timetable_to_drive).grid(
            row=0, column=3, padx=4, sticky="ew"
        )

        table = ctk.CTkFrame(
            card,
            fg_color=self.colors["surface"],
            corner_radius=20,
            border_width=1,
            border_color=self.colors["line"],
        )
        table.grid(row=1, column=0, padx=18, pady=(0, 18), sticky="nsew")
        table.grid_columnconfigure(0, weight=1)
        table.grid_rowconfigure(1, weight=1)

        columns = [
            ("", 1),
            ("요일", 2),
            ("교시", 2),
            ("학년", 2),
            ("반", 2),
            ("과목명", 4),
            ("NEIS 표시명", 5),
        ]
        self._build_table_header(table, columns).grid(row=0, column=0, padx=12, pady=(12, 8), sticky="ew")

        self.timetable_list = ctk.CTkScrollableFrame(
            table,
            fg_color="transparent",
            corner_radius=0,
            scrollbar_button_color=self.colors["surface_alt"],
            scrollbar_button_hover_color=self.colors["line"],
            height=280,
        )
        self.timetable_list.grid(row=1, column=0, padx=8, pady=(0, 8), sticky="nsew")
        self.timetable_list.grid_columnconfigure(0, weight=1)

    def _build_students_card(self, parent) -> None:
        card = self._card(parent)
        card.grid(row=3, column=0, sticky="nsew")
        card.grid_columnconfigure(0, weight=1)
        card.grid_rowconfigure(2, weight=1)

        header = ctk.CTkFrame(card, fg_color="transparent")
        header.grid(row=0, column=0, padx=20, pady=(18, 10), sticky="ew")
        header.grid_columnconfigure(0, weight=1)
        header.grid_columnconfigure(1, weight=1)

        title = ctk.CTkFrame(header, fg_color="transparent")
        title.grid(row=0, column=0, sticky="w")
        ctk.CTkLabel(
            title,
            text="학생 명부",
            font=("Noto Sans KR", 20, "bold"),
            text_color=self.colors["base03"],
        ).grid(row=0, column=0, sticky="w")
        ctk.CTkLabel(
            title,
            text="학급별 학생을 관리하고 복사 붙여넣기로 빠르게 채웁니다.",
            font=("Noto Sans KR", 12),
            text_color=self.colors["base00"],
        ).grid(row=1, column=0, pady=(4, 0), sticky="w")

        controls = ctk.CTkFrame(header, fg_color="transparent")
        controls.grid(row=0, column=1, padx=(16, 0), sticky="e")
        controls.grid_columnconfigure((1, 2, 3), weight=1)
        ctk.CTkLabel(
            controls,
            text="학급",
            font=("Noto Sans KR", 12, "bold"),
            text_color=self.colors["base00"],
        ).grid(row=0, column=0, padx=(0, 8), sticky="e")
        self.class_menu = ctk.CTkComboBox(
            controls,
            variable=self.student_class_var,
            values=sorted(self.student_cache),
            command=self.on_student_class_change,
            font=self.main_font,
            width=120,
            fg_color=self.colors["surface"],
            border_color=self.colors["line"],
            button_color=self.colors["surface_alt"],
            button_hover_color=self.colors["line"],
            dropdown_fg_color=self.colors["base2"],
            dropdown_hover_color=self.colors["surface_alt"],
            text_color=self.colors["base03"],
        )
        self.class_menu.grid(row=0, column=1, padx=4, sticky="ew")
        self._secondary_button(controls, "학급 추가", self.add_class_key).grid(row=0, column=2, padx=4, sticky="ew")
        self._primary_button(controls, "명부 저장", self.save_students_to_drive).grid(row=0, column=3, padx=4, sticky="ew")

        summary = ctk.CTkFrame(
            card,
            fg_color=self.colors["surface"],
            corner_radius=18,
            border_width=1,
            border_color=self.colors["line"],
        )
        summary.grid(row=1, column=0, padx=18, pady=(0, 12), sticky="ew")
        summary.grid_columnconfigure((0, 1, 2), weight=1)
        summary.grid_columnconfigure(3, weight=0)

        self.student_class_summary_label = ctk.CTkLabel(
            summary,
            text="학급 2-1",
            font=("Noto Sans KR", 16, "bold"),
            text_color=self.colors["base03"],
        )
        self.student_class_summary_label.grid(row=0, column=0, padx=16, pady=(14, 4), sticky="w")
        self.student_count_label = ctk.CTkLabel(
            summary,
            text="학생 수 0명",
            font=("Noto Sans KR", 13),
            text_color=self.colors["base00"],
        )
        self.student_count_label.grid(row=0, column=1, padx=8, pady=(14, 4), sticky="w")
        ctk.CTkLabel(
            summary,
            text="복사 붙여넣기 예시: 18 정수빈",
            font=("Noto Sans KR", 12),
            text_color=self.colors["base00"],
        ).grid(row=0, column=2, padx=8, pady=(14, 4), sticky="w")
        self._secondary_button(summary, "실행 탭 보기", lambda: self._select_tab("실행")).grid(
            row=0, column=3, padx=16, pady=(10, 4), sticky="e"
        )

        paste_row = ctk.CTkFrame(summary, fg_color="transparent")
        paste_row.grid(row=1, column=0, columnspan=4, padx=12, pady=(0, 12), sticky="ew")
        paste_row.grid_columnconfigure(0, weight=1)
        paste_row.grid_columnconfigure(1, weight=0)
        self.paste_text = ctk.CTkTextbox(
            paste_row,
            height=78,
            font=(self.main_font[0], 12),
            fg_color=self.colors["base2"],
            border_width=1,
            border_color=self.colors["line"],
            text_color=self.colors["base03"],
        )
        self.paste_text.grid(row=0, column=0, padx=(0, 8), sticky="ew")
        self._secondary_button(paste_row, "붙여넣기 반영", self.import_students_from_text).grid(
            row=0, column=1, sticky="ns"
        )

        table = ctk.CTkFrame(
            card,
            fg_color=self.colors["surface"],
            corner_radius=20,
            border_width=1,
            border_color=self.colors["line"],
        )
        table.grid(row=2, column=0, padx=18, pady=(0, 10), sticky="nsew")
        table.grid_columnconfigure(0, weight=1)
        table.grid_rowconfigure(1, weight=1)

        self._build_table_header(table, [("", 1), ("번호", 2), ("이름", 5)]).grid(
            row=0, column=0, padx=12, pady=(12, 8), sticky="ew"
        )

        self.students_list = ctk.CTkScrollableFrame(
            table,
            fg_color="transparent",
            corner_radius=0,
            scrollbar_button_color=self.colors["surface_alt"],
            scrollbar_button_hover_color=self.colors["line"],
            height=220,
        )
        self.students_list.grid(row=1, column=0, padx=8, pady=(0, 8), sticky="nsew")
        self.students_list.grid_columnconfigure(0, weight=1)

        footer = ctk.CTkFrame(card, fg_color="transparent")
        footer.grid(row=3, column=0, padx=18, pady=(0, 18), sticky="ew")
        footer.grid_columnconfigure((0, 1), weight=1)
        self._secondary_button(footer, "학생 행 추가", self.add_student_row).grid(row=0, column=0, padx=4, sticky="ew")
        self._secondary_button(footer, "선택 삭제", self.remove_selected_student_rows).grid(
            row=0, column=1, padx=4, sticky="ew"
        )
        ctk.CTkLabel(
            footer,
            text="학생 이름은 이 PC에만 저장되며 외부로 전송되지 않습니다.  처리방침: docs/legal/privacy-policy.md",
            font=("Noto Sans KR", 11),
            text_color=self.colors["base00"],
            justify="left",
        ).grid(row=1, column=0, columnspan=2, padx=4, pady=(8, 0), sticky="w")

    def _build_table_header(self, parent, columns: list[tuple[str, int]]) -> ctk.CTkFrame:
        header = ctk.CTkFrame(parent, fg_color=self.colors["surface_alt"], corner_radius=14)
        for index, (_, weight) in enumerate(columns):
            header.grid_columnconfigure(index, weight=weight)
        for index, (label, _) in enumerate(columns):
            ctk.CTkLabel(
                header,
                text=label,
                font=("Noto Sans KR", 11, "bold"),
                text_color=self.colors["base00"],
            ).grid(
                row=0,
                column=index,
                padx=(12 if index == 0 else 6, 12 if index == len(columns) - 1 else 6),
                pady=10,
                sticky="w",
            )
        return header

    def _field_label(self, parent, text: str, row: int, column: int, padx: tuple[int, int] = (8, 8)) -> None:
        ctk.CTkLabel(
            parent,
            text=text,
            font=("Noto Sans KR", 12, "bold"),
            text_color=self.colors["base00"],
        ).grid(row=row, column=column, padx=padx, pady=(0, 6), sticky="w")

    def _card(self, parent, accent: bool = False) -> ctk.CTkFrame:
        return ctk.CTkFrame(
            parent,
            fg_color=self.colors["base2"],
            corner_radius=28 if accent else 24,
            border_width=1,
            border_color=self.colors["line"],
        )

    def _primary_button(self, parent, text: str, command) -> ctk.CTkButton:
        return ctk.CTkButton(
            parent,
            text=text,
            command=command,
            font=("Noto Sans KR", 13, "bold"),
            height=38,
            corner_radius=14,
            fg_color=self.colors["base03"],
            hover_color=self.colors["base01"],
            text_color=self.colors["base2"],
        )

    def _secondary_button(self, parent, text: str, command) -> ctk.CTkButton:
        return ctk.CTkButton(
            parent,
            text=text,
            command=command,
            font=("Noto Sans KR", 13),
            height=38,
            corner_radius=14,
            fg_color=self.colors["base2"],
            hover_color=self.colors["surface_alt"],
            border_width=1,
            border_color=self.colors["line"],
            text_color=self.colors["base01"],
        )

    def _rail_button(self, parent, text: str, command, selected: bool = False) -> ctk.CTkButton:
        return ctk.CTkButton(
            parent,
            text=text,
            command=command,
            anchor="w",
            font=("Noto Sans KR", 14 if selected else 13, "bold" if selected else "normal"),
            height=40,
            corner_radius=14,
            fg_color=self.colors["surface_alt"] if selected else "transparent",
            hover_color=self.colors["surface_alt"],
            border_width=0,
            text_color=self.colors["blue"] if selected else self.colors["base01"],
        )

    def _side_action_button(self, parent, text: str, command) -> ctk.CTkButton:
        return ctk.CTkButton(
            parent,
            text=text,
            command=command,
            anchor="w",
            font=("Noto Sans KR", 12),
            height=34,
            corner_radius=12,
            fg_color=self.colors["base2"],
            hover_color=self.colors["surface_alt"],
            border_width=1,
            border_color=self.colors["line"],
            text_color=self.colors["base01"],
        )

    def _pill(self, parent, text: str) -> ctk.CTkLabel:
        return ctk.CTkLabel(
            parent,
            text=text,
            fg_color=self.colors["surface_alt"],
            corner_radius=999,
            font=("Noto Sans KR", 11, "bold"),
            text_color=self.colors["base01"],
            padx=12,
            pady=8,
        )

    def _select_tab(self, name: str) -> None:
        if hasattr(self.app, "select_tab"):
            self.app.select_tab(name)

    def _with_store(self):
        self.app.write_log("Drive 연결 중...")
        return build_store()

    def _count_timetable_rows(self) -> int:
        return sum(
            1
            for row in self.timetable_rows
            if row["subject_name"].get().strip() or row["neis_subject_label"].get().strip()
        )

    def _count_current_students(self) -> int:
        return sum(
            1
            for row in self.student_rows
            if row["number"].get().strip() and row["name"].get().strip()
        )

    def _refresh_timetable_summary(self, *_args) -> None:
        if self.timetable_count_label is not None:
            self.timetable_count_label.configure(text=f"{self._count_timetable_rows()}개 수업")

    def _refresh_student_summary(self, *_args) -> None:
        class_key = self.student_class_var.get().strip() or "학급 미지정"
        if self.student_class_summary_label is not None:
            self.student_class_summary_label.configure(text=f"학급 {class_key}")
        if self.student_count_label is not None:
            self.student_count_label.configure(text=f"학생 수 {self._count_current_students()}명")

    def add_timetable_row(self, data: dict[str, str] | None = None) -> None:
        data = data or {}
        row_frame = ctk.CTkFrame(
            self.timetable_list,
            fg_color=self.colors["base2"],
            corner_radius=16,
            border_width=1,
            border_color=self.colors["line"],
        )
        row_frame.pack(fill="x", padx=4, pady=4)
        weights = [1, 2, 2, 2, 2, 4, 5]
        for index, weight in enumerate(weights):
            row_frame.grid_columnconfigure(index, weight=weight)

        selected_var = ctk.BooleanVar(value=False)
        day_var = ctk.StringVar(value=data.get("day_label", "월"))
        period_var = ctk.StringVar(value=data.get("period", "1"))
        grade_var = ctk.StringVar(value=data.get("grade", "1"))
        class_no_var = ctk.StringVar(value=data.get("class_no", "1"))
        subject_var = ctk.StringVar(value=data.get("subject_name", ""))
        neis_var = ctk.StringVar(value=data.get("neis_subject_label", ""))

        ctk.CTkCheckBox(
            row_frame,
            text="",
            variable=selected_var,
            width=20,
            fg_color=self.colors["blue"],
            hover_color="#0066cc",
            checkmark_color=self.colors["base2"],
        ).grid(row=0, column=0, padx=(12, 6), pady=8, sticky="w")
        ctk.CTkOptionMenu(
            row_frame,
            variable=day_var,
            values=[label for label, _ in DAY_OPTIONS],
            font=(self.main_font[0], 12),
            height=34,
            fg_color=self.colors["surface"],
            button_color=self.colors["surface_alt"],
            button_hover_color=self.colors["line"],
            dropdown_fg_color=self.colors["base2"],
            dropdown_hover_color=self.colors["surface_alt"],
            text_color=self.colors["base03"],
        ).grid(row=0, column=1, padx=4, pady=8, sticky="ew")
        ctk.CTkOptionMenu(
            row_frame,
            variable=period_var,
            values=[str(i) for i in range(1, 8)],
            font=(self.main_font[0], 12),
            height=34,
            fg_color=self.colors["surface"],
            button_color=self.colors["surface_alt"],
            button_hover_color=self.colors["line"],
            dropdown_fg_color=self.colors["base2"],
            dropdown_hover_color=self.colors["surface_alt"],
            text_color=self.colors["base03"],
        ).grid(row=0, column=2, padx=4, pady=8, sticky="ew")
        ctk.CTkEntry(
            row_frame,
            textvariable=grade_var,
            font=(self.main_font[0], 12),
            height=34,
            fg_color=self.colors["surface"],
            border_color=self.colors["line"],
            text_color=self.colors["base03"],
        ).grid(row=0, column=3, padx=4, pady=8, sticky="ew")
        ctk.CTkEntry(
            row_frame,
            textvariable=class_no_var,
            font=(self.main_font[0], 12),
            height=34,
            fg_color=self.colors["surface"],
            border_color=self.colors["line"],
            text_color=self.colors["base03"],
        ).grid(row=0, column=4, padx=4, pady=8, sticky="ew")
        ctk.CTkEntry(
            row_frame,
            textvariable=subject_var,
            font=(self.main_font[0], 12),
            placeholder_text="과목명",
            height=34,
            fg_color=self.colors["surface"],
            border_color=self.colors["line"],
            text_color=self.colors["base03"],
        ).grid(row=0, column=5, padx=4, pady=8, sticky="ew")
        ctk.CTkEntry(
            row_frame,
            textvariable=neis_var,
            font=(self.main_font[0], 12),
            placeholder_text="NEIS 표시명",
            height=34,
            fg_color=self.colors["surface"],
            border_color=self.colors["line"],
            text_color=self.colors["base03"],
        ).grid(row=0, column=6, padx=(4, 12), pady=8, sticky="ew")

        subject_var.trace_add("write", self._refresh_timetable_summary)
        neis_var.trace_add("write", self._refresh_timetable_summary)

        self.timetable_rows.append(
            {
                "frame": row_frame,
                "selected": selected_var,
                "day": day_var,
                "period": period_var,
                "grade": grade_var,
                "class_no": class_no_var,
                "subject_name": subject_var,
                "neis_subject_label": neis_var,
            }
        )
        self._refresh_timetable_summary()

    def remove_selected_timetable_rows(self) -> None:
        kept = []
        for row in self.timetable_rows:
            if row["selected"].get():
                row["frame"].destroy()
            else:
                kept.append(row)
        self.timetable_rows = kept
        if not self.timetable_rows:
            self.add_timetable_row()
        self._refresh_timetable_summary()

    def _collect_timetable(self) -> Timetable:
        slots = []
        for row in self.timetable_rows:
            subject_name = row["subject_name"].get().strip()
            neis_label = row["neis_subject_label"].get().strip()
            if not subject_name or not neis_label:
                continue
            day_label = row["day"].get().strip()
            period = int(row["period"].get().strip())
            grade = int(row["grade"].get().strip())
            class_no = row["class_no"].get().strip()
            if not class_no:
                continue
            slots.append(
                TimetableSlot(
                    id=f"{day_label}-{period}",
                    dayOfWeek=DAY_LABEL_TO_NUMBER[day_label],
                    period=period,
                    grade=grade,
                    classNo=class_no,
                    subjectName=subject_name,
                    neisSubjectLabel=neis_label,
                )
            )
        return Timetable(schemaVersion=SCHEMA_VERSION, effectiveFrom=self.effective_from_var.get().strip(), slots=slots)

    def _save_current_student_class(self) -> None:
        class_key = self.student_class_var.get().strip()
        rows = []
        for row in self.student_rows:
            number = row["number"].get().strip()
            name = row["name"].get().strip()
            if not number or not name:
                continue
            rows.append({"number": number, "name": name})
        self.student_cache[class_key] = rows
        self._refresh_student_summary()

    def _load_student_rows_for_current_class(self) -> None:
        for row in self.student_rows:
            row["frame"].destroy()
        self.student_rows = []
        rows = self.student_cache.get(self.student_class_var.get().strip(), [])
        if not rows:
            self.add_student_row()
            self._refresh_student_summary()
            return
        for row in rows:
            self.add_student_row(number=row["number"], name=row["name"])
        self._refresh_student_summary()

    def add_student_row(self, number: str = "", name: str = "") -> None:
        row_frame = ctk.CTkFrame(
            self.students_list,
            fg_color=self.colors["base2"],
            corner_radius=16,
            border_width=1,
            border_color=self.colors["line"],
        )
        row_frame.pack(fill="x", padx=4, pady=4)
        row_frame.grid_columnconfigure(0, weight=1)
        row_frame.grid_columnconfigure(1, weight=2)
        row_frame.grid_columnconfigure(2, weight=5)

        selected_var = ctk.BooleanVar(value=False)
        number_var = ctk.StringVar(value=number)
        name_var = ctk.StringVar(value=name)

        ctk.CTkCheckBox(
            row_frame,
            text="",
            variable=selected_var,
            width=20,
            fg_color=self.colors["blue"],
            hover_color="#0066cc",
            checkmark_color=self.colors["base2"],
        ).grid(row=0, column=0, padx=(12, 6), pady=8, sticky="w")
        ctk.CTkEntry(
            row_frame,
            textvariable=number_var,
            font=(self.main_font[0], 12),
            placeholder_text="번호",
            height=34,
            fg_color=self.colors["surface"],
            border_color=self.colors["line"],
            text_color=self.colors["base03"],
        ).grid(row=0, column=1, padx=4, pady=8, sticky="ew")
        ctk.CTkEntry(
            row_frame,
            textvariable=name_var,
            font=(self.main_font[0], 12),
            placeholder_text="이름",
            height=34,
            fg_color=self.colors["surface"],
            border_color=self.colors["line"],
            text_color=self.colors["base03"],
        ).grid(row=0, column=2, padx=(4, 12), pady=8, sticky="ew")

        number_var.trace_add("write", self._refresh_student_summary)
        name_var.trace_add("write", self._refresh_student_summary)

        self.student_rows.append(
            {
                "frame": row_frame,
                "selected": selected_var,
                "number": number_var,
                "name": name_var,
            }
        )
        self._refresh_student_summary()

    def remove_selected_student_rows(self) -> None:
        kept = []
        for row in self.student_rows:
            if row["selected"].get():
                row["frame"].destroy()
            else:
                kept.append(row)
        self.student_rows = kept
        if not self.student_rows:
            self.add_student_row()
        self._save_current_student_class()
        self._refresh_student_summary()

    def add_class_key(self) -> None:
        dialog = ctk.CTkInputDialog(text="학급 키를 입력하세요. 예: 2-1", title="학급 추가")
        class_key = (dialog.get_input() or "").strip()
        if not class_key:
            return
        self._save_current_student_class()
        self.student_cache.setdefault(class_key, [])
        values = sorted(self.student_cache)
        self.class_menu.configure(values=values)
        self.student_class_var.set(class_key)
        self._load_student_rows_for_current_class()
        self._refresh_student_summary()

    def on_student_class_change(self, class_key: str) -> None:
        self._save_current_student_class()
        self.student_class_var.set(class_key)
        self._load_student_rows_for_current_class()
        self._refresh_student_summary()

    def import_students_from_text(self) -> None:
        self._save_current_student_class()
        rows = []
        for line in self.paste_text.get("1.0", "end").splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            parts = stripped.split(maxsplit=1)
            if len(parts) != 2:
                raise ValueError(f"형식이 잘못된 줄: {line!r}")
            rows.append({"number": parts[0], "name": parts[1]})
        self.student_cache[self.student_class_var.get().strip()] = rows
        self.paste_text.delete("1.0", "end")
        self._load_student_rows_for_current_class()
        self._refresh_student_summary()

    def _collect_students(self) -> Students:
        self._save_current_student_class()
        classes: dict[str, list[StudentEntry]] = {}
        for class_key, rows in self.student_cache.items():
            items = []
            for row in rows:
                number = row["number"].strip()
                name = row["name"].strip()
                if not number or not name:
                    continue
                items.append(StudentEntry(number=int(number), name=name))
            if items:
                classes[class_key] = items
        return Students(schemaVersion=SCHEMA_VERSION, classes=classes)

    def load_from_drive(self) -> None:
        try:
            store = self._with_store()
            settings = store.load_settings() or default_settings(self.region_var.get(), int(self.year_var.get()), int(self.term_var.get()))
            timetable = store.load_timetable()
            students = load_local_students()

            self.region_var.set(settings.region)
            self.year_var.set(str(settings.semester.year))
            self.term_var.set(str(settings.semester.term))
            self.close_by_default_var.set(settings.close_by_default)
            if timetable:
                self.effective_from_var.set(timetable.effective_from)

            for row in self.timetable_rows:
                row["frame"].destroy()
            self.timetable_rows = []
            if timetable and timetable.slots:
                for slot in timetable.slots:
                    self.add_timetable_row(
                        {
                            "day_label": DAY_NUMBER_TO_LABEL.get(slot.day_of_week, "월"),
                            "period": str(slot.period),
                            "grade": str(slot.grade),
                            "class_no": str(slot.class_no),
                            "subject_name": slot.subject_name,
                            "neis_subject_label": slot.neis_subject_label,
                        }
                    )
            else:
                self.add_timetable_row()

            self.student_cache = {}
            if students:
                for class_key, items in students.classes.items():
                    self.student_cache[class_key] = [{"number": str(item.number), "name": item.name} for item in items]
            if not self.student_cache:
                self.student_cache = {self.student_class_var.get(): []}
            values = sorted(self.student_cache)
            self.class_menu.configure(values=values)
            self.student_class_var.set(values[0])
            self._load_student_rows_for_current_class()
            self._refresh_timetable_summary()
            self._refresh_student_summary()
            self.app.write_log("Drive 데이터를 불러왔습니다.")
        except Exception as exc:
            CTkMessagebox(title="불러오기 실패", message=str(exc), icon="cancel")

    def save_settings_to_drive(self) -> None:
        try:
            store = self._with_store()
            settings = default_settings(self.region_var.get(), int(self.year_var.get()), int(self.term_var.get()))
            settings.close_by_default = self.close_by_default_var.get()
            store.save_settings(settings)
            self.app.write_log("settings.json 저장 완료")
        except Exception as exc:
            CTkMessagebox(title="저장 실패", message=str(exc), icon="cancel")

    def save_timetable_to_drive(self) -> None:
        try:
            timetable = self._collect_timetable()
            store = self._with_store()
            store.save_timetable(timetable)
            self.app.write_log("timetable.json 저장 완료")
        except Exception as exc:
            CTkMessagebox(title="시간표 저장 실패", message=str(exc), icon="cancel")

    def save_students_to_drive(self) -> None:
        try:
            students = self._collect_students()
            save_local_students(students)             # 이름까지 로컬
            self._with_store().save_students(students) # 번호만 Drive
            self.app.write_log("학생 명부 저장 완료 (이름은 로컬, 번호만 동기화)")
        except Exception as exc:
            CTkMessagebox(title="학생 명부 저장 실패", message=str(exc), icon="cancel")

    def fill_sample_values(self) -> None:
        self.region_var.set("경기")
        self.year_var.set("2026")
        self.term_var.set("1")
        self.effective_from_var.set("2026-03-02")
        self.close_by_default_var.set(False)

        for row in self.timetable_rows:
            row["frame"].destroy()
        self.timetable_rows = []
        self.add_timetable_row(
            {
                "day_label": "월",
                "period": "3",
                "grade": "2",
                "class_no": "1",
                "subject_name": "문학",
                "neis_subject_label": "2학년 1(문학)",
            }
        )

        self.student_cache = {
            "2-1": [
                {"number": "18", "name": "정수빈"},
                {"number": "19", "name": "조성준"},
                {"number": "20", "name": "조승현"},
            ]
        }
        self.class_menu.configure(values=["2-1"])
        self.student_class_var.set("2-1")
        self._load_student_rows_for_current_class()
        self._refresh_timetable_summary()
        self._refresh_student_summary()
        self.app.write_log("샘플 입력값을 채웠습니다.")
