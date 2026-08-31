"""
Cerberus Desktop - entry point.
Run with: python main.py
"""

import os
import webview

from backend.api import Api

FRONTEND_INDEX = os.path.join(os.path.dirname(__file__), "frontend", "index.html")
# Note: app_icon.ico (in frontend/assets/) isn't loaded here. pywebview has no
# cross-platform runtime API for setting a window icon. On Windows, the exe's
# icon is set at build time instead: `pyinstaller --icon=frontend/assets/app_icon.ico ...`


def main():
    api = Api()
    window = webview.create_window(
        "Cerberus Desktop",
        FRONTEND_INDEX,
        js_api=api,
        width=1280,
        height=820,
        min_size=(1000, 650),
    )
    api.window = window  # so Api methods can open file dialogs
    webview.start(debug=False)


if __name__ == "__main__":
    main()