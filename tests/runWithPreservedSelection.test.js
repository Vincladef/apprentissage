const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><body><div id="editor" contenteditable="true"></div></body>', {
  pretendToBeVisual: true,
});

const { window } = dom;
const { document } = window;

global.window = window;
global.document = document;
global.Node = window.Node;
global.Range = window.Range;

global.getSelection = () => window.getSelection();

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

const ui = { noteEditor: document.getElementById('editor') };
const state = {
  savedSelection: null,
  isEditorFocused: true,
};
let isImageResizeActive = false;

function getNodePath(root, node) {
  if (!root || !node) {
    return null;
  }
  const path = [];
  let current = node;
  while (current && current !== root) {
    const parent = current.parentNode;
    if (!parent) {
      return null;
    }
    const index = Array.prototype.indexOf.call(parent.childNodes, current);
    if (index === -1) {
      return null;
    }
    path.unshift(index);
    current = parent;
  }
  if (current !== root) {
    return null;
  }
  return path;
}

function getNodeFromPath(root, path) {
  if (!root || !Array.isArray(path)) {
    return null;
  }
  let current = root;
  for (let i = 0; i < path.length; i += 1) {
    const index = path[i];
    if (
      !current ||
      !current.childNodes ||
      typeof index !== 'number' ||
      index < 0 ||
      index >= current.childNodes.length
    ) {
      return null;
    }
    current = current.childNodes[index];
  }
  return current;
}

function normalizeRangeOffset(node, offset) {
  if (!node) {
    return 0;
  }
  const maxOffset =
    node.nodeType === Node.TEXT_NODE
      ? node.length
      : node.childNodes
      ? node.childNodes.length
      : 0;
  if (typeof offset !== 'number' || Number.isNaN(offset)) {
    return maxOffset;
  }
  if (offset < 0) {
    return 0;
  }
  if (offset > maxOffset) {
    return maxOffset;
  }
  return offset;
}

function captureSelection(container) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) {
    return null;
  }
  const preRange = range.cloneRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  const end = start + range.toString().length;
  const startPath = getNodePath(container, range.startContainer);
  const endPath = getNodePath(container, range.endContainer);
  return {
    start,
    end,
    startPath,
    endPath,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
  };
}

function restoreSelection(container, saved) {
  if (!saved) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let startNode = null;
  let endNode = null;
  let startOffset = saved.startOffset;
  let endOffset = saved.endOffset;

  const startPath = Array.isArray(saved.startPath) ? saved.startPath : null;
  const endPath = Array.isArray(saved.endPath) ? saved.endPath : null;

  if (startPath && endPath) {
    startNode = getNodeFromPath(container, startPath);
    endNode = getNodeFromPath(container, endPath);
    if (startNode && endNode) {
      startOffset = normalizeRangeOffset(startNode, startOffset);
      endOffset = normalizeRangeOffset(endNode, endOffset);
    } else {
      startNode = null;
      endNode = null;
    }
  }

  if (!startNode || !endNode) {
    let charIndex = 0;
    let fallbackStartNode = null;
    let fallbackEndNode = null;
    let fallbackStartOffset = 0;
    let fallbackEndOffset = 0;

    const traverse = (node) => {
      if (fallbackEndNode) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const nextCharIndex = charIndex + node.length;
        if (
          !fallbackStartNode &&
          typeof saved.start === 'number' &&
          saved.start >= charIndex &&
          saved.start <= nextCharIndex
        ) {
          fallbackStartNode = node;
          fallbackStartOffset = saved.start - charIndex;
        }
        if (
          !fallbackEndNode &&
          typeof saved.end === 'number' &&
          saved.end >= charIndex &&
          saved.end <= nextCharIndex
        ) {
          fallbackEndNode = node;
          fallbackEndOffset = saved.end - charIndex;
        }
        charIndex = nextCharIndex;
      } else {
        for (let i = 0; i < node.childNodes.length; i += 1) {
          traverse(node.childNodes[i]);
          if (fallbackEndNode) {
            break;
          }
        }
      }
    };

    traverse(container);

    startNode = fallbackStartNode || container;
    endNode = fallbackEndNode || startNode;
    startOffset = normalizeRangeOffset(startNode, fallbackStartOffset);
    endOffset = normalizeRangeOffset(endNode, fallbackEndOffset);
  }

  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);

  selection.removeAllRanges();
  selection.addRange(range);
}

function resolveSelectionOverride(override) {
  if (!override) {
    return null;
  }
  if (override instanceof window.Range) {
    return override;
  }
  if (override instanceof window.Node) {
    const range = document.createRange();
    range.setStartAfter(override);
    range.collapse(true);
    return range;
  }
  if (
    typeof override === 'object' &&
    override !== null &&
    override.node instanceof window.Node
  ) {
    const range = document.createRange();
    const position = override.position === 'before' ? 'before' : 'after';
    if (position === 'before') {
      range.setStartBefore(override.node);
    } else {
      range.setStartAfter(override.node);
    }
    range.collapse(true);
    return range;
  }
  if (
    typeof override === 'object' &&
    override !== null &&
    override.range instanceof window.Range
  ) {
    return override.range;
  }
  return null;
}

