# Suggestiō

**Suggestiō** is a Flask-based web application that provides *next-word suggestions* while you write. It uses a causal language model from Hugging Face Transformers, exposes a simple JSON endpoint with the most probable following words and confidence scores, and ships with a fully wired browser frontend that shows suggestions as you type.

The name is Latin for "suggestion" and the project is designed as a prototype for interactive writing assistance, and autocomplete experiments.

---

## Introduction

The application demonstrates:

* how to load a modern causal language model behind a web server,
* how to query the model for the next word after a given prompt,
* how to return those predictions as JSON to a frontend,
* how to implement a keyboard-driven suggestion popup in the browser.

The current backend loads the **Qwen/Qwen3-0.6B** model. By default it runs on **CUDA** when available and falls back to **CPU** otherwise, making it easy to test locally without special hardware.

---

## Features

* Predicts the *top 200* next-word candidates for a given text prompt on the backend.
* Returns a JSON list of *token* / *probability* pairs.
* Accepts a `text` query parameter at the `/suggest` endpoint.
* Uses a **textarea-based editor** with a suggestion popup.
* Fully wired frontend: suggestions are fetched when you press the spacebar, filtered as you type, and insertable via keyboard or mouse.
* Supports several keyboard shortcuts:
  * `Tab` or `→` accepts the highlighted suggestion.
  * `↑` / `↓` navigate through the suggestion list.
  * `←` dismisses the popup.
  * Alphabetic keys filter the visible suggestions by the current word prefix.
* Loads the model lazily, so the server can boot even when the model is not yet downloaded.

---

## Architecture

The application consists of two main Python files:

1. `app.py` — the Flask application factory, routes, and request handling.
2. `autosuggest.py` — the model wrapper, lazy loading, and probability extraction.

It also contains frontend assets:

* `static/index.html` — the editor page.
* `static/app.js` — the keyboard handling, fetch logic, and popup rendering.

The flow is:

1. The user opens the web page and starts typing in the textarea.
2. When the user presses the spacebar (and has typed at least 20 characters), the frontend sends the current text to `/suggest?text=…`.
3. The backend tokenizes the text, runs it through the causal language model, and applies *softmax* to obtain a probability distribution over the next token.
4. The top *200* tokens and their probabilities are returned as JSON.
5. The frontend filters the list, shows at most 10 suggestions in a popup near the cursor, and lets the user accept one.

---

## Installation

### Requirements

* Python 3.8 or newer
* pip

### Dependencies

Install the required packages with:

```bash
pip install flask transformers torch
```

The model files are downloaded automatically by the `transformers` library on first run.

---

## Usage

### Starting the server

Run the application from the project directory:

```bash
python app.py
```

The Flask development server will start on port `5050`:

```text
http://127.0.0.1:5050
```

Open that address in a browser, type a sentence, and press the spacebar to see suggestions.

### Testing the suggestion endpoint

You can also call the API directly with `curl`:

```bash
curl "http://127.0.0.1:5050/suggest?text=The%20cat%20sat%20on%20the"
```

Example JSON response:

```json
[
  [" mat", 0.1234],
  [" chair", 0.0987],
  [" floor", 0.0765]
]
```

The first element in each pair is the predicted token, and the second is the probability.

---

## API Endpoints

### `GET /`

Serves the static frontend page.

* **File:** `static/index.html`
* **Title:** Suggestiō

### `GET /suggest`

Returns next-word predictions as JSON.

Query parameters:

* `text` — the prompt string to complete. If omitted, empty, or longer than 2000 characters, the request is adjusted or rejected.

Response format:

```json
[
  [" token1", 0.25],
  [" token2", 0.12]
]
```

Error responses use the same JSON style:

```json
{
  "error": "Missing or empty 'text' query parameter."
}
```

---

## Project Files

* `app.py` — Flask application factory, configuration, routes, and error handling.
* `autosuggest.py` — `Autosuggester` class, tokenization, model loading, and prediction.
* `static/index.html` — the HTML editor page.
* `static/app.js` — frontend logic: suggestion fetching, filtering, keyboard handling, and popup positioning.

---

## Configuration

The model is selected in `autosuggest.py`:

```python
DEFAULT_MODEL = "Qwen/Qwen3-0.6B"
```

You can change it to another causal language model, for example:

* `gpt2`
* `distilbert/distilgpt2`
* `microsoft/Phi-3-mini-4k-instruct`

Device selection is automatic by default:

```python
device: str = "auto"
```

This maps to `cuda` when a GPU is available, otherwise to `cpu`. You can also set it explicitly in the `Autosuggester` constructor, e.g. `Autosuggester(device="cpu")`.

The Flask server settings in `app.py`:

```python
MAX_PROMPT_LENGTH = 2000
DEFAULT_TOP_K = 200
DEFAULT_PORT = 5050
```

---

## Limitations

* The model runs locally; on CPU it may respond slowly for long prompts or under heavy load.
* Token-level decoding may produce fragments such as leading spaces or partial words, because the tokenizer can split words into subword tokens.
* Suggestions are triggered only by the spacebar; no request is made while typing inside a word.
* The endpoint is a **GET** route with no caching, authentication, or throttling.

---

## Possible Use Cases

* A **writing assistant** that suggests the next word to the user.
* An **autocomplete demo** for web-based editors.
* A **language-model playground** to explore probability distributions.
* A **base project** for building more advanced grammar or style suggestions.
* An **educational example** of integrating Hugging Face Transformers with Flask and a modern browser frontend.

---

## Final Notes

**Suggestiō** is a solid starting point for experimenting with language-model-powered writing tools. It demonstrates the full stack from model inference to a keyboard-friendly web interface, and it can be extended with richer filtering, model caching, and server-side optimizations.
