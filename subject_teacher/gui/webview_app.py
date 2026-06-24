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
        title="체크온 · 교과 출결",
        url=_html_url(),
        js_api=api,
        width=1440,
        height=900,
        min_size=(1200, 800),
        background_color="#F2F2F7",
    )
    api.set_window(window)

    # Window / taskbar icon (체크온). pywebview has no per-tab favicon — a
    # chromeless window shows no HTML <link rel=icon> — so set the window icon
    # explicitly. The packaged EXE icon is set separately in the PyInstaller spec.
    here = Path(__file__).resolve().parent
    icon_path = here.parent / "neis_attendance" / "dist" / "favicon.ico"
    if not icon_path.exists():
        icon_path = here.parent / "neis_attendance" / "public" / "favicon.ico"
    try:
        if icon_path.exists():
            webview.start(debug=False, icon=str(icon_path))
        else:
            webview.start(debug=False)
    except TypeError:
        # Older pywebview without the `icon` parameter.
        webview.start(debug=False)
