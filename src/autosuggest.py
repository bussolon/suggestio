#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Suggestiō — model layer.

This module wraps a Hugging Face causal language model and exposes a small
API for next-word prediction.  It deliberately keeps no global state
beyond a lazily-loaded model instance, so it can be imported safely.
"""

from __future__ import annotations

import logging
from typing import List, Tuple

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


# --------------------------------------------------------------------------- #
# Exceptions
# --------------------------------------------------------------------------- #

class SuggestionError(Exception):
    """Raised when suggestions cannot be produced for a given prompt."""


# --------------------------------------------------------------------------- #
# Service
# --------------------------------------------------------------------------- #

class Autosuggester:
    """Lazy-loading wrapper around a causal language model.

    Parameters
    ----------
    model_name:
        Hugging Face identifier of the model to load.
    device:
        Torch device on which to run inference.  ``"auto"`` selects
        CUDA when available and falls back to CPU otherwise.
    top_k:
        Default number of suggestions returned by :py:meth:`suggest`.
    """

    DEFAULT_MODEL = "Qwen/Qwen3-0.6B"

    def __init__(
        self,
        model_name: str = DEFAULT_MODEL,
        device: str = "auto",
        top_k: int = 200,
    ) -> None:
        self.model_name = model_name
        self.top_k = top_k
        self._device = self._resolve_device(device)
        self._tokenizer = None
        self._model = None

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def suggest(
        self,
        prompt: str,
        top_k: int | None = None,
    ) -> List[Tuple[str, float]]:
        """Return ``top_k`` likely next tokens for ``prompt``.

        Each entry is a ``(token_string, probability)`` tuple, ordered
        from most to least likely.
        """
        prompt = (prompt or "").strip()
        if not prompt:
            raise SuggestionError("Prompt must not be empty.")

        top_k = top_k or self.top_k
        if top_k <= 0:
            raise SuggestionError("top_k must be positive.")

        tokenizer, model = self._ensure_loaded()
        return _predict_next_tokens(
            prompt=prompt,
            tokenizer=tokenizer,
            model=model,
            device=self._device,
            top_k=top_k,
        )

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #
    def _resolve_device(self, device: str) -> str:
        """Map the human-friendly device string to a torch device."""
        if device == "auto":
            return "cuda" if torch.cuda.is_available() else "cpu"
        if device in {"cpu", "cuda", "mps"}:
            return device
        logging.warning("Unknown device %r, falling back to CPU.", device)
        return "cpu"

    def _ensure_loaded(self):
        """Load the tokenizer and model the first time they are needed."""
        if self._model is not None and self._tokenizer is not None:
            return self._tokenizer, self._model

        logging.info("Loading model %s on %s …", self.model_name, self._device)
        tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        model = AutoModelForCausalLM.from_pretrained(
            self.model_name,
            trust_remote_code=True,
        )
        model.to(self._device)
        model.eval()                                    # inference mode

        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
            model.config.pad_token_id = model.config.eos_token_id

        self._tokenizer = tokenizer
        self._model = model
        return tokenizer, model


# --------------------------------------------------------------------------- #
# Pure-function inference
# --------------------------------------------------------------------------- #

def _predict_next_tokens(
    *,
    prompt: str,
    tokenizer,
    model,
    device: str,
    top_k: int,
) -> List[Tuple[str, float]]:
    """Compute the top-k next-token distribution for ``prompt``."""
    try:
        encoded = tokenizer(prompt, return_tensors="pt")
        input_ids = encoded["input_ids"].to(device)

        with torch.no_grad():
            outputs = model(input_ids)
    except Exception as exc:                           # noqa: BLE001
        raise SuggestionError(f"Model inference failed: {exc}") from exc

    next_token_logits = outputs.logits[:, -1, :]
    probabilities = torch.nn.functional.softmax(next_token_logits, dim=-1)
    top_probs, top_indices = torch.topk(probabilities, top_k)

    # ``tokenizer.decode`` is happy to take a tensor of ids, so we can
    # batch the decoding instead of looping in Python.
    tokens = tokenizer.decode(top_indices[0].tolist(), skip_special_tokens=False)
    decoded = _split_decoded_tokens(tokens, top_indices[0].tolist(), tokenizer)

    return list(zip(decoded, top_probs[0].tolist()))


def _split_decoded_tokens(
    decoded_string: str,
    ids: List[int],
    tokenizer,
) -> List[str]:
    """Best-effort: decode each id individually so callers see per-token text."""
    return [tokenizer.decode([i], skip_special_tokens=False) for i in ids]
