const { JSDOM } = require('jsdom');

(async () => {
  const { prepareNodesForClozeInsertion } = await import('../cloze-utils.mjs');

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
    '<p>Avant</p><ul><li>Alpha</li><li>Bravo</li><li>Charlie</li></ul><p>Après</p>';

  const list = editor.querySelector('ul');
  const secondItem = list.children[1];
  const thirdItem = list.children[2];

  const selection = window.getSelection();
  selection.removeAllRanges();
  const range = document.createRange();
  range.setStartBefore(secondItem);
  range.setEndAfter(thirdItem);
  selection.addRange(range);

  const fragment = range.cloneContents();
  const nodesToInsert = prepareNodesForClozeInsertion(fragment, range);

  const wrapper = document.createElement('div');
  nodesToInsert.forEach((node) => {
    wrapper.appendChild(node);
  });

  if (!wrapper.firstElementChild || wrapper.childElementCount !== 1) {
    console.error('Expected a single cloned list container in the wrapper.');
    process.exit(1);
  }

  const pendingToken = 'test-token';
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
    console.error('Inserted cloze wrapper not found.');
    process.exit(1);
  }

  const initializeClozeElement = (cloze, { block = false } = {}) => {
    cloze.classList.add('cloze');
    if (block) {
      cloze.classList.add('cloze--block');
    }
    return cloze;
  };

  initializeClozeElement(insertedCloze, { block: true });

  const clozes = editor.querySelectorAll('.cloze');
  if (clozes.length !== 1) {
    console.error(`Expected a single cloze element, received ${clozes.length}.`);
    process.exit(1);
  }

  const clonedList = clozes[0].firstElementChild;
  if (!clonedList || clonedList.tagName !== 'UL') {
    console.error('Expected the cloze to wrap a UL element.');
    process.exit(1);
  }

  const clonedItems = Array.from(clonedList.children).map((node) => node.textContent);
  if (clonedItems.join(',') !== 'Bravo,Charlie') {
    console.error('Unexpected list items within the cloze:', clonedItems);
    process.exit(1);
  }

  console.log('Partial list selection produces a single cloze element.');
})();
