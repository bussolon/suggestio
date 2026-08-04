const SUGGEST_URL = 'http://127.0.0.1:5050/suggest';
const MAX_SUGGESTIONS = 10;
const MIN_CHARS_FOR_SUGGESTION = 20;

const editor = document.getElementById('editor');
const popup = document.getElementById('suggestion-popup');

let allSuggestions = [];
let visibleSuggestions = [];
let selectedIndex = 0;
let popupVisible = false;
let fetchToken = 0;
let activePrefix = '';

editor.addEventListener('keydown', onEditorKeyDown);

function formatSuggestionLabel(rawText) {
	return rawText
}

function onEditorKeyDown(event) {
  const key = event.key;
  const hasModifier = event.ctrlKey || event.metaKey || event.altKey;

  if (key === ' ' && !hasModifier) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;

    // Send the text before the newly typed space. The backend response
    // contains suggestions with a leading space.
    const textWithoutSelection = editor.value.slice(0, start) + editor.value.slice(end);

    if (textWithoutSelection.length + 1 > MIN_CHARS_FOR_SUGGESTION) {
      clearSuggestions();
      fetchSuggestions(textWithoutSelection);
    } else {
      clearSuggestions();
    }

    return;
  }

  if (key === 'Tab' || key === 'ArrowRight') {
    if (popupVisible && visibleSuggestions.length > 0) {
      event.preventDefault();
      acceptSelectedSuggestion();
    }
    return;
  }

  if (key === 'ArrowDown' || key === 'ArrowUp') {
    if (popupVisible && visibleSuggestions.length > 0) {
      event.preventDefault();

      const nextIndex = key === 'ArrowDown'
        ? selectedIndex + 1
        : selectedIndex - 1;

      if (nextIndex >= 0 && nextIndex < visibleSuggestions.length) {
        setSelectedIndex(nextIndex);
      }
    }
    return;
  }

  if (key === 'ArrowLeft') {
    if (popupVisible || allSuggestions.length > 0) {
      event.preventDefault();
      clearSuggestions();
    }
    return;
  }

  if (!hasModifier && isAlphabetic(key)) {
    activePrefix = getPredictedAlphaPrefix(key);

    if (allSuggestions.length > 0) {
      window.setTimeout(() => {
        filterVisibleSuggestions(activePrefix);
      }, 0);
    }

    return;
  }
}

function isAlphabetic(key) {
  return key.length === 1 && /^[a-zA-Z]$/.test(key);
}

function getPredictedAlphaPrefix(key) {
  const start = editor.selectionStart;
  const textBeforeNewCaret = editor.value.slice(0, start) + key;
  const lastSpace = textBeforeNewCaret.lastIndexOf(' ');

  return lastSpace === -1 ? '' : textBeforeNewCaret.slice(lastSpace + 1);
}

async function fetchSuggestions(fullText) {
  const token = ++fetchToken;

  try {
    const response = await fetch(`${SUGGEST_URL}?text=${encodeURIComponent(fullText)}`);

    if (!response.ok) {
      if (token === fetchToken) {
        clearSuggestions();
      }
      return;
    }

    const data = await response.json();

    if (token !== fetchToken) {
      return;
    }

    allSuggestions = Array.isArray(data) ? data : [];
    filterVisibleSuggestions(activePrefix);
  } catch (error) {
    console.log(error)
    if (token === fetchToken) {
      clearSuggestions();
    }
  }
}

function filterVisibleSuggestions(prefix = activePrefix) {
  if (!prefix) {
    showSuggestions(allSuggestions);
    return;
  }

  const lowerCasePrefix = prefix.toLowerCase();
  const myFiltered = allSuggestions.filter(item => item[0].trim().toLowerCase().startsWith(lowerCasePrefix))
  showSuggestions(myFiltered);
/*
  const filtered = allSuggestions.filter(([rawText]) => {
    return formatSuggestionLabel(rawText).toLowerCase().startsWith(lowerCasePrefix);
  });
  showSuggestions(filtered);
*/
}

