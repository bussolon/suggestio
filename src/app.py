#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Suggestiō — Flask application.

This module exposes two routes:
    * ``/``        — serves the static ``index.html`` page.
    * ``/suggest`` — returns next-word predictions for a given prompt as JSON.

The heavy lifting (model loading, tokenization, inference) lives in
``autosuggest.py`` and is imported lazily so that the Flask app can boot
even when the model is unavailable.
"""

from __future__ import annotations

import logging

from flask import Flask, jsonify, request

from autosuggest import Autosuggester, SuggestionError

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

MAX_PROMPT_LENGTH = 2000          # characters; protects against abusive input
DEFAULT_TOP_K = 200               # number of suggestions returned
DEFAULT_PORT = 5050

# --------------------------------------------------------------------------- #
# Application factory
# --------------------------------------------------------------------------- #

def create_app() -> Flask:
    """Build and configure the Flask application.

    Using an application factory makes the project easier to test and
    avoids module-level side effects (such as loading the language model
    at import time).
    """
    app = Flask(__name__, static_folder="static")

    # Required by Flask even when we don't currently use server-side
    # sessions — it's good practice to set one for the future.
    app.config["SECRET_KEY"] = "dev-only-change-me"

    # The model is large; load it once and keep it in app.extensions so
    # that we can swap it out during tests.
    app.extensions["autosuggester"] = Autosuggester()

    # ------------------------------------------------------------------- #
    # Routes
    # ------------------------------------------------------------------- #
    register_routes(app)

    return app


def register_routes(app: Flask) -> None:
    """Attach HTTP routes to the given Flask app."""

    @app.route("/")
    def dashboard():
        """Serve the static front page."""
        return app.send_static_file("index.html")

    @app.route("/suggest")
    def suggest():
        """Return next-word predictions for ``?text=…`` as JSON."""
        prompt = _extract_prompt()
        if prompt is None:
            return _error("Missing or empty 'text' query parameter.", 400)

        try:
            suggester: Autosuggester = app.extensions["autosuggester"]
            suggestions = suggester.suggest(prompt, top_k=DEFAULT_TOP_K)
        except SuggestionError as exc:
            logging.warning("Suggestion failure: %s", exc)
            return _error(str(exc), 400)
        except Exception:                       # noqa: BLE001
            logging.exception("Unexpected error while generating suggestions")
            return _error("Internal server error.", 500)

        return jsonify(suggestions)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _extract_prompt() -> str | None:
    """Return a sanitized prompt from the query string, or ``None``."""
    raw = request.args.get("text", "", type=str)
    prompt = raw.strip()
    if not prompt:
        return None
    if len(prompt) > MAX_PROMPT_LENGTH:
        prompt = prompt[:MAX_PROMPT_LENGTH]
    return prompt


def _error(message: str, status: int):
    """Return a JSON error payload with the given HTTP status."""
    response = jsonify({"error": message})
    response.status_code = status
    return response


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #

app = create_app()


if __name__ == "__main__":
    # ``debug`` is wired to an env var so that production deployments can
    # easily disable it without editing the source.
    import os
    app.run(
        host="127.0.0.1",
        port=DEFAULT_PORT,
        debug=os.environ.get("FLASK_DEBUG", "1") == "1",
    )
