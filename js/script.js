const textEl = document.getElementById("text");
const inputEl = document.getElementById("typingInput");

let tokens = [];
let jumps = [];
let hyperlinks = [];
let expandItems = [];
let caretPos = 0;
let preferredX = null;
let openExpands = [];

function isSkippable(char) {
  return char === " " || char === "·";
}

function foldChar(char) {
  return (char ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function charsMatch(a, b) {
  return foldChar(a) === foldChar(b);
}

function resetPreferredX() {
  preferredX = null;
}

function getCurrentTargetIndex() {
  for (let i = caretPos; i < tokens.length; i++) {
    if (tokens[i].kind === "target") {
      return i;
    }
  }
  return -1;
}

function getTargetTokenIndexByOriginalIndex(originalIndex) {
  return tokens.findIndex(
    (token) => token.kind === "target" && token.originalIndex === originalIndex
  );
}

function getCaretPosFromOriginalIndex(originalIndex) {
  const tokenIndex = getTargetTokenIndexByOriginalIndex(originalIndex);
  return tokenIndex === -1 ? tokens.length : tokenIndex;
}

function getRangeItemForOriginalIndex(items, originalIndex) {
  return items.find(
    (item) => originalIndex >= item.startC && originalIndex <= item.endC
  );
}

function getTargetTokensInRange(item) {
  return tokens.filter(
    (token) =>
      token.kind === "target" &&
      token.originalIndex >= item.startC &&
      token.originalIndex <= item.endC
  );
}

function isRangeActivated(item) {
  const rangeTokens = getTargetTokensInRange(item);

  if (rangeTokens.length === 0) {
    return false;
  }

  return rangeTokens.every((token) => token.state === "correct");
}

function getRenderedNodeByOriginalIndex(originalIndex) {
  return textEl.querySelector(`[data-original-index="${originalIndex}"]`);
}

function isSameRenderedLine(nodeA, nodeB, tolerance = 2) {
  if (!nodeA || !nodeB) return false;
  return Math.abs(
    nodeA.getBoundingClientRect().top - nodeB.getBoundingClientRect().top
  ) <= tolerance;
}

function toggleOpenExpandOnSameLine(clickedNode, newExpandEntry) {
  let foundSameEntry = false;

  openExpands = openExpands.filter((entry) => {
    const anchor = getRenderedNodeByOriginalIndex(entry.anchorOriginalIndex);

    if (!isSameRenderedLine(clickedNode, anchor)) {
      return true;
    }

    const isSameEntry =
      entry.startC === newExpandEntry.startC &&
      entry.endC === newExpandEntry.endC &&
      entry.anchorOriginalIndex === newExpandEntry.anchorOriginalIndex;

    if (isSameEntry) {
      foundSameEntry = true;
    }

    return false;
  });

  if (!foundSameEntry) {
    openExpands.push(newExpandEntry);
  }
}

function makeSpan(token, index, currentIndex) {
  let el = document.createElement("span");
  el.textContent = token.char;
  el.dataset.index = String(index);

  if (token.kind === "inserted") {
    el.classList.add("inserted");
  }

  if (token.kind === "target") {
    el.dataset.originalIndex = String(token.originalIndex);

    if (token.state === "correct") {
      el.classList.add("correct");
    }

    const hyperlink = getRangeItemForOriginalIndex(hyperlinks, token.originalIndex);
    if (hyperlink && isRangeActivated(hyperlink)) {
      const a = document.createElement("a");
      a.textContent = token.char;
      a.href = hyperlink.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "hyperlink-link";
      a.dataset.index = String(index);
      a.dataset.originalIndex = String(token.originalIndex);
      a.dataset.link = hyperlink.link;
      el = a;

      if (token.state === "correct") {
        el.classList.add("correct");
      }
    }

    const expandItem = getRangeItemForOriginalIndex(expandItems, token.originalIndex);
    if (expandItem && isRangeActivated(expandItem)) {
      el.classList.add("expand-link");
      el.dataset.expandStart = String(expandItem.startC);
    }

    const jump = getRangeItemForOriginalIndex(jumps, token.originalIndex);
    if (jump && isRangeActivated(jump)) {
      el.classList.add("jump-link");
      el.dataset.jumpTo = String(jump.jumpTo);
    }
  }

  if (index === currentIndex) {
    el.classList.add("current");
  }

  return el;
}

function insertExpandPanels() {
  if (openExpands.length === 0) return;

  const entries = [...openExpands].sort(
    (a, b) => a.anchorOriginalIndex - b.anchorOriginalIndex
  );

  for (const entry of entries) {
    const anchor = getRenderedNodeByOriginalIndex(entry.anchorOriginalIndex);
    if (!anchor) continue;

    const nodes = [...textEl.querySelectorAll("[data-index]")];
    const anchorPos = nodes.indexOf(anchor);
    if (anchorPos === -1) continue;

    const tolerance = 2;
    const anchorTop = anchor.getBoundingClientRect().top;
    let lastOnLine = anchor;

    for (let i = anchorPos + 1; i < nodes.length; i++) {
      const top = nodes[i].getBoundingClientRect().top;

      if (Math.abs(top - anchorTop) <= tolerance) {
        lastOnLine = nodes[i];
      } else if (top > anchorTop + tolerance) {
        break;
      }
    }

    const panel = document.createElement("div");
    panel.className = "expand-panel";
    panel.dataset.anchorOriginalIndex = String(entry.anchorOriginalIndex);

    if (entry.note) {
      const title = document.createElement("div");
      title.className = "expand-title";
      panel.appendChild(title);
    }

    const gallery = document.createElement("div");
    gallery.className = "expand-gallery";

    for (const photo of entry.photos) {
      const img = document.createElement("img");
      img.src = photo;
      img.alt = entry.note || "Expanded image";
      img.loading = "lazy";
      gallery.appendChild(img);
    }

    panel.appendChild(gallery);
    lastOnLine.insertAdjacentElement("afterend", panel);
  }
}

function renderText() {
  textEl.innerHTML = "";
  const currentIndex = getCurrentTargetIndex();

  tokens.forEach((token, index) => {
    textEl.appendChild(makeSpan(token, index, currentIndex));
  });

  insertExpandPanels();
}

function typeCharacter(char) {
  const currentIndex = getCurrentTargetIndex();
  if (currentIndex === -1) return;

  const currentToken = tokens[currentIndex];
  resetPreferredX();

  if (char === " " && isSkippable(currentToken.char)) {
    let i = currentIndex;

    while (
      i < tokens.length &&
      tokens[i].kind === "target" &&
      isSkippable(tokens[i].char)
    ) {
      tokens[i].state = "correct";
      i++;
    }

    caretPos = i;
    renderText();
    return;
  }

  if (charsMatch(char, currentToken.char)) {
    currentToken.state = "correct";
    caretPos = currentIndex + 1;
  } else {
    tokens.splice(caretPos, 0, {
      kind: "inserted",
      char
    });
    caretPos++;
  }

  renderText();
}

function backspace() {
  if (caretPos === 0) return;

  resetPreferredX();

  let i = caretPos - 1;

  if (tokens[i]?.kind === "inserted") {
    tokens.splice(i, 1);
    caretPos = i;
    renderText();
    return;
  }

  while (
    i >= 0 &&
    tokens[i].kind === "target" &&
    tokens[i].state === "correct" &&
    isSkippable(tokens[i].char)
  ) {
    tokens[i].state = "pending";
    i--;
  }

  if (i >= 0) {
    if (tokens[i].kind === "inserted") {
      tokens.splice(i, 1);
      caretPos = i;
    } else {
      tokens[i].state = "pending";
      caretPos = i;
    }
  } else {
    caretPos = 0;
  }

  renderText();
}

function del() {
  if (caretPos >= tokens.length) return;

  resetPreferredX();

  const next = tokens[caretPos];

  if (next.kind === "inserted") {
    tokens.splice(caretPos, 1);
  } else {
    next.state = "pending";
  }

  renderText();
}

function moveCaretLeft() {
  if (caretPos === 0) return;

  resetPreferredX();

  let newPos = caretPos - 1;

  while (
    newPos > 0 &&
    tokens[newPos - 1]?.kind === "target" &&
    tokens[newPos - 1].state === "correct" &&
    isSkippable(tokens[newPos - 1].char)
  ) {
    newPos--;
  }

  caretPos = newPos;
  renderText();
}

function moveCaretRight() {
  if (caretPos >= tokens.length) return;

  resetPreferredX();

  let newPos = caretPos + 1;

  while (
    newPos < tokens.length &&
    tokens[newPos - 1]?.kind === "target" &&
    tokens[newPos - 1].state === "correct" &&
    isSkippable(tokens[newPos - 1].char)
  ) {
    newPos++;
  }

  caretPos = newPos;
  renderText();
}

function findCaretTargetVertically(direction) {
  const nodes = [...textEl.querySelectorAll("[data-index]")];
  if (!nodes.length) return caretPos;

  let anchorIndex = Math.min(caretPos, nodes.length - 1);
  if (caretPos === nodes.length && nodes.length > 0) {
    anchorIndex = nodes.length - 1;
  }

  const anchor = nodes[anchorIndex];
  if (!anchor) return caretPos;

  const anchorRect = anchor.getBoundingClientRect();
  const anchorY = anchorRect.top;

  if (preferredX === null) {
    preferredX = anchorRect.left + anchorRect.width / 2;
  }

  const targetX = preferredX;
  let bestIndex = caretPos;
  let bestDistance = Infinity;

  for (let i = 0; i < nodes.length; i++) {
    const rect = nodes[i].getBoundingClientRect();

    const isTargetLine =
      direction === "up"
        ? rect.top < anchorY - 2
        : rect.top > anchorY + 2;

    if (!isTargetLine) continue;

    const dy = Math.abs(rect.top - anchorY);
    const dx = Math.abs(rect.left + rect.width / 2 - targetX);
    const score = dy * 10000 + dx;

    if (score < bestDistance) {
      bestDistance = score;
      bestIndex = i;
    }
  }

  if (bestDistance === Infinity) {
    return caretPos;
  }

  const bestNode = nodes[bestIndex];
  const bestRect = bestNode.getBoundingClientRect();
  const midpoint = bestRect.left + bestRect.width / 2;

  return targetX < midpoint ? bestIndex : bestIndex + 1;
}

function moveCaretUp() {
  caretPos = findCaretTargetVertically("up");
  renderText();
}

function moveCaretDown() {
  caretPos = findCaretTargetVertically("down");
  renderText();
}

async function loadData() {
  try {
    const [textResponse, jsonResponse] = await Promise.all([
      fetch("./js/text.txt"),
      fetch("./js/links.json")
    ]);

    if (!textResponse.ok) {
      throw new Error(`TEXT HTTP ${textResponse.status}`);
    }

    if (!jsonResponse.ok) {
      throw new Error(`DATA HTTP ${jsonResponse.status}`);
    }

    const text = (await textResponse.text()).trim();
    const data = await jsonResponse.json();

    jumps = data.jumps || [];
    hyperlinks = data.hyperlinks || [];
    expandItems = data.expand || [];

    tokens = [...text].map((char, index) => ({
      kind: "target",
      char,
      state: "pending",
      originalIndex: index
    }));

    caretPos = 0;
    preferredX = null;
    openExpands = [];
    renderText();
  } catch (error) {
    console.error("Failed to load data:", error);
    textEl.textContent = "FAILED TO LOAD TEXT / DATA.";
  }
}

inputEl.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  switch (event.key) {
    case "Backspace":
      event.preventDefault();
      backspace();
      break;

    case "Delete":
      event.preventDefault();
      del();
      break;

    case "ArrowLeft":
      event.preventDefault();
      moveCaretLeft();
      break;

    case "ArrowRight":
      event.preventDefault();
      moveCaretRight();
      break;

    case "ArrowUp":
      event.preventDefault();
      moveCaretUp();
      break;

    case "ArrowDown":
      event.preventDefault();
      moveCaretDown();
      break;

    case "Home":
      event.preventDefault();
      resetPreferredX();
      caretPos = 0;
      renderText();
      break;

    case "End":
      event.preventDefault();
      resetPreferredX();
      caretPos = tokens.length;
      renderText();
      break;

    default:
      if (event.key.length === 1) {
        event.preventDefault();
        typeCharacter(event.key);
      }
      break;
  }
});

