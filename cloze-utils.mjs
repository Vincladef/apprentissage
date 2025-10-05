const LIST_ITEM_TAGS = new Set(["LI", "DT", "DD"]);
const LIST_CONTAINER_TAGS = new Set(["UL", "OL", "DL"]);

export const CLOZE_GROUP_ATTR = "data-group";
export const CLOZE_PRIORITY_ATTR = "data-priority";

export function generateClozeGroupId() {
  if (typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function") {
    return `g-${crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2);
  return `g-${random}`;
}

function isElementNode(node) {
  return Boolean(node && node.nodeType === Node.ELEMENT_NODE);
}

function isListItemElement(node) {
  return Boolean(isElementNode(node) && LIST_ITEM_TAGS.has(node.tagName));
}

function isListContainerElement(node) {
  return Boolean(isElementNode(node) && LIST_CONTAINER_TAGS.has(node.tagName));
}

function isListContentNode(node) {
  return isListItemElement(node) || isListContainerElement(node);
}

function getStartingElement(node) {
  if (!node) {
    return null;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    return node;
  }
  return node.parentElement || null;
}

function findAncestorElement(node, predicate) {
  let current = getStartingElement(node);
  while (current) {
    if (predicate(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function findListContainerInRange(range) {
  if (!range) {
    return null;
  }
  const startContainer = findAncestorElement(range.startContainer, isListContainerElement);
  const endContainer = findAncestorElement(range.endContainer, isListContainerElement);
  if (startContainer && (!endContainer || startContainer === endContainer)) {
    return startContainer;
  }
  if (endContainer && !startContainer) {
    return endContainer;
  }
  if (startContainer && endContainer && startContainer === endContainer) {
    return startContainer;
  }
  return null;
}

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

export function resolveListWrapperForNodes(nodes, range) {
  const normalizedNodes = Array.isArray(nodes) ? nodes : Array.from(nodes || []);
  if (!normalizedNodes.length) {
    return { wrapper: null, nodesToAppend: [], isListWrapper: false };
  }

  const elementNodes = normalizedNodes.filter(isElementNode);
  if (!elementNodes.length) {
    return { wrapper: null, nodesToAppend: [], isListWrapper: false };
  }

  const containsOnlyListNodes = elementNodes.every(isListContentNode);
  if (!containsOnlyListNodes) {
    return { wrapper: null, nodesToAppend: [], isListWrapper: false };
  }

  const listContainers = elementNodes.filter(isListContainerElement);
  if (listContainers.length === 1) {
    const wrapper = listContainers[0];
    const nodesToAppend = normalizedNodes.filter((node) => node !== wrapper);
    return { wrapper, nodesToAppend, isListWrapper: true };
  }

  if (listContainers.length === 0) {
    const sourceContainer = findListContainerInRange(range);
    if (sourceContainer) {
      const wrapper = sourceContainer.cloneNode(false);
      return {
        wrapper,
        nodesToAppend: normalizedNodes,
        isListWrapper: true,
      };
    }
  }

  return { wrapper: null, nodesToAppend: [], isListWrapper: false };
}

export const __TEST_ONLY__ = {
  isListItemElement,
  isListContainerElement,
  findListContainerInRange,
};
