const LIST_ITEM_TAGS = new Set(["LI", "DT", "DD"]);
const LIST_CONTAINER_TAGS = new Set(["UL", "OL", "DL"]);

function collectListItemsInRange(range) {
  if (!range || !range.commonAncestorContainer) {
    return [];
  }
  const items = [];
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (!node || !LIST_ITEM_TAGS.has(node.tagName)) {
          return NodeFilter.FILTER_SKIP;
        }
        try {
          return range.intersectsNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        } catch (error) {
          return NodeFilter.FILTER_SKIP;
        }
      },
    },
    false
  );
  while (walker.nextNode()) {
    items.push(walker.currentNode);
  }
  return items;
}

export function prepareNodesForClozeInsertion(fragment, range) {
  if (!fragment) {
    return [];
  }
  const nodes = Array.from(fragment.childNodes || []);
  if (!nodes.length) {
    return nodes;
  }

  const listItems = collectListItemsInRange(range);
  const listGroupSources = new WeakMap();
  const normalizedNodes = [];
  let listItemIndex = 0;

  nodes.forEach((node) => {
    if (
      node &&
      node.nodeType === Node.ELEMENT_NODE &&
      LIST_ITEM_TAGS.has(node.tagName)
    ) {
      const originalListItem = listItems[listItemIndex] || null;
      if (originalListItem) {
        listItemIndex += 1;
        const originalListContainer = originalListItem.parentElement;
        if (
          originalListContainer &&
          LIST_CONTAINER_TAGS.has(originalListContainer.tagName)
        ) {
          let lastNode =
            normalizedNodes.length > 0
              ? normalizedNodes[normalizedNodes.length - 1]
              : null;
          if (listGroupSources.get(lastNode) !== originalListContainer) {
            const clonedListContainer = originalListContainer.cloneNode(false);
            listGroupSources.set(clonedListContainer, originalListContainer);
            normalizedNodes.push(clonedListContainer);
            lastNode = clonedListContainer;
          }
          if (lastNode) {
            lastNode.appendChild(node);
            return;
          }
        }
      }
    }

    normalizedNodes.push(node);
  });

  return normalizedNodes;
}