function showSuggestions(suggestions) {
  visibleSuggestions = Array.isArray(suggestions)
    ? suggestions.slice(0, MAX_SUGGESTIONS)
    : [];

  if (visibleSuggestions.length === 0) {
    hidePopup();
    return;
  }

  selectedIndex = 0;
  popup.innerHTML = '';

  visibleSuggestions.forEach(([rawText, probability], index) => {
    const item = document.createElement('div');

    item.className = index === selectedIndex
      ? 'suggestion selected'
      : 'suggestion';

    item.dataset.sug = rawText == null ? '' : rawText;

    item.textContent = `${formatSuggestionLabel(rawText)} (${Number(probability || 0).toFixed(2)})`;

    item.addEventListener('mousedown', (event) => event.preventDefault());

    item.addEventListener('keydown', onSuggestionKeyDown);

    item.addEventListener('click', (event) => {
      event.preventDefault();

      selectedIndex = index;
      acceptSelectedSuggestion();

      editor.focus();
    });

    popup.appendChild(item);
  });

  popup.style.display = 'block';
  popupVisible = true;

  positionPopupAtCaret();
}

function onSuggestionKeyDown(event) {
  onEditorKeyDown(event);
}

function acceptSelectedSuggestion() {
  if (visibleSuggestions.length === 0) {
    return;
  }

  const [rawText] = visibleSuggestions[selectedIndex];

  const selectionEnd = editor.selectionEnd;
  const textBeforeCaret = editor.value.slice(0, selectionEnd);

  const lastSpace = textBeforeCaret.lastIndexOf(' ');
  const replaceStart = lastSpace === -1 ? selectionEnd : lastSpace;

  const before = editor.value.slice(0, replaceStart);
  const after = editor.value.slice(selectionEnd);
  const replacement = getReplacementText(rawText, lastSpace !== -1);

  editor.value = before + replacement + after;

  const caretPosition = before.length + replacement.length;
  editor.setSelectionRange(caretPosition, caretPosition);

  positionPopupAtCaret();
  clearSuggestions();

  editor.focus();
}

function getReplacementText(rawText, hasSpaceContext) {
  let replacement = rawText == null ? '' : String(rawText);

  // The specification says no trailing space is added.
  replacement = replacement.replace(/\s+$/, '');

  // If the backend returns the word without a leading space, preserve
  // the space before the replaced prefix.
  if (hasSpaceContext && replacement.length > 0 && !/^\s/.test(replacement)) {
    replacement = ` ${replacement}`;
  }

  return replacement;
}

function setSelectedIndex(index) {
  const previousItem = popup.children[selectedIndex];

  if (previousItem) {
    previousItem.classList.remove('selected');
  }

  selectedIndex = index;

  const currentItem = popup.children[selectedIndex];

  if (currentItem) {
    currentItem.classList.add('selected');
    currentItem.scrollIntoView({ block: 'nearest' });
  }
}

function clearSuggestions() {
  invalidatePendingFetches();

  allSuggestions = [];
  visibleSuggestions = [];
  selectedIndex = 0;
  activePrefix = '';

  hidePopup();
}

function invalidatePendingFetches() {
  fetchToken += 1;
}

function hidePopup() {
  popup.style.display = 'none';
  popupVisible = false;
}

function positionPopupAtCaret() {
  const coordinates = getCaretCoordinates(editor, editor.selectionEnd);

  popup.style.top = `${coordinates.top}px`;
  popup.style.left = `${coordinates.left + 10}px`;
}

function getCaretCoordinates(textarea, position) {
  const mirror = document.createElement('div');
  const computedStyle = window.getComputedStyle(textarea);

  const properties = [
    'boxSizing',
    'width',
    'height',
    'overflowX',
    'overflowY',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontFamily',
    'fontSize',
    'fontStyle',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'whiteSpace',
    'wordWrap',
    'overflowWrap',
    'tabSize',
    'textTransform'
  ];

  properties.forEach((property) => {
    mirror.style[property] = computedStyle[property];
  });

  mirror.style.position = 'absolute';
  mirror.style.top = '-9999px';
  mirror.style.left = '-9999px';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.setAttribute('aria-hidden', 'true');

  mirror.textContent = textarea.value.slice(0, position);

  const marker = document.createElement('span');
  marker.textContent = textarea.value.slice(position) || '.';

  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const textareaRect = textarea.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();

  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

  const top = textareaRect.top + scrollTop + (markerRect.top - mirrorRect.top) - textarea.scrollTop;
  const left = textareaRect.left + scrollLeft + (markerRect.left - mirrorRect.left) - textarea.scrollLeft;

  document.body.removeChild(mirror);

  return { top, left };
}
