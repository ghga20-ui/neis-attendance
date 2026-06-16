"""pywebview-based desktop window for subject_teacher."""
from __future__ import annotations

import os
from pathlib import Path

import webview

from subject_teacher.gui.api import Api


def _html_url() -> str:
    # Dev override: point at the Vite dev server (`npm run dev`) for fast iteration.
    dev_url = os.environ.get("NEIS_UI_DEV_URL")
    if dev_url:
        return dev_url
    here = Path(__file__).resolve().parent
    dist_index = here.parent / "neis_attendance" / "dist" / "index.html"
    if not dist_index.exists():
        raise FileNotFoundError(
            "Desktop UI is not built. Run:\n"
            "  cd subject_teacher/neis_attendance && npm install && npm run build"
        )
    return dist_index.resolve().as_uri()


def start() -> None:
    api = Api()
    window = webview.create_window(
        title="나이스 출결관리 프로 · 교과교사용",
        url=_html_url(),
        js_api=api,
        width=1440,
        height=900,
        min_size=(1200, 800),
        background_color="#F2F2F7",
    )
    api.set_window(window)
    webview.start(debug=False)
