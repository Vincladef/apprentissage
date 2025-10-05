const { JSDOM } = require('jsdom');

(async () => {
  const {
    prepareNodesForClozeInsertion,
    resolveListWrapperForNodes,
  } = await import('../cloze-utils.mjs');

  const dom = new JSDOM(
    '<!DOCTYPE html><body><div id="editor" contenteditable="true"></div></body>',
    { pretendToBeVisual: true }
  );

  const { window } = dom;
  const { document } = window;

  global.window = window;
  global.document = document;
  global.Node = window.Node;
  global.NodeFilter = window.NodeFilter;

  const editor = document.getElementById('editor');
  editor.innerHTML =
    '<p>Intro</p><ul><li>Alpha</li><li>Bravo</li><li>Charlie</li></ul><p>Outro</p>';

  const list = editor.querySelector('ul');
  const selectedItem = list.children[1];

  const selection = window.getSelection();
  selection.removeAllRanges();
  const range = document.createRange();
  range.setStartBefore(selectedItem);
  range.setEndAfter(selectedItem);
  selection.addRange(range);

  const fragment = range.cloneContents();
  const nodesToInsert = prepareNodesForClozeInsertion(fragment, range);
  const resolution = resolveListWrapperForNodes(nodesToInsert, range);

  if (!resolution.wrapper || !resolution.isListWrapper) {
    console.error('Expected to resolve a list-compatible wrapper for the selection.');
    process.exit(1);
  }

  const wrapper = resolution.wrapper;
  const nodesToAppend = Array.isArray(resolution.nodesToAppend)
    ? resolution.nodesToAppend
    : [];
  nodesToAppend.forEach((node) => {
    if (node !== wrapper) {
      wrapper.appendChild(node);
    }
  });

  const pendingToken = 'single-item-token';
  wrapper.setAttribute('data-cloze-pending', pendingToken);
  wrapper.setAttribute('data-cloze-pending-block', '1');

  const container = document.createElement('div');
  container.appendChild(wrapper);
  const htmlToInsert = container.innerHTML;

  range.deleteContents();
  const tempContainer = document.createElement('div');
  tempContainer.innerHTML = htmlToInsert;
  const insertedWrapper = tempContainer.firstElementChild;
  range.insertNode(insertedWrapper);

  const insertedCloze = editor.querySelector(
    `[data-cloze-pending="${pendingToken}"]`
  );

  if (!insertedCloze) {
    console.error('Inserted list wrapper not found.');
    process.exit(1);
  }

  const initializeClozeElement = (cloze, { block = false } = {}) => {
    cloze.classList.add('cloze');
    const shouldBeBlock =
      block || ['UL', 'OL', 'DL'].includes(cloze.tagName) || cloze.matches('div, p');
    if (shouldBeBlock) {
      cloze.classList.add('cloze--block');
    } else {
      cloze.classList.remove('cloze--block');
    }
    cloze.dataset.placeholder = '[…]';
    cloze.dataset.score = '0';
    cloze.dataset.priority = 'medium';
    return cloze;
  };

  initializeClozeElement(insertedCloze, { block: true });
  insertedCloze.removeAttribute('data-cloze-pending');
  insertedCloze.removeAttribute('data-cloze-pending-block');

  const clozes = editor.querySelectorAll('.cloze');
  if (clozes.length !== 1) {
    console.error(`Expected a single cloze element, received ${clozes.length}.`);
    process.exit(1);
  }

  const createdCloze = clozes[0];
  if (createdCloze.tagName !== 'UL') {
    console.error('Expected the wrapper to be a UL element.', createdCloze.outerHTML);
    process.exit(1);
  }

  const strayItems = Array.from(editor.querySelectorAll('li')).filter((item) => {
    return item.textContent.trim() === 'Bravo' && !item.closest('.cloze');
  });

  if (strayItems.length !== 0) {
    console.error('The original list item still exists outside of the cloze wrapper.');
    process.exit(1);
  }

  console.log('Single list item selection produces a list-based cloze wrapper.');
})();