function rememberEditorSelection() {
  state.savedSelection = captureSelection(ui.noteEditor);
}

function restoreEditorSelection() {
  if (!ui.noteEditor || !state.savedSelection) {
    return false;
  }
  restoreSelection(ui.noteEditor, state.savedSelection);
  return true;
}

function focusEditorPreservingSelection(argument = undefined) {
  if (!ui.noteEditor) return;

  let savedSelectionOption = undefined;
  let selectionOverrideOption = null;

  if (
    argument &&
    typeof argument === 'object' &&
    !("start" in argument && "end" in argument) &&
    ("savedSelection" in argument ||
      "selectionOverride" in argument ||
      "range" in argument)
  ) {
    savedSelectionOption = argument.savedSelection;
    selectionOverrideOption =
      argument.selectionOverride !== undefined
        ? argument.selectionOverride
        : argument.range;
  } else if (argument instanceof window.Range) {
    savedSelectionOption = null;
    selectionOverrideOption = argument;
  } else {
    savedSelectionOption = argument;
  }

  const resolvedOverride = resolveSelectionOverride(selectionOverrideOption);
  const selectionToRestore =
    savedSelectionOption !== undefined ? savedSelectionOption : state.savedSelection;

  const selection = window.getSelection();

  if (selection && resolvedOverride) {
    const rangeToApply =
      typeof resolvedOverride.cloneRange === 'function'
        ? resolvedOverride.cloneRange()
        : resolvedOverride;
    selection.removeAllRanges();
    selection.addRange(rangeToApply);
  } else if (selection && selectionToRestore) {
    restoreSelection(ui.noteEditor, selectionToRestore);
  } else if (selection && !resolvedOverride && savedSelectionOption === null) {
    selection.removeAllRanges();
  }

  rememberEditorSelection();
}

function runWithPreservedSelection(operation) {
  if (typeof operation !== 'function') {
    return;
  }
  restoreEditorSelection();
  const preservedSelection = captureSelection(ui.noteEditor);
  const result = operation();
  let selectionOverride = null;
  if (result instanceof window.Range || result instanceof window.Node) {
    selectionOverride = result;
  } else if (result && typeof result === 'object') {
    if (result.selectionOverride) {
      selectionOverride = result.selectionOverride;
    } else if (result.wrapper) {
      selectionOverride = { node: result.wrapper, position: 'after' };
    }
  }
  const updatedSelection = captureSelection(ui.noteEditor);
  const selectionToPreserve =
    selectionOverride || !preservedSelection
      ? updatedSelection || preservedSelection
      : preservedSelection;
  focusEditorPreservingSelection({
    savedSelection: selectionToPreserve,
    selectionOverride,
  });
  return result;
}

function handleEditorInput() {}

function applyFontSize(size) {
  if (!size || !ui.noteEditor) return;
  runWithPreservedSelection(() => {
    document.execCommand('fontSize', false, '7');
    const fonts = ui.noteEditor.querySelectorAll('font[size="7"]');
    fonts.forEach((font) => {
      const span = document.createElement('span');
      span.style.fontSize = `${size}pt`;
      while (font.firstChild) {
        span.appendChild(font.firstChild);
      }
      font.replaceWith(span);
    });
    handleEditorInput();
  });
}

document.execCommand = (command, _ui, value) => {
  if (command !== 'fontSize') {
    return false;
  }
  const walker = document.createTreeWalker(
    ui.noteEditor,
    window.NodeFilter.SHOW_TEXT,
    null
  );
  let wrapped = false;
  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    if (!textNode.nodeValue) {
      continue;
    }
    const font = document.createElement('font');
    font.setAttribute('size', value);
    const parent = textNode.parentNode;
    parent.replaceChild(font, textNode);
    font.appendChild(textNode);
    wrapped = true;
  }
  return wrapped;
};

ui.noteEditor.innerHTML =
  '<p>Alpha <strong>bravo</strong></p><ul><li>Charlie</li><li>Delta</li></ul><p>Echo</p>';

const selection = window.getSelection();
selection.removeAllRanges();
const range = document.createRange();
const firstParagraphText = ui.noteEditor.querySelector('p').firstChild;
const lastParagraph = ui.noteEditor.querySelectorAll('p')[1];
const lastParagraphText = lastParagraph.firstChild;
range.setStart(firstParagraphText, 0);
range.setEnd(lastParagraphText, lastParagraphText.textContent.length);
selection.addRange(range);
state.savedSelection = captureSelection(ui.noteEditor);

const initialText = selection.toString();

applyFontSize(18);
const selectionAfterFirst = window.getSelection();
const afterFirstText = selectionAfterFirst.toString();

if (afterFirstText !== initialText) {
  console.error('Selection mismatch after first application');
  console.error('Expected:', JSON.stringify(initialText));
  console.error('Received :', JSON.stringify(afterFirstText));
  process.exit(1);
}

applyFontSize(18);
const afterSecondText = window.getSelection().toString();

if (afterSecondText !== initialText) {
  console.error('Selection mismatch after second application');
  console.error('Expected:', JSON.stringify(initialText));
  console.error('Received :', JSON.stringify(afterSecondText));
  process.exit(1);
}

console.log('Selection preserved across repeated font size applications.');