textEl.addEventListener("click", (event) => {
  if (event.target.closest(".expand-panel")) {
    return;
  }

  const node = event.target.closest("[data-index]");
  inputEl.focus();

  if (!node) return;

  if (node.dataset.expandStart !== undefined) {
    event.preventDefault();

    const expandStart = Number(node.dataset.expandStart);
    const item = expandItems.find((x) => x.startC === expandStart);

    if (item) {
      const clickedOriginalIndex = Number(node.dataset.originalIndex);

      toggleOpenExpandOnSameLine(node, {
        ...item,
        anchorOriginalIndex: clickedOriginalIndex
      });

      resetPreferredX();
      renderText();
      return;
    }
  }

  if (node.dataset.jumpTo !== undefined) {
    event.preventDefault();
    caretPos = getCaretPosFromOriginalIndex(Number(node.dataset.jumpTo));
    resetPreferredX();
    renderText();
    return;
  }

  if (node.dataset.link) {
    return;
  }

  const index = Number(node.dataset.index);
  const rect = node.getBoundingClientRect();
  const midpoint = rect.left + rect.width / 2;

  caretPos = event.clientX < midpoint ? index : index + 1;
  resetPreferredX();
  renderText();
});

document.body.addEventListener("click", () => {
  inputEl.focus();
});

loadData();
inputEl.focus();