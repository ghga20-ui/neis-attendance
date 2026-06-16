# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path


ROOT = Path(SPECPATH)

datas = [
    # Ship only the built Vite UI, not node_modules/src.
    (
        str(ROOT / "subject_teacher" / "neis_attendance" / "dist"),
        "subject_teacher/neis_attendance/dist",
    ),
]

hiddenimports = [
    "clr_loader",
    "googleapiclient.discovery",
    "googleapiclient.http",
    "google_auth_oauthlib.flow",
    "pythonnet",
    "webview.platforms.edgechromium",
    "webview.platforms.winforms",
    "win32timezone",
]

a = Analysis(
    ["subject_teacher/main.py"],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="NEIS_Subject_Teacher",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
