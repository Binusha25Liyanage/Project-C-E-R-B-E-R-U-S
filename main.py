"""
Cerberus Desktop - entry point.
Run with: python main.py
"""

import os
import webview

from backend.api import Api

FRONTEND_INDEX = os.path.join(os.path.dirname(__file__), "frontend", "index.html")


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
