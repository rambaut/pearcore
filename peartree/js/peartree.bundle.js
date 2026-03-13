(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // peartree/js/treeio.js
  function parseNewick(newickString, tipNameMap = null) {
    const tokens = newickString.split(/\s*('[^']*'|"[^"]*"|;|\(|\)|,|:|=|\[&|\]|\{|\})\s*/);
    let level = 0;
    let currentNode = null;
    let nodeStack = [];
    let labelNext = false;
    let lengthNext = false;
    let inAnnotation = false;
    let annotationKeyNext = true;
    let annotationKey = null;
    let isAnnotationARange = false;
    let idCounter = 0;
    function newId() {
      return `n${idCounter++}`;
    }
    for (const token of tokens.filter((t) => t.length > 0)) {
      if (inAnnotation) {
        if (token === "=") {
          annotationKeyNext = false;
        } else if (token === ",") {
          if (!isAnnotationARange) annotationKeyNext = true;
        } else if (token === "{") {
          isAnnotationARange = true;
          currentNode.annotations[annotationKey] = [];
        } else if (token === "}") {
          isAnnotationARange = false;
        } else if (token === "]") {
          inAnnotation = false;
          annotationKeyNext = true;
        } else {
          let t = token;
          if (t.startsWith('"') || t.startsWith("'")) t = t.slice(1);
          if (t.endsWith('"') || t.endsWith("'")) t = t.slice(0, -1);
          if (annotationKeyNext) {
            annotationKey = t.replace(".", "_");
          } else {
            if (isAnnotationARange) {
              if (t === "?" || t === "") {
                currentNode.annotations[annotationKey].push(null);
              } else {
                const arrNum = Number(t);
                currentNode.annotations[annotationKey].push(!isNaN(arrNum) ? arrNum : t);
              }
            } else {
              if (t === "?" || t === "") {
                currentNode.annotations[annotationKey] = null;
              } else {
                const num = Number(t);
                currentNode.annotations[annotationKey] = !isNaN(num) ? num : t;
              }
            }
          }
        }
      } else if (token === "(") {
        const node = { id: newId(), level, parent: currentNode, children: [], annotations: {} };
        level++;
        if (currentNode) nodeStack.push(currentNode);
        currentNode = node;
      } else if (token === ",") {
        labelNext = false;
        const parent = nodeStack.pop();
        parent.children.push(currentNode);
        currentNode = parent;
      } else if (token === ")") {
        labelNext = false;
        const parent = nodeStack.pop();
        parent.children.push(currentNode);
        level--;
        currentNode = parent;
        labelNext = true;
      } else if (token === ":") {
        labelNext = false;
        lengthNext = true;
      } else if (token === ";") {
        if (level > 0) throw new Error("Unbalanced brackets in Newick string");
        break;
      } else if (token === "[&") {
        inAnnotation = true;
      } else {
        if (lengthNext) {
          currentNode.length = parseFloat(token);
          lengthNext = false;
        } else if (labelNext) {
          currentNode.label = token;
          if (!token.startsWith("#")) {
            currentNode.annotations["_node_label"] = token;
          } else {
            currentNode.id = token.slice(1);
          }
          labelNext = false;
        } else {
          if (!currentNode.children) currentNode.children = [];
          let name = tipNameMap ? tipNameMap.get(token) || token : token;
          name = name.replace(/^['"]|['"]$/g, "").trim().replace(/'/g, "");
          const externalNode = {
            id: newId(),
            name,
            parent: currentNode,
            annotations: {}
          };
          if (currentNode) nodeStack.push(currentNode);
          currentNode = externalNode;
        }
      }
    }
    if (level > 0) throw new Error("Unbalanced brackets in Newick string");
    const DATE_RE = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;
    function annotateDates(root) {
      const stack = [root];
      while (stack.length) {
        const node = stack.pop();
        const isTip = !node.children || node.children.length === 0;
        if (isTip && node.name && node.name.includes("|")) {
          const parts = node.name.split("|");
          const last = parts[parts.length - 1].trim();
          if (DATE_RE.test(last) && !("date" in node.annotations)) {
            node.annotations["date"] = last;
          }
        }
        if (node.children) {
          for (let j = node.children.length - 1; j >= 0; j--) stack.push(node.children[j]);
        }
      }
    }
    if (currentNode) annotateDates(currentNode);
    return currentNode;
  }
  function parseNexus(nexus) {
    const trees = [];
    const nexusTokens = nexus.split(
      /\s*(?:^|(?<=\s))begin(?=\s)|(?<=\s)end(?=\s*;)\s*;/gi
    );
    const rawText = nexus;
    const lines = rawText.split("\n");
    let inTreesBlock = false;
    const tipNameMap = /* @__PURE__ */ new Map();
    let inTranslate = false;
    let peartreeSettings = null;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const lower = line.toLowerCase();
      if (lower === "begin trees;" || lower.startsWith("begin trees;")) {
        inTreesBlock = true;
        inTranslate = false;
        continue;
      }
      if (inTreesBlock) {
        if (lower === "end;" || lower === "end") {
          inTreesBlock = false;
          continue;
        }
        const ptMatch = line.match(/^\[peartree=(\{.*\})\]$/i);
        if (ptMatch) {
          try {
            peartreeSettings = JSON.parse(ptMatch[1]);
          } catch {
          }
          continue;
        }
        if (lower === "translate") {
          inTranslate = true;
          continue;
        }
        if (inTranslate) {
          if (line === ";") {
            inTranslate = false;
            continue;
          }
          const clean = line.replace(/,$/, "").replace(/;$/, "");
          const parts = clean.split(/\s+/);
          if (parts.length >= 2) tipNameMap.set(parts[0], parts.slice(1).join(" "));
          if (line.endsWith(";")) inTranslate = false;
        } else {
          const idx = line.indexOf("(");
          if (idx !== -1) {
            const newickStr = line.slice(idx);
            const root = parseNewick(
              newickStr,
              tipNameMap.size > 0 ? tipNameMap : null
            );
            trees.push({ root, tipNameMap, peartreeSettings });
          }
        }
      }
    }
    if (peartreeSettings) {
      for (const t of trees) {
        if (!t.peartreeSettings) t.peartreeSettings = peartreeSettings;
      }
    }
    return trees;
  }
  function newickEsc(name) {
    if (!name) return "";
    if (/[(),;:\[\]\s]/.test(name)) return `'${name.replace(/'/g, "''")}'`;
    return name;
  }
  function fmtLen(n) {
    if (n == null || isNaN(n)) return null;
    if (n === 0) return "0";
    return parseFloat(n.toPrecision(12)).toString();
  }
  function fmtAnnot(annotations, annotKeys) {
    if (!annotations || annotKeys.length === 0) return "";
    const parts = [];
    for (const key of annotKeys) {
      const val = annotations[key];
      if (val === void 0 || val === null) continue;
      if (Array.isArray(val)) {
        const elems = val.map((v) => typeof v === "string" ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v);
        parts.push(`${key}={${elems.join(",")}}`);
      } else if (typeof val === "string") {
        parts.push(`${key}="${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
      } else {
        parts.push(`${key}=${val}`);
      }
    }
    return parts.length > 0 ? `[&${parts.join(",")}]` : "";
  }
  function branchLen(ci, pi, g) {
    if (pi < 0) return null;
    const { nodeA, nodeB, lenA, lenB } = g.root;
    if (ci === nodeA && pi === nodeB) return lenA;
    if (ci === nodeB && pi === nodeA) return lenB;
    return g.nodes[ci].lengths[0];
  }
  function newickNode(nodeIdx, parentIdx, g, annotKeys) {
    const node = g.nodes[nodeIdx];
    const annotStr = fmtAnnot(node.annotations, annotKeys);
    const safeName = newickEsc(node.name || node.label || "");
    const childIdxs = node.adjacents.filter((i) => i !== parentIdx);
    if (childIdxs.length === 0) {
      return `${safeName}${annotStr}`;
    }
    const parts = childIdxs.map((ci) => {
      const cStr = newickNode(ci, nodeIdx, g, annotKeys);
      const len = branchLen(ci, nodeIdx, g);
      const lenStr = len != null ? `:${fmtLen(len)}` : "";
      return `${cStr}${lenStr}`;
    });
    return `(${parts.join(",")})${safeName}${annotStr}`;
  }
  function graphToNewick(g, subtreeRootId, annotKeys) {
    const { nodeA, nodeB, lenA } = g.root;
    let body;
    if (subtreeRootId) {
      const idx = g.origIdToIdx.get(subtreeRootId);
      if (idx === void 0) return null;
      const node = g.nodes[idx];
      const parentIdx = node.adjacents.length > 0 ? node.adjacents[0] : -1;
      body = newickNode(idx, parentIdx, g, annotKeys);
    } else if (lenA === 0) {
      body = newickNode(nodeA, -1, g, annotKeys);
    } else {
      const aStr = newickNode(nodeA, nodeB, g, annotKeys);
      const bStr = newickNode(nodeB, nodeA, g, annotKeys);
      const aLen = lenA != null ? `:${fmtLen(lenA)}` : "";
      const bLen = g.root.lenB != null ? `:${fmtLen(g.root.lenB)}` : "";
      body = `(${aStr}${aLen},${bStr}${bLen})`;
    }
    return body + ";";
  }
  function parseDelimited(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const firstLine = lines[0];
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const delimiter = tabCount >= commaCount ? "	" : ",";
    function parseLine(line) {
      if (delimiter === "	") return line.split("	").map((v) => v.trim());
      const result = [];
      let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = !inQ;
        } else if (ch === "," && !inQ) {
          result.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      result.push(cur.trim());
      return result;
    }
    const headers = parseLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = parseLine(lines[i]);
      if (vals.every((v) => !v)) continue;
      const obj = {};
      headers.forEach((h, j) => {
        obj[h] = vals[j] ?? "";
      });
      rows.push(obj);
    }
    return { headers, rows };
  }

  // peartree/js/treeutils.js
  function _countVisibleTips(gnodes, hiddenNodeIds, nodeIdx, fromIdx) {
    let count = 0;
    const stack = [{ ni: nodeIdx, fi: fromIdx }];
    while (stack.length) {
      const { ni, fi } = stack.pop();
      const gnode = gnodes[ni];
      if (hiddenNodeIds.has(gnode.origId)) continue;
      const children = gnode.adjacents.filter((a) => a !== fi);
      if (children.length === 0) count++;
      else for (const c of children) stack.push({ ni: c, fi: ni });
    }
    return count;
  }
  function _findEffectiveRoot(gnodes, hiddenNodeIds, startIdx, fromIdx) {
    let curIdx = startIdx;
    let curFrom = fromIdx;
    while (true) {
      const gnode = gnodes[curIdx];
      const visChildren = gnode.adjacents.filter((adjIdx) => {
        if (adjIdx === curFrom) return false;
        const childOrigId = gnodes[adjIdx].origId;
        if (hiddenNodeIds.has(childOrigId)) return false;
        return _countVisibleTips(gnodes, hiddenNodeIds, adjIdx, curIdx) > 0;
      });
      if (visChildren.length !== 1) return { nodeIdx: curIdx, fromIdx: curFrom };
      curFrom = curIdx;
      curIdx = visChildren[0];
    }
  }
  function computeLayoutFromGraph(graph, subtreeRootId = null, options = {}) {
    const { nodes: gnodes, root } = graph;
    const { nodeA, nodeB, lenA, lenB } = root;
    const hiddenNodeIds = graph.hiddenNodeIds || /* @__PURE__ */ new Set();
    const clampNeg = !!options.clampNegativeBranches;
    let tipCounter = 0;
    const layoutNodes = [];
    const nodeMap2 = /* @__PURE__ */ new Map();
    function traverse(startNodeIdx, startFromNodeIdx, startXFromRoot, startParentLayoutId) {
      const startLen = layoutNodes.length;
      const stack = [{
        nodeIdx: startNodeIdx,
        fromNodeIdx: startFromNodeIdx,
        xFromRoot: startXFromRoot,
        parentLayoutId: startParentLayoutId
      }];
      while (stack.length) {
        const { nodeIdx, fromNodeIdx, xFromRoot, parentLayoutId } = stack.pop();
        const gnode = gnodes[nodeIdx];
        const entry = {
          id: gnode.origId,
          name: gnode.name,
          label: gnode.label,
          annotations: gnode.annotations,
          x: xFromRoot,
          y: null,
          isTip: false,
          hasHiddenChildren: false,
          children: [],
          parentId: parentLayoutId
        };
        layoutNodes.push(entry);
        nodeMap2.set(entry.id, entry);
        const allChildren = gnode.adjacents.map((adjIdx, i) => ({ adjIdx, len: gnode.lengths[i] })).filter(({ adjIdx }) => adjIdx !== fromNodeIdx);
        entry.isTip = allChildren.length === 0;
        if (entry.isTip) {
          tipCounter++;
          entry.y = tipCounter;
        }
        const toPush = [];
        for (const { adjIdx, len } of allChildren) {
          const childOrigId = gnodes[adjIdx].origId;
          if (hiddenNodeIds.has(childOrigId)) {
            entry.hasHiddenChildren = true;
          } else {
            entry.children.push(childOrigId);
            toPush.push({ adjIdx, len });
          }
        }
        for (let j = toPush.length - 1; j >= 0; j--) {
          const { adjIdx, len } = toPush[j];
          stack.push({
            nodeIdx: adjIdx,
            fromNodeIdx: nodeIdx,
            xFromRoot: xFromRoot + (clampNeg ? Math.max(0, len) : len),
            parentLayoutId: gnode.origId
          });
        }
      }
      for (let i = layoutNodes.length - 1; i >= startLen; i--) {
        const node = layoutNodes[i];
        if (node.isTip || node.children.length === 0) continue;
        const childYs = node.children.map((cid) => nodeMap2.get(cid).y).filter((y) => y != null);
        if (childYs.length > 0)
          node.y = childYs.reduce((a, b) => a + b, 0) / childYs.length;
      }
    }
    if (subtreeRootId !== null) {
      const nodeIdx = graph.origIdToIdx.get(subtreeRootId);
      if (nodeIdx !== void 0) {
        traverse(nodeIdx, gnodes[nodeIdx].adjacents[0], 0, null);
      }
    } else if (lenA === 0) {
      const eff = hiddenNodeIds.size ? _findEffectiveRoot(gnodes, hiddenNodeIds, nodeA, -1) : { nodeIdx: nodeA, fromIdx: -1 };
      traverse(eff.nodeIdx, eff.fromIdx, 0, null);
    } else {
      const tipsA = hiddenNodeIds.size ? _countVisibleTips(gnodes, hiddenNodeIds, nodeA, nodeB) : 1;
      const tipsB = hiddenNodeIds.size ? _countVisibleTips(gnodes, hiddenNodeIds, nodeB, nodeA) : 1;
      if (tipsA > 0 && tipsB > 0) {
        const ROOT_LAYOUT_ID = "__graph_root__";
        const gNodeA = gnodes[nodeA];
        const gNodeB = gnodes[nodeB];
        if (!hiddenNodeIds.has(gNodeA.origId)) traverse(nodeA, nodeB, lenA, ROOT_LAYOUT_ID);
        if (!hiddenNodeIds.has(gNodeB.origId)) traverse(nodeB, nodeA, lenB, ROOT_LAYOUT_ID);
        const aEntry = nodeMap2.get(gNodeA.origId);
        const bEntry = nodeMap2.get(gNodeB.origId);
        const rootChildren = [];
        if (aEntry) rootChildren.push(gNodeA.origId);
        if (bEntry) rootChildren.push(gNodeB.origId);
        const rootY = aEntry && bEntry ? (aEntry.y + bEntry.y) / 2 : aEntry ? aEntry.y : bEntry ? bEntry.y : 1;
        const rootEntry = {
          id: ROOT_LAYOUT_ID,
          name: null,
          label: null,
          annotations: root.annotations || {},
          x: 0,
          y: rootY,
          isTip: rootChildren.length === 0,
          hasHiddenChildren: hiddenNodeIds.has(gNodeA.origId) || hiddenNodeIds.has(gNodeB.origId),
          children: rootChildren,
          parentId: null
        };
        if (rootEntry.isTip) {
          tipCounter++;
          rootEntry.y = tipCounter;
        }
        layoutNodes.unshift(rootEntry);
        nodeMap2.set(ROOT_LAYOUT_ID, rootEntry);
      } else {
        const startIdx = tipsA > 0 ? nodeA : nodeB;
        const startFrom = tipsA > 0 ? nodeB : nodeA;
        const eff = _findEffectiveRoot(gnodes, hiddenNodeIds, startIdx, startFrom);
        traverse(eff.nodeIdx, eff.fromIdx, 0, null);
      }
    }
    const toRemove = /* @__PURE__ */ new Set();
    for (let i = layoutNodes.length - 1; i >= 0; i--) {
      const node = layoutNodes[i];
      if (node.parentId === null) continue;
      if (node.isTip) continue;
      if (node.children.length === 0) {
        const parentNode2 = nodeMap2.get(node.parentId);
        if (parentNode2) {
          parentNode2.hasHiddenChildren = true;
          const idx2 = parentNode2.children.indexOf(node.id);
          if (idx2 !== -1) parentNode2.children.splice(idx2, 1);
        }
        toRemove.add(node.id);
        nodeMap2.delete(node.id);
        continue;
      }
      if (node.children.length !== 1) continue;
      const parentNode = nodeMap2.get(node.parentId);
      const childNode = nodeMap2.get(node.children[0]);
      if (!parentNode || !childNode) continue;
      const idx = parentNode.children.indexOf(node.id);
      if (idx !== -1) parentNode.children[idx] = childNode.id;
      childNode.parentId = parentNode.id;
      if (node.hasHiddenChildren) childNode.hasHiddenChildren = true;
      toRemove.add(node.id);
      nodeMap2.delete(node.id);
    }
    let finalNodes = layoutNodes.filter((n) => !toRemove.has(n.id));
    {
      const rootsToRemove = /* @__PURE__ */ new Set();
      let rootNode = finalNodes.find((n) => n.parentId === null);
      while (rootNode && !rootNode.isTip && rootNode.children.length === 1) {
        const childNode = nodeMap2.get(rootNode.children[0]);
        if (!childNode) break;
        if (rootNode.hasHiddenChildren) childNode.hasHiddenChildren = true;
        childNode.parentId = null;
        rootsToRemove.add(rootNode.id);
        nodeMap2.delete(rootNode.id);
        rootNode = childNode;
      }
      if (rootsToRemove.size) {
        finalNodes = finalNodes.filter((n) => !rootsToRemove.has(n.id));
        const newRoot = finalNodes.find((n) => n.parentId === null);
        const newRootX = newRoot?.x ?? 0;
        if (newRootX !== 0) {
          for (const n of finalNodes) n.x -= newRootX;
        }
      }
    }
    for (let i = finalNodes.length - 1; i >= 0; i--) {
      const node = finalNodes[i];
      if (node.isTip) continue;
      const childYs = node.children.map((cid) => nodeMap2.get(cid)?.y).filter((y) => y != null);
      if (childYs.length > 0)
        node.y = childYs.reduce((a, b) => a + b, 0) / childYs.length;
    }
    const maxX = finalNodes.reduce((m, n) => Math.max(m, n.x), 0);
    const maxY = tipCounter;
    return { nodes: finalNodes, nodeMap: nodeMap2, maxX, maxY };
  }
  function graphVisibleTipCount(graph, gStartIdx, gFromIdx, extraHiddenId) {
    let count = 0;
    const stack = [{ ni: gStartIdx, fi: gFromIdx }];
    while (stack.length) {
      const { ni, fi } = stack.pop();
      const gnode = graph.nodes[ni];
      if (graph.hiddenNodeIds.has(gnode.origId) || gnode.origId === extraHiddenId) continue;
      const children = gnode.adjacents.filter((a) => a !== fi);
      if (children.length === 0) {
        count++;
      } else {
        for (const c of children) stack.push({ ni: c, fi: ni });
      }
    }
    return count;
  }
  function graphSubtreeHasHidden(graph, gStartIdx, gFromIdx) {
    const stack = [{ ni: gStartIdx, fi: gFromIdx }];
    while (stack.length) {
      const { ni, fi } = stack.pop();
      for (const adjIdx of graph.nodes[ni].adjacents) {
        if (adjIdx === fi) continue;
        if (graph.hiddenNodeIds.has(graph.nodes[adjIdx].origId)) return true;
        stack.push({ ni: adjIdx, fi: ni });
      }
    }
    return false;
  }

  // peartree/js/phylograph.js
  function swapToFront(node, neighborIdx) {
    const pos = node.adjacents.indexOf(neighborIdx);
    if (pos <= 0) return;
    [node.adjacents[0], node.adjacents[pos]] = [node.adjacents[pos], node.adjacents[0]];
    [node.lengths[0], node.lengths[pos]] = [node.lengths[pos], node.lengths[0]];
  }
  function rerootOnGraph(graph, childOrigId, distFromParent) {
    const { nodes: nodes2, root, origIdToIdx } = graph;
    const newBIdx = origIdToIdx.get(childOrigId);
    if (newBIdx === void 0) return;
    const newBNode = nodes2[newBIdx];
    const newAIdx = newBNode.adjacents[0];
    const totalEdgeLen = newBNode.lengths[0];
    const newLenA = Math.max(0, Math.min(totalEdgeLen, distFromParent));
    const newLenB = totalEdgeLen - newLenA;
    const oldRootSet = /* @__PURE__ */ new Set([root.nodeA, root.nodeB]);
    const path = [newAIdx];
    let cur = newAIdx;
    while (!oldRootSet.has(cur)) {
      cur = nodes2[cur].adjacents[0];
      path.push(cur);
    }
    const schema = graph.annotationSchema;
    if (schema) {
      const branchKeys = [];
      for (const [k, def] of schema) {
        if (def.isBranchAnnotation) branchKeys.push(k);
      }
      if (branchKeys.length > 0) {
        for (const k of branchKeys) {
          const oldVals = path.map((idx) => nodes2[idx].annotations[k]);
          const last = path.length - 1;
          for (const idx of path) delete nodes2[idx].annotations[k];
          for (let i = 0; i < last; i++) {
            if (oldVals[i] !== void 0) {
              nodes2[path[i + 1]].annotations[k] = oldVals[i];
            }
          }
        }
      }
    }
    for (let i = path.length - 1; i >= 1; i--) {
      swapToFront(nodes2[path[i]], path[i - 1]);
    }
    swapToFront(nodes2[newAIdx], newBIdx);
    graph.root = { nodeA: newAIdx, nodeB: newBIdx, lenA: newLenA, lenB: newLenB, annotations: {} };
  }
  function fromNestedRoot(nestedRoot) {
    const nodes2 = [];
    const origIdToIdx = /* @__PURE__ */ new Map();
    const rootChildren = nestedRoot.children || [];
    const hasRootAnnotations = Object.keys(nestedRoot.annotations || {}).length > 0;
    const isBifurcating = rootChildren.length === 2 && !hasRootAnnotations;
    function allocNode(startNode) {
      const stack = [startNode];
      while (stack.length) {
        const node = stack.pop();
        const idx = nodes2.length;
        origIdToIdx.set(node.id, idx);
        nodes2.push({
          idx,
          origId: node.id,
          name: node.name || null,
          label: node.label || null,
          annotations: node.annotations || {},
          adjacents: [],
          lengths: []
        });
        if (node.children) {
          for (let j = node.children.length - 1; j >= 0; j--) stack.push(node.children[j]);
        }
      }
    }
    if (isBifurcating) {
      for (const c of rootChildren) allocNode(c);
    } else {
      allocNode(nestedRoot);
    }
    function linkEdge(nestedChild, nestedParent) {
      const ci = origIdToIdx.get(nestedChild.id);
      const pi = origIdToIdx.get(nestedParent.id);
      const len = nestedChild.length || 0;
      nodes2[ci].adjacents.push(pi);
      nodes2[ci].lengths.push(len);
      nodes2[pi].adjacents.push(ci);
      nodes2[pi].lengths.push(len);
    }
    function buildEdges(startNode, startParent) {
      const stack = [{ node: startNode, parentNode: startParent }];
      while (stack.length) {
        const { node, parentNode } = stack.pop();
        if (parentNode !== null) linkEdge(node, parentNode);
        if (node.children) {
          for (let j = node.children.length - 1; j >= 0; j--) {
            stack.push({ node: node.children[j], parentNode: node });
          }
        }
      }
    }
    let root;
    if (isBifurcating) {
      const [cA, cB] = rootChildren;
      const idxA = origIdToIdx.get(cA.id);
      const idxB = origIdToIdx.get(cB.id);
      const lenA = cA.length || 0;
      const lenB = cB.length || 0;
      const totalLen = lenA + lenB;
      nodes2[idxA].adjacents.push(idxB);
      nodes2[idxA].lengths.push(totalLen);
      nodes2[idxB].adjacents.push(idxA);
      nodes2[idxB].lengths.push(totalLen);
      if (cA.children) for (const c of cA.children) buildEdges(c, cA);
      if (cB.children) for (const c of cB.children) buildEdges(c, cB);
      const rootAnnotations = nestedRoot.annotations || {};
      root = { nodeA: idxA, nodeB: idxB, lenA, lenB, annotations: rootAnnotations };
    } else {
      buildEdges(nestedRoot, null);
      const rootIdx = origIdToIdx.get(nestedRoot.id);
      const firstChild = rootChildren[0];
      const firstChildIdx = origIdToIdx.get(firstChild.id);
      root = {
        nodeA: rootIdx,
        nodeB: firstChildIdx,
        lenA: 0,
        lenB: firstChild.length || 0,
        annotations: nestedRoot.annotations || {}
      };
    }
    const rooted = Object.keys(root.annotations).length > 0;
    return { nodes: nodes2, root, origIdToIdx, annotationSchema: buildAnnotationSchema(nodes2), rooted, hiddenNodeIds: /* @__PURE__ */ new Set() };
  }
  var KNOWN_ANNOTATION_BOUNDS = /* @__PURE__ */ new Map([
    // Bayesian posterior probability / support
    ["posterior", { min: 0, max: 1 }],
    ["posterior_probability", { min: 0, max: 1 }],
    ["prob", { min: 0, max: 1 }],
    ["probability", { min: 0, max: 1 }],
    // Bootstrap / general node support expressed as a proportion (0–1)
    // or percentage (0–100) – detected at schema-build time from observed values.
    ["support", { min: 0, max: 1 }],
    ["bootstrap", { min: 0, max: 1 }],
    // Explicitly percent-named annotations
    ["percent", { min: 0, max: 100 }],
    ["percentage", { min: 0, max: 100 }],
    ["pct", { min: 0, max: 100 }],
    ["perc", { min: 0, max: 100 }]
    // Common date/time decimal-year annotations do NOT have fixed bounds — omitted.
  ]);
  var KNOWN_BRANCH_ANNOTATIONS = /* @__PURE__ */ new Set([
    "bootstrap",
    "support",
    "posterior",
    "posterior_probability",
    "prob",
    "probability",
    "label"
    // raw non-numeric Newick internal-node labels
  ]);
  function isNumericType(dt) {
    return dt === "real" || dt === "integer" || dt === "proportion" || dt === "percentage";
  }
  var DATE_FULL_RE = /^\d{4}-\d{2}-\d{2}$/;
  var DATE_MONTH_RE = /^\d{4}-\d{2}$/;
  var DATE_YEAR_RE = /^\d{4}$/;
  function isDateString(v) {
    return typeof v === "string" && (DATE_FULL_RE.test(v) || DATE_MONTH_RE.test(v) || DATE_YEAR_RE.test(v));
  }
  function dateToDecimalYear(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return NaN;
    const parts = String(dateStr).split("-");
    const year = parseInt(parts[0], 10);
    if (isNaN(year)) return NaN;
    if (parts.length === 1) return year;
    const month = parseInt(parts[1], 10);
    if (parts.length === 2) return year + (month - 1) / 12;
    const day = parseInt(parts[2], 10);
    const startOfYear = new Date(year, 0, 1);
    const startOfDay = new Date(year, month - 1, day);
    const endOfYear = new Date(year + 1, 0, 1);
    const daysInYear = (endOfYear - startOfYear) / 864e5;
    const dayOfYear = (startOfDay - startOfYear) / 864e5;
    return year + dayOfYear / daysInYear;
  }
  function makeAnnotationFormatter(def, mode = "ticks") {
    if (!def || !isNumericType(def.dataType)) {
      return (v) => String(v);
    }
    if (def.dataType === "integer") return (v) => String(Math.round(v));
    const obsMin = def.observedMin ?? def.min ?? 0;
    const obsMax = def.observedMax ?? def.max ?? 1;
    const obsRange = Math.abs(obsMax - obsMin);
    const maxAbs = Math.max(Math.abs(obsMin), Math.abs(obsMax));
    const step = obsRange > 0 ? obsRange / 5 : maxAbs > 0 ? maxAbs / 5 : 1;
    const dpTicks = step > 0 ? Math.max(0, Math.ceil(-Math.log10(step))) : 2;
    const dp = mode === "value" ? dpTicks + 2 : dpTicks;
    const useExp = dpTicks > 4 || maxAbs >= 1e6 || maxAbs > 0 && maxAbs < 1e-3;
    if (useExp) return (v) => v === 0 ? "0" : v.toExponential(mode === "value" ? 4 : 2);
    return (v) => v.toFixed(dp);
  }
  function inferAnnotationType(values) {
    if (values.some((v) => Array.isArray(v))) {
      const elements = values.flatMap((v) => Array.isArray(v) ? v : [v]);
      return { dataType: "list", elementType: inferAnnotationType(elements) };
    }
    const numericValues = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
    if (numericValues.length === values.length) {
      let min = Infinity, max = -Infinity;
      for (const v of numericValues) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const allInteger = numericValues.every((v) => Number.isInteger(v));
      return { dataType: allInteger ? "integer" : "real", min, max, observedMin: min, observedMax: max };
    }
    const stringValues = values.map((v) => String(v));
    if (stringValues.every(isDateString) && stringValues.some((v) => DATE_FULL_RE.test(v) || DATE_MONTH_RE.test(v))) {
      const distinct2 = [...new Set(stringValues)].sort();
      return { dataType: "date", values: distinct2, min: distinct2[0], max: distinct2[distinct2.length - 1] };
    }
    const distinct = [...new Set(stringValues)].sort();
    return { dataType: "categorical", values: distinct };
  }
  function buildAnnotationSchema(nodes2) {
    const allKeys = /* @__PURE__ */ new Set();
    for (const node of nodes2) {
      for (const k of Object.keys(node.annotations)) allKeys.add(k);
    }
    const schema = /* @__PURE__ */ new Map();
    for (const name of allKeys) {
      const values = [];
      let onTips = false;
      let onNodes = false;
      for (const node of nodes2) {
        if (Object.prototype.hasOwnProperty.call(node.annotations, name)) {
          const v = node.annotations[name];
          if (v !== null && v !== void 0 && v !== "?") {
            values.push(v);
            if (node.adjacents.length === 1) onTips = true;
            else onNodes = true;
          }
        }
      }
      if (values.length > 0) {
        const def = { name, onTips, onNodes, ...inferAnnotationType(values) };
        const knownKey = [...KNOWN_ANNOTATION_BOUNDS.keys()].find((k) => k.toLowerCase() === name.toLowerCase());
        if (knownKey && (def.dataType === "real" || def.dataType === "integer")) {
          const bounds = KNOWN_ANNOTATION_BOUNDS.get(knownKey);
          const effectiveBounds = bounds.max === 1 && def.observedMax != null && def.observedMax > 1 ? { min: 0, max: 100 } : bounds;
          def.min = effectiveBounds.min;
          def.max = effectiveBounds.max;
          def.fixedBounds = true;
          if (effectiveBounds.min === 0 && effectiveBounds.max === 1) {
            def.dataType = "proportion";
          } else if (effectiveBounds.min === 0 && effectiveBounds.max === 100) {
            def.dataType = "percentage";
          }
        }
        if (isNumericType(def.dataType)) {
          def.observedRange = (def.observedMax ?? def.max ?? 0) - (def.observedMin ?? def.min ?? 0);
          def.fmt = makeAnnotationFormatter(def, "ticks");
          def.fmtValue = makeAnnotationFormatter(def, "value");
        }
        const lowerName = name.toLowerCase();
        if ([...KNOWN_BRANCH_ANNOTATIONS].some((k) => k.toLowerCase() === lowerName)) {
          def.isBranchAnnotation = true;
        }
        schema.set(name, def);
      }
    }
    const BEAST_SUFFIXES = [
      ["_95%_HPD", "hpd"],
      ["_median", "median"],
      ["_range", "range"],
      ["_mean", "mean"],
      ["_lower", "lower"],
      ["_upper", "upper"]
    ];
    for (const [name, def] of schema) {
      for (const [suffix, label] of BEAST_SUFFIXES) {
        if (name.endsWith(suffix)) {
          const base = name.slice(0, -suffix.length);
          if (schema.has(base)) {
            def.groupMember = base;
            const baseDef = schema.get(base);
            baseDef.group = baseDef.group || {};
            baseDef.group[label] = name;
          }
          break;
        }
      }
    }
    {
      const orphanedBases = /* @__PURE__ */ new Map();
      for (const name of schema.keys()) {
        for (const [suffix, label] of BEAST_SUFFIXES) {
          if (name.endsWith(suffix)) {
            const base = name.slice(0, -suffix.length);
            if (!schema.has(base)) {
              if (!orphanedBases.has(base)) orphanedBases.set(base, /* @__PURE__ */ new Map());
              orphanedBases.get(base).set(label, name);
            }
            break;
          }
        }
      }
      for (const [base, members] of orphanedBases) {
        if (!members.has("mean")) continue;
        const meanKey = base + "_mean";
        const meanDef = schema.get(meanKey);
        if (!meanDef) continue;
        const synth = { ...meanDef, name: base, group: {} };
        for (const [label, key] of members) {
          synth.group[label] = key;
          schema.get(key).groupMember = base;
        }
        const firstMemberKey = members.values().next().value;
        const entries = [...schema];
        schema.clear();
        for (const [k, v] of entries) {
          if (k === firstMemberKey) schema.set(base, synth);
          schema.set(k, v);
        }
      }
    }
    return schema;
  }
  function rotateNodeGraph(graph, origId, recursive = false) {
    const { nodes: nodes2, origIdToIdx } = graph;
    const startIdx = origIdToIdx.get(origId);
    if (startIdx === void 0) return;
    function reverseChildren(nodeIdx) {
      const n = nodes2[nodeIdx];
      const nCh = n.adjacents.length - 1;
      if (nCh < 2) return;
      const adjs = n.adjacents.slice(1).reverse();
      const lens = n.lengths.slice(1).reverse();
      for (let i = 0; i < nCh; i++) {
        n.adjacents[i + 1] = adjs[i];
        n.lengths[i + 1] = lens[i];
      }
    }
    if (!recursive) {
      reverseChildren(startIdx);
    } else {
      const dfsStack = [startIdx];
      while (dfsStack.length) {
        const nodeIdx = dfsStack.pop();
        reverseChildren(nodeIdx);
        const n = nodes2[nodeIdx];
        for (let i = 1; i < n.adjacents.length; i++) dfsStack.push(n.adjacents[i]);
      }
    }
  }
  function reorderGraph(graph, ascending) {
    const { nodes: nodes2, root: { nodeA, nodeB, lenA } } = graph;
    const hiddenNodeIds = graph.hiddenNodeIds || /* @__PURE__ */ new Set();
    function sortSubtree(rootNodeIdx) {
      const order = [];
      const stk = [rootNodeIdx];
      while (stk.length) {
        const i = stk.pop();
        const n = nodes2[i];
        if (hiddenNodeIds.has(n.origId)) continue;
        order.push(i);
        for (let k = n.adjacents.length - 1; k >= 1; k--) stk.push(n.adjacents[k]);
      }
      const tipCounts = /* @__PURE__ */ new Map();
      for (let i = order.length - 1; i >= 0; i--) {
        const idx = order[i];
        const n = nodes2[idx];
        if (n.adjacents.length === 1) {
          tipCounts.set(idx, 1);
        } else {
          const pairs = [];
          for (let k = 1; k < n.adjacents.length; k++) {
            const ct = tipCounts.get(n.adjacents[k]) ?? 0;
            pairs.push({ adj: n.adjacents[k], len: n.lengths[k], ct });
          }
          pairs.sort((a, b) => ascending ? a.ct - b.ct : b.ct - a.ct);
          pairs.forEach(({ adj, len }, k) => {
            n.adjacents[k + 1] = adj;
            n.lengths[k + 1] = len;
          });
          tipCounts.set(idx, pairs.reduce((s, p) => s + p.ct, 0));
        }
      }
      return tipCounts.get(rootNodeIdx) ?? 0;
    }
    if (lenA === 0) {
      const n = nodes2[nodeA];
      const pairs = n.adjacents.map((adj, i) => ({
        adj,
        len: n.lengths[i],
        ct: sortSubtree(adj)
      }));
      pairs.sort((a, b) => ascending ? a.ct - b.ct : b.ct - a.ct);
      pairs.forEach(({ adj, len }, i) => {
        n.adjacents[i] = adj;
        n.lengths[i] = len;
      });
      graph.root = { ...graph.root, nodeB: n.adjacents[0] };
    } else {
      const nA = nodes2[nodeA];
      const pairsA = [];
      for (let i = 1; i < nA.adjacents.length; i++)
        pairsA.push({ adj: nA.adjacents[i], len: nA.lengths[i], ct: sortSubtree(nA.adjacents[i]) });
      pairsA.sort((a, b) => ascending ? a.ct - b.ct : b.ct - a.ct);
      pairsA.forEach(({ adj, len }, i) => {
        nA.adjacents[i + 1] = adj;
        nA.lengths[i + 1] = len;
      });
      const nB = nodes2[nodeB];
      const pairsB = [];
      for (let i = 1; i < nB.adjacents.length; i++)
        pairsB.push({ adj: nB.adjacents[i], len: nB.lengths[i], ct: sortSubtree(nB.adjacents[i]) });
      pairsB.sort((a, b) => ascending ? a.ct - b.ct : b.ct - a.ct);
      pairsB.forEach(({ adj, len }, i) => {
        nB.adjacents[i + 1] = adj;
        nB.lengths[i + 1] = len;
      });
      const ctA = pairsA.length ? pairsA.reduce((s, p) => s + p.ct, 0) : 1;
      const ctB = pairsB.length ? pairsB.reduce((s, p) => s + p.ct, 0) : 1;
      if (ascending ? ctA > ctB : ctA < ctB) {
        const { lenA: la, lenB: lb } = graph.root;
        graph.root = { nodeA: nodeB, nodeB: nodeA, lenA: lb, lenB: la };
      }
    }
  }
  function midpointRootGraph(graph) {
    const { nodes: nodes2 } = graph;
    function bfs(startIdx) {
      const dist = /* @__PURE__ */ new Map([[startIdx, 0]]);
      const prev = /* @__PURE__ */ new Map([[startIdx, -1]]);
      const queue = [startIdx];
      for (let qi = 0; qi < queue.length; qi++) {
        const cur2 = queue[qi];
        const n = nodes2[cur2];
        for (let i = 0; i < n.adjacents.length; i++) {
          const adj = n.adjacents[i];
          if (!dist.has(adj)) {
            dist.set(adj, dist.get(cur2) + n.lengths[i]);
            prev.set(adj, cur2);
            queue.push(adj);
          }
        }
      }
      return { dist, prev };
    }
    const tips = nodes2.filter((n) => n.adjacents.length === 1);
    if (tips.length < 2) {
      const t = tips[0];
      return { childNodeId: t.origId, distFromParent: t.lengths[0] / 2 };
    }
    const { dist: d0 } = bfs(tips[0].idx);
    const tipA = tips.reduce((b, t) => d0.get(t.idx) > d0.get(b.idx) ? t : b, tips[0]);
    const { dist: dA, prev: prevA } = bfs(tipA.idx);
    const tipB = tips.reduce((b, t) => {
      if (t.idx === tipA.idx) return b;
      return dA.get(t.idx) > dA.get(b.idx) ? t : b;
    }, tips.find((t) => t.idx !== tipA.idx));
    const diameter = dA.get(tipB.idx);
    const half = diameter / 2;
    const path = [];
    let cur = tipB.idx;
    while (cur !== -1) {
      path.push(cur);
      cur = prevA.get(cur);
    }
    path.reverse();
    let acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];
      const fn = nodes2[from];
      const edgeLen = fn.lengths[fn.adjacents.indexOf(to)];
      if (acc + edgeLen >= half) {
        if (nodes2[to].adjacents[0] === from) {
          return { childNodeId: nodes2[to].origId, distFromParent: half - acc };
        } else {
          return { childNodeId: nodes2[from].origId, distFromParent: edgeLen - (half - acc) };
        }
      }
      acc += edgeLen;
    }
    const last = nodes2[path[path.length - 1]];
    return { childNodeId: last.origId, distFromParent: last.lengths[0] / 2 };
  }
  var TreeCalibration = class _TreeCalibration {
    constructor() {
      this._anchorDecYear = null;
      this._anchorH = null;
      this._minTipH = 0;
      this._active = false;
    }
    // ── Instance API ───────────────────────────────────────────────────────────
    /**
     * Set the calibration from a date annotation key.
     * Scans nodeMap for the first tip that carries the annotation and computes
     * the decimal-year anchor.  Also records the minimum tip height across all tips.
     *
     * @param {string|null} annotKey – annotation key to use; null clears the calibration
     * @param {Map}         nodeMap  – renderer's nodeMap (id → layout node with .x)
     * @param {number}      maxX     – full-tree branch span; height = maxX - node.x
     * @returns {boolean}  true if calibration was successfully established
     */
    setAnchor(annotKey, nodeMap2, maxX) {
      if (!annotKey) {
        this._clear();
        return false;
      }
      let anchorDecYear = null;
      let anchorH = null;
      let minTipH = Infinity;
      for (const node of nodeMap2.values()) {
        if (!node.isTip) continue;
        const h = maxX - node.x;
        if (isNaN(h)) continue;
        if (h < minTipH) minTipH = h;
        if (anchorDecYear == null) {
          const raw = node.annotations?.[annotKey];
          if (raw == null) continue;
          const dec = _TreeCalibration.parseDateToDecYear(String(raw));
          if (dec != null) {
            anchorDecYear = dec;
            anchorH = h;
          }
        }
      }
      if (anchorDecYear == null) {
        this._clear();
        return false;
      }
      this._anchorDecYear = anchorDecYear;
      this._anchorH = anchorH;
      this._minTipH = isFinite(minTipH) ? minTipH : 0;
      this._active = true;
      return true;
    }
    _clear() {
      this._anchorDecYear = null;
      this._anchorH = null;
      this._minTipH = 0;
      this._active = false;
    }
    /** True when the calibration is active (setAnchor was called successfully). */
    get isActive() {
      return this._active;
    }
    /** Decimal year of the anchor tip (null when inactive). */
    get anchorDecYear() {
      return this._anchorDecYear;
    }
    /** Computed height (maxX – tip.x) of the anchor tip (null when inactive). */
    get anchorH() {
      return this._anchorH;
    }
    /** Minimum computed height across all tips at the last setAnchor call. */
    get minTipH() {
      return this._minTipH;
    }
    /**
     * Convert a node height to a decimal year.
     * @param {number} height
     * @returns {number}
     */
    heightToDecYear(height) {
      return this._anchorDecYear + this._anchorH - height;
    }
    /**
     * Convert a decimal year to a formatted date string.
     *
     * @param {number} decYear
     * @param {string} labelMode  – Label rendering mode:
     *   'full'      – render using dateFormat exactly
     *   'partial'   – strip sub-interval components (e.g. months tick → strip day)
     *   'component' – show only the interval-specific part (Q2, Jan, 14, etc.)
     *   'auto'      – alias for 'partial'
     *   Legacy format strings (e.g. 'yyyy-MM-dd') are treated as 'full' with that format.
     * @param {string} [dateFormat='yyyy-MM-dd']  – full date format chosen by the user:
     *   'yyyy-MM-dd' | 'yyyy-MMM-dd' | 'dd MMM yyyy'
     * @param {string} [interval]  – interval hint for 'partial' / 'component':
     *   'decades'|'years'|'quarters'|'months'|'weeks'|'days'
     * @returns {string}
     */
    decYearToString(decYear, labelMode, dateFormat = "yyyy-MM-dd", interval = "") {
      const { year, month, day } = _TreeCalibration.decYearToDate(decYear);
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      const mmm = _TreeCalibration.MONTHS[month - 1];
      if (labelMode === "component") {
        switch (interval) {
          case "decades":
            return String(Math.floor(year / 10) * 10) + "s";
          case "years":
            return String(year);
          case "quarters":
            return `Q${Math.ceil(month / 3)}`;
          case "months":
            return mmm;
          case "weeks":
            return `W${String(_TreeCalibration._weekOfYear(year, month, day)).padStart(2, "0")}`;
          case "days":
            return dd;
          default:
            return String(year);
        }
      }
      if (interval === "weeks" && (labelMode === "full" || labelMode === "partial" || labelMode === "auto")) {
        const ww = String(_TreeCalibration._weekOfYear(year, month, day)).padStart(2, "0");
        return `${year}-W${ww}`;
      }
      let fmt;
      if (labelMode === "full") {
        fmt = dateFormat;
      } else if (labelMode === "partial" || labelMode === "auto") {
        fmt = _TreeCalibration._partialFormat(dateFormat, interval);
      } else {
        fmt = labelMode;
      }
      return _TreeCalibration._applyFormat(fmt, year, mm, dd, mmm);
    }
    /**
     * Convert a node height directly to a formatted date string.
     * Convenience wrapper: heightToDateString(h, labelMode, dateFormat, interval)
     *   ≡ decYearToString(heightToDecYear(h), labelMode, dateFormat, interval)
     *
     * @param {number} height
     * @param {string} labelMode  – see decYearToString()
     * @param {string} [dateFormat]
     * @param {string} [interval]
     * @returns {string}
     */
    heightToDateString(height, labelMode, dateFormat, interval) {
      return this.decYearToString(this.heightToDecYear(height), labelMode, dateFormat, interval);
    }
    // ── Static format helpers ──────────────────────────────────────────────
    /**
     * Given a full date format and a tick interval, return a reduced format that
     * strips sub-interval components (e.g. months tick → remove day portion).
     * @param {string} fullFormat
     * @param {string} interval
     * @returns {string}
     */
    static _partialFormat(fullFormat, interval) {
      switch (interval) {
        case "decades":
        case "years":
        case "quarters":
          return "yyyy";
        case "months":
          if (fullFormat === "yyyy-MMM-dd") return "yyyy-MMM";
          if (fullFormat === "dd MMM yyyy") return "MMM yyyy";
          if (fullFormat === "dd MMMM yyyy") return "MMMM yyyy";
          if (fullFormat === "MMM dd, yyyy") return "MMM yyyy";
          if (fullFormat === "MMMM dd, yyyy") return "MMMM yyyy";
          if (fullFormat === "MMM-dd-yyyy") return "MMM-yyyy";
          return "yyyy-MM";
        case "weeks":
          return "yyyy-Www";
        // handled specially before _applyFormat is called
        case "days":
        default:
          return fullFormat;
      }
    }
    /**
     * Render a (possibly partial) format string with pre-computed date parts.
     * @param {string} fmt
     * @param {number} year
     * @param {string} mm   – zero-padded month number
     * @param {string} dd   – zero-padded day number
     * @param {string} mmm  – 3-letter month abbreviation
     * @returns {string}
     */
    static _applyFormat(fmt, year, mm, dd, mmm) {
      const mmmm = _TreeCalibration.MONTHS_FULL[_TreeCalibration.MONTHS.indexOf(mmm)];
      switch (fmt) {
        case "yyyy":
          return String(year);
        case "yyyy-MM":
          return `${year}-${mm}`;
        case "yyyy-MMM":
          return `${year}-${mmm}`;
        case "MMM yyyy":
          return `${mmm} ${year}`;
        case "MMMM yyyy":
          return `${mmmm} ${year}`;
        case "yyyy-MM-dd":
          return `${year}-${mm}-${dd}`;
        case "yyyy-mm-dd":
          return `${year}-${mm}-${dd}`;
        // legacy alias
        case "yyyy-MMM-dd":
          return `${year}-${mmm}-${dd}`;
        case "dd MMM yyyy":
          return `${dd} ${mmm} ${year}`;
        case "dd MMMM yyyy":
          return `${dd} ${mmmm} ${year}`;
        case "MMM dd, yyyy":
          return `${mmm} ${dd}, ${year}`;
        case "MMMM dd, yyyy":
          return `${mmmm} ${dd}, ${year}`;
        case "MMM-dd-yyyy":
          return `${mmm}-${dd}-${year}`;
        case "MMM-yyyy":
          return `${mmm}-${year}`;
        case "MM-dd":
          return `${mm}-${dd}`;
        case "MMM-dd":
          return `${mmm}-${dd}`;
        case "dd MMM":
          return `${dd} ${mmm}`;
        case "dd MMMM":
          return `${dd} ${mmmm}`;
        case "MMM dd":
          return `${mmm} ${dd}`;
        case "MMMM dd":
          return `${mmmm} ${dd}`;
        default:
          return `${year}-${mm}-${dd}`;
      }
    }
    // ── Static helpers ─────────────────────────────────────────────────────────
    static MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    static MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    /** Return true if the given year is a leap year. */
    static _isLeapYear(year) {
      return year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
    }
    /**
     * Return a 13-element cumulative-days-in-month array for the given year.
     * Index 0 is always 0 (sentinel); indices 1–12 are days in each month.
     * e.g. _daysInMonth(2000)[2] === 29
     */
    static _daysInMonth(year) {
      const L = _TreeCalibration._isLeapYear(year);
      return [0, 31, L ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    }
    /**
     * Return the week-of-year number (1–53) for a given date.
     * Uses simple ordinal day ÷ 7, matching the calendarTicksForInterval 'weeks' generator.
     */
    static _weekOfYear(year, month, day) {
      const dims = _TreeCalibration._daysInMonth(year);
      let doy = day;
      for (let m = 1; m < month; m++) doy += dims[m];
      return Math.ceil(doy / 7);
    }
    /**
     * Parse a date string to a decimal year.
     * Supports: "2014", "2014-06", "2014-06-15", "2014.45"
     * Returns null if not parseable.
     * @param {string} str
     * @returns {number|null}
     */
    static parseDateToDecYear(str) {
      if (!str) return null;
      str = str.trim();
      const decFull = str.match(/^(\d{4})\.(\d+)$/);
      if (decFull) return parseFloat(str);
      const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (ymd) return _TreeCalibration.dateToDecYear(+ymd[1], +ymd[2], +ymd[3]);
      const ym = str.match(/^(\d{4})-(\d{2})$/);
      if (ym) return _TreeCalibration.dateToDecYear(+ym[1], +ym[2], 15);
      const y = str.match(/^(\d{4})$/);
      if (y) return _TreeCalibration.dateToDecYear(+y[1], 7, 2);
      return null;
    }
    /**
     * Convert a calendar date to a decimal year.
     * e.g. 2014-01-01 → 2014.0,  2014-07-02 → ~2014.5
     */
    static dateToDecYear(year, month, day) {
      const dims = _TreeCalibration._daysInMonth(year);
      let doy = day;
      for (let m = 1; m < month; m++) doy += dims[m];
      return year + (doy - 1) / (_TreeCalibration._isLeapYear(year) ? 366 : 365);
    }
    /**
     * Convert a decimal year to { year, month, day }.
     */
    static decYearToDate(dy) {
      const year = Math.floor(dy);
      const total = _TreeCalibration._isLeapYear(year) ? 366 : 365;
      let doy = Math.round((dy - year) * total) + 1;
      if (doy < 1) doy = 1;
      if (doy > total) doy = total;
      const dims = _TreeCalibration._daysInMonth(year);
      let month = 1;
      while (month < 12 && doy > dims[month]) {
        doy -= dims[month];
        month++;
      }
      return { year, month, day: doy };
    }
    /**
     * Format a decimal year for display, automatically choosing precision
     * based on the step size between adjacent ticks.
     * @param {number}   dy
     * @param {number[]} ticks – full tick array (used to infer step size)
     * @returns {string}
     */
    static formatDecYear(dy, ticks) {
      if (ticks.length < 2) return String(Math.round(dy));
      const step = Math.abs(ticks[1] - ticks[0]);
      if (step >= 1 - 1e-6) return String(Math.round(dy));
      const { year, month, day } = _TreeCalibration.decYearToDate(dy);
      const mm = String(month).padStart(2, "0");
      if (step >= 1 / 12 - 1e-6) return `${year}-${mm}`;
      return `${year}-${mm}-${String(day).padStart(2, "0")}`;
    }
    /**
     * Generate nicely-spaced calendar ticks within decimal-year range [minDY, maxDY].
     * Auto-picks the coarsest interval that gives roughly targetCount ticks.
     * @param {number} minDY
     * @param {number} maxDY
     * @param {number} [targetCount=5]
     * @returns {number[]}  decimal years
     */
    static niceCalendarTicks(minDY, maxDY, targetCount = 5) {
      const range = maxDY - minDY;
      if (range === 0) return [minDY];
      const W_DY = 7 / 365.25;
      const D_DY = 1 / 365.25;
      const candidates = [100, 50, 25, 10, 5, 2, 1, 1 / 2, 1 / 3, 1 / 4, 1 / 6, 1 / 12, 1 / 24, W_DY, D_DY];
      const roughStep = range / targetCount;
      let step = D_DY;
      for (const c of candidates) {
        if (c <= roughStep * 1.5) {
          step = c;
          break;
        }
      }
      const ticks = [];
      if (step >= 1) {
        const startYear = Math.ceil(minDY / step - 1e-9) * step;
        for (let y = startYear; y <= maxDY + step * 1e-9; y += step)
          ticks.push(parseFloat(y.toPrecision(10)));
      } else if (step >= 0.03) {
        const mps = Math.max(1, Math.round(step * 12));
        const sd = _TreeCalibration.decYearToDate(minDY);
        let m = sd.month, yr = sd.year;
        const rem = m % mps;
        if (rem !== 0) m += mps - rem;
        while (m > 12) {
          m -= 12;
          yr++;
        }
        for (let i = 0; i < 60; i++) {
          const dy = _TreeCalibration.dateToDecYear(yr, m, 1);
          if (dy > maxDY + step * 1e-6) break;
          ticks.push(dy);
          m += mps;
          while (m > 12) {
            m -= 12;
            yr++;
          }
        }
      } else if (step >= 5e-3) {
        return _TreeCalibration.calendarTicksForInterval(minDY, maxDY, "weeks");
      } else {
        return _TreeCalibration.calendarTicksForInterval(minDY, maxDY, "days");
      }
      return ticks;
    }
    /**
     * Generate ticks for a fixed named calendar interval within [minDY, maxDY].
     * @param {number} minDY
     * @param {number} maxDY
     * @param {string} interval – 'decades'|'years'|'quarters'|'months'|'weeks'|'days'
     * @returns {number[]}  decimal years
     */
    static calendarTicksForInterval(minDY, maxDY, interval) {
      const ticks = [];
      const sd = _TreeCalibration.decYearToDate(minDY);
      const dy = (yr, mo, d) => _TreeCalibration.dateToDecYear(yr, mo, d);
      if (interval === "decades") {
        const start = Math.ceil(minDY / 10 - 1e-9) * 10;
        for (let y = start; y <= maxDY + 1e-6; y += 10) ticks.push(dy(y, 1, 1));
      } else if (interval === "years") {
        let yr = sd.year;
        if (dy(yr, 1, 1) < minDY - 1e-9) yr++;
        for (; dy(yr, 1, 1) <= maxDY + 1e-6; yr++) ticks.push(dy(yr, 1, 1));
      } else if (interval === "quarters") {
        let yr = sd.year, m = Math.ceil(sd.month / 3) * 3 - 2;
        if (m < 1) m = 1;
        if (dy(yr, m, 1) < minDY - 1e-9) {
          m += 3;
          while (m > 12) {
            m -= 12;
            yr++;
          }
        }
        for (let i = 0; i < 500; i++) {
          const v = dy(yr, m, 1);
          if (v > maxDY + 1e-6) break;
          ticks.push(v);
          m += 3;
          while (m > 12) {
            m -= 12;
            yr++;
          }
        }
      } else if (interval === "months") {
        let yr = sd.year, m = sd.month;
        if (dy(yr, m, 1) < minDY - 1e-9) {
          m++;
          if (m > 12) {
            m = 1;
            yr++;
          }
        }
        for (let i = 0; i < 5e3; i++) {
          const v = dy(yr, m, 1);
          if (v > maxDY + 1e-6) break;
          ticks.push(v);
          m++;
          if (m > 12) {
            m = 1;
            yr++;
          }
        }
      } else if (interval === "weeks") {
        const anchor = dy(sd.year, 1, 1);
        const W_DY = 7 / 365.25;
        const n = Math.ceil((minDY - anchor) / W_DY - 1e-9);
        let { year, month, day } = _TreeCalibration.decYearToDate(anchor + n * W_DY);
        const dim = (yr) => _TreeCalibration._daysInMonth(yr);
        for (let i = 0; i < 5e3; i++) {
          const v = dy(year, month, day);
          if (v > maxDY + 1e-4) break;
          if (v >= minDY - 1e-9) ticks.push(v);
          day += 7;
          const d = dim(year);
          while (day > d[month]) {
            day -= d[month];
            month++;
            if (month > 12) {
              month = 1;
              year++;
            }
          }
        }
      } else if (interval === "days") {
        let { year, month, day } = _TreeCalibration.decYearToDate(minDY);
        const dim = (yr) => _TreeCalibration._daysInMonth(yr);
        if (dy(year, month, day) < minDY - 1e-9) {
          day++;
          const d = dim(year);
          if (day > d[month]) {
            day = 1;
            month++;
            if (month > 12) {
              month = 1;
              year++;
            }
          }
        }
        for (let i = 0; i < 1e5; i++) {
          const v = dy(year, month, day);
          if (v > maxDY + 1e-6) break;
          ticks.push(v);
          day++;
          const d = dim(year);
          if (day > d[month]) {
            day = 1;
            month++;
            if (month > 12) {
              month = 1;
              year++;
            }
          }
        }
      }
      return ticks;
    }
  };

  // peartree/js/palettes.js
  var MISSING_DATA_COLOUR = "#aaaaaa";
  var CATEGORICAL_PALETTES = {
    /** Solarized accent colours — the original default. */
    "Solarized": [
      "#2aa198",
      // cyan
      "#cb4b16",
      // orange
      "#268bd2",
      // blue
      "#d33682",
      // magenta
      "#6c71c4",
      // violet
      "#b58900",
      // yellow
      "#859900",
      // green
      "#dc322f"
      // red
    ],
    /** High-contrast Bold palette — large, well-separated hues. */
    "Bold": [
      "#e6194b",
      // red
      "#3cb44b",
      // green
      "#4363d8",
      // blue
      "#f58231",
      // orange
      "#911eb4",
      // purple
      "#42d4f4",
      // cyan
      "#f032e6",
      // magenta
      "#bfef45",
      // lime
      "#fabed4",
      // pink
      "#469990"
      // teal
    ],
    /** Pastel — softer tones, suitable for light backgrounds. */
    "Pastel": [
      "#a8d8a8",
      // sage green
      "#f4a8a8",
      // rose
      "#a8c8f4",
      // sky blue
      "#f4d4a8",
      // peach
      "#d4a8f4",
      // lavender
      "#f4f4a8",
      // lemon
      "#a8f4f4",
      // aqua
      "#f4a8d4"
      // pink
    ],
    /** Tableau-10 — the palette used by Tableau / Vega default charts. */
    "Tableau": [
      "#4e79a7",
      // steel blue
      "#f28e2b",
      // tangerine
      "#e15759",
      // brick red
      "#76b7b2",
      // sage teal
      "#59a14f",
      // grass green
      "#edc948",
      // golden yellow
      "#b07aa1",
      // rose purple
      "#ff9da7",
      // salmon
      "#9c755f",
      // brown
      "#bab0ac"
      // grey
    ],
    /** ARTIC — colours sampled from the ARTIC network / PearTree Artic theme. */
    "ARTIC": [
      "#19A699",
      // teal
      "#B58901",
      // gold
      "#E06961",
      // coral red
      "#f7eeca",
      // cream
      "#3b9ddd",
      // sky blue
      "#8eb35a",
      // olive green
      "#c97fb5",
      // mauve
      "#6bcac0"
      // mint
    ],
    /**
     * Wes — a curated palette inspired by the muted, idiosyncratic
     * colour worlds of his films.  Hues are spread across the full wheel at
     * varied saturation and brightness so all 16 values remain legible and
     * clearly distinct from one another (and from the neutral missing-data grey).
     *
     * Film references (approximate):
     *   The Royal Tenenbaums · Moonrise Kingdom · The Life Aquatic
     *   Fantastic Mr. Fox · The Grand Budapest Hotel · The Darjeeling Limited
     *   Rushmore · Isle of Dogs
     */
    "Wes": [
      "#C1615A",
      // dusty red        — Tenenbaums burgundy warmth
      "#E07B39",
      // burnt orange      — Fantastic Mr. Fox
      "#C9A84C",
      // saffron gold      — Darjeeling Limited
      "#8D9040",
      // olive             — Moonrise Kingdom scouts
      "#4A7C3F",
      // forest green      — Tenenbaums tennis court
      "#2A6B5A",
      // deep teal-green   — Life Aquatic diving suit
      "#3D8C8C",
      // teal              — Life Aquatic vessel
      "#3D5A80",
      // muted navy        — Life Aquatic ocean
      "#5C4E8A",
      // dusty violet      — Budapest lobby carpet
      "#9B72AA",
      // soft lavender     — Budapest tower facade
      "#C06B82",
      // rose              — Budapest hotel uniform
      "#7D2E46",
      // deep burgundy     — Rushmore chapel
      "#6B4226",
      // rich brown        — Fox fur
      "#B8956A",
      // warm caramel      — Moonrise Kingdom canvas
      "#E8D0A3",
      // pale sand         — Isle of Dogs ash plain
      "#7A8594"
      // slate blue-grey   — Isle of Dogs industrial haze
    ]
  };
  var SEQUENTIAL_PALETTES = {
    /** Teal → Red — the original default. */
    "Teal-Red": ["#2aa198", "#dc322f"],
    /** Blue → Orange — a colourblind-friendly diverging pair. */
    "Blue-Orange": ["#2166ac", "#d6604d"],
    /** Purple → Gold */
    "Purple-Gold": ["#762a83", "#e08214"],
    /** Green → Purple */
    "Green-Purple": ["#1b7837", "#762a83"],
    /** Cool: Teal → Indigo */
    "Teal-Indigo": ["#2aa198", "#4b0082"],
    /** Viridis-like: Purple → Yellow */
    "Viridis": ["#440154", "#fde725"],
    /** Inferno-like: Black → Yellow */
    "Inferno": ["#000004", "#fcffa4"],
    /** Monochrome: White → Black */
    "Greyscale": ["#f5f5f5", "#111111"],
    // ── Black-centre diverging (3 stops) ───────────────────────────────────
    // The midpoint black creates a dramatic separation between the two extremes.
    /** Blue → Black → Red */
    "Blue-Black-Red": ["#1e70b5", "#111111", "#c82424"],
    /** Teal → Black → Orange */
    "Teal-Black-Orange": ["#2aa198", "#111111", "#e07b39"],
    /** Purple → Black → Gold */
    "Purple-Black-Gold": ["#6a2080", "#111111", "#d49800"],
    /** Cyan → Black → Magenta */
    "Cyan-Black-Magenta": ["#009bb5", "#111111", "#b52880"],
    // ── Spectrum palettes (multi-stop) ──────────────────────────────────────
    // Each sweeps a broad arc of the colour wheel with varied saturation and
    // brightness so every stop is clearly distinct.
    /** ARTIC — colours sampled from the ARTIC network / PearTree Artic theme. */
    "ARTIC": [
      "#7D2E46",
      // deep burgundy     — Rushmore chapel
      "#C1615A",
      // dusty red        — Tenenbaums burgundy warmth
      "#E07B39",
      // burnt orange      — Fantastic Mr. Fox
      "#C9A84C",
      // saffron gold      — Darjeeling Limited
      "#8D9040",
      // olive             — Moonrise Kingdom scouts
      "#4A7C3F",
      // forest green      — Tenenbaums tennis court
      "#2A6B5A",
      // deep teal-green   — Life Aquatic diving suit
      "#3D5A80",
      // muted navy        — Life Aquatic ocean
      "#5C4E8A"
      // dusty violet      — Budapest lobby carpet
    ],
    /**
     * Rainbow — a full hue sweep: red → orange → yellow → green → blue → violet.
     * Brightness is kept moderate so both ends remain legible on dark backgrounds.
     */
    "Rainbow": ["#d62728", "#f57c00", "#f9d600", "#2ca02c", "#1f77b4", "#9467bd"],
    /**
     * Sunset — deep indigo night sky through crimson and amber to pale dawn gold.
     */
    "Sunset": ["#1a0030", "#7b0d6b", "#c83520", "#e07800", "#f5c800", "#fdf5b0"],
    /**
     * Ocean — abyssal navy through cobalt and teal to bright cyan at the surface.
     */
    "Ocean": ["#040d28", "#18458f", "#1478b0", "#2aa198", "#5fd4cc"],
    /**
     * Fire — charcoal black through deep red, orange, and yellow to near-white.
     * Brightness increases monotonically toward the high end.
     */
    "Fire": ["#0d0000", "#6b0000", "#cc2200", "#ff7500", "#ffdc00", "#fffce0"]
  };
  var DEFAULT_CATEGORICAL_PALETTE = "Solarized";
  var DEFAULT_SEQUENTIAL_PALETTE = "Teal-Red";
  function getCategoricalPalette(name) {
    return CATEGORICAL_PALETTES[name] ?? CATEGORICAL_PALETTES[DEFAULT_CATEGORICAL_PALETTE];
  }
  function buildCategoricalColourMap(values, paletteName) {
    const palette = getCategoricalPalette(paletteName);
    const n = values.length;
    const p = palette.length;
    const map = /* @__PURE__ */ new Map();
    values.forEach((v, i) => {
      const idx = n <= p ? Math.round(i * (p - 1) / Math.max(n - 1, 1)) : i % p;
      map.set(v, palette[idx]);
    });
    return map;
  }
  function getSequentialPalette(name) {
    return SEQUENTIAL_PALETTES[name] ?? SEQUENTIAL_PALETTES[DEFAULT_SEQUENTIAL_PALETTE];
  }
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 };
  }
  function lerpSequential(t, stops) {
    const tc = Math.max(0, Math.min(1, t));
    const n = stops.length;
    if (n === 0) return "rgb(0,0,0)";
    if (n === 1) return stops[0];
    const scaled = tc * (n - 1);
    const lo = Math.min(Math.floor(scaled), n - 2);
    const lt = scaled - lo;
    const loC = hexToRgb(stops[lo]);
    const hiC = hexToRgb(stops[lo + 1]);
    const r = Math.round(loC.r + lt * (hiC.r - loC.r));
    const g = Math.round(loC.g + lt * (hiC.g - loC.g));
    const b = Math.round(loC.b + lt * (hiC.b - loC.b));
    return `rgb(${r},${g},${b})`;
  }

  // peartree/js/treerenderer.js
  var CAL_DATE_KEY = "__cal_date__";
  var CAL_DATE_HPD_KEY = "__cal_date_hpd__";
  var CAL_DATE_HPD_ONLY_KEY = "__cal_date_hpd_only__";
  var TreeRenderer = class _TreeRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} settings  Complete settings object — see setSettings() for all recognised keys.
     *                           peartree.js is responsible for supplying every key; the renderer
     *                           has no built-in defaults of its own.
     */
    constructor(canvas, settings) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.dpr = window.devicePixelRatio || 1;
      this.nodes = null;
      this.nodeMap = null;
      this.maxX = 1;
      this.maxY = 1;
      this.labelRightPad = 200;
      this._labelCacheKey = null;
      this._maxLabelWidth = 0;
      this.setSettings(
        settings,
        /*redraw*/
        false
      );
      this.scaleX = 1;
      this.offsetX = this.paddingLeft;
      this._targetOffsetX = this.paddingLeft;
      this.scaleY = 1;
      this.minScaleY = 1;
      this.offsetY = 0;
      this._dragging = false;
      this._spaceDown = false;
      this._lastY = 0;
      this._dragStartOffsetY = 0;
      this._snapTimer = null;
      this._dragSel = null;
      this._dragSelActive = false;
      this._dragSelStartX = null;
      this._dragSelStartY = null;
      this._suppressNextClick = false;
      this._hoveredNodeId = null;
      this._selectedTipIds = /* @__PURE__ */ new Set();
      this._mrcaNodeId = null;
      this._fitLabelsMode = false;
      this._shiftHeld = false;
      this._hypFocusScreenY = null;
      this._hypStrength = 0;
      this._hypTarget = 0;
      this._hypMagMult = 10;
      this._onStatsChange = null;
      this._mode = "nodes";
      this._branchHoverNode = null;
      this._branchHoverX = null;
      this._branchSelectNode = null;
      this._branchSelectX = null;
      this.graph = null;
      this._viewSubtreeRootId = null;
      this._navStack = [];
      this._fwdStack = [];
      this.hiddenNodeIds = /* @__PURE__ */ new Set();
      this._onNavChange = null;
      this._onBranchSelectChange = null;
      this._onNodeSelectChange = null;
      this._onViewChange = null;
      this._onLayoutChange = null;
      this._globalHeightMap = /* @__PURE__ */ new Map();
      this._lastViewHash = "";
      this._targetOffsetY = 0;
      this._targetScaleY = 1;
      this._targetScaleX = 1;
      this._animating = false;
      this._reorderFromY = null;
      this._reorderToY = null;
      this._reorderAlpha = 1;
      this._introPhase = null;
      this._introAlpha = 0;
      this._introStyle = null;
      this._introAnimationStyle = "y-then-x";
      this._introFinalX = null;
      this._introFinalY = null;
      this._introRootY = 0;
      this._rootShiftAlpha = 1;
      this._rootShiftFromX = 0;
      this._rootShiftToX = 0;
      this._crossfadeSnapshot = null;
      this._annotationSchema = null;
      this._annotationPaletteOverrides = /* @__PURE__ */ new Map();
      this._tipColourBy = null;
      this._tipColourScale = null;
      this._nodeColourBy = null;
      this._nodeColourScale = null;
      this._labelColourBy = null;
      this._labelColourScale = null;
      this._tipLabelShapeColourBy = null;
      this._tipLabelShapeColourScale = null;
      this._tipLabelShape = "off";
      this._tipLabelShapeColor = "#aaaaaa";
      this._tipLabelShapeSize = 50;
      this._tipLabelShapeMarginLeft = 2;
      this._tipLabelShapeMarginRight = 3;
      this._tipLabelShape2 = "off";
      this._tipLabelShape2Color = "#888888";
      this._tipLabelShape2Size = 50;
      this._tipLabelShape2ColourBy = null;
      this._tipLabelShape2ColourScale = null;
      this._tipLabelShape2MarginRight = 3;
      this._crossfadeAlpha = 0;
      this._legendRenderer = null;
      this._rafId = null;
      this._dirty = true;
      this._setupEvents();
      this._loop();
    }
    /**
     * Apply a Theme instance, overwriting all rendering-option properties.
     * Pass redraw=false during construction to skip the draw call.
     */
    /**
     * Apply a complete set of visual and layout settings to the renderer.
     * All property values must be correctly typed (numbers as numbers, not strings).
     * Called by the constructor (redraw=false) and may be called externally at any time.
     *
     * @param {object}  s        Settings object — see property assignments below for all keys.
     * @param {boolean} redraw   When true (default) and data is loaded, triggers a repaint.
     */
    setSettings(s, redraw = true) {
      this.bgColor = s.bgColor;
      this.branchColor = s.branchColor;
      this.branchWidth = s.branchWidth;
      this.fontSize = s.fontSize;
      this.fontFamily = s.fontFamily ?? "monospace";
      this.tipRadius = s.tipRadius;
      this.tipHaloSize = s.tipHaloSize;
      this.tipShapeColor = s.tipShapeColor;
      this.tipShapeBgColor = s.tipShapeBgColor;
      this.tipOutlineColor = s.tipOutlineColor;
      this.nodeRadius = s.nodeRadius;
      this.nodeHaloSize = s.nodeHaloSize;
      this.nodeShapeColor = s.nodeShapeColor;
      this.nodeShapeBgColor = s.nodeShapeBgColor;
      const { dim: _dim, selected: _sel } = _TreeRenderer._deriveLabelColors(s.labelColor);
      this.labelColor = s.labelColor;
      this.dimLabelColor = s.dimLabelColor ?? _dim;
      this.selectedLabelColor = s.selectedLabelColor ?? _sel;
      this.selectedLabelStyle = s.selectedLabelStyle ?? "bold";
      this.tipLabelAnnotation = s.tipLabelAnnotation ?? null;
      this._tipLabelsOff = s.tipLabelsOff ?? false;
      this._tipLabelDecimalPlaces = s.tipLabelDecimalPlaces ?? null;
      this._tipLabelShape = s.tipLabelShape ?? "off";
      this._tipLabelShapeColor = s.tipLabelShapeColor ?? "#aaaaaa";
      this._tipLabelShapeSize = +(s.tipLabelShapeSize ?? 50);
      this._tipLabelShapeMarginLeft = +(s.tipLabelShapeMarginLeft ?? 2);
      this._tipLabelShapeMarginRight = +(s.tipLabelShapeMarginRight ?? 3);
      this._tipLabelShape2 = s.tipLabelShape2 ?? "off";
      this._tipLabelShape2Color = s.tipLabelShape2Color ?? "#888888";
      this._tipLabelShape2Size = +(s.tipLabelShape2Size ?? 50);
      this._tipLabelShape2MarginRight = +(s.tipLabelShape2MarginRight ?? 3);
      this.paddingLeft = s.paddingLeft;
      this.paddingRight = s.paddingRight ?? 10;
      this.paddingTop = s.paddingTop;
      this.paddingBottom = s.paddingBottom;
      this.elbowRadius = s.elbowRadius;
      this.rootStubLength = s.rootStubLength;
      this.clampNegativeBranches = !!s.clampNegativeBranches;
      this.tipHoverFillColor = s.tipHoverFillColor;
      this.tipHoverStrokeColor = s.tipHoverStrokeColor;
      this.tipHoverGrowthFactor = s.tipHoverGrowthFactor;
      this.tipHoverMinSize = s.tipHoverMinSize;
      this.tipHoverFillOpacity = s.tipHoverFillOpacity;
      this.tipHoverStrokeWidth = s.tipHoverStrokeWidth;
      this.tipHoverStrokeOpacity = s.tipHoverStrokeOpacity;
      this.nodeHoverFillColor = s.nodeHoverFillColor;
      this.nodeHoverStrokeColor = s.nodeHoverStrokeColor;
      this.nodeHoverGrowthFactor = s.nodeHoverGrowthFactor;
      this.nodeHoverMinSize = s.nodeHoverMinSize;
      this.nodeHoverFillOpacity = s.nodeHoverFillOpacity;
      this.nodeHoverStrokeWidth = s.nodeHoverStrokeWidth;
      this.nodeHoverStrokeOpacity = s.nodeHoverStrokeOpacity;
      this.selectedTipStrokeColor = s.selectedTipStrokeColor;
      this.selectedTipFillColor = s.selectedTipFillColor;
      this.selectedTipGrowthFactor = s.selectedTipGrowthFactor;
      this.selectedTipMinSize = s.selectedTipMinSize;
      this.selectedTipFillOpacity = s.selectedTipFillOpacity;
      this.selectedTipStrokeWidth = s.selectedTipStrokeWidth;
      this.selectedTipStrokeOpacity = s.selectedTipStrokeOpacity;
      this.selectedNodeStrokeColor = s.selectedNodeStrokeColor;
      this.selectedNodeFillColor = s.selectedNodeFillColor;
      this.selectedNodeGrowthFactor = s.selectedNodeGrowthFactor;
      this.selectedNodeMinSize = s.selectedNodeMinSize;
      this.selectedNodeFillOpacity = s.selectedNodeFillOpacity;
      this.selectedNodeStrokeWidth = s.selectedNodeStrokeWidth;
      this.selectedNodeStrokeOpacity = s.selectedNodeStrokeOpacity;
      this.nodeBarsEnabled = s.nodeBarsEnabled ?? false;
      this.nodeBarsColor = s.nodeBarsColor ?? "#2aa198";
      this.nodeBarsWidth = s.nodeBarsWidth ?? 6;
      this.nodeBarsShowMedian = s.nodeBarsShowMedian ?? "mean";
      this.nodeBarsShowRange = s.nodeBarsShowRange ?? false;
      this._calCalibration = "calCalibration" in s ? s.calCalibration ?? null : this._calCalibration ?? null;
      this._calDateFormat = s.calDateFormat ?? this._calDateFormat ?? "yyyy-MM-dd";
      this.nodeLabelAnnotation = s.nodeLabelAnnotation || null;
      this._nodeLabelDecimalPlaces = s.nodeLabelDecimalPlaces ?? null;
      this.nodeLabelPosition = s.nodeLabelPosition ?? "right";
      this.nodeLabelFontSize = s.nodeLabelFontSize != null ? +s.nodeLabelFontSize : 9;
      this.nodeLabelColor = s.nodeLabelColor ?? "#aaaaaa";
      this.nodeLabelSpacing = s.nodeLabelSpacing != null ? +s.nodeLabelSpacing : 4;
      const _al = s.tipLabelAlign ?? "off";
      this.tipLabelAlign = _al === true || _al === "on" ? "aligned" : _al === false ? "off" : _al;
      if (s.introAnimation !== void 0) this._introAnimationStyle = s.introAnimation;
      this._legendRenderer?.setBgColor(this.bgColor, this._skipBg);
      if (redraw && this.nodes) {
        this._measureLabels();
        this._updateScaleX();
        this._updateMinScaleY();
        this._dirty = true;
      }
    }
    setData(nodes2, nodeMap2, maxX, maxY) {
      this._reorderAlpha = 1;
      this._introPhase = null;
      this._hypFocusScreenY = null;
      this._hypStrength = 0;
      this._hypTarget = 0;
      this.nodes = nodes2;
      this.nodeMap = nodeMap2;
      this.maxX = maxX;
      this.maxY = maxY;
      this._buildGlobalHeightMap(nodes2, maxX);
      this._labelCacheKey = null;
      this._measureLabels();
      if (nodes2.length > 6e4) {
        this._fitLabelsMode = false;
        this._updateScaleX();
        this._updateMinScaleY();
        const plotH = this.canvas.clientHeight - this.paddingTop - this.paddingBottom;
        const landingY = Math.max(this.minScaleY, plotH / 500);
        const offsetY = this.paddingTop + landingY * 0.5;
        this._setTarget(
          offsetY,
          landingY,
          /*immediate*/
          true
        );
        this._dirty = true;
      } else {
        this.fitToWindow();
      }
      this._notifyStats();
    }
    /**
     * Replace the layout data (same as setData) but animate each node's y
     * position from its old screen row to the new one.  Does NOT reset the
     * viewport (scaleY / offsetY), so the caller can handle zoom-restoration
     * itself with _setTarget as usual.
     */
    setDataAnimated(nodes2, nodeMap2, maxX, maxY) {
      if (nodes2.length > 6e4) return this.setData(nodes2, nodeMap2, maxX, maxY);
      const fromY = /* @__PURE__ */ new Map();
      if (this.nodes) {
        for (const n of this.nodes) fromY.set(n.id, n.y);
      }
      const toY = /* @__PURE__ */ new Map();
      for (const n of nodes2) toY.set(n.id, n.y);
      this.nodes = nodes2;
      this.nodeMap = nodeMap2;
      this.maxX = maxX;
      this.maxY = maxY;
      this._buildGlobalHeightMap(nodes2, maxX);
      this._labelCacheKey = null;
      this._measureLabels();
      this._updateScaleX(false);
      this._updateMinScaleY();
      for (const n of this.nodes) {
        const fy = fromY.get(n.id);
        if (fy !== void 0) n.y = fy;
      }
      this._reorderFromY = fromY;
      this._reorderToY = toY;
      this._reorderAlpha = 0;
      this._dirty = true;
      if (this._onLayoutChange) this._onLayoutChange(this.maxX, this._viewSubtreeRootId);
    }
    /**
     * Replace layout data with a cross-fade from the current frame.
     * The old frame is captured as a snapshot, the new data is installed
     * immediately (including fitToWindow), then the old snapshot is faded
     * out over the new tree over ~350 ms.
     */
    setDataCrossfade(nodes2, nodeMap2, maxX, maxY) {
      const W = this.canvas.width;
      const H = this.canvas.height;
      const snap = document.createElement("canvas");
      snap.width = W;
      snap.height = H;
      snap.getContext("2d").drawImage(this.canvas, 0, 0);
      this._crossfadeSnapshot = snap;
      this._crossfadeAlpha = 1;
      this.setData(nodes2, nodeMap2, maxX, maxY);
    }
    /**
     * Trigger the intro animation for a freshly loaded tree.
     * The style is taken from `this._introAnimationStyle`:
     *   'y-then-x'    – spread vertically from root, then expand horizontally
     *   'x-then-y'    – expand horizontally from root, then spread vertically
     *   'simultaneous'– both axes move together from the root point
     *   'from-bottom' – all nodes slide up from the bottom of the tree space
     *   'from-top'    – all nodes slide down from the top of the tree space
     *   'none'        – no animation
     * Skipped silently for very large trees (>10 000 nodes).
     */
    startIntroAnimation() {
      if (!this.nodes || this.nodes.length === 0) return;
      if (this.nodes.length > 1e4) return;
      const style = this._introAnimationStyle ?? "y-then-x";
      if (style === "none") return;
      const rootNode = this.nodes[0];
      this._introRootY = rootNode.y;
      this._introStyle = style;
      this._introFinalX = /* @__PURE__ */ new Map();
      this._introFinalY = /* @__PURE__ */ new Map();
      for (const n of this.nodes) {
        this._introFinalX.set(n.id, n.x);
        this._introFinalY.set(n.id, n.y);
      }
      for (const n of this.nodes) {
        switch (style) {
          case "y-then-x":
          case "x-then-y":
          case "simultaneous":
            n.x = 0;
            n.y = this._introRootY;
            break;
          case "from-bottom":
            n.x = this._introFinalX.get(n.id);
            n.y = this.maxY;
            break;
          case "from-top":
            n.x = this._introFinalX.get(n.id);
            n.y = 0;
            break;
        }
      }
      this._introPhase = 1;
      this._introAlpha = 0;
      this._dirty = true;
    }
    /** Snap all nodes to their final positions and clear intro state. */
    _introEnd() {
      for (const node of this.nodes) {
        node.x = this._introFinalX.get(node.id);
        node.y = this._introFinalY.get(node.id);
      }
      this._introPhase = null;
      this._introFinalX = null;
      this._introFinalY = null;
    }
    setTipLabelAnnotation(key) {
      this.tipLabelAnnotation = key || null;
      this._labelCacheKey = null;
      this._measureLabels();
      this._updateScaleX();
      this._dirty = true;
    }
    setTipLabelsOff(v) {
      this._tipLabelsOff = !!v;
      this._labelCacheKey = null;
      this._measureLabels();
      this._updateScaleX();
      this._dirty = true;
    }
    setTipLabelAlign(val) {
      if (val === true || val === "on") val = "aligned";
      if (val === false || val === null) val = "off";
      this.tipLabelAlign = val;
      this._dirty = true;
    }
    setFontSize(sz) {
      this.fontSize = sz;
      this._measureLabels();
      this._updateScaleX();
      this._updateMinScaleY();
      if (this._fitLabelsMode) {
        this.fitLabels();
      } else {
        const prevMin = this.minScaleY;
        const newScaleY = Math.max(this.minScaleY, this._targetScaleY * (this.minScaleY / prevMin));
        this._setTarget(this._targetOffsetY, newScaleY, true);
      }
      this._dirty = true;
    }
    /** Switch interaction mode ('nodes' or 'branches'); clears both modes' selections. */
    setMode(mode) {
      if (mode === this._mode) return;
      this._selectedTipIds.clear();
      this._mrcaNodeId = null;
      this._hoveredNodeId = null;
      this._branchHoverNode = null;
      this._branchHoverX = null;
      this._branchSelectNode = null;
      this._branchSelectX = null;
      this._mode = mode;
      if (this._onBranchSelectChange) this._onBranchSelectChange(false);
      if (this._onNodeSelectChange) this._onNodeSelectChange(false);
      this._notifyStats();
      this._dirty = true;
    }
    setTipRadius(r) {
      this.tipRadius = r;
      this._measureLabels();
      this._updateScaleX();
      this._dirty = true;
    }
    setNodeRadius(r) {
      this.nodeRadius = r;
      this._dirty = true;
    }
    setTipShapeColor(c) {
      this.tipShapeColor = c;
      this._dirty = true;
    }
    setNodeShapeColor(c) {
      this.nodeShapeColor = c;
      this._dirty = true;
    }
    setTipShapeBgColor(c) {
      this.tipShapeBgColor = c;
      this._dirty = true;
    }
    setNodeShapeBgColor(c) {
      this.nodeShapeBgColor = c;
      this._dirty = true;
    }
    setTipHaloSize(n) {
      this.tipHaloSize = n;
      this._measureLabels();
      this._updateScaleX();
      this._dirty = true;
    }
    setNodeHaloSize(n) {
      this.nodeHaloSize = n;
      this._dirty = true;
    }
    setNodeLabelAnnotation(key) {
      this.nodeLabelAnnotation = key || null;
      this._dirty = true;
    }
    setNodeLabelPosition(pos) {
      this.nodeLabelPosition = pos;
      this._dirty = true;
    }
    setNodeLabelFontSize(sz) {
      this.nodeLabelFontSize = +sz;
      this._dirty = true;
    }
    setNodeLabelColor(c) {
      this.nodeLabelColor = c;
      this._dirty = true;
    }
    setNodeLabelSpacing(n) {
      this.nodeLabelSpacing = +n;
      this._dirty = true;
    }
    /**
     * Update the calibration used for calendar-date node/tip labels.
     * @param {TreeCalibration|null} cal
     * @param {string} [fmt]  date format string, e.g. 'yyyy-MM-dd'
     */
    setCalibration(cal, fmt) {
      this._calCalibration = cal?.isActive ? cal : null;
      if (fmt != null) this._calDateFormat = fmt;
      this._labelCacheKey = null;
      if (this.nodes) {
        this._measureLabels();
        this._updateScaleX();
      }
      this._dirty = true;
    }
    /** Update only the date format used for calendar-date labels. */
    setCalDateFormat(fmt) {
      if (this._calDateFormat === fmt) return;
      this._calDateFormat = fmt;
      this._labelCacheKey = null;
      if (this.nodes) {
        this._measureLabels();
        this._updateScaleX();
      }
      this._dirty = true;
    }
    setBgColor(c) {
      this.bgColor = c;
      this._legendRenderer?.setBgColor(c, this._skipBg);
      this._dirty = true;
    }
    setBranchColor(c) {
      this.branchColor = c;
      this._dirty = true;
    }
    setBranchWidth(w) {
      this.branchWidth = w;
      this._dirty = true;
    }
    /**
     * Set the base tip-label colour and automatically derive related dim and
     * selected colours from it using HSL lightness/saturation adjustments.
     * dim    → darker + more desaturated (unselected labels when a selection exists)
     * selected → brighter + less saturated (selected labels, approaching white)
     */
    setLabelColor(hex) {
      const { dim, selected } = _TreeRenderer._deriveLabelColors(hex);
      this.labelColor = hex;
      this.dimLabelColor = dim;
      this.selectedLabelColor = selected;
      this._dirty = true;
    }
    /** Set the font style applied to selected tip labels: 'normal' | 'bold' | 'italic' | 'bold italic'. */
    setSelectedLabelStyle(style) {
      this.selectedLabelStyle = style || "bold";
      this._dirty = true;
    }
    /** Colour of the ring drawn around selected tip nodes. */
    setSelectedTipStrokeColor(c) {
      this.selectedTipStrokeColor = c;
      this._dirty = true;
    }
    /** Colour of the ring drawn around the MRCA node. */
    setSelectedNodeStrokeColor(c) {
      this.selectedNodeStrokeColor = c;
      this._dirty = true;
    }
    /** Fill colour used for a hovered tip node. */
    setTipHoverFillColor(c) {
      this.tipHoverFillColor = c;
      this._dirty = true;
    }
    /** Fill colour used for a hovered internal node (and MRCA node fill). */
    setNodeHoverFillColor(c) {
      this.nodeHoverFillColor = c;
      this._dirty = true;
    }
    /** Ring/stroke colour drawn around a hovered tip. */
    setTipHoverStrokeColor(c) {
      this.tipHoverStrokeColor = c;
      this._dirty = true;
    }
    /** Growth factor (marker radius = max(tipRadius × factor, minSize)). */
    setTipHoverGrowthFactor(f) {
      this.tipHoverGrowthFactor = f;
      this._dirty = true;
    }
    /** Minimum radius (px) of the hover indicator for tips. */
    setTipHoverMinSize(n) {
      this.tipHoverMinSize = n;
      this._dirty = true;
    }
    /** Opacity (0–1) of the filled circle for tip hover. */
    setTipHoverFillOpacity(a) {
      this.tipHoverFillOpacity = a;
      this._dirty = true;
    }
    /** Stroke width (px) of the hover ring for tips. */
    setTipHoverStrokeWidth(w) {
      this.tipHoverStrokeWidth = w;
      this._dirty = true;
    }
    /** Opacity (0–1) of the ring stroke for tip hover. */
    setTipHoverStrokeOpacity(a) {
      this.tipHoverStrokeOpacity = a;
      this._dirty = true;
    }
    /** Ring/stroke colour drawn around a hovered internal node. */
    setNodeHoverStrokeColor(c) {
      this.nodeHoverStrokeColor = c;
      this._dirty = true;
    }
    /** Growth factor for the node hover indicator. */
    setNodeHoverGrowthFactor(f) {
      this.nodeHoverGrowthFactor = f;
      this._dirty = true;
    }
    /** Minimum radius (px) of the hover indicator for internal nodes. */
    setNodeHoverMinSize(n) {
      this.nodeHoverMinSize = n;
      this._dirty = true;
    }
    /** Opacity (0–1) of the filled circle for node hover. */
    setNodeHoverFillOpacity(a) {
      this.nodeHoverFillOpacity = a;
      this._dirty = true;
    }
    /** Stroke width (px) of the hover ring for internal nodes. */
    setNodeHoverStrokeWidth(w) {
      this.nodeHoverStrokeWidth = w;
      this._dirty = true;
    }
    /** Opacity (0–1) of the ring stroke for node hover. */
    setNodeHoverStrokeOpacity(a) {
      this.nodeHoverStrokeOpacity = a;
      this._dirty = true;
    }
    /** Fill colour of the selection indicator for selected tips. */
    setSelectedTipFillColor(c) {
      this.selectedTipFillColor = c;
      this._dirty = true;
    }
    /** Growth factor for the selected-tip indicator. */
    setSelectedTipGrowthFactor(f) {
      this.selectedTipGrowthFactor = f;
      this._dirty = true;
    }
    /** Minimum radius (px) of the selected-tip indicator. */
    setSelectedTipMinSize(n) {
      this.selectedTipMinSize = n;
      this._dirty = true;
    }
    /** Opacity (0–1) of the filled circle for selected tips. */
    setSelectedTipFillOpacity(a) {
      this.selectedTipFillOpacity = a;
      this._dirty = true;
    }
    /** Stroke width (px) of the selection ring for tips. */
    setSelectedTipStrokeWidth(w) {
      this.selectedTipStrokeWidth = w;
      this._dirty = true;
    }
    /** Opacity (0–1) of the ring stroke for selected tips. */
    setSelectedTipStrokeOpacity(a) {
      this.selectedTipStrokeOpacity = a;
      this._dirty = true;
    }
    /** Fill colour of the MRCA/selection indicator for internal nodes. */
    setSelectedNodeFillColor(c) {
      this.selectedNodeFillColor = c;
      this._dirty = true;
    }
    /** Growth factor for the selected-node / MRCA indicator. */
    setSelectedNodeGrowthFactor(f) {
      this.selectedNodeGrowthFactor = f;
      this._dirty = true;
    }
    /** Minimum radius (px) of the MRCA indicator. */
    setSelectedNodeMinSize(n) {
      this.selectedNodeMinSize = n;
      this._dirty = true;
    }
    /** Opacity (0–1) of the filled circle for selected/MRCA node. */
    setSelectedNodeFillOpacity(a) {
      this.selectedNodeFillOpacity = a;
      this._dirty = true;
    }
    /** Stroke width (px) of the MRCA/selection ring for internal nodes. */
    setSelectedNodeStrokeWidth(w) {
      this.selectedNodeStrokeWidth = w;
      this._dirty = true;
    }
    /** Opacity (0–1) of the ring stroke for selected/MRCA node. */
    setSelectedNodeStrokeOpacity(a) {
      this.selectedNodeStrokeOpacity = a;
      this._dirty = true;
    }
    static _hexToHsl(hex) {
      if (hex.length === 4) hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
      let r = parseInt(hex.slice(1, 3), 16) / 255;
      let g = parseInt(hex.slice(3, 5), 16) / 255;
      let b = parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h = 0, s = 0;
      const l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            break;
          case g:
            h = ((b - r) / d + 2) / 6;
            break;
          case b:
            h = ((r - g) / d + 4) / 6;
            break;
        }
      }
      return { h: h * 360, s: s * 100, l: l * 100 };
    }
    /** Convert HSL (h: 0‑360, s: 0‑100, l: 0‑100) to a CSS hex colour. */
    static _hslToHex(h, s, l) {
      h = (h % 360 + 360) % 360;
      s = Math.max(0, Math.min(100, s)) / 100;
      l = Math.max(0, Math.min(100, l)) / 100;
      const a = s * Math.min(l, 1 - l);
      const f = (n) => {
        const k = (n + h / 30) % 12;
        const col = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(255 * col).toString(16).padStart(2, "0");
      };
      return `#${f(0)}${f(8)}${f(4)}`;
    }
    /**
     * Derive the dim and selected label colours from a base label colour.
     * dim      → darker + more desaturated (unselected labels when a selection exists)
     * selected → brighter + less saturated (selected labels, approaching white)
     * @param {string} hex  Base label colour as a CSS hex string.
     * @returns {{ dim: string, selected: string }}
     */
    static _deriveLabelColors(hex) {
      const { h, s, l } = _TreeRenderer._hexToHsl(hex);
      return {
        dim: _TreeRenderer._hslToHex(h, s * 0.7, l * 0.83),
        selected: _TreeRenderer._hslToHex(h, s * 0.5, Math.min(97, l * 1.08))
      };
    }
    /**
     * Store the annotation schema so the renderer can build colour scales.
     * Called by peartree.js immediately after graph = fromNestedRoot(root).
     * @param {Map<string, AnnotationDef>} schema
     */
    setAnnotationSchema(schema) {
      this._annotationSchema = schema;
      if (this._tipColourBy) this._tipColourScale = this._buildColourScale(this._tipColourBy);
      if (this._nodeColourBy) this._nodeColourScale = this._buildColourScale(this._nodeColourBy);
      if (this._labelColourBy) this._labelColourScale = this._buildColourScale(this._labelColourBy);
      if (this._tipLabelShapeColourBy) this._tipLabelShapeColourScale = this._buildColourScale(this._tipLabelShapeColourBy);
      if (this._tipLabelShape2ColourBy) this._tipLabelShape2ColourScale = this._buildColourScale(this._tipLabelShape2ColourBy);
      this._legendRenderer?.setAnnotationSchema(schema);
      this._legendRenderer?.setPaletteOverrides(this._annotationPaletteOverrides);
      this._dirty = true;
    }
    /**
     * Set the annotation key used to colour tip circles.
     * Pass null (or empty string) to revert to the default tip colour.
     * @param {string|null} key
     */
    setTipColourBy(key) {
      this._tipColourBy = key || null;
      this._tipColourScale = this._tipColourBy ? this._buildColourScale(this._tipColourBy) : null;
      this._dirty = true;
    }
    setNodeColourBy(key) {
      this._nodeColourBy = key || null;
      this._nodeColourScale = this._nodeColourBy ? this._buildColourScale(this._nodeColourBy) : null;
      this._dirty = true;
    }
    setLabelColourBy(key) {
      this._labelColourBy = key || null;
      this._labelColourScale = this._labelColourBy ? this._buildColourScale(this._labelColourBy) : null;
      this._dirty = true;
    }
    /** Set the shape style for tip-label swatches: 'off' | 'square' | 'circle' | 'block'. */
    setTipLabelShape(shape) {
      this._tipLabelShape = shape || "off";
      this._measureLabels();
      this._updateScaleX(false);
      this._dirty = true;
    }
    /** Set the size of tip-label shape swatches (1–100). For square/circle: % of scaleY. For block: ×0.1 width factor of scaleY. */
    setTipLabelShapeSize(n) {
      this._tipLabelShapeSize = n;
      this._measureLabels();
      this._updateScaleX(false);
      this._dirty = true;
    }
    /** Set the default fill colour for tip-label shape swatches. */
    setTipLabelShapeColor(hex) {
      this._tipLabelShapeColor = hex;
      this._dirty = true;
    }
    /**
     * Set the annotation key used to colour tip-label shape swatches.
     * Pass null (or empty string) to revert to the default swatch colour.
     */
    setTipLabelShapeColourBy(key) {
      this._tipLabelShapeColourBy = key || null;
      this._tipLabelShapeColourScale = this._tipLabelShapeColourBy ? this._buildColourScale(this._tipLabelShapeColourBy) : null;
      this._dirty = true;
    }
    /** Set the left margin (px) between the tip edge and the left side of the swatch. */
    setTipLabelShapeMarginLeft(n) {
      this._tipLabelShapeMarginLeft = n;
      this._measureLabels();
      this._updateScaleX(false);
      this._dirty = true;
    }
    /** Set the right margin (px) between the right side of the swatch and the label text (or shape 2). */
    setTipLabelShapeMarginRight(n) {
      this._tipLabelShapeMarginRight = n;
      this._measureLabels();
      this._updateScaleX(false);
      this._dirty = true;
    }
    /** Set the shape style for the second tip-label swatch: 'off' | 'square' | 'circle' | 'block'. */
    setTipLabelShape2(shape) {
      this._tipLabelShape2 = shape || "off";
      this._measureLabels();
      this._updateScaleX(false);
      this._dirty = true;
    }
    /** Set the size of the second tip-label shape swatch (1–100). For square/circle: % of scaleY. For block: ×0.1 width factor of scaleY. */
    setTipLabelShape2Size(n) {
      this._tipLabelShape2Size = n;
      this._measureLabels();
      this._updateScaleX(false);
      this._dirty = true;
    }
    /** Set the default fill colour for the second tip-label shape swatch. */
    setTipLabelShape2Color(hex) {
      this._tipLabelShape2Color = hex;
      this._dirty = true;
    }
    /** Set the annotation key used to colour the second tip-label shape swatch. */
    setTipLabelShape2ColourBy(key) {
      this._tipLabelShape2ColourBy = key || null;
      this._tipLabelShape2ColourScale = this._tipLabelShape2ColourBy ? this._buildColourScale(this._tipLabelShape2ColourBy) : null;
      this._dirty = true;
    }
    /** Set the right margin (px) between shape 2 and the label text. */
    setTipLabelShape2MarginRight(n) {
      this._tipLabelShape2MarginRight = n;
      this._measureLabels();
      this._updateScaleX(false);
      this._dirty = true;
    }
    /**
     * Set (or clear) the palette to use for a specific annotation key.
     * Rebuilds any active colour scales that use that key.
     * @param {string}      key          Annotation name
     * @param {string|null} paletteName  Name from CATEGORICAL_PALETTES or SEQUENTIAL_PALETTES, or null to revert to default
     */
    setAnnotationPalette(key, paletteName) {
      if (paletteName) {
        this._annotationPaletteOverrides.set(key, paletteName);
      } else {
        this._annotationPaletteOverrides.delete(key);
      }
      if (this._tipColourBy === key) this._tipColourScale = this._buildColourScale(key);
      if (this._nodeColourBy === key) this._nodeColourScale = this._buildColourScale(key);
      if (this._labelColourBy === key) this._labelColourScale = this._buildColourScale(key);
      if (this._tipLabelShapeColourBy === key) this._tipLabelShapeColourScale = this._buildColourScale(key);
      if (this._tipLabelShape2ColourBy === key) this._tipLabelShape2ColourScale = this._buildColourScale(key);
      this._legendRenderer?.setPaletteOverrides(this._annotationPaletteOverrides);
      this._dirty = true;
    }
    /** Build a colour scale Map for the given annotation key. Returns the Map or null. */
    _buildColourScale(key) {
      const schema = this._annotationSchema;
      if (!schema) return null;
      const def = schema.get(key);
      if (!def) return null;
      if (key === "user_colour") {
        const identity = /* @__PURE__ */ new Map();
        identity.set("__identity__", true);
        (def.values || []).forEach((v) => identity.set(v, v));
        return identity;
      }
      const scale = /* @__PURE__ */ new Map();
      if (def.dataType === "categorical" || def.dataType === "ordinal") {
        const paletteName = this._annotationPaletteOverrides.get(key);
        const colourMap = buildCategoricalColourMap(def.values || [], paletteName);
        for (const [v, c] of colourMap) scale.set(v, c);
      } else if (def.dataType === "date") {
        scale.set("__min__", dateToDecimalYear(def.min));
        scale.set("__max__", dateToDecimalYear(def.max));
        scale.set("__palette__", this._annotationPaletteOverrides.get(key) ?? null);
        scale.set("__isDate__", true);
      } else if (isNumericType(def.dataType)) {
        scale.set("__min__", def.min ?? 0);
        scale.set("__max__", def.max ?? 1);
        scale.set("__palette__", this._annotationPaletteOverrides.get(key) ?? null);
      }
      return scale;
    }
    /** Return a CSS colour string for a value looked up in the given scale, or null. */
    _colourFromScale(value, scale) {
      if (!scale) return null;
      if (value === null || value === void 0 || value === "?") {
        return scale.get("__identity__") ? null : MISSING_DATA_COLOUR;
      }
      if (scale.has(value)) return scale.get(value);
      if (scale.has("__min__")) {
        const rawValue = scale.get("__isDate__") ? dateToDecimalYear(value) : value;
        const min = scale.get("__min__");
        const max = scale.get("__max__");
        const t = max > min ? (rawValue - min) / (max - min) : 0.5;
        return lerpSequential(t, getSequentialPalette(scale.get("__palette__")));
      }
      return MISSING_DATA_COLOUR;
    }
    _tipColourForValue(value) {
      return this._colourFromScale(value, this._tipColourScale);
    }
    _nodeColourForValue(value) {
      return this._colourFromScale(value, this._nodeColourScale);
    }
    _labelColourForValue(value) {
      return this._colourFromScale(value, this._labelColourScale);
    }
    _tipLabelShapeColourForValue(value) {
      return this._colourFromScale(value, this._tipLabelShapeColourScale);
    }
    _tipLabelShape2ColourForValue(value) {
      return this._colourFromScale(value, this._tipLabelShape2ColourScale);
    }
    /** Pixel size of tip-label shape swatches, relative to the current inter-tip spacing (scaleY).
     *  square / circle: sizePercent 1–100 maps to 1–100 % of scaleY.
     *  block: sizePercent 1–100 maps to 0.1×–10× scaleY (width only; height is always scaleY). */
    _shapeSize(sizePercent, shape = "square") {
      if (shape === "block") {
        return Math.max(1, this.scaleY * sizePercent / 10);
      }
      return Math.max(2, Math.round(this.scaleY * sizePercent / 100));
    }
    /**
     * Register a LegendRenderer instance.  TreeRenderer will automatically proxy
     * background-colour and annotation-schema changes to it, and call resize()
     * during its own _resize() pass.
     * @param {import('./legendrenderer.js').LegendRenderer} lr
     */
    setLegendRenderer(lr) {
      this._legendRenderer = lr;
    }
    /** Snapshot the current view state for the nav stacks. */
    _currentViewState() {
      return {
        subtreeRootId: this._viewSubtreeRootId,
        scaleY: this._targetScaleY,
        offsetY: this._targetOffsetY,
        selectedTipIds: new Set(this._selectedTipIds),
        mrcaNodeId: this._mrcaNodeId
      };
    }
    /**
     * Compute a new layout rooted at subtreeRootId (null = full tree) and
     * install it as the current view state, refreshing labels and scale bounds.
     * Used by all five navigation methods to eliminate the repeated 5-line pattern.
     * @param {string|null} subtreeRootId
     */
    _computeAndInstallLayout(subtreeRootId) {
      const { nodes: nodes2, nodeMap: nodeMap2, maxX, maxY } = computeLayoutFromGraph(
        this.graph,
        subtreeRootId,
        { clampNegativeBranches: this.clampNegativeBranches }
      );
      this.nodes = nodes2;
      this.nodeMap = nodeMap2;
      this.maxX = maxX;
      this.maxY = maxY;
      this._measureLabels();
      this._updateScaleX(false);
      this._updateMinScaleY();
    }
    /** Double-click on an internal layout node id → drill into its subtree. */
    navigateInto(layoutNodeId) {
      const layoutNode = this.nodeMap?.get(layoutNodeId);
      if (!layoutNode || layoutNode.isTip || !layoutNode.parentId) return;
      const px_old = this.offsetX + layoutNode.x * this.scaleX;
      const py_old = this.offsetY + layoutNode.y * this.scaleY;
      this._navStack.push(this._currentViewState());
      this._fwdStack = [];
      this._viewSubtreeRootId = layoutNodeId;
      this._selectedTipIds.clear();
      this._mrcaNodeId = null;
      this._computeAndInstallLayout(layoutNodeId);
      const newScaleY = Math.max(this.minScaleY, this._targetScaleY);
      const newOffsetY = this.paddingTop + newScaleY * 0.5;
      this._setTarget(newOffsetY, newScaleY, false);
      const newRoot = this.nodes.find((n) => !n.parentId);
      if (newRoot) {
        this.offsetX = px_old;
        this.offsetY = py_old - newRoot.y * this.scaleY;
      }
      this._animating = true;
      this._dirty = true;
      if (this._onLayoutChange) this._onLayoutChange(this.maxX, this._viewSubtreeRootId);
      if (this._onNavChange) this._onNavChange(true, false);
    }
    navigateBack() {
      if (!this._navStack.length) return;
      const curRootLayout = this.nodes ? this.nodes.find((n) => !n.parentId) : null;
      const px_cur = this.offsetX;
      const py_cur = curRootLayout ? this.offsetY + curRootLayout.y * this.scaleY : this.canvas.clientHeight / 2;
      const curRootId = curRootLayout ? curRootLayout.id : null;
      const oldNodeMap = this.nodeMap;
      const oldOffsetX = this.offsetX;
      const oldOffsetY = this.offsetY;
      const oldScaleX = this.scaleX;
      const oldScaleY = this.scaleY;
      this._fwdStack.push(this._currentViewState());
      const state = this._navStack.pop();
      this._viewSubtreeRootId = state.subtreeRootId;
      this._selectedTipIds = new Set(state.selectedTipIds || []);
      this._mrcaNodeId = state.mrcaNodeId || null;
      this._computeAndInstallLayout(state.subtreeRootId);
      this._setTarget(state.offsetY, state.scaleY, false);
      let seeded = false;
      if (curRootId) {
        const restoredNode = nodeMap.get(curRootId);
        if (restoredNode) {
          this.offsetX = px_cur - restoredNode.x * this.scaleX;
          this.offsetY = py_cur - restoredNode.y * this.scaleY;
          seeded = true;
        }
      }
      if (!seeded && state.subtreeRootId && oldNodeMap) {
        const subtreeInOld = oldNodeMap.get(state.subtreeRootId);
        if (subtreeInOld) {
          const px_sub = oldOffsetX + subtreeInOld.x * oldScaleX;
          const py_sub = oldOffsetY + subtreeInOld.y * oldScaleY;
          const newRoot = nodes.find((n) => !n.parentId);
          this.offsetX = px_sub;
          this.offsetY = newRoot ? py_sub - newRoot.y * this.scaleY : py_sub;
        }
      }
      this._animating = true;
      this._dirty = true;
      if (this._onLayoutChange) this._onLayoutChange(this.maxX, this._viewSubtreeRootId);
      if (this._onNavChange) this._onNavChange(this._navStack.length > 0, true);
      if (this._onNodeSelectChange) this._onNodeSelectChange(this._selectedTipIds.size > 0 || !!this._mrcaNodeId);
    }
    navigateForward() {
      if (!this._fwdStack.length) return;
      const state = this._fwdStack[this._fwdStack.length - 1];
      const fwdSubtreeRootId = state.subtreeRootId;
      const fromNode = fwdSubtreeRootId && this.nodeMap ? this.nodeMap.get(fwdSubtreeRootId) : null;
      const px_old = fromNode ? this.offsetX + fromNode.x * this.scaleX : this.paddingLeft;
      const py_old = fromNode ? this.offsetY + fromNode.y * this.scaleY : this.canvas.clientHeight / 2;
      this._navStack.push(this._currentViewState());
      this._fwdStack.pop();
      this._viewSubtreeRootId = state.subtreeRootId;
      this._selectedTipIds = new Set(state.selectedTipIds || []);
      this._mrcaNodeId = state.mrcaNodeId || null;
      this._computeAndInstallLayout(fwdSubtreeRootId);
      this._setTarget(state.offsetY, state.scaleY, false);
      const newRoot = this.nodes.find((n) => !n.parentId);
      if (newRoot) {
        this.offsetX = px_old;
        this.offsetY = py_old - newRoot.y * this.scaleY;
      }
      this._animating = true;
      this._dirty = true;
      if (this._onLayoutChange) this._onLayoutChange(this.maxX, this._viewSubtreeRootId);
      if (this._onNavChange) this._onNavChange(true, this._fwdStack.length > 0);
      if (this._onNodeSelectChange) this._onNodeSelectChange(this._selectedTipIds.size > 0 || !!this._mrcaNodeId);
    }
    /** Jump directly to the global root, pushing the current view onto the back stack. */
    navigateHome() {
      if (!this._viewSubtreeRootId) return;
      const curRootLayout = this.nodes ? this.nodes.find((n) => !n.parentId) : null;
      const px_cur = this.offsetX;
      const py_cur = curRootLayout ? this.offsetY + curRootLayout.y * this.scaleY : this.canvas.clientHeight / 2;
      const curRootId = curRootLayout ? curRootLayout.id : null;
      this._navStack.push(this._currentViewState());
      this._fwdStack = [];
      this._viewSubtreeRootId = null;
      this._selectedTipIds.clear();
      this._mrcaNodeId = null;
      this._computeAndInstallLayout(null);
      const newOffsetY = this.paddingTop + this.minScaleY * 0.5;
      this._setTarget(newOffsetY, this.minScaleY, false);
      if (curRootId) {
        const restoredNode = nodeMap.get(curRootId);
        if (restoredNode) {
          this.offsetX = px_cur - restoredNode.x * this.scaleX;
          this.offsetY = py_cur - restoredNode.y * this.scaleY;
        }
      }
      this._animating = true;
      this._dirty = true;
      if (this._onLayoutChange) this._onLayoutChange(this.maxX, this._viewSubtreeRootId);
      if (this._onNavChange) this._onNavChange(this._navStack.length > 0, false);
      if (this._onNodeSelectChange) this._onNodeSelectChange(false);
    }
    /**
     * Move the view one level up the tree from the current subtree root.
     * The parent of the current subtree root becomes the new subtree root
     * (or the full tree is shown if the parent is the global root).
     * The current state is pushed onto the back stack.
     */
    navigateClimb() {
      if (!this._viewSubtreeRootId) return;
      const nodeIdx = this.graph.origIdToIdx.get(this._viewSubtreeRootId);
      if (nodeIdx === void 0) return;
      const parentIdx = this.graph.nodes[nodeIdx].adjacents[0];
      if (parentIdx === void 0 || parentIdx < 0) return;
      const { nodeA, nodeB, lenA } = this.graph.root;
      const parentIsRoot = lenA === 0 ? parentIdx === nodeA : parentIdx === nodeA || parentIdx === nodeB;
      const newSubtreeRootId = parentIsRoot ? null : this.graph.nodes[parentIdx].origId;
      const curRootLayout = this.nodes ? this.nodes.find((n) => !n.parentId) : null;
      const py_cur = curRootLayout ? this.offsetY + curRootLayout.y * this.scaleY : this.canvas.clientHeight / 2;
      const curRootId = curRootLayout ? curRootLayout.id : null;
      this._navStack.push(this._currentViewState());
      this._fwdStack = [];
      this._viewSubtreeRootId = newSubtreeRootId;
      this._selectedTipIds.clear();
      this._mrcaNodeId = null;
      this._computeAndInstallLayout(newSubtreeRootId);
      const newOffsetY = this.paddingTop + this.minScaleY * 0.5;
      this._setTarget(newOffsetY, this.minScaleY, false);
      if (curRootId) {
        const restoredNode = nodeMap.get(curRootId);
        if (restoredNode) {
          this._rootShiftFromX = this.paddingLeft - restoredNode.x * this.scaleX;
          this._rootShiftToX = this.paddingLeft;
          this._rootShiftAlpha = 0;
          this.offsetX = this._rootShiftFromX;
          this.offsetY = py_cur - restoredNode.y * this.scaleY;
        }
      }
      this._animating = true;
      this._dirty = true;
      if (this._onLayoutChange) this._onLayoutChange(this.maxX, this._viewSubtreeRootId);
      if (this._onNavChange) this._onNavChange(true, false);
      if (this._onNodeSelectChange) this._onNodeSelectChange(false);
    }
    /**
     * Returns the display text for a tip node label.
     * Uses the tipLabelAnnotation value when set; falls back to node.name.
     * Handles the synthetic CAL_DATE_KEY / CAL_DATE_HPD_KEY / CAL_DATE_HPD_ONLY_KEY sentinels.
     */
    /**
     * Shared implementation for _tipLabelText / _nodeLabelText.
     * @param {object}      node           The tree node.
     * @param {string|null} key            The annotation key.
     * @param {number|null} decimalPlaces  Fixed decimal places for numeric values (null = auto).
     * @param {string|null} nameFallback   Value returned when no label can be derived.
     */
    _labelText(node, key, decimalPlaces, nameFallback) {
      if (!key) return nameFallback;
      if (key === CAL_DATE_KEY || key === CAL_DATE_HPD_KEY || key === CAL_DATE_HPD_ONLY_KEY) {
        const cal = this._calCalibration;
        if (!cal?.isActive) return nameFallback;
        const height = this.maxX - node.x;
        const hpdKey = this._annotationSchema?.get("height")?.group?.hpd;
        const hpd = hpdKey ? node.annotations?.[hpdKey] : null;
        const hasHpd = Array.isArray(hpd) && hpd.length >= 2;
        if (key === CAL_DATE_HPD_ONLY_KEY) {
          if (!hasHpd) return null;
          const dOlder = cal.heightToDateString(hpd[1], "full", this._calDateFormat);
          const dNewer = cal.heightToDateString(hpd[0], "full", this._calDateFormat);
          return `[${dOlder} \u2013 ${dNewer}]`;
        }
        const dateStr = cal.heightToDateString(height, "full", this._calDateFormat);
        if (key === CAL_DATE_HPD_KEY && hasHpd) {
          const dOlder = cal.heightToDateString(hpd[1], "full", this._calDateFormat);
          const dNewer = cal.heightToDateString(hpd[0], "full", this._calDateFormat);
          return `${dateStr} [${dOlder} \u2013 ${dNewer}]`;
        }
        return dateStr;
      }
      const def = this._annotationSchema?.get(key);
      let val = node.annotations?.[key];
      if ((val == null || val === "") && def?.group?.mean) {
        val = node.annotations?.[def.group.mean];
      }
      if (val == null || val === "") return nameFallback;
      if (Array.isArray(val)) return val.join(", ");
      if (typeof val === "number") {
        if (decimalPlaces != null) return val.toFixed(decimalPlaces);
        if (def?.fmtValue) return def.fmtValue(val);
        if (def?.fmt) return def.fmt(val);
      }
      return String(val);
    }
    _tipLabelText(node) {
      if (this._tipLabelsOff) return null;
      return this._labelText(node, this.tipLabelAnnotation, this._tipLabelDecimalPlaces, node.name || null);
    }
    /**
     * Returns the display text for an internal-node label.
     * Uses nodeLabelAnnotation to look up the annotation value on the node.
     * Handles the synthetic CAL_DATE_KEY / CAL_DATE_HPD_KEY / CAL_DATE_HPD_ONLY_KEY sentinels.
     */
    _nodeLabelText(node) {
      return this._labelText(node, this.nodeLabelAnnotation, this._nodeLabelDecimalPlaces, null);
    }
    _measureLabels() {
      if (!this.nodes) return;
      const cacheKey = `${this.fontSize}|${this.fontFamily}|${this.tipLabelAnnotation ?? ""}|${this._calDateFormat}|${this._tipLabelDecimalPlaces ?? ""}|${this._nodeLabelDecimalPlaces ?? ""}|${this._tipLabelsOff ? "0" : "1"}`;
      if (this._labelCacheKey !== cacheKey) {
        const ctx = this.ctx;
        ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        let max = 0;
        for (const n of this.nodes) {
          if (!n.isTip) continue;
          const t = this._tipLabelText(n);
          if (t) {
            const w = ctx.measureText(t).width;
            if (w > max) max = w;
          }
        }
        this._maxLabelWidth = max;
        this._labelCacheKey = cacheKey;
      }
      const r = this.tipRadius;
      const tipOuterR = r > 0 ? r + this.tipHaloSize : 0;
      const shapeExtra = this._tipLabelShape !== "off" ? this._tipLabelShapeMarginLeft + this._shapeSize(this._tipLabelShapeSize, this._tipLabelShape) + this._tipLabelShapeMarginRight : 0;
      const shape2Extra = this._tipLabelShape !== "off" && this._tipLabelShape2 !== "off" ? this._shapeSize(this._tipLabelShape2Size, this._tipLabelShape2) + this._tipLabelShape2MarginRight : 0;
      this.labelRightPad = this._maxLabelWidth + Math.max(tipOuterR, 5) + 5 + shapeExtra + shape2Extra + (this.paddingRight ?? 10);
    }
    /** Recompute scaleX so the tree always fills the full viewport width.
     *  immediate=true (default) snaps instantly; false animates via _targetScaleX. */
    _updateScaleX(immediate = true) {
      const W = this.canvas.clientWidth;
      const plotW = W - this.paddingLeft - this.labelRightPad;
      const barPad = this.nodeBarsEnabled ? this._nodeBarsLeftPad() : 0;
      this._targetScaleX = plotW / (this.maxX + barPad);
      this._targetOffsetX = this.paddingLeft + barPad * this._targetScaleX;
      if (immediate) {
        this.scaleX = this._targetScaleX;
        this.offsetX = this._targetOffsetX;
      } else {
        this._animating = true;
      }
    }
    /**
     * Return the number of world-units by which node bars or whiskers extend to
     * the LEFT of the root (worldX < 0).  Used to add left padding for the scale.
     */
    _nodeBarsLeftPad() {
      if (!this.nodes || !this._annotationSchema) return 0;
      const heightDef = this._annotationSchema.get("height");
      if (!heightDef?.group?.hpd) return 0;
      const hpdKey = heightDef.group.hpd;
      const rangeKey = this.nodeBarsShowRange && heightDef.group.range ? heightDef.group.range : null;
      let maxLeftward = 0;
      for (const node of this.nodes) {
        if (node.isTip) continue;
        const hpd = node.annotations?.[hpdKey];
        if (Array.isArray(hpd) && hpd.length >= 2) {
          const excess = hpd[1] - this.maxX;
          if (excess > maxLeftward) maxLeftward = excess;
        }
        if (rangeKey) {
          const range = node.annotations?.[rangeKey];
          if (Array.isArray(range) && range.length >= 2) {
            const excess = range[1] - this.maxX;
            if (excess > maxLeftward) maxLeftward = excess;
          }
        }
      }
      return maxLeftward;
    }
    /** Recompute the minimum scaleY (tree fits the viewport vertically). */
    _updateMinScaleY() {
      const H = this.canvas.clientHeight;
      const plotH = H - this.paddingTop - this.paddingBottom;
      this.minScaleY = plotH / (this.maxY + 1);
    }
    // _clampOffsetY is replaced by _clampedOffsetY (pure) + _setTarget.
    fitToWindow(immediate = false) {
      if (!this.nodes) return;
      this._fitLabelsMode = false;
      this._updateScaleX();
      this._updateMinScaleY();
      const newOffsetY = this.paddingTop + this.minScaleY * 0.5;
      this._setTarget(newOffsetY, this.minScaleY, immediate);
      this._dirty = true;
    }
    /**
     * Zoom to the level where consecutive tip labels no longer overlap.
     * Each tip occupies 1 world unit; we need at least (fontSize + 2) screen px per unit.
     */
    fitLabels() {
      if (!this.nodes) return;
      this._fitLabelsMode = true;
      this._updateMinScaleY();
      const labelScaleY = this.fontSize + 2;
      const newScaleY = Math.max(this.minScaleY, labelScaleY);
      const H = this.canvas.clientHeight;
      const centreWorldY = this._worldYfromScreen(H / 2);
      const newOffsetY = H / 2 - centreWorldY * newScaleY;
      this._setTarget(
        newOffsetY,
        newScaleY,
        /*immediate*/
        false
      );
      this._dirty = true;
    }
    zoomIn() {
      if (!this.nodes) return;
      this._fitLabelsMode = false;
      const centerY = this.canvas.clientHeight / 2;
      this._setTarget(this._targetOffsetY, this._targetScaleY * 1.5, false, centerY);
    }
    zoomOut() {
      if (!this.nodes) return;
      this._fitLabelsMode = false;
      const centerY = this.canvas.clientHeight / 2;
      this._setTarget(this._targetOffsetY, this._targetScaleY / 1.5, false, centerY);
    }
    /** Expand the flat centre zone of the hyperbolic lens by one row. */
    hypMagUp() {
      this._hypMagMult = Math.min(20, this._hypMagMult + 1);
      this._dirty = true;
    }
    /** Contract the flat centre zone of the hyperbolic lens by one row. */
    hypMagDown() {
      this._hypMagMult = Math.max(0, this._hypMagMult - 1);
      this._dirty = true;
    }
    /**
     * Render the full tree (fit-to-window) into an OffscreenCanvas at the given
     * CSS pixel dimensions.  The entire tree is drawn unclipped.
     * Does NOT mutate any persistent rendering state.
     *
     * @param {OffscreenCanvas} offscreenCanvas  target canvas (width × height in physical px)
     * @param {number} targetW   CSS-pixel width  of the canvas
     * @param {number} targetH   CSS-pixel height of the canvas
     */
    renderFull(offscreenCanvas, targetW, targetH, skipBg = false) {
      if (!this.nodes) return;
      const plotW = targetW - this.paddingLeft - this.labelRightPad;
      const plotH = targetH - this.paddingTop - this.paddingBottom;
      const sx = plotW / (this.maxX || 1);
      const sy = plotH / ((this.maxY || 1) + 1);
      const ox = this.paddingLeft;
      const oy = this.paddingTop + sy * 0.5;
      const s_ctx = this.ctx, s_canvas = this.canvas;
      const s_sx = this.scaleX, s_ox = this.offsetX;
      const s_sy = this.scaleY, s_oy = this.offsetY;
      const s_hyp = this._hypFocusScreenY;
      const s_str = this._hypStrength;
      this._hypFocusScreenY = null;
      this._hypStrength = 0;
      this.ctx = offscreenCanvas.getContext("2d");
      this.canvas = { clientWidth: targetW, clientHeight: targetH };
      this.scaleX = sx;
      this.offsetX = ox;
      this.scaleY = sy;
      this.offsetY = oy;
      this._skipBg = skipBg;
      this._draw();
      this._skipBg = false;
      this.ctx = s_ctx;
      this.canvas = s_canvas;
      this.scaleX = s_sx;
      this.offsetX = s_ox;
      this.scaleY = s_sy;
      this.offsetY = s_oy;
      this._hypFocusScreenY = s_hyp;
      this._hypStrength = s_str;
    }
    /**
     * Render the current viewport to an OffscreenCanvas without switching
     * scale/offset (used for transparent PNG export).
     */
    renderViewToOffscreen(oc, skipBg = false) {
      if (!this.nodes) return;
      const s_ctx = this.ctx, s_canvas = this.canvas;
      const s_hyp = this._hypFocusScreenY;
      const s_str = this._hypStrength;
      this._hypFocusScreenY = null;
      this._hypStrength = 0;
      const W = s_canvas.clientWidth, H = s_canvas.clientHeight;
      this.ctx = oc.getContext("2d");
      this.canvas = { clientWidth: W, clientHeight: H };
      this._skipBg = skipBg;
      this._draw();
      this._skipBg = false;
      this.ctx = s_ctx;
      this.canvas = s_canvas;
      this._hypFocusScreenY = s_hyp;
      this._hypStrength = s_str;
    }
    /**
     * Compute the clamped offsetY for a given scaleY and desired raw offsetY.
     * Does NOT mutate state.
     */
    _clampedOffsetY(offsetY, scaleY) {
      const H = this.canvas.clientHeight;
      const maxOY = this.paddingTop - scaleY * 0.5;
      const minOY = H - this.paddingBottom - (this.maxY + 0.5) * scaleY;
      if (minOY > maxOY) return (minOY + maxOY) / 2;
      return Math.min(maxOY, Math.max(minOY, offsetY));
    }
    /**
     * Set animation targets (and optionally apply immediately).
     * @param {number} offsetY  desired raw offsetY
     * @param {number} scaleY   desired scaleY
     * @param {boolean} immediate  if true, snap with no animation
     * @param {number|null} pivotScreenY  screen-y to hold fixed during zoom
     */
    _setTarget(offsetY, scaleY, immediate = false, pivotScreenY = null) {
      const newScaleY = Math.max(this.minScaleY, scaleY);
      let newOffsetY = offsetY;
      if (pivotScreenY !== null) {
        const worldY = (pivotScreenY - this._targetOffsetY) / this._targetScaleY;
        newOffsetY = pivotScreenY - worldY * newScaleY;
      }
      this._targetScaleY = newScaleY;
      this._targetOffsetY = this._clampedOffsetY(newOffsetY, newScaleY);
      if (immediate) {
        this.scaleY = this._targetScaleY;
        this.offsetY = this._targetOffsetY;
        this._animating = false;
      } else {
        this._animating = true;
      }
      this._dirty = true;
    }
    // X is anchored to offsetX (animated during navigation, otherwise == paddingLeft).
    _wx(worldX) {
      return this.offsetX + worldX * this.scaleX;
    }
    /** World Y → screen Y, with animated hyperbolic fisheye blend. */
    _wy(worldY) {
      const sy = this.offsetY + worldY * this.scaleY;
      if (this._hypFocusScreenY === null || this._hypStrength <= 0) return sy;
      const distorted = this._fisheyeScreenY(sy);
      if (this._hypStrength >= 1) return distorted;
      return sy + (distorted - sy) * this._hypStrength;
    }
    _worldYfromScreen(sy) {
      return (sy - this.offsetY) / this.scaleY;
    }
    _worldXfromScreen(sx) {
      return (sx - this.offsetX) / this.scaleX;
    }
    /**
     * Apply hyperbolic fisheye distortion to a linear screen-Y value.
     *
     * The lens has three zones:
     *   • Flat centre  (|d| ≤ W): uniform expansion at peak magFactor.
     *   • Outer zones  (|d| > W): Möbius-form falloff that smoothly
     *     continues from the flat zone and clamps the tree to its bounds.
     *
     * magFactor is capped at the "fit labels" level so the peak spacing never
     * exceeds what Fit Labels would produce.  _hypMagMult controls how many
     * rows wide the flat centre zone is (0 = pure hyperbolic, no flat section).
     */
    _fisheyeScreenY(sy) {
      const cy = this._hypFocusScreenY;
      const magFactor = Math.max(1, (this.fontSize + 2) / this.scaleY);
      if (magFactor <= 1) return sy;
      const d = sy - cy;
      const sy_top = this.offsetY + 0.5 * this.scaleY;
      const sy_bot = this.offsetY + (this.maxY + 0.5) * this.scaleY;
      const W_req = this._hypMagMult * this.scaleY;
      const W_above = Math.min(W_req, Math.max(0, cy - sy_top) / magFactor);
      const W_below = Math.min(W_req, Math.max(0, sy_bot - cy) / magFactor);
      const W = d < 0 ? W_above : W_below;
      if (Math.abs(d) <= W) return cy + d * magFactor;
      const sign = d > 0 ? 1 : -1;
      const x = Math.abs(d) - W;
      const D = (d > 0 ? sy_bot - cy : cy - sy_top) - W;
      const D_out = D - W * (magFactor - 1);
      if (D_out <= 0) return d > 0 ? sy_bot : sy_top;
      const b = D * D_out / ((magFactor - 1) * (D + W));
      const y = b * magFactor * x / (b + x);
      return cy + sign * (W * magFactor + y);
    }
    /**
     * Whether a tip label at the given world-Y should be rendered.
     * In normal mode this is a global threshold; in hyperbolic-stretch mode
     * it checks the local inter-tip spacing using the derivative of the
     * piecewise fisheye function.
     */
    _showLabelAt(worldY) {
      const minScale = this.fontSize * 0.5;
      if (this._hypFocusScreenY === null || this._hypStrength <= 0) return this.scaleY >= minScale;
      const magFactor = Math.max(1, (this.fontSize + 2) / this.scaleY);
      if (magFactor <= 1) return this.scaleY >= minScale;
      const sy_lin = this.offsetY + worldY * this.scaleY;
      const cy = this._hypFocusScreenY;
      const W_req = this._hypMagMult * this.scaleY;
      const sy_top = this.offsetY + 0.5 * this.scaleY;
      const sy_bot = this.offsetY + (this.maxY + 0.5) * this.scaleY;
      const d = sy_lin - cy;
      const W = d < 0 ? Math.min(W_req, Math.max(0, cy - sy_top) / magFactor) : Math.min(W_req, Math.max(0, sy_bot - cy) / magFactor);
      const s = this._hypStrength;
      if (Math.abs(d) <= W) {
        return this.scaleY * (1 + (magFactor - 1) * s) >= minScale;
      }
      const x = Math.abs(d) - W;
      const D = (d > 0 ? sy_bot - cy : cy - sy_top) - W;
      const D_out = D - W * (magFactor - 1);
      if (D_out <= 0) return false;
      const b = D * D_out / ((magFactor - 1) * (D + W));
      const dydx = b * b * magFactor / ((b + x) * (b + x));
      return this.scaleY * (1 - s + dydx * s) >= minScale;
    }
    _viewHash() {
      return `${this.scaleX.toFixed(4)}|${this.offsetX.toFixed(2)}|${this.paddingLeft}|${this.labelRightPad}|${this.bgColor}|${this.fontSize}|${this.canvas.clientWidth}|${this.canvas.clientHeight}`;
    }
    _resize() {
      const W = this.canvas.parentElement.clientWidth;
      const H = this.canvas.parentElement.clientHeight;
      this.canvas.style.width = W + "px";
      this.canvas.style.height = H + "px";
      this._pendingBitmapW = W * this.dpr;
      this._pendingBitmapH = H * this.dpr;
      if (this.nodes) {
        const zoomRatio = this.minScaleY > 0 ? this._targetScaleY / this.minScaleY : 1;
        this._updateScaleX();
        this._updateMinScaleY();
        const newScaleY = Math.max(this.minScaleY, this.minScaleY * zoomRatio);
        this._setTarget(this._targetOffsetY, newScaleY, true);
      }
      this._legendRenderer?.resize();
      this._dirty = true;
    }
    _loop() {
      if (this._crossfadeAlpha > 0) {
        const EASE = 0.055;
        this._crossfadeAlpha = Math.max(0, this._crossfadeAlpha - EASE);
        if (this._crossfadeAlpha === 0) this._crossfadeSnapshot = null;
        this._dirty = true;
      }
      if (this._introPhase !== null) {
        const EASE = 0.04;
        this._introAlpha = Math.min(1, this._introAlpha + EASE);
        const t = this._introAlpha;
        const a = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const done = this._introAlpha >= 1;
        const fX = this._introFinalX;
        const fY = this._introFinalY;
        const rY = this._introRootY;
        switch (this._introStyle) {
          case "y-then-x":
            if (this._introPhase === 1) {
              for (const node of this.nodes) {
                node.y = rY + (fY.get(node.id) - rY) * a;
                node.x = 0;
              }
              if (done) {
                for (const node of this.nodes) {
                  node.y = fY.get(node.id);
                  node.x = 0;
                }
                this._introPhase = 2;
                this._introAlpha = 0;
              }
            } else {
              for (const node of this.nodes) node.x = fX.get(node.id) * a;
              if (done) this._introEnd();
            }
            break;
          case "x-then-y":
            if (this._introPhase === 1) {
              for (const node of this.nodes) {
                node.x = fX.get(node.id) * a;
                node.y = rY;
              }
              if (done) {
                for (const node of this.nodes) {
                  node.x = fX.get(node.id);
                  node.y = rY;
                }
                this._introPhase = 2;
                this._introAlpha = 0;
              }
            } else {
              for (const node of this.nodes) node.y = rY + (fY.get(node.id) - rY) * a;
              if (done) this._introEnd();
            }
            break;
          case "simultaneous":
            for (const node of this.nodes) {
              node.x = fX.get(node.id) * a;
              node.y = rY + (fY.get(node.id) - rY) * a;
            }
            if (done) this._introEnd();
            break;
          case "from-bottom": {
            const edgeY = this.maxY;
            for (const node of this.nodes) {
              node.x = fX.get(node.id);
              node.y = edgeY + (fY.get(node.id) - edgeY) * a;
            }
            if (done) this._introEnd();
            break;
          }
          case "from-top":
            for (const node of this.nodes) {
              node.x = fX.get(node.id);
              node.y = fY.get(node.id) * a;
            }
            if (done) this._introEnd();
            break;
          default:
            this._introEnd();
        }
        this._dirty = true;
      }
      if (this._reorderAlpha < 1) {
        const EASE = 0.05;
        this._reorderAlpha = Math.min(1, this._reorderAlpha + EASE);
        const t = this._reorderAlpha;
        const a = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        for (const node of this.nodes) {
          const fy = this._reorderFromY.get(node.id);
          const ty = this._reorderToY.get(node.id);
          if (fy !== void 0 && ty !== void 0) {
            node.y = fy + (ty - fy) * a;
          }
        }
        if (this._reorderAlpha >= 1) {
          for (const node of this.nodes) {
            const ty = this._reorderToY.get(node.id);
            if (ty !== void 0) node.y = ty;
          }
          this._reorderFromY = null;
          this._reorderToY = null;
        }
        this._dirty = true;
      }
      if (this._rootShiftAlpha < 1) {
        const EASE = 0.05;
        this._rootShiftAlpha = Math.min(1, this._rootShiftAlpha + EASE);
        const t = this._rootShiftAlpha;
        const a = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        this.offsetX = this._rootShiftFromX + (this._rootShiftToX - this._rootShiftFromX) * a;
        this._dirty = true;
      }
      if (this._animating) {
        const EASE = 0.16;
        const dY = this._targetOffsetY - this.offsetY;
        const dSY = this._targetScaleY - this.scaleY;
        const dSX = this._targetScaleX - this.scaleX;
        const dOX = this._rootShiftAlpha < 1 ? 0 : this._targetOffsetX - this.offsetX;
        if (Math.abs(dY) < 0.05 && Math.abs(dSY) < 5e-5 && Math.abs(dSX) < 5e-5 && Math.abs(dOX) < 0.05) {
          this.offsetY = this._targetOffsetY;
          this.scaleY = this._targetScaleY;
          this.scaleX = this._targetScaleX;
          if (this._rootShiftAlpha >= 1) this.offsetX = this._targetOffsetX;
          this._animating = false;
        } else {
          this.offsetY += dY * EASE;
          this.scaleY += dSY * EASE;
          this.scaleX += dSX * EASE;
          if (this._rootShiftAlpha >= 1) this.offsetX += dOX * EASE;
        }
        this._dirty = true;
      }
      if (this._hypStrength !== this._hypTarget) {
        const dH = this._hypTarget - this._hypStrength;
        if (Math.abs(dH) < 5e-3) {
          this._hypStrength = this._hypTarget;
          if (this._hypTarget === 0) this._hypFocusScreenY = null;
        } else {
          this._hypStrength += dH * 0.18;
        }
        this._dirty = true;
      }
      if (this._dirty) {
        this._draw();
        this._dirty = false;
      }
      if (this._onViewChange && (this._animating || this._reorderAlpha < 1 || this._rootShiftAlpha < 1 || this._crossfadeAlpha > 0 || this._introPhase !== null || !this._lastViewHash || this._lastViewHash !== this._viewHash())) {
        this._lastViewHash = this._viewHash();
        this._onViewChange(this.scaleX, this.offsetX, this.paddingLeft, this.labelRightPad, this.bgColor, this.fontSize, window.devicePixelRatio || 1);
      }
      this._rafId = requestAnimationFrame(() => this._loop());
    }
    _draw() {
      const ctx = this.ctx;
      const W = this.canvas.clientWidth;
      const H = this.canvas.clientHeight;
      if (this._pendingBitmapW !== void 0) {
        const pw = this._pendingBitmapW;
        const ph = this._pendingBitmapH;
        if (this.canvas.width !== pw || this.canvas.height !== ph) {
          this.canvas.width = pw;
          this.canvas.height = ph;
        }
        this._pendingBitmapW = void 0;
        this._pendingBitmapH = void 0;
      }
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!this.nodes) return;
      if (!this._skipBg) {
        ctx.fillStyle = this.bgColor;
        ctx.fillRect(0, 0, W, H);
      }
      const yWorldMin = this._worldYfromScreen(-this.fontSize * 2);
      const yWorldMax = this._worldYfromScreen(H + this.fontSize * 2);
      this._drawNodeBars(yWorldMin, yWorldMax);
      this._drawBranches(yWorldMin, yWorldMax);
      this._drawNodesAndLabels(yWorldMin, yWorldMax);
      this._drawSelectionAndHover(yWorldMin, yWorldMax);
      this._drawNodeLabels(yWorldMin, yWorldMax);
      if (this._crossfadeSnapshot && this._crossfadeAlpha > 0) {
        const cW = this.canvas.clientWidth;
        const cH = this.canvas.clientHeight;
        const t = this._crossfadeAlpha;
        const a = t * t;
        ctx.globalAlpha = a;
        ctx.drawImage(this._crossfadeSnapshot, 0, 0, cW, cH);
        ctx.globalAlpha = 1;
      }
    }
    /**
     * Draw node bars: translucent HPD intervals rendered behind branches for
     * internal nodes.  Uses the 'height' BEAST annotation group:
     *   – filled rectangle spanning the 95% HPD interval
     *   – dark border around the rectangle
     *   – optional vertical median line inside the rectangle
     *   – optional range whiskers extending beyond the rectangle
     * Heights are converted to x positions as: worldX = maxX − height.
     */
    _drawNodeBars(yWorldMin, yWorldMax) {
      if (!this.nodeBarsEnabled || !this.nodes) return;
      const schema = this._annotationSchema;
      if (!schema) return;
      const heightDef = schema.get("height");
      if (!heightDef || !heightDef.group || !heightDef.group.hpd) return;
      const hpdKey = heightDef.group.hpd;
      const medianKey = heightDef.group.median;
      const rangeKey = heightDef.group.range;
      const maxX = this.maxX;
      const halfW = this.nodeBarsWidth / 2;
      const ctx = this.ctx;
      const col = this.nodeBarsColor;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.22;
      for (const node of this.nodes) {
        if (node.isTip) continue;
        if (node.y < yWorldMin || node.y > yWorldMax) continue;
        const hpd = node.annotations?.[hpdKey];
        if (!Array.isArray(hpd) || hpd.length < 2) continue;
        const xLeft = this._wx(maxX - hpd[1]);
        const xRight = this._wx(maxX - hpd[0]);
        if (xRight <= xLeft) continue;
        ctx.fillRect(xLeft, this._wy(node.y) - halfW, xRight - xLeft, halfW * 2);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (const node of this.nodes) {
        if (node.isTip) continue;
        if (node.y < yWorldMin || node.y > yWorldMax) continue;
        const hpd = node.annotations?.[hpdKey];
        if (!Array.isArray(hpd) || hpd.length < 2) continue;
        const xLeft = this._wx(maxX - hpd[1]);
        const xRight = this._wx(maxX - hpd[0]);
        if (xRight <= xLeft) continue;
        ctx.rect(xLeft, this._wy(node.y) - halfW, xRight - xLeft, halfW * 2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      if (this.nodeBarsShowMedian !== "none") {
        const useMedian = this.nodeBarsShowMedian === "median";
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        for (const node of this.nodes) {
          if (node.isTip) continue;
          if (node.y < yWorldMin || node.y > yWorldMax) continue;
          const hpd = node.annotations?.[hpdKey];
          if (!Array.isArray(hpd) || hpd.length < 2) continue;
          let xLine;
          if (useMedian) {
            if (!medianKey) continue;
            const medVal = node.annotations?.[medianKey];
            if (medVal == null) continue;
            xLine = this._wx(maxX - medVal);
          } else {
            const meanVal = node.annotations?.["height"];
            if (meanVal == null) continue;
            xLine = this._wx(maxX - meanVal);
          }
          const cy = this._wy(node.y);
          ctx.moveTo(xLine, cy - halfW);
          ctx.lineTo(xLine, cy + halfW);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;
      }
      if (this.nodeBarsShowRange && rangeKey) {
        const capH = halfW * 0.6;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        for (const node of this.nodes) {
          if (node.isTip) continue;
          if (node.y < yWorldMin || node.y > yWorldMax) continue;
          const hpd = node.annotations?.[hpdKey];
          const range = node.annotations?.[rangeKey];
          if (!Array.isArray(hpd) || hpd.length < 2) continue;
          if (!Array.isArray(range) || range.length < 2) continue;
          const cy = this._wy(node.y);
          const xHpdL = this._wx(maxX - hpd[1]);
          const xHpdR = this._wx(maxX - hpd[0]);
          const xRangeL = this._wx(maxX - range[1]);
          const xRangeR = this._wx(maxX - range[0]);
          ctx.moveTo(xHpdL, cy);
          ctx.lineTo(xRangeL, cy);
          ctx.moveTo(xRangeL, cy - capH);
          ctx.lineTo(xRangeL, cy + capH);
          ctx.moveTo(xHpdR, cy);
          ctx.lineTo(xRangeR, cy);
          ctx.moveTo(xRangeR, cy - capH);
          ctx.lineTo(xRangeR, cy + capH);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;
      }
    }
    /** Draw all branches: horizontal segments, rounded-elbow arcs, root stub, vertical connectors. */
    _drawBranches(yWorldMin, yWorldMax) {
      const ctx = this.ctx;
      const nodeMap2 = this.nodeMap;
      const er = this.elbowRadius;
      ctx.lineWidth = this.branchWidth;
      ctx.strokeStyle = this.branchColor;
      ctx.beginPath();
      for (const node of this.nodes) {
        if (!node.parentId) continue;
        if (node.y < yWorldMin || node.y > yWorldMax) continue;
        const parent = nodeMap2.get(node.parentId);
        if (!parent) continue;
        const px = this._wx(parent.x);
        const nx = this._wx(node.x);
        const ny = this._wy(node.y);
        const py = this._wy(parent.y);
        const dx = nx - px;
        const dir = dx >= 0 ? 1 : -1;
        const cer = Math.min(er, Math.abs(ny - py) * 0.4, Math.abs(dx) * 0.4);
        ctx.moveTo(px + dir * cer, ny);
        ctx.lineTo(nx, ny);
      }
      ctx.stroke();
      if (er > 0) {
        ctx.beginPath();
        for (const node of this.nodes) {
          if (!node.parentId) continue;
          if (node.y < yWorldMin || node.y > yWorldMax) continue;
          const parent = nodeMap2.get(node.parentId);
          if (!parent) continue;
          const px = this._wx(parent.x);
          const nx = this._wx(node.x);
          const ny = this._wy(node.y);
          const py = this._wy(parent.y);
          if (Math.abs(ny - py) < 0.5) continue;
          const dx = nx - px;
          const dir = dx >= 0 ? 1 : -1;
          const cer = Math.max(0, Math.min(er, Math.abs(ny - py) * 0.4, Math.abs(dx) * 0.4));
          if (cer === 0) continue;
          const fromY = ny + (ny < py ? cer : -cer);
          ctx.moveTo(px, fromY);
          ctx.arcTo(px, ny, px + dir * cer, ny, cer);
        }
        ctx.stroke();
      }
      const rootNode = this.nodes[0];
      if (rootNode) {
        const rx = this._wx(rootNode.x);
        const ry = this._wy(rootNode.y);
        const stubLen = this.rootStubLength;
        ctx.beginPath();
        ctx.moveTo(rx - stubLen, ry);
        ctx.lineTo(rx, ry);
        ctx.stroke();
      }
      ctx.beginPath();
      for (const node of this.nodes) {
        if (node.isTip) continue;
        if (node.children.length === 0) continue;
        const childNodes = node.children.map((cid) => nodeMap2.get(cid)).filter(Boolean);
        if (childNodes.length < 2) continue;
        let minY = Infinity, maxY = -Infinity, topChild = null, botChild = null;
        for (const c of childNodes) {
          if (c.y < minY) {
            minY = c.y;
            topChild = c;
          }
          if (c.y > maxY) {
            maxY = c.y;
            botChild = c;
          }
        }
        if (maxY < yWorldMin || minY > yWorldMax) continue;
        const nx = this._wx(node.x);
        const py = this._wy(node.y);
        const ny_top = this._wy(topChild.y);
        const ny_bot = this._wy(botChild.y);
        const cer_top = er > 0 ? Math.min(er, Math.abs(ny_top - py) * 0.4, Math.abs(this._wx(topChild.x) - nx) * 0.4) : 0;
        const cer_bot = er > 0 ? Math.min(er, Math.abs(ny_bot - py) * 0.4, Math.abs(this._wx(botChild.x) - nx) * 0.4) : 0;
        ctx.moveTo(nx, ny_top + cer_top);
        ctx.lineTo(nx, ny_bot - cer_bot);
      }
      ctx.stroke();
    }
    /** Draw node/tip shapes (halos + fills) and tip labels. */
    _drawNodesAndLabels(yWorldMin, yWorldMax) {
      const ctx = this.ctx;
      const r = this.tipRadius;
      const nodeR = this.nodeRadius;
      const tipHalo = this.tipHaloSize;
      const nodeHalo = this.nodeHaloSize;
      const outlineR = Math.max(r + tipHalo, 5);
      ctx.font = `${this.fontSize}px ${this.fontFamily}`;
      ctx.textBaseline = "middle";
      const showLabels = this.scaleY >= this.fontSize * 0.5 || this._hypFocusScreenY !== null;
      if (nodeR > 0 && nodeHalo > 0) {
        ctx.strokeStyle = this.nodeShapeBgColor;
        ctx.lineWidth = nodeHalo * 2;
        ctx.beginPath();
        for (const node of this.nodes) {
          if (node.isTip) continue;
          if (node.y < yWorldMin || node.y > yWorldMax) continue;
          ctx.moveTo(this._wx(node.x) + nodeR, this._wy(node.y));
          ctx.arc(this._wx(node.x), this._wy(node.y), nodeR, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      if (r > 0 && tipHalo > 0) {
        ctx.strokeStyle = this.tipShapeBgColor;
        ctx.lineWidth = tipHalo * 2;
        ctx.beginPath();
        for (const node of this.nodes) {
          if (!node.isTip) continue;
          if (node.y < yWorldMin || node.y > yWorldMax) continue;
          ctx.moveTo(this._wx(node.x) + r, this._wy(node.y));
          ctx.arc(this._wx(node.x), this._wy(node.y), r, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      if (nodeR > 0) {
        if (this._nodeColourBy && this._nodeColourScale) {
          const key = this._nodeColourBy;
          for (const node of this.nodes) {
            if (node.isTip) continue;
            if (node.y < yWorldMin || node.y > yWorldMax) continue;
            const val = node.annotations ? node.annotations[key] : void 0;
            ctx.fillStyle = this._nodeColourForValue(val) ?? this.nodeShapeColor;
            ctx.beginPath();
            ctx.arc(this._wx(node.x), this._wy(node.y), nodeR, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = this.nodeShapeColor;
          ctx.beginPath();
          for (const node of this.nodes) {
            if (node.isTip) continue;
            if (node.y < yWorldMin || node.y > yWorldMax) continue;
            ctx.moveTo(this._wx(node.x) + nodeR, this._wy(node.y));
            ctx.arc(this._wx(node.x), this._wy(node.y), nodeR, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
      if (r > 0) {
        if (this._tipColourBy && this._tipColourScale) {
          const key = this._tipColourBy;
          for (const node of this.nodes) {
            if (!node.isTip) continue;
            if (node.y < yWorldMin || node.y > yWorldMax) continue;
            const val = node.annotations ? node.annotations[key] : void 0;
            const col = this._tipColourForValue(val) ?? this.tipShapeColor;
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(this._wx(node.x), this._wy(node.y), r, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = this.tipShapeColor;
          ctx.beginPath();
          for (const node of this.nodes) {
            if (!node.isTip) continue;
            if (node.y < yWorldMin || node.y > yWorldMax) continue;
            ctx.moveTo(this._wx(node.x) + r, this._wy(node.y));
            ctx.arc(this._wx(node.x), this._wy(node.y), r, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
      const _align = this.tipLabelAlign;
      const alignLabelX = _align && _align !== "off" ? this._wx(this.maxX) + outlineR + 3 : null;
      const _shape = this._tipLabelShape;
      const _shSz = _shape !== "off" ? this._shapeSize(this._tipLabelShapeSize, _shape) : 0;
      const _shML = _shape !== "off" ? this._tipLabelShapeMarginLeft : 0;
      const _shMR = _shape !== "off" ? this._tipLabelShapeMarginRight : 0;
      const _shOffset = _shML + _shSz + _shMR;
      const _shape2 = _shape !== "off" ? this._tipLabelShape2 : "off";
      const _shSz2 = _shape2 !== "off" ? this._shapeSize(this._tipLabelShape2Size, _shape2) : 0;
      const _sh2MR = _shape2 !== "off" ? this._tipLabelShape2MarginRight : 0;
      const _sh2Offset = _shSz2 + _sh2MR;
      const _tx = (baseX) => baseX + _shOffset + _sh2Offset;
      if (showLabels) {
        const hasSelection = this._selectedTipIds.size > 0;
        const dimColor = this.dimLabelColor;
        if (alignLabelX !== null && _align !== "aligned") {
          ctx.save();
          if (_align === "dashed") ctx.setLineDash([3, 4]);
          else if (_align === "dots") ctx.setLineDash([1, 4]);
          ctx.lineWidth = 0.35;
          ctx.strokeStyle = this.dimLabelColor;
          ctx.beginPath();
          for (const node of this.nodes) {
            if (!node.isTip) continue;
            if (node.y < yWorldMin || node.y > yWorldMax) continue;
            if (!this._showLabelAt(node.y)) continue;
            const tipEdgeX = this._wx(node.x) + outlineR + 2;
            const lineEndX = alignLabelX + (_shOffset > 0 ? _shML : 0) - 2;
            if (lineEndX - tipEdgeX < 8) continue;
            const sy = this._wy(node.y);
            ctx.moveTo(tipEdgeX, sy);
            ctx.lineTo(lineEndX, sy);
          }
          ctx.stroke();
          ctx.restore();
        }
        if (hasSelection) {
          ctx.fillStyle = dimColor;
          for (const node of this.nodes) {
            if (!node.isTip || this._selectedTipIds.has(node.id)) continue;
            if (node.y < yWorldMin || node.y > yWorldMax) continue;
            if (!this._showLabelAt(node.y)) continue;
            const _t = this._tipLabelText(node);
            const _bX = alignLabelX ?? this._wx(node.x) + outlineR + 3;
            if (_t) ctx.fillText(_t, _tx(_bX), this._wy(node.y));
          }
          ctx.fillStyle = this.selectedLabelColor;
          ctx.font = `${this.selectedLabelStyle} ${this.fontSize}px ${this.fontFamily}`;
          for (const node of this.nodes) {
            if (!node.isTip || !this._selectedTipIds.has(node.id)) continue;
            if (node.y < yWorldMin || node.y > yWorldMax) continue;
            if (!this._showLabelAt(node.y)) continue;
            const _t = this._tipLabelText(node);
            const _bX = alignLabelX ?? this._wx(node.x) + outlineR + 3;
            if (_t) ctx.fillText(_t, _tx(_bX), this._wy(node.y));
          }
          ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        } else if (this._labelColourBy && this._labelColourScale) {
          const key = this._labelColourBy;
          for (const node of this.nodes) {
            if (!node.isTip) continue;
            if (node.y < yWorldMin || node.y > yWorldMax) continue;
            if (!this._showLabelAt(node.y)) continue;
            const _t = this._tipLabelText(node);
            if (!_t) continue;
            const val = node.annotations ? node.annotations[key] : void 0;
            const _bX = alignLabelX ?? this._wx(node.x) + outlineR + 3;
            ctx.fillStyle = this._labelColourForValue(val) ?? this.labelColor;
            ctx.fillText(_t, _tx(_bX), this._wy(node.y));
          }
        } else {
          ctx.fillStyle = this.labelColor;
          for (const node of this.nodes) {
            if (!node.isTip) continue;
            if (node.y < yWorldMin || node.y > yWorldMax) continue;
            if (!this._showLabelAt(node.y)) continue;
            const _t = this._tipLabelText(node);
            const _bX = alignLabelX ?? this._wx(node.x) + outlineR + 3;
            if (_t) ctx.fillText(_t, _tx(_bX), this._wy(node.y));
          }
        }
      }
      if (_shape !== "off") {
        const _shKey = this._tipLabelShapeColourBy;
        const _shScl = this._tipLabelShapeColourScale;
        const _hasSc = !!(_shKey && _shScl);
        const halfSz = _shSz / 2;
        for (const node of this.nodes) {
          if (!node.isTip) continue;
          if (node.y < yWorldMin || node.y > yWorldMax) continue;
          const baseX = alignLabelX ?? this._wx(node.x) + outlineR + 3;
          const shapeX = baseX + _shML;
          const sy = this._wy(node.y);
          ctx.fillStyle = _hasSc ? this._tipLabelShapeColourForValue(node.annotations?.[_shKey]) ?? this._tipLabelShapeColor : this._tipLabelShapeColor;
          if (_shape === "circle") {
            ctx.beginPath();
            ctx.arc(shapeX + halfSz, sy, halfSz, 0, Math.PI * 2);
            ctx.fill();
          } else if (_shape === "block") {
            const _bTop = Math.floor(sy - this.scaleY / 2);
            ctx.fillRect(shapeX, _bTop, _shSz, Math.ceil(sy + this.scaleY / 2) - _bTop);
          } else {
            ctx.fillRect(shapeX, sy - halfSz, _shSz, _shSz);
          }
        }
      }
      if (_shape2 !== "off") {
        const _sh2Key = this._tipLabelShape2ColourBy;
        const _sh2Scl = this._tipLabelShape2ColourScale;
        const _has2Sc = !!(_sh2Key && _sh2Scl);
        const halfSz2 = _shSz2 / 2;
        for (const node of this.nodes) {
          if (!node.isTip) continue;
          if (node.y < yWorldMin || node.y > yWorldMax) continue;
          const baseX = alignLabelX ?? this._wx(node.x) + outlineR + 3;
          const shape2X = baseX + _shOffset;
          const sy = this._wy(node.y);
          ctx.fillStyle = _has2Sc ? this._tipLabelShape2ColourForValue(node.annotations?.[_sh2Key]) ?? this._tipLabelShape2Color : this._tipLabelShape2Color;
          if (_shape2 === "circle") {
            ctx.beginPath();
            ctx.arc(shape2X + halfSz2, sy, halfSz2, 0, Math.PI * 2);
            ctx.fill();
          } else if (_shape2 === "block") {
            const _bTop = Math.floor(sy - this.scaleY / 2);
            ctx.fillRect(shape2X, _bTop, _shSz2, Math.ceil(sy + this.scaleY / 2) - _bTop);
          } else {
            ctx.fillRect(shape2X, sy - halfSz2, _shSz2, _shSz2);
          }
        }
      }
    }
    /** Draw selection markers, MRCA indicator, hover state, branch-mode hit markers and drag-select rect. */
    _drawSelectionAndHover(yWorldMin, yWorldMax) {
      const ctx = this.ctx;
      const r = this.tipRadius;
      const nodeR = this.nodeRadius;
      if (this._selectedTipIds.size > 0) {
        const gf = this.selectedTipGrowthFactor;
        const minR = this.selectedTipMinSize;
        const markerR = Math.max(r * gf, minR);
        const sw = this.selectedTipStrokeWidth;
        ctx.globalAlpha = this.selectedTipStrokeOpacity;
        ctx.strokeStyle = this.selectedTipStrokeColor;
        ctx.lineWidth = sw;
        ctx.beginPath();
        for (const node of this.nodes) {
          if (!node.isTip || !this._selectedTipIds.has(node.id)) continue;
          if (node.y < yWorldMin || node.y > yWorldMax) continue;
          ctx.moveTo(this._wx(node.x) + markerR, this._wy(node.y));
          ctx.arc(this._wx(node.x), this._wy(node.y), markerR, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;
        if (r > 0) {
          if (this._tipColourBy && this._tipColourScale) {
            const key = this._tipColourBy;
            for (const node of this.nodes) {
              if (!node.isTip || !this._selectedTipIds.has(node.id)) continue;
              if (node.y < yWorldMin || node.y > yWorldMax) continue;
              const val = node.annotations ? node.annotations[key] : void 0;
              ctx.fillStyle = this._tipColourForValue(val) ?? this.tipShapeColor;
              ctx.beginPath();
              ctx.arc(this._wx(node.x), this._wy(node.y), r, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            ctx.fillStyle = this.tipShapeColor;
            ctx.beginPath();
            for (const node of this.nodes) {
              if (!node.isTip || !this._selectedTipIds.has(node.id)) continue;
              if (node.y < yWorldMin || node.y > yWorldMax) continue;
              ctx.moveTo(this._wx(node.x) + r, this._wy(node.y));
              ctx.arc(this._wx(node.x), this._wy(node.y), r, 0, Math.PI * 2);
            }
            ctx.fill();
          }
        }
        ctx.globalAlpha = this.selectedTipFillOpacity;
        ctx.fillStyle = this.selectedTipFillColor;
        ctx.beginPath();
        for (const node of this.nodes) {
          if (!node.isTip || !this._selectedTipIds.has(node.id)) continue;
          if (node.y < yWorldMin || node.y > yWorldMax) continue;
          ctx.moveTo(this._wx(node.x) + markerR, this._wy(node.y));
          ctx.arc(this._wx(node.x), this._wy(node.y), markerR, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (this._mrcaNodeId && this._selectedTipIds.size >= 2) {
        const mn = this.nodeMap.get(this._mrcaNodeId);
        if (mn) {
          const mnx = this._wx(mn.x);
          const mny = this._wy(mn.y);
          const gf = this.selectedNodeGrowthFactor;
          const minR = this.selectedNodeMinSize;
          const markerR = Math.max(nodeR * gf, minR);
          const sw = this.selectedNodeStrokeWidth;
          ctx.globalAlpha = this.selectedNodeStrokeOpacity;
          ctx.beginPath();
          ctx.arc(mnx, mny, markerR, 0, Math.PI * 2);
          ctx.strokeStyle = this.selectedNodeStrokeColor;
          ctx.lineWidth = sw;
          ctx.stroke();
          ctx.lineWidth = 1;
          ctx.globalAlpha = 1;
          if (nodeR > 0) {
            ctx.beginPath();
            ctx.arc(mnx, mny, nodeR, 0, Math.PI * 2);
            ctx.fillStyle = this.nodeShapeColor;
            ctx.fill();
          }
          ctx.globalAlpha = this.selectedNodeFillOpacity;
          ctx.beginPath();
          ctx.arc(mnx, mny, markerR, 0, Math.PI * 2);
          ctx.fillStyle = this.selectedNodeFillColor;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      if (this._mode === "nodes" && this._hoveredNodeId) {
        const hn = this.nodeMap.get(this._hoveredNodeId);
        if (hn) {
          const hx = this._wx(hn.x);
          const hy = this._wy(hn.y);
          const baseR = hn.isTip ? r : nodeR;
          const gf = hn.isTip ? this.tipHoverGrowthFactor : this.nodeHoverGrowthFactor;
          const minR = hn.isTip ? this.tipHoverMinSize : this.nodeHoverMinSize;
          const hr = Math.max(baseR * gf, minR);
          const fillColor = hn.isTip ? this.tipHoverFillColor : this.nodeHoverFillColor;
          const fillOpacity = hn.isTip ? this.tipHoverFillOpacity : this.nodeHoverFillOpacity;
          const ringColor = hn.isTip ? this.tipHoverStrokeColor : this.nodeHoverStrokeColor;
          const ringW = hn.isTip ? this.tipHoverStrokeWidth : this.nodeHoverStrokeWidth;
          const ringOpacity = hn.isTip ? this.tipHoverStrokeOpacity : this.nodeHoverStrokeOpacity;
          ctx.globalAlpha = ringOpacity;
          ctx.beginPath();
          ctx.arc(hx, hy, hr, 0, Math.PI * 2);
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = ringW;
          ctx.stroke();
          ctx.lineWidth = 1;
          ctx.globalAlpha = 1;
          if (baseR > 0) {
            if (hn.isTip) {
              if (this._tipColourBy && this._tipColourScale) {
                const val = hn.annotations ? hn.annotations[this._tipColourBy] : void 0;
                ctx.fillStyle = this._tipColourForValue(val) ?? this.tipShapeColor;
              } else {
                ctx.fillStyle = this.tipShapeColor;
              }
            } else {
              ctx.fillStyle = this.nodeShapeColor;
            }
            ctx.beginPath();
            ctx.arc(hx, hy, baseR, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = fillOpacity;
          ctx.beginPath();
          ctx.arc(hx, hy, hr, 0, Math.PI * 2);
          ctx.fillStyle = fillColor;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      if (this._mode === "branches") {
        const gf = this.selectedNodeGrowthFactor;
        const br = Math.max(nodeR * gf, this.selectedNodeMinSize);
        const sw = this.selectedNodeStrokeWidth;
        const drawBranchMarker = (node, worldX, fillAlpha, strokeAlpha) => {
          const bx = this._wx(worldX);
          const by = this._wy(node.y);
          ctx.globalAlpha = strokeAlpha;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.strokeStyle = this.selectedNodeStrokeColor;
          ctx.lineWidth = sw;
          ctx.stroke();
          ctx.lineWidth = 1;
          ctx.globalAlpha = 1;
          ctx.globalAlpha = fillAlpha;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fillStyle = this.selectedNodeFillColor;
          ctx.fill();
          ctx.globalAlpha = 1;
        };
        if (this._branchHoverNode) {
          drawBranchMarker(
            this._branchHoverNode,
            this._branchHoverX,
            this.selectedNodeFillOpacity * 0.5,
            this.selectedNodeStrokeOpacity * 0.5
          );
        }
        if (this._branchSelectNode) {
          drawBranchMarker(
            this._branchSelectNode,
            this._branchSelectX,
            this.selectedNodeFillOpacity,
            this.selectedNodeStrokeOpacity
          );
        }
      }
      if (this._dragSel && this._dragSelActive) {
        const { x0, y0, x1, y1 } = this._dragSel;
        const rx = Math.min(x0, x1), ry = Math.min(y0, y1);
        const rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
        ctx.save();
        ctx.fillStyle = "rgba(100,160,255,0.15)";
        ctx.strokeStyle = "rgba(100,160,255,0.8)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
    /**
     * Draw annotation labels for internal nodes.
     * Drawn last (on top of everything), controlled by nodeLabelAnnotation.
     * Positions: 'right' = to the right of the node; 'above-left' / 'below-left'
     * = above or below the branch, to the left of the node.
     */
    _drawNodeLabels(yWorldMin, yWorldMax) {
      if (!this.nodeLabelAnnotation || !this.nodes) return;
      const minScale = this.nodeLabelFontSize * 0.5;
      if (this.scaleY < minScale) return;
      const ctx = this.ctx;
      const nodeR = Math.max(this.nodeRadius, 0);
      const spacing = this.nodeLabelSpacing;
      const pos = this.nodeLabelPosition;
      ctx.save();
      ctx.font = `${this.nodeLabelFontSize}px ${this.fontFamily}`;
      ctx.fillStyle = this.nodeLabelColor;
      if (pos === "right") {
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
      } else if (pos === "below-left") {
        ctx.textBaseline = "top";
        ctx.textAlign = "right";
      } else {
        ctx.textBaseline = "bottom";
        ctx.textAlign = "right";
      }
      for (const node of this.nodes) {
        if (node.isTip) continue;
        if (node.y < yWorldMin || node.y > yWorldMax) continue;
        const label = this._nodeLabelText(node);
        if (!label) continue;
        const nx = this._wx(node.x);
        const ny = this._wy(node.y);
        let tx, ty;
        if (pos === "right") {
          tx = nx + nodeR + spacing;
          ty = ny;
        } else if (pos === "below-left") {
          tx = nx - nodeR - spacing;
          ty = ny + spacing;
        } else {
          tx = nx - nodeR - spacing;
          ty = ny - spacing;
        }
        ctx.fillText(label, tx, ty);
      }
      ctx.restore();
    }
    /**
     * Compute the MRCA (most recent common ancestor) of a set of tip IDs.
     * Returns the node id of the MRCA, or null.
     */
    _computeMRCA(tipIds) {
      if (!this.nodeMap || tipIds.size < 2) return null;
      const ids = [...tipIds];
      const getChain = (id) => {
        const path = [];
        let cur = this.nodeMap.get(id);
        while (cur) {
          path.push(cur.id);
          cur = cur.parentId ? this.nodeMap.get(cur.parentId) : null;
        }
        return path;
      };
      let chain = getChain(ids[0]);
      let chainSet = new Set(chain);
      for (let i = 1; i < ids.length; i++) {
        let cur = this.nodeMap.get(ids[i]);
        while (cur && !chainSet.has(cur.id)) {
          cur = cur.parentId ? this.nodeMap.get(cur.parentId) : null;
        }
        if (!cur) return null;
        const hitIdx = chain.indexOf(cur.id);
        chain = chain.slice(hitIdx);
        chainSet = new Set(chain);
      }
      return chain[0];
    }
    /** Recompute and cache the MRCA node id based on the current selection. */
    _updateMRCA() {
      this._mrcaNodeId = this._selectedTipIds.size >= 2 ? this._computeMRCA(this._selectedTipIds) : null;
    }
    /** Collect all descendant tip ids of the node with the given id. */
    _getDescendantTipIds(nodeId) {
      const result = [];
      const stack = [nodeId];
      while (stack.length) {
        const id = stack.pop();
        const node = this.nodeMap.get(id);
        if (!node) continue;
        if (node.isTip) {
          result.push(id);
        } else {
          for (const cid of node.children) stack.push(cid);
        }
      }
      return result;
    }
    /** Darken a CSS hex colour by multiplying each channel by `factor` (0–1). */
    _darkenColor(hex, factor) {
      const h = hex.replace("#", "");
      const r = Math.round(parseInt(h.slice(0, 2), 16) * factor);
      const g = Math.round(parseInt(h.slice(2, 4), 16) * factor);
      const b = Math.round(parseInt(h.slice(4, 6), 16) * factor);
      return `rgb(${r},${g},${b})`;
    }
    /**
     * Returns the node (tip or internal) closest to screen point (mx, my),
     * or null if none is within the hit threshold.
     * Tips get a slightly larger hit area.
     */
    _findNodeAtScreen(mx, my) {
      if (!this.nodes) return null;
      const H = this.canvas.clientHeight;
      const yWorldMin = this._worldYfromScreen(-this.tipRadius * 4);
      const yWorldMax = this._worldYfromScreen(H + this.tipRadius * 4);
      const hitR = this.tipRadius * 3 + 6;
      let best = null, bestDist2 = hitR * hitR;
      for (const node of this.nodes) {
        if (node.y < yWorldMin || node.y > yWorldMax) continue;
        const dx = this._wx(node.x) - mx;
        const dy = this._wy(node.y) - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist2) {
          bestDist2 = d2;
          best = node;
        }
      }
      if (best) return best;
      if (this.scaleY > 1) {
        const r = this.tipRadius;
        const outlineR = Math.max(r + this.tipHaloSize, 5);
        const halfH = this.fontSize / 2 + 2;
        this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        const _align = this.tipLabelAlign;
        const isAligned = _align && _align !== "off";
        const alignLabelX = isAligned ? this._wx(this.maxX) + outlineR + 3 : null;
        for (const node of this.nodes) {
          if (!node.isTip || !node.name) continue;
          if (node.y < yWorldMin || node.y > yWorldMax) continue;
          const sy = this._wy(node.y);
          if (my < sy - halfH || my > sy + halfH) continue;
          const lx0 = alignLabelX ?? this._wx(node.x) + outlineR + 3;
          if (mx < lx0) continue;
          const labelText = this._tipLabelText(node);
          if (!labelText) continue;
          if (mx <= lx0 + this.ctx.measureText(labelText).width) return node;
        }
      }
      return null;
    }
    /**
     * In branches mode: find the horizontal branch segment under (mx, my).
     * Returns { node, worldX } or null.
     * The horizontal segment of a branch runs from parent.x to node.x at y = node.y.
     */
    _findBranchAtScreen(mx, my) {
      if (!this.nodes) return null;
      const H = this.canvas.clientHeight;
      const yMin = this._worldYfromScreen(-20);
      const yMax = this._worldYfromScreen(H + 20);
      const hitY = 7;
      let bestNode = null;
      let bestDY = Infinity;
      for (const node of this.nodes) {
        if (!node.parentId) continue;
        if (node.y < yMin || node.y > yMax) continue;
        const parent2 = this.nodeMap.get(node.parentId);
        if (!parent2) continue;
        const sy = this._wy(node.y);
        const dy = Math.abs(my - sy);
        if (dy > hitY) continue;
        const lx = this._wx(parent2.x);
        const rx = this._wx(node.x);
        if (mx < lx || mx > rx) continue;
        if (dy < bestDY) {
          bestDY = dy;
          bestNode = node;
        }
      }
      if (!bestNode) return null;
      const parent = this.nodeMap.get(bestNode.parentId);
      const worldX = Math.max(parent.x, Math.min(bestNode.x, this._worldXfromScreen(mx)));
      return { node: bestNode, worldX };
    }
    /** Returns the id of the node whose world-y is closest to the viewport centre. */
    nodeIdAtViewportCenter() {
      if (!this.nodes) return null;
      const centreWorldY = this._worldYfromScreen(this.canvas.clientHeight / 2);
      let bestId = null, bestDist = Infinity;
      for (const n of this.nodes) {
        const d = Math.abs(n.y - centreWorldY);
        if (d < bestDist) {
          bestDist = d;
          bestId = n.id;
        }
      }
      return bestId;
    }
    /**
     * Adjust _targetOffsetY so the appropriate edge aligns on a whole tip.
     * scrolledDown=true  → tree moved up, revealing lower tips → snap top edge.
     * scrolledDown=false → tree moved down, revealing upper tips → snap bottom edge.
     */
    _snapToTip(scrolledDown) {
      const H = this.canvas.clientHeight;
      const sy = this._targetScaleY;
      if (scrolledDown) {
        const topWorldY = (this.paddingTop - this._targetOffsetY) / sy;
        const tipY = Math.max(1, Math.min(this.maxY, Math.ceil(topWorldY)));
        this._targetOffsetY = this._clampedOffsetY(this.paddingTop - tipY * sy, sy);
      } else {
        const botWorldY = (H - this.paddingBottom - this._targetOffsetY) / sy;
        const tipY = Math.max(1, Math.min(this.maxY, Math.floor(botWorldY)));
        this._targetOffsetY = this._clampedOffsetY(
          H - this.paddingBottom - tipY * sy,
          sy
        );
      }
      this._animating = true;
      this._dirty = true;
    }
    // ── Input & interaction ────────────────────────────────────────────────────
    _setupEvents() {
      const canvas = this.canvas;
      this._setupClickEvents(canvas);
      this._setupScrollAndZoomEvents(canvas);
      this._setupPointerEvents(canvas);
      this._setupKeyEvents(canvas);
    }
    /** Register dblclick and click event listeners on the canvas. */
    _setupClickEvents(canvas) {
      canvas.addEventListener("dblclick", (e) => {
        if (this._spaceDown || !this.graph) return;
        const rect = canvas.getBoundingClientRect();
        const node = this._findNodeAtScreen(e.clientX - rect.left, e.clientY - rect.top);
        if (!node || node.isTip) return;
        if (!node.parentId && this._navStack.length > 0) {
          this.navigateBack();
        } else {
          this.navigateInto(node.id);
        }
      });
      canvas.addEventListener("click", (e) => {
        if (this._suppressNextClick) {
          this._suppressNextClick = false;
          return;
        }
        if (this._spaceDown) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        if (this._mode === "branches") {
          const hit = this._findBranchAtScreen(mx, my);
          if (!hit) {
            this._branchSelectNode = null;
            this._branchSelectX = null;
          } else {
            this._branchSelectNode = hit.node;
            this._branchSelectX = hit.worldX;
          }
          if (this._onBranchSelectChange) this._onBranchSelectChange(!!hit);
          this._dirty = true;
          return;
        }
        const node = this._findNodeAtScreen(mx, my);
        const additive = e.metaKey || e.ctrlKey;
        if (!node) {
          if (!additive) this._selectedTipIds.clear();
        } else if (node.isTip) {
          if (additive) {
            if (this._selectedTipIds.has(node.id)) this._selectedTipIds.delete(node.id);
            else this._selectedTipIds.add(node.id);
          } else {
            this._selectedTipIds.clear();
            this._selectedTipIds.add(node.id);
          }
        } else {
          const descIds = this._getDescendantTipIds(node.id);
          const allSelected = descIds.length > 0 && descIds.every((id) => this._selectedTipIds.has(id));
          if (additive) {
            if (allSelected) descIds.forEach((id) => this._selectedTipIds.delete(id));
            else descIds.forEach((id) => this._selectedTipIds.add(id));
          } else {
            this._selectedTipIds.clear();
            descIds.forEach((id) => this._selectedTipIds.add(id));
          }
        }
        this._updateMRCA();
        if (this._onNodeSelectChange) this._onNodeSelectChange(this._selectedTipIds.size > 0);
        this._notifyStats();
        this._dirty = true;
      });
    }
    /** Register wheel event listener for pinch-zoom, option-scroll zoom and pan. */
    _setupScrollAndZoomEvents(canvas) {
      canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const my = e.clientY - rect.top;
        if (e.ctrlKey) {
          const factor = Math.pow(0.99, e.deltaY);
          this._fitLabelsMode = false;
          this._setTarget(
            this._targetOffsetY,
            this._targetScaleY * factor,
            false,
            my
          );
        } else if (e.altKey) {
          let delta = e.deltaY;
          if (e.deltaMode === 1) delta *= 20;
          if (e.deltaMode === 2) delta *= this.canvas.clientHeight;
          const factor = Math.pow(0.998, delta);
          this._fitLabelsMode = false;
          this._setTarget(
            this._targetOffsetY,
            this._targetScaleY * factor,
            false,
            my
          );
        } else {
          let delta = e.deltaY;
          if (e.deltaMode === 1) delta *= this.scaleY;
          if (e.deltaMode === 2) delta *= this.canvas.clientHeight;
          const scrolledDown = delta > 0;
          this._setTarget(
            this._targetOffsetY - delta,
            this._targetScaleY,
            false
          );
          clearTimeout(this._snapTimer);
          this._snapTimer = setTimeout(() => this._snapToTip(scrolledDown), 150);
        }
      }, { passive: false });
    }
    /** Register mousedown, mousemove, mouseleave and mouseup listeners for pan and drag-select. */
    _setupPointerEvents(canvas) {
      canvas.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        if (this._spaceDown) {
          this._dragging = true;
          this._lastY = e.clientY;
          this._dragStartOffsetY = this.offsetY;
          this._targetOffsetY = this.offsetY;
          this._targetScaleY = this.scaleY;
          this._animating = false;
          canvas.classList.remove("space");
          canvas.classList.add("grabbing");
        } else if (this._mode === "nodes") {
          const rect = canvas.getBoundingClientRect();
          this._dragSelStartX = e.clientX - rect.left;
          this._dragSelStartY = e.clientY - rect.top;
          this._dragSelActive = false;
          this._dragSel = null;
        }
      });
      window.addEventListener("mousemove", (e) => {
        if (this._dragging) {
          const dy = e.clientY - this._lastY;
          this._lastY = e.clientY;
          const newOY = this._clampedOffsetY(this.offsetY + dy, this.scaleY);
          this.offsetY = newOY;
          this._targetOffsetY = newOY;
          this._dirty = true;
        } else if (this._mode === "nodes" && e.buttons & 1 && this._dragSelStartX !== null) {
          const rect = canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const dx = mx - this._dragSelStartX;
          const dy = my - this._dragSelStartY;
          if (!this._dragSelActive && Math.hypot(dx, dy) > 5) {
            this._dragSelActive = true;
            canvas.style.cursor = "crosshair";
          }
          if (this._dragSelActive) {
            this._dragSel = {
              x0: this._dragSelStartX,
              y0: this._dragSelStartY,
              x1: mx,
              y1: my,
              additive: e.metaKey || e.ctrlKey
            };
            this._dirty = true;
          }
        }
        if (!this._dragging && !this._dragSelActive) {
          const rect = this.canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          if (this._mode === "branches") {
            const hit = this._findBranchAtScreen(mx, my);
            const newNode = hit ? hit.node : null;
            const newX = hit ? hit.worldX : null;
            if (newNode !== this._branchHoverNode || newX !== this._branchHoverX) {
              this._branchHoverNode = newNode;
              this._branchHoverX = newX;
              this.canvas.style.cursor = newNode ? this._spaceDown ? "grab" : "crosshair" : this._spaceDown ? "grab" : "default";
              this._dirty = true;
            }
          } else {
            const hovered = this._findNodeAtScreen(mx, my);
            const newId = hovered ? hovered.id : null;
            if (newId !== this._hoveredNodeId) {
              this._hoveredNodeId = newId;
              this.canvas.style.cursor = newId ? this._spaceDown ? "grab" : "pointer" : this._spaceDown ? "grab" : "default";
              this._dirty = true;
            }
          }
        }
        if (this._shiftHeld && !this._dragging && !this._dragSelActive) {
          const rect_h = this.canvas.getBoundingClientRect();
          const hx = e.clientX - rect_h.left;
          const hy = e.clientY - rect_h.top;
          const inCanvas = hx >= 0 && hx <= this.canvas.clientWidth && hy >= 0 && hy <= this.canvas.clientHeight;
          if (inCanvas) {
            const sy_top = this.offsetY + 0.5 * this.scaleY;
            const sy_bot = this.offsetY + (this.maxY + 0.5) * this.scaleY;
            const clampedHy = Math.min(sy_bot, Math.max(sy_top, hy));
            if (clampedHy !== this._hypFocusScreenY || this._hypTarget !== 1) {
              this._hypFocusScreenY = clampedHy;
              this._hypTarget = 1;
              this._dirty = true;
            }
            this.canvas.style.cursor = "ns-resize";
          }
        }
      });
      this.canvas.addEventListener("mouseleave", () => {
        let dirty = false;
        if (this._hoveredNodeId !== null) {
          this._hoveredNodeId = null;
          dirty = true;
        }
        if (this._branchHoverNode !== null) {
          this._branchHoverNode = null;
          this._branchHoverX = null;
          dirty = true;
        }
        if (dirty) this._dirty = true;
      });
      window.addEventListener("mouseup", (e) => {
        if (this._dragging) {
          const scrolledDown = this.offsetY < this._dragStartOffsetY;
          this._targetOffsetY = this.offsetY;
          this._targetScaleY = this.scaleY;
          this._snapToTip(scrolledDown);
        }
        this._dragging = false;
        this.canvas.classList.remove("grabbing");
        if (this._dragSelActive && this._dragSel) {
          const { x0, y0, x1, y1, additive } = this._dragSel;
          const rxMin = Math.min(x0, x1), rxMax = Math.max(x0, x1);
          const ryMin = Math.min(y0, y1), ryMax = Math.max(y0, y1);
          const hits = [];
          if (this.nodes) {
            const r = this.tipRadius;
            const outlineR = Math.max(r + this.tipHaloSize, 5);
            const halfH = this.fontSize / 2 + 2;
            const showLbls = this.scaleY >= this.fontSize * 0.5;
            this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;
            const _align = this.tipLabelAlign;
            const isAligned = _align && _align !== "off";
            const alignLabelX = isAligned ? this._wx(this.maxX) + outlineR + 3 : null;
            for (const node of this.nodes) {
              if (!node.isTip) continue;
              const sx = this._wx(node.x);
              const sy = this._wy(node.y);
              if (ryMax < sy - halfH || ryMin > sy + halfH) continue;
              const circleHit = rxMax >= sx - r && rxMin <= sx + r;
              let labelHit = false;
              if (showLbls && node.name) {
                const lx0 = alignLabelX ?? sx + outlineR + 3;
                const labelText = this._tipLabelText(node) ?? node.name;
                const lx1 = lx0 + this.ctx.measureText(labelText).width;
                labelHit = rxMax >= lx0 && rxMin <= lx1;
              }
              if (circleHit || labelHit) hits.push(node.id);
            }
          }
          if (additive) {
            hits.forEach((id) => this._selectedTipIds.add(id));
          } else {
            this._selectedTipIds.clear();
            hits.forEach((id) => this._selectedTipIds.add(id));
          }
          this._updateMRCA();
          if (this._onNodeSelectChange) this._onNodeSelectChange(this._selectedTipIds.size > 0);
          this._suppressNextClick = true;
          this._dirty = true;
        }
        this._dragSel = null;
        this._dragSelActive = false;
        this._dragSelStartX = null;
        if (this._spaceDown) {
          this.canvas.style.cursor = "grab";
        } else {
          this.canvas.style.cursor = this._hoveredNodeId ? "pointer" : "default";
        }
      });
    }
    /** Register keydown, keyup and resize listeners for keyboard navigation and canvas resize. */
    _setupKeyEvents(canvas) {
      window.addEventListener("keydown", (e) => {
        if (e.code === "Space" && !e.metaKey && !e.ctrlKey && !e.altKey) {
          if (!this._spaceDown) {
            this._spaceDown = true;
            this.canvas.classList.add("space");
            this.canvas.style.cursor = "grab";
          }
          e.preventDefault();
          return;
        }
        if (e.code === "Backquote") {
          this._shiftHeld = true;
        }
        if (!this.nodes) return;
        const H = canvas.clientHeight;
        const tipPx = this.scaleY;
        const pagePx = H - tipPx;
        const zoomStep = 1.5;
        const centerY = H / 2;
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === "=" || e.key === "+")) {
          e.preventDefault();
          this._fitLabelsMode = false;
          this._setTarget(this._targetOffsetY, this._targetScaleY * zoomStep, false, centerY);
          return;
        }
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "-") {
          e.preventDefault();
          this._fitLabelsMode = false;
          this._setTarget(this._targetOffsetY, this._targetScaleY / zoomStep, false, centerY);
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "Digit0") {
          e.preventDefault();
          this.fitLabels();
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "Equal") {
          e.preventDefault();
          this.hypMagUp();
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "Minus") {
          e.preventDefault();
          this.hypMagDown();
          return;
        }
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === "Digit0") {
          e.preventDefault();
          this.fitToWindow();
          return;
        }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const scrolledDown = e.key === "ArrowDown";
          const dist = e.metaKey || e.ctrlKey ? pagePx : tipPx;
          const sign = scrolledDown ? -1 : 1;
          this._setTarget(this._targetOffsetY + sign * dist, this._targetScaleY, false);
          this._snapToTip(scrolledDown);
          return;
        }
        if (e.key === "Escape") {
          if (this._hypFocusScreenY !== null && this._hypTarget !== 0) {
            this._hypTarget = 0;
            this._dirty = true;
          }
          return;
        }
      });
      window.addEventListener("keyup", (e) => {
        if (e.code === "Space") {
          this._spaceDown = false;
          this._dragging = false;
          this.canvas.classList.remove("space", "grabbing");
          this.canvas.style.cursor = this._hoveredNodeId ? "pointer" : "default";
        }
        if (e.code === "Backquote") {
          this._shiftHeld = false;
          if (!this._spaceDown) {
            this.canvas.style.cursor = this._hoveredNodeId ? "pointer" : "default";
          }
        }
      });
      window.addEventListener("resize", () => this._resize());
    }
    /**
     * Build (or rebuild) _globalHeightMap from a full-tree layout.
     * height[id] = maxX - node.x  (distance from node down to most divergent tip).
     * Only called from setData / setDataAnimated so subtree navigation never overwrites it.
     */
    _buildGlobalHeightMap(nodes2, maxX) {
      this._globalHeightMap = /* @__PURE__ */ new Map();
      for (const n of nodes2) this._globalHeightMap.set(n.id, maxX - n.x);
    }
    _computeStats() {
      if (!this.nodes) return null;
      const tipCount = this._selectedTipIds.size > 0 ? this._selectedTipIds.size : this.maxY;
      let refNode = null;
      if (this._mrcaNodeId) {
        refNode = this.nodeMap.get(this._mrcaNodeId);
      } else if (this._selectedTipIds.size === 1) {
        refNode = this.nodeMap.get([...this._selectedTipIds][0]);
      }
      const distance = refNode ? refNode.x : this.maxX;
      const globalH = (n) => {
        const gh = this._globalHeightMap.get(n.id);
        return gh != null ? gh : this.maxX - n.x;
      };
      let minTipGH = Infinity;
      for (const n of this.nodes) {
        if (!n.isTip) continue;
        const gh = globalH(n);
        if (gh < minTipGH) minTipGH = gh;
      }
      if (!isFinite(minTipGH)) minTipGH = 0;
      let height;
      if (!refNode) {
        const viewRoot = this.nodes.find((n) => !n.parentId);
        height = viewRoot ? globalH(viewRoot) - minTipGH : this.maxX;
      } else if (refNode.isTip) {
        height = 0;
      } else {
        height = globalH(refNode) - minTipGH;
      }
      const subRootId = refNode ? refNode.id : (this.nodes.find((n) => !n.parentId) || {}).id;
      let totalLength = 0;
      if (subRootId != null) {
        const stack = [subRootId];
        while (stack.length) {
          const id = stack.pop();
          const node = this.nodeMap.get(id);
          if (!node) continue;
          if (node.parentId) {
            const parent = this.nodeMap.get(node.parentId);
            if (parent) totalLength += node.x - parent.x;
          }
          if (!node.isTip) for (const cid of node.children) stack.push(cid);
        }
      }
      return { tipCount, distance, height, totalLength };
    }
    /** Fire the stats-change callback with current selection/tree stats. */
    _notifyStats() {
      if (this._onStatsChange) this._onStatsChange(this._computeStats());
    }
  };

  // peartree/js/legendrenderer.js
  var LegendRenderer = class {
    /**
     * @param {HTMLCanvasElement} leftCanvas
     * @param {HTMLCanvasElement} rightCanvas
     * @param {HTMLCanvasElement} leftCanvas2  Secondary legend canvas (far-left side).
     * @param {HTMLCanvasElement} rightCanvas2 Secondary legend canvas (far-right side).
     * @param {object}            settings  Must include fontSize, textColor, bgColor.
     */
    constructor(leftCanvas, rightCanvas, leftCanvas2, rightCanvas2, settings) {
      this._leftCanvas = leftCanvas;
      this._rightCanvas = rightCanvas;
      this._leftCanvas2 = leftCanvas2 ?? null;
      this._rightCanvas2 = rightCanvas2 ?? null;
      this._position = null;
      this._annotation = null;
      this._schema = null;
      this._paletteOverrides = null;
      this._annotation2 = null;
      this._position2 = "right";
      this._heightPct2 = 50;
      this.skipBg = false;
      this._dpr = window.devicePixelRatio || 1;
      this._fontFamily = "monospace";
      this._hitRegions = [];
      this._hitRegions2 = [];
      this.onCategoryClick = null;
      this.onCategoryClick2 = null;
      for (const [lc, isL2canvas] of [
        [this._leftCanvas, false],
        [this._rightCanvas, false],
        [this._leftCanvas2, true],
        [this._rightCanvas2, true]
      ]) {
        if (!lc) continue;
        lc.addEventListener("click", (e) => {
          const cssY = e.offsetY;
          const regions = isL2canvas ? this._hitRegions2 : this._hitRegions;
          for (const r of regions) {
            if (cssY >= r.y0 && cssY < r.y1) {
              const cb = r.isLegend2 ? this.onCategoryClick2 : this.onCategoryClick;
              if (cb) cb(r.value);
              return;
            }
          }
        });
        lc.style.cursor = "default";
        lc.addEventListener("mousemove", (e) => {
          const cssY = e.offsetY;
          const regions = isL2canvas ? this._hitRegions2 : this._hitRegions;
          const hit = regions.find((r) => cssY >= r.y0 && cssY < r.y1);
          const hasCb = hit ? hit.isLegend2 ? !!this.onCategoryClick2 : !!this.onCategoryClick : false;
          lc.style.cursor = hit && hasCb ? "pointer" : "default";
        });
        lc.addEventListener("mouseleave", () => {
          lc.style.cursor = "default";
        });
      }
      this._padding = 12;
      this._heightPct = 100;
      this.setSettings(
        settings,
        /*redraw*/
        false
      );
    }
    // ── Public API ─────────────────────────────────────────────────────────
    /**
     * Apply rendering settings.  Recognised keys: fontSize (number), textColor (string),
     * bgColor (string), skipBg (boolean), padding (number).
     * @param {object}  s
     * @param {boolean} redraw  When true (default) triggers a repaint.
     */
    setSettings(s, redraw = true) {
      if (s.fontSize != null) this.fontSize = s.fontSize;
      if (s.textColor != null) this.textColor = s.textColor;
      if (s.bgColor != null) {
        this.bgColor = s.bgColor;
        for (const lc of [
          this._leftCanvas,
          this._rightCanvas,
          this._leftCanvas2,
          this._rightCanvas2
        ]) {
          if (lc) lc.style.backgroundColor = s.bgColor;
        }
      }
      if (s.skipBg != null) this.skipBg = s.skipBg;
      if (s.padding != null) this._padding = s.padding;
      if (s.heightPct != null) this._heightPct = s.heightPct;
      if (s.heightPct2 != null) this._heightPct2 = s.heightPct2;
      if (redraw) this.draw();
    }
    /**
     * Store the annotation schema.  Triggers a redraw so the legend reflects
     * the new data immediately.
     * @param {Map<string, object>} schema
     */
    setAnnotationSchema(schema) {
      this._schema = schema;
      this.draw();
    }
    /**
     * Receive the per-annotation palette overrides Map from TreeRenderer.
     * Triggers a redraw so legend colours update immediately.
     * @param {Map<string,string>|null} overrides
     */
    setPaletteOverrides(overrides) {
      this._paletteOverrides = overrides;
      this.draw();
    }
    /**
     * Set which annotation and which canvas side to use, then draw.
     * Pass position=null to hide the legend entirely.
     * @param {'left'|'right'|null} position
     * @param {string|null}         key
     */
    setAnnotation(position, key) {
      this._position = position || null;
      this._annotation = key || null;
    }
    /**
     * Set the second legend's annotation and position relative to legend 1.
     * @param {'right'|'below'|null} relPos  'right' = own canvas beside L1; 'below' = stacked in same canvas
     * @param {string|null}          key
     */
    setAnnotation2(relPos, key) {
      this._position2 = relPos || "right";
      this._annotation2 = key || null;
    }
    /** @param {number} n — font size in CSS pixels */
    setFontSize(n) {
      this.fontSize = n;
      this.draw();
    }
    /** @param {string} color — CSS colour string */
    setTextColor(color) {
      this.textColor = color;
      this.draw();
    }
    /** @param {string} f — CSS font-family string */
    setFontFamily(f) {
      this._fontFamily = f || "monospace";
      this.draw();
    }
    /**
     * Update the background colour.  Also sets the CSS backgroundColor of both
     * legend canvases so there is no bleed-through around the drawn content.
     * @param {string}  color
     * @param {boolean} skipBg — when true the background rect is not painted
     *                           (matches TreeRenderer._skipBg for Tauri captures)
     */
    setBgColor(color, skipBg = false) {
      this.bgColor = color;
      this.skipBg = skipBg;
      for (const lc of [
        this._leftCanvas,
        this._rightCanvas,
        this._leftCanvas2,
        this._rightCanvas2
      ]) {
        if (lc) lc.style.backgroundColor = color;
      }
      this.draw();
    }
    /**
     * Sync the physical canvas dimensions to the current CSS dimensions and DPR,
     * then repaint.  Called automatically by TreeRenderer._resize().
     */
    resize() {
      this._dpr = window.devicePixelRatio || 1;
      const pos = this._position;
      const hasL2 = !!this._annotation2;
      const below = hasL2 && this._position2 === "below";
      const active = pos === "left" ? this._leftCanvas : pos === "right" ? this._rightCanvas : null;
      for (const lc of [this._leftCanvas, this._rightCanvas]) {
        if (!lc || lc.style.display === "none") continue;
        const LW = lc.clientWidth;
        const LH = lc === active && below ? this._computeStackedHeights(lc).total : this._computeHeight(lc);
        lc.style.height = LH + "px";
        lc.width = LW * this._dpr;
        lc.height = LH * this._dpr;
        lc.getContext("2d").setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      }
      if (hasL2 && !below) {
        for (const lc of [this._leftCanvas2, this._rightCanvas2]) {
          if (!lc || lc.style.display === "none") continue;
          const LW = lc.clientWidth;
          const LH = this._computeHeight2(lc);
          lc.style.height = LH + "px";
          lc.width = LW * this._dpr;
          lc.height = LH * this._dpr;
          lc.getContext("2d").setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
        }
      }
      this.draw();
    }
    /** Legend-1 canvas height in CSS px. */
    _computeHeight(lc) {
      const containerH = lc.parentElement?.clientHeight ?? lc.clientHeight ?? 0;
      if (!containerH) return lc.clientHeight || 0;
      return Math.round(containerH * Math.min(this._heightPct, 100) / 100);
    }
    /** Legend-2 side-canvas height in CSS px. */
    _computeHeight2(lc) {
      const containerH = lc.parentElement?.clientHeight ?? lc.clientHeight ?? 0;
      if (!containerH) return lc.clientHeight || 0;
      return Math.round(containerH * Math.min(this._heightPct2, 100) / 100);
    }
    /**
     * For the 'below' stacked layout: compute h1, h2, and total canvas height.
     * • pct1 + pct2 < 100 → independent percentages; total = h1 + h2.
     * • pct1 + pct2 ≥ 100 → proportional share of full height; total = containerH.
     */
    _computeStackedHeights(lc) {
      const containerH = lc.parentElement?.clientHeight ?? lc.clientHeight ?? 0;
      if (!containerH) return { total: lc.clientHeight || 0, h1: lc.clientHeight || 0, h2: 0 };
      const pct1 = Math.max(1, this._heightPct);
      const pct2 = Math.max(1, this._heightPct2);
      if (pct1 + pct2 < 100) {
        const h12 = Math.round(containerH * pct1 / 100);
        const h2 = Math.round(containerH * pct2 / 100);
        return { total: h12 + h2, h1: h12, h2 };
      }
      const h1 = Math.round(containerH * pct1 / (pct1 + pct2));
      return { total: containerH, h1, h2: containerH - h1 };
    }
    /**
     * Measure the minimum canvas width (CSS px) for any annotation key.
     * @param {string|null} key
     * @returns {number}
     */
    _measureWidthForKey(key) {
      const def = key && this._schema?.get(key);
      if (!def) return 120;
      const PAD = this._padding ?? 12;
      const lfs = this.fontSize ?? 11;
      const FONT = this._fontFamily ?? "monospace";
      const mc = document.createElement("canvas");
      const ctx = mc.getContext("2d");
      const measure = (text, bold = false) => {
        ctx.font = `${bold ? "700 " : ""}${lfs}px ${FONT}`;
        return ctx.measureText(text).width;
      };
      let contentW = measure(key, true);
      if (def.dataType === "categorical" || def.dataType === "ordinal") {
        const SWATCH = Math.max(8, lfs);
        for (const v of def.values || []) {
          contentW = Math.max(contentW, SWATCH + 6 + measure(String(v)));
        }
      } else {
        const BAR_W = 14;
        const tickCount = 6;
        if (def.dataType === "date") {
          const vals = def.values || [];
          for (let i = 0; i < Math.min(tickCount, vals.length); i++) {
            contentW = Math.max(contentW, BAR_W + 6 + measure(String(vals[i])));
          }
        } else {
          const fmt = def.fmt ?? ((v) => String(v));
          const min = def.min ?? 0;
          const max = def.max ?? 1;
          for (let i = 0; i < tickCount; i++) {
            const val = max - i / (tickCount - 1) * (max - min);
            contentW = Math.max(contentW, BAR_W + 6 + measure(fmt(val)));
          }
        }
      }
      return Math.ceil(PAD + contentW + PAD);
    }
    /** Minimum canvas width for legend 1. */
    measureWidth() {
      return this._measureWidthForKey(this._annotation);
    }
    /** Minimum canvas width for legend 2. */
    measureWidth2() {
      return this._measureWidthForKey(this._annotation2);
    }
    /**
     * Paint the colour legend(s) onto the canvas(es).
     * Safe to call at any time; exits early when nothing is configured.
     */
    draw() {
      const pos = this._position;
      const key = this._annotation;
      const key2 = this._annotation2;
      const lcL = this._leftCanvas;
      const lcR = this._rightCanvas;
      for (const lc of [lcL, lcR, this._leftCanvas2, this._rightCanvas2]) {
        if (!lc || lc.style.display === "none") continue;
        lc.getContext("2d").clearRect(0, 0, lc.width, lc.height);
      }
      const activeCanvas = pos === "left" ? lcL : pos === "right" ? lcR : null;
      if (!activeCanvas || activeCanvas.style.display === "none") return;
      if (!key || !this._schema) return;
      const dpr = this._dpr;
      const W = activeCanvas.width / dpr;
      const ctx = activeCanvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const below = !!key2 && this._position2 === "below";
      let h1 = activeCanvas.height / dpr;
      let h2 = 0;
      if (below && key2) {
        const s = this._computeStackedHeights(activeCanvas);
        h1 = s.h1;
        h2 = s.h2;
      }
      this._hitRegions = this._drawContent(ctx, W, h1, key, 0);
      this._hitRegions2 = [];
      if (below && key2 && h2 > 0) {
        ctx.fillStyle = (this.textColor ?? "#ffffff") + "44";
        ctx.fillRect(0, h1, W, 1);
        const regs2 = this._drawContent(ctx, W, h2, key2, h1);
        this._hitRegions2 = regs2.map((r) => ({ ...r, isLegend2: true }));
        for (const r of this._hitRegions2) this._hitRegions.push(r);
      }
      if (!below && key2) {
        const lc2 = pos === "left" ? this._leftCanvas2 : this._rightCanvas2;
        if (lc2 && lc2.style.display !== "none") {
          const ctx2 = lc2.getContext("2d");
          ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
          this._hitRegions2 = this._drawContent(ctx2, lc2.width / dpr, lc2.height / dpr, key2, 0).map((r) => ({ ...r, isLegend2: true }));
        }
      }
    }
    /**
     * Draw one legend's content into `ctx` within the CSS-pixel rect
     * [0, offsetY .. offsetY+H, W].  Returns hit regions with y values
     * relative to the canvas origin (already include offsetY).
     * @private
     */
    _drawContent(ctx, W, H, key, offsetY) {
      const hitRegions = [];
      if (!key || !this._schema) return hitRegions;
      const def = this._schema.get(key);
      if (!def) return hitRegions;
      const PAD = this._padding ?? 12;
      const FONT = this._fontFamily ?? "monospace";
      const lfs = this.fontSize;
      const ltc = this.textColor;
      const maxY = offsetY + H - PAD;
      if (!this.skipBg) {
        ctx.fillStyle = this.bgColor;
        ctx.fillRect(0, offsetY, W, H);
      }
      let y = offsetY + PAD;
      ctx.font = `700 ${lfs}px ${FONT}`;
      ctx.fillStyle = ltc;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(key, PAD, y, W - PAD * 2);
      y += lfs + 10;
      if (def.dataType === "categorical" || def.dataType === "ordinal") {
        const paletteName = this._paletteOverrides?.get(key);
        const colourMap = buildCategoricalColourMap(def.values || [], paletteName);
        const SWATCH = Math.max(8, lfs);
        const ROW_H = Math.max(SWATCH + 4, lfs + 4);
        ctx.font = `${lfs}px ${FONT}`;
        ctx.textBaseline = "middle";
        (def.values || []).forEach((val) => {
          if (y + SWATCH > maxY) return;
          ctx.fillStyle = colourMap.get(val) ?? MISSING_DATA_COLOUR;
          ctx.fillRect(PAD, y, SWATCH, SWATCH);
          ctx.fillStyle = ltc;
          ctx.textAlign = "left";
          ctx.fillText(String(val), PAD + SWATCH + 6, y + SWATCH / 2, W - PAD * 2 - SWATCH - 6);
          hitRegions.push({ value: val, y0: y, y1: y + ROW_H });
          y += ROW_H;
        });
      } else if (def.dataType === "date") {
        const BAR_W = 14;
        const BAR_Y = y;
        const BAR_H = Math.max(40, maxY - y);
        const grad = ctx.createLinearGradient(0, BAR_Y, 0, BAR_Y + BAR_H);
        const stops = getSequentialPalette(this._paletteOverrides?.get(key));
        const ns = stops.length;
        for (let i = 0; i < ns; i++) grad.addColorStop(i / (ns - 1), stops[ns - 1 - i]);
        ctx.fillStyle = grad;
        ctx.fillRect(PAD, BAR_Y, BAR_W, BAR_H);
        const LABEL_X = PAD + BAR_W + 6;
        const LABEL_W = W - LABEL_X - PAD;
        const tc = Math.max(2, Math.min(6, Math.floor(BAR_H / (lfs + 6))));
        const vals = def.values || [];
        const minDec = dateToDecimalYear(def.min);
        const maxDec = dateToDecimalYear(def.max);
        const range = maxDec - minDec || 1;
        ctx.font = `${lfs}px ${FONT}`;
        ctx.fillStyle = ltc;
        ctx.textAlign = "left";
        for (let i = 0; i < tc; i++) {
          const t = i / (tc - 1);
          const tickY = BAR_Y + t * BAR_H;
          const targetDec = maxDec - t * range;
          let label = vals[0] ?? def.min;
          let best = Infinity;
          for (const v of vals) {
            const d = Math.abs(dateToDecimalYear(v) - targetDec);
            if (d < best) {
              best = d;
              label = v;
            }
          }
          ctx.fillRect(PAD + BAR_W, tickY - 0.5, 4, 1);
          ctx.textBaseline = i === 0 ? "top" : i === tc - 1 ? "bottom" : "middle";
          ctx.fillText(label, LABEL_X, tickY, LABEL_W);
        }
      } else if (isNumericType(def.dataType)) {
        const BAR_W = 14;
        const BAR_Y = y;
        const BAR_H = Math.max(40, maxY - y);
        const grad = ctx.createLinearGradient(0, BAR_Y, 0, BAR_Y + BAR_H);
        const stops = getSequentialPalette(this._paletteOverrides?.get(key));
        const ns = stops.length;
        for (let i = 0; i < ns; i++) grad.addColorStop(i / (ns - 1), stops[ns - 1 - i]);
        ctx.fillStyle = grad;
        ctx.fillRect(PAD, BAR_Y, BAR_W, BAR_H);
        const min = def.min ?? 0;
        const max = def.max ?? 1;
        const range = max - min;
        const LABEL_X = PAD + BAR_W + 6;
        const LABEL_W = W - LABEL_X - PAD;
        const tc = Math.max(2, Math.min(6, Math.floor(BAR_H / (lfs + 6))));
        const fmt = def.fmt ?? ((v) => String(v));
        ctx.font = `${lfs}px ${FONT}`;
        ctx.fillStyle = ltc;
        ctx.textAlign = "left";
        for (let i = 0; i < tc; i++) {
          const t = i / (tc - 1);
          const tickY = BAR_Y + t * BAR_H;
          ctx.fillRect(PAD + BAR_W, tickY - 0.5, 4, 1);
          ctx.textBaseline = i === 0 ? "top" : i === tc - 1 ? "bottom" : "middle";
          ctx.fillText(fmt(max - t * range), LABEL_X, tickY, LABEL_W);
        }
      }
      return hitRegions;
    }
  };

  // peartree/js/axisrenderer.js
  var AxisRenderer = class _AxisRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object}            settings  Must include axisColor, fontSize, lineWidth.
     */
    constructor(canvas, settings) {
      this._canvas = canvas;
      this._ctx = canvas.getContext("2d");
      this._visible = false;
      this._maxX = 1;
      this._timed = false;
      this._rootHeight = 0;
      this._fontSize = 9;
      this._fontFamily = "monospace";
      this._calibration = null;
      this._viewMinTipH = 0;
      this._majorInterval = "auto";
      this._minorInterval = "off";
      this._majorLabelFormat = "auto";
      this._minorLabelFormat = "off";
      this._dateFormat = "yyyy-MM-dd";
      this._lastHash = "";
      this._direction = "forward";
      this._axisColor = null;
      this._axisLineWidth = 1;
      this._axisFontSizeManual = false;
      this._heightFormatter = null;
      this._paddingTop = 3;
      this.setSettings(
        settings,
        /*redraw*/
        false
      );
    }
    // ── Public API ──────────────────────────────────────────────────────────
    /**
     * Apply rendering settings.  Recognised keys: axisColor (string), fontSize (number),
     * lineWidth (number).
     * @param {object}  s
     * @param {boolean} redraw  When false (default) only stores values without repainting.
     */
    setSettings(s, redraw = false) {
      if (s.axisColor != null) this.setColor(s.axisColor);
      if (s.fontSize != null) this.setFontSize(s.fontSize);
      if (s.lineWidth != null) this.setLineWidth(s.lineWidth);
      if (s.paddingTop != null) {
        this._paddingTop = s.paddingTop;
        this._lastHash = "";
      }
      if (redraw) this._lastHash = "";
    }
    /**
     * Provide a pre-computed formatter for non-date (height / divergence) tick labels.
     * Pass null to revert to the built-in magnitude-based static formatter.
     * @param {((v:number)=>string)|null} fmt
     */
    setHeightFormatter(fmt) {
      this._heightFormatter = fmt || null;
      this._lastHash = "";
    }
    // ── Public API ──────────────────────────────────────────────────────────
    /**
     * @param {object} params
     * @param {number}  params.maxX        – world-x span of the tree
     * @param {boolean} params.isTimedTree – true if 'height' annotation exists on all nodes
     * @param {number}  params.rootHeight  – value of height at the root node (0 for divergence trees)
     */
    setTreeParams({ maxX, isTimedTree, rootHeight }) {
      this._maxX = maxX;
      this._timed = isTimedTree;
      this._rootHeight = isTimedTree ? rootHeight || 0 : 0;
      this._calibration = null;
      this._viewMinTipH = 0;
      this._lastHash = "";
    }
    /**
     * Activate date-axis mode using a pre-built TreeCalibration.
     * Pass null to clear date mode and fall back to height / divergence.
     * @param {TreeCalibration|null} cal
     */
    setCalibration(cal) {
      this._calibration = cal?.isActive ? cal : null;
      this._viewMinTipH = cal?.minTipH ?? 0;
      this._lastHash = "";
    }
    /** True when a valid TreeCalibration is active. Kept as a getter for internal use. */
    get _dateMode() {
      return this._calibration?.isActive ?? false;
    }
    /**
     * Update axis params for a subtree view without re-running setTreeParams / setCalibration.
     * Call whenever the renderer navigates into or out of a subtree.
     *
     * @param {number}  maxX       – branch span of the new view (root → most distant tip)
     * @param {number}  rootHeight – computed height at the new view root (maxX_full - root.x)
     * @param {number}  minTipH    – minimum computed height among tips in the new view
     */
    setSubtreeParams({ maxX, rootHeight, minTipH }) {
      this._maxX = maxX;
      this._rootHeight = rootHeight;
      if (this._calibration?.isActive && minTipH != null) this._viewMinTipH = minTipH;
      this._lastHash = "";
    }
    setTickOptions({ majorInterval, minorInterval, majorLabelFormat, minorLabelFormat }) {
      this._majorInterval = majorInterval || "auto";
      this._minorInterval = minorInterval || "off";
      this._majorLabelFormat = majorLabelFormat || "auto";
      this._minorLabelFormat = minorLabelFormat || "off";
      this._lastHash = "";
    }
    /**
     * Set the full date format string used for 'full' and 'partial' label modes.
     * @param {string} fmt  e.g. 'yyyy-MM-dd', 'yyyy-MMM-dd', 'dd MMM yyyy'
     */
    setDateFormat(fmt) {
      this._dateFormat = fmt || "yyyy-MM-dd";
      this._lastHash = "";
    }
    /**
     * Called every animation frame (from renderer._onViewChange).
     * Redraws if view state has changed.
     */
    update(scaleX, offsetX, paddingLeft, labelRightPad, bgColor, fontSize, dpr = 1) {
      if (!this._visible) return;
      const W = this._canvas.clientWidth;
      const H = this._canvas.clientHeight;
      if (W === 0 || H === 0) return;
      const wPx = Math.round(W * dpr);
      const hPx = Math.round(H * dpr);
      if (this._canvas.width !== wPx || this._canvas.height !== hPx) {
        this._canvas.width = wPx;
        this._canvas.height = hPx;
        this._canvas.style.width = W + "px";
        this._canvas.style.height = H + "px";
        this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (!this._axisFontSizeManual) this._fontSize = Math.max(7, fontSize - 1);
      const hash = `${scaleX.toFixed(4)}|${offsetX.toFixed(2)}|${paddingLeft}|${labelRightPad}|${bgColor}|${this._fontSize}|${this._fontFamily}|${this._axisColor ?? ""}|${this._axisLineWidth}|${W}|${H}|${this._timed}|${this._dateMode}|${this._rootHeight}|${this._calibration?.anchorDecYear ?? ""}|${this._calibration?.anchorH ?? ""}|${this._viewMinTipH}|${this._majorInterval}|${this._minorInterval}|${this._majorLabelFormat}|${this._minorLabelFormat}|${this._dateFormat}|${this._direction}`;
      if (hash === this._lastHash) return;
      this._lastHash = hash;
      this._scaleX = scaleX;
      this._offsetX = offsetX;
      this._paddingLeft = paddingLeft;
      this._labelRightPad = labelRightPad;
      this._bgColor = bgColor;
      this._W = W;
      this._H = H;
      this._draw();
    }
    setVisible(v) {
      this._visible = !!v;
      this._lastHash = "";
      if (!v) {
        const ctx = this._ctx;
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
      }
    }
    setFontSize(px) {
      this._fontSize = Math.max(6, px);
      this._axisFontSizeManual = true;
      this._lastHash = "";
    }
    setFontFamily(f) {
      this._fontFamily = f || "monospace";
      this._lastHash = "";
    }
    /** Set the base colour used for ticks, baseline and labels (hex, e.g. '#f2f1e6'). */
    setColor(hex) {
      this._axisColor = hex || null;
      this._lastHash = "";
    }
    /** Set the stroke width for ticks and the baseline (default 1). */
    setLineWidth(w) {
      this._axisLineWidth = Math.max(0.5, w);
      this._lastHash = "";
    }
    /**
     * Set the direction for non-timed, non-date trees.
     * 'forward' = divergence from root (0 at root, maxX at tips).
     * 'reverse' = height above most-divergent tip (maxX at root, 0 at tip).
     * Has no effect when date mode or timed-tree mode is active.
     */
    setDirection(dir) {
      this._direction = dir === "reverse" ? "reverse" : "forward";
      this._lastHash = "";
    }
    // ── Drawing ──────────────────────────────────────────────────────────────
    _draw() {
      const ctx = this._ctx;
      const W = this._W, H = this._H;
      const fs = this._fontSize;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = this._bgColor;
      ctx.fillRect(0, 0, W, H);
      if (!this._scaleX || this._maxX === 0) return;
      const plotLeft = Math.min(this._offsetX, this._paddingLeft);
      const plotRight = this._offsetX + this._maxX * this._scaleX;
      if (plotRight <= plotLeft) return;
      const { leftVal, rightVal } = this._valueDomain();
      const minVal = Math.min(leftVal, rightVal);
      const maxVal = Math.max(leftVal, rightVal);
      const targetMajor = Math.max(2, Math.round((plotRight - plotLeft) / 90));
      let majorTicks, minorTicks;
      if (this._dateMode) {
        const majorInt = this._majorInterval;
        const minorInt = this._minorInterval;
        majorTicks = majorInt === "auto" ? TreeCalibration.niceCalendarTicks(minVal, maxVal, targetMajor) : TreeCalibration.calendarTicksForInterval(minVal, maxVal, majorInt);
        if (minorInt === "off") {
          minorTicks = [];
        } else if (minorInt === "auto") {
          const minorAll = TreeCalibration.niceCalendarTicks(minVal, maxVal, targetMajor * 5);
          const majorSet = new Set(majorTicks.map((t) => t.toFixed(8)));
          minorTicks = minorAll.filter((t) => !majorSet.has(t.toFixed(8)));
        } else {
          const minorAll = TreeCalibration.calendarTicksForInterval(minVal, maxVal, minorInt);
          const majorSet = new Set(majorTicks.map((t) => t.toFixed(8)));
          minorTicks = minorAll.filter((t) => !majorSet.has(t.toFixed(8)));
        }
      } else {
        majorTicks = _AxisRenderer._niceTicks(leftVal, rightVal, targetMajor);
        if (!this._timed && majorTicks.length > 0) {
          const lastTick = majorTicks[majorTicks.length - 1];
          const step = majorTicks.length > 1 ? Math.abs(majorTicks[1] - majorTicks[0]) : 0;
          const gap = rightVal - lastTick;
          if (step > 0 && gap > step * 0.15) {
            majorTicks.push(rightVal);
          }
        }
        const minorAll = majorTicks.length > 1 ? _AxisRenderer._niceTicks(leftVal, rightVal, targetMajor * 5) : [];
        const majorSet = new Set(majorTicks.map((t) => t.toPrecision(10)));
        minorTicks = minorAll.filter((t) => !majorSet.has(t.toPrecision(10)));
      }
      const Y_BASE = this._paddingTop ?? 3;
      const MAJOR_H = 9;
      const MINOR_H = 5;
      const axC = this._axisColor;
      const TICK_COLOR = axC ? _AxisRenderer._hexToRgba(axC, 0.55) : "rgba(255,255,255,0.45)";
      const MINOR_COLOR = axC ? _AxisRenderer._hexToRgba(axC, 0.3) : "rgba(255,255,255,0.25)";
      const TEXT_COLOR = axC ? _AxisRenderer._hexToRgba(axC, 0.9) : "rgba(242,241,230,0.80)";
      const TEXT_DIM = axC ? _AxisRenderer._hexToRgba(axC, 0.5) : "rgba(242,241,230,0.45)";
      const lw = this._axisLineWidth;
      const fsMinor = Math.max(6, fs - 2);
      ctx.strokeStyle = TICK_COLOR;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(plotLeft, Y_BASE + 0.5);
      ctx.lineTo(plotRight, Y_BASE + 0.5);
      ctx.stroke();
      const minorLabelFmt = this._dateMode ? this._minorLabelFormat : "off";
      const showMinorLabel = minorLabelFmt !== "off";
      let minorLabelRight = -Infinity;
      ctx.font = `${fsMinor}px ${this._fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const val of minorTicks) {
        const sx = this._valToScreenX(val);
        if (sx < plotLeft - 1 || sx > plotRight + 1) continue;
        ctx.strokeStyle = MINOR_COLOR;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(sx + 0.5, Y_BASE + 1);
        ctx.lineTo(sx + 0.5, Y_BASE + 1 + MINOR_H);
        ctx.stroke();
        if (showMinorLabel) {
          const label = this._calibration.decYearToString(val, minorLabelFmt, this._dateFormat, this._minorInterval);
          const tw = ctx.measureText(label).width;
          const lx = Math.max(plotLeft + tw / 2 + 1, Math.min(plotRight - tw / 2 - 1, sx));
          if (lx - tw / 2 > minorLabelRight + 2) {
            ctx.fillStyle = TEXT_DIM;
            ctx.fillText(label, lx, Y_BASE + 1 + MINOR_H + 2);
            minorLabelRight = lx + tw / 2;
          }
        }
      }
      const majorLabelFmt = this._dateMode ? this._majorLabelFormat : "auto";
      const showMajorLabel = majorLabelFmt !== "off";
      let majorLabelRight = -Infinity;
      const _majorStep = majorTicks.length >= 2 ? Math.abs(majorTicks[1] - majorTicks[0]) : 0;
      ctx.font = `${fs}px ${this._fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const val of majorTicks) {
        const sx = this._valToScreenX(val);
        if (sx < plotLeft - 1 || sx > plotRight + 1) continue;
        ctx.strokeStyle = TICK_COLOR;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(sx + 0.5, Y_BASE + 1);
        ctx.lineTo(sx + 0.5, Y_BASE + 1 + MAJOR_H);
        ctx.stroke();
        if (showMajorLabel) {
          let label;
          if (this._dateMode) {
            const effMajorFmt = majorLabelFmt === "auto" ? "partial" : majorLabelFmt;
            label = this._calibration.decYearToString(val, effMajorFmt, this._dateFormat, this._majorInterval);
          } else {
            label = _AxisRenderer._formatValue(val, _majorStep);
          }
          const tw = ctx.measureText(label).width;
          const lx = Math.max(plotLeft + tw / 2 + 1, Math.min(W - tw / 2 - 2, sx));
          if (lx - tw / 2 > majorLabelRight + 2) {
            ctx.fillStyle = TEXT_COLOR;
            ctx.fillText(label, lx, Y_BASE + 1 + MAJOR_H + 2);
            majorLabelRight = lx + tw / 2;
          }
        }
      }
    }
    /** Returns {leftVal, rightVal} = the axis values at worldX=0 and worldX=maxX */
    _valueDomain() {
      const extraH = this._scaleX > 0 ? Math.max(0, this._offsetX - this._paddingLeft) / this._scaleX : 0;
      if (this._calibration?.isActive) {
        const rootH = Math.max(this._rootHeight, this._maxX);
        const leftVal = this._calibration.heightToDecYear(rootH + extraH);
        const rightVal = this._calibration.heightToDecYear(this._viewMinTipH);
        return { leftVal, rightVal };
      }
      if (this._timed) {
        return { leftVal: this._rootHeight + extraH, rightVal: 0 };
      }
      if (this._direction === "reverse") {
        return { leftVal: this._maxX + extraH, rightVal: 0 };
      }
      return { leftVal: 0, rightVal: this._maxX };
    }
    _valToWorldX(val) {
      if (this._calibration?.isActive) {
        const rootH = Math.max(this._rootHeight, this._maxX);
        return val - this._calibration.heightToDecYear(rootH);
      }
      if (this._timed) return this._rootHeight - val;
      if (this._direction === "reverse") return this._maxX - val;
      return val;
    }
    _valToScreenX(val) {
      return this._offsetX + this._valToWorldX(val) * this._scaleX;
    }
    // ── Static helpers ────────────────────────────────────────────────────────
    /**
     * Convert a hex colour and alpha value to a CSS rgba() string.
     * @param {string} hex   – '#rrggbb'
     * @param {number} alpha – 0–1
     */
    static _hexToRgba(hex, alpha) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    /**
     * Generate nicely-spaced ticks within [min, max].
     * Works for any real-valued axis (divergence or height).
     */
    static _niceTicks(min, max, targetCount = 5) {
      const range = max - min;
      if (range === 0) return [min];
      if (targetCount < 1) targetCount = 1;
      const roughStep = range / targetCount;
      const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(roughStep))));
      const norm = roughStep / mag;
      let niceStep;
      if (norm < 1.5) niceStep = 1 * mag;
      else if (norm < 3) niceStep = 2 * mag;
      else if (norm < 7) niceStep = 5 * mag;
      else niceStep = 10 * mag;
      const [lo, hi] = min < max ? [min, max] : [max, min];
      const start = Math.ceil(lo / niceStep - 1e-9) * niceStep;
      const ticks = [];
      for (let t = start; t <= hi + niceStep * 1e-9; t += niceStep) {
        const rounded = parseFloat(t.toPrecision(10));
        ticks.push(rounded);
      }
      if (min > max) ticks.reverse();
      return ticks;
    }
    /** Format a plain numeric value (divergence or height).
     * @param {number} v    – the tick value to format
     * @param {number} step – the interval between ticks; drives required decimal precision
     */
    static _formatValue(v, step) {
      if (v === 0 && (!step || step >= 1)) return "0";
      if (step > 0) {
        const dp = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
        return v.toFixed(dp);
      }
      const abs = Math.abs(v);
      if (abs >= 100) return v.toFixed(0);
      if (abs >= 10) return v.toFixed(1);
      if (abs >= 1) return v.toFixed(2);
      if (abs >= 0.01) return v.toFixed(3);
      return v.toExponential(2);
    }
  };

  // peartree/js/themes.js
  var TYPEFACES = {
    "Monospace": "monospace",
    "Sans-serif": "sans-serif",
    "Serif": "serif",
    "Courier New": "'Courier New', Courier, monospace",
    "Helvetica": "'Helvetica Neue', Helvetica, Arial, sans-serif",
    "Georgia": "Georgia, serif",
    "Times New Roman": "'Times New Roman', Times, serif",
    "System UI": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "Menlo": "Menlo, 'DejaVu Sans Mono', 'Lucida Console', monospace"
  };
  var SETTINGS_KEY = "peartree-settings";
  var USER_THEMES_KEY = "peartree-user-themes";
  var DEFAULT_THEME_KEY = "peartree-default-theme";
  var THEMES = {
    "Minimal": {
      canvasBgColor: "#fffffc",
      branchColor: "#302f29",
      branchWidth: "1",
      fontSize: "11",
      fontFamily: "Monospace",
      labelColor: "#000000",
      tipSize: "2",
      tipHaloSize: "1",
      tipShapeColor: "#fffffc",
      tipShapeBgColor: "#302f29",
      nodeSize: "0",
      nodeHaloSize: "1",
      nodeShapeColor: "#302f29",
      nodeShapeBgColor: "#fffffc",
      axisColor: "#444302f2944",
      legendTextColor: "#302f29",
      nodeBarsColor: "#f5a700",
      selectedTipStrokeColor: "#E06961",
      selectedTipFillColor: "#E06961",
      selectedNodeStrokeColor: "#19A699",
      selectedNodeFillColor: "#19A699",
      tipHoverStrokeColor: "#f5a700",
      tipHoverFillColor: "#f5a700",
      nodeHoverStrokeColor: "#f5a700",
      nodeHoverFillColor: "#f5a700"
    },
    "Artic": {
      canvasBgColor: "#02292e",
      branchColor: "#19A699",
      branchWidth: "1",
      fontSize: "11",
      fontFamily: "Helvetica",
      labelColor: "#f7eeca",
      tipSize: "3",
      tipHaloSize: "1",
      tipShapeColor: "#B58901",
      tipShapeBgColor: "#02292e",
      nodeSize: "0",
      nodeHaloSize: "1",
      nodeShapeColor: "#E06961",
      nodeShapeBgColor: "#02292e",
      nodeBarsColor: "#2aa198",
      axisColor: "#f7eeca",
      legendTextColor: "#f7eeca",
      nodeBarsColor: "#E06961"
    },
    "BEAST": {
      canvasBgColor: "#02292e",
      branchColor: "#68A3BB",
      branchWidth: "1",
      fontSize: "11",
      fontFamily: "Monospace",
      labelColor: "#B1CBB8",
      tipSize: "3",
      tipHaloSize: "1",
      tipShapeColor: "#CBB944",
      tipShapeBgColor: "#02292e",
      nodeSize: "0",
      nodeHaloSize: "1",
      nodeShapeColor: "#3B6F84",
      nodeShapeBgColor: "#02292e",
      axisColor: "#B1CBB8",
      legendTextColor: "#B1CBB8",
      nodeBarsColor: "#CBB944",
      selectedTipFillColor: "#FFF4A9",
      selectedTipStrokeColor: "#FFF4A9",
      selectedNodeFillColor: "#B1CBB8",
      selectedNodeStrokeColor: "#B1CBB8"
    },
    // // Warm pastels: Grand Budapest Hotel / Moonrise Kingdom palette
    // "Wes": {
    //     canvasBgColor:    '#f5edd6',
    //     branchColor:      '#7b3b5e',
    //     branchWidth:      '1',
    //     fontSize:         '11',
    //     labelColor:       '#4a2040',
    //     tipSize:          '4',
    //     tipHaloSize:      '2',
    //     tipShapeColor:    '#d4614b',
    //     tipShapeBgColor:  '#f5edd6',
    //     nodeSize:         '0',
    //     nodeHaloSize:     '2',
    //     nodeShapeColor:   '#b8962e',
    //     nodeShapeBgColor: '#f5edd6',
    //     axisColor:        '#4a2040',
    // },
    // Deep jewel tones: The Life Aquatic / Isle of Dogs palette
    "MCM": {
      canvasBgColor: "#1e2d3a",
      branchColor: "#edd59c",
      branchWidth: "1",
      fontSize: "11",
      fontFamily: "Monospace",
      labelColor: "#f4c9a8",
      tipSize: "4",
      tipHaloSize: "1",
      tipShapeColor: "#e07b65",
      tipShapeBgColor: "#1e2d3a",
      nodeSize: "3",
      nodeHaloSize: "1",
      nodeShapeColor: "#7dbfcc",
      nodeShapeBgColor: "#1e2d3a",
      axisColor: "#edd59c",
      legendTextColor: "#edd59c",
      nodeBarsColor: "#7dbfcc"
    },
    // Royal Tenenbaums: aged plaster, forest green, burgundy, tennis-ball gold
    "Tenenbaums": {
      canvasBgColor: "#f0e8d8",
      branchColor: "#2b4a2a",
      branchWidth: "1",
      fontSize: "11",
      fontFamily: "Monospace",
      labelColor: "#1c3220",
      tipSize: "3",
      tipHaloSize: "1",
      tipShapeColor: "#a01830",
      tipShapeBgColor: "#f0e8d8",
      nodeSize: "2",
      nodeHaloSize: "1",
      nodeShapeColor: "#c8a020",
      nodeShapeBgColor: "#f0e8d8",
      axisColor: "#2b4a2a",
      legendTextColor: "#2b4a2a",
      nodeBarsColor: "#a01830"
    },
    // Fantastic Mr Fox: night earth, fox orange, rust, harvest green
    "Mr Fox": {
      canvasBgColor: "#1a0d00",
      branchColor: "#e87830",
      branchWidth: "1",
      fontSize: "11",
      fontFamily: "Monospace",
      labelColor: "#f0c060",
      tipSize: "3",
      tipHaloSize: "1",
      tipShapeColor: "#c84a18",
      tipShapeBgColor: "#1a0d00",
      nodeSize: "3",
      nodeHaloSize: "1",
      nodeShapeColor: "#508a28",
      nodeShapeBgColor: "#1a0d00",
      axisColor: "#f0c060",
      legendTextColor: "#f0c060",
      nodeBarsColor: "#508a28"
    },
    // The Darjeeling Limited: warm cream, saffron, cerulean, rust
    "Darjeeling": {
      canvasBgColor: "#faf0d8",
      branchColor: "#c87010",
      branchWidth: "1",
      fontSize: "11",
      fontFamily: "Monospace",
      labelColor: "#3a2010",
      tipSize: "4",
      tipHaloSize: "1",
      tipShapeColor: "#1a5878",
      tipShapeBgColor: "#faf0d8",
      nodeSize: "0",
      nodeHaloSize: "1",
      nodeShapeColor: "#c04428",
      nodeShapeBgColor: "#faf0d8",
      axisColor: "#3a2010",
      legendTextColor: "#3a2010",
      nodeBarsColor: "#1a5878"
    },
    // // Mid Century Modern – Birch: warm white, teak, avocado, harvest gold
    // "MCM Birch": {
    //     canvasBgColor:    '#f2ede0',
    //     branchColor:      '#5c3a1e',
    //     branchWidth:      '1',
    //     fontSize:         '11',
    //     labelColor:       '#2a1c10',
    //     tipSize:          '4',
    //     tipHaloSize:      '2',
    //     tipShapeColor:    '#5a7a2a',
    //     tipShapeBgColor:  '#f2ede0',
    //     nodeSize:         '0',
    //     nodeHaloSize:     '2',
    //     nodeShapeColor:   '#c88c24',
    //     nodeShapeBgColor: '#f2ede0',
    //     axisColor:        '#2a1c10',
    // },
    // // Mid Century Modern – Walnut: warm sand, burnt sienna, mustard, teal
    // "MCM Walnut": {
    //     canvasBgColor:    '#e8dcc8',
    //     branchColor:      '#8c4822',
    //     branchWidth:      '1',
    //     fontSize:         '11',
    //     labelColor:       '#3a1c0a',
    //     tipSize:          '4',
    //     tipHaloSize:      '2',
    //     tipShapeColor:    '#c89520',
    //     tipShapeBgColor:  '#e8dcc8',
    //     nodeSize:         '0',
    //     nodeHaloSize:     '2',
    //     nodeShapeColor:   '#2a6870',
    //     nodeShapeBgColor: '#e8dcc8',
    //     axisColor:        '#3a1c0a',
    // },
    // // Mid Century Modern – Eames: dark walnut, warm amber, turquoise, coral
    // "MCM Eames": {
    //     canvasBgColor:    '#1a1208',
    //     branchColor:      '#d08830',
    //     branchWidth:      '1',
    //     fontSize:         '11',
    //     labelColor:       '#f0d890',
    //     tipSize:          '4',
    //     tipHaloSize:      '2',
    //     tipShapeColor:    '#2a8878',
    //     tipShapeBgColor:  '#1a1208',
    //     nodeSize:         '0',
    //     nodeHaloSize:     '2',
    //     nodeShapeColor:   '#c44030',
    //     nodeShapeBgColor: '#1a1208',
    //     axisColor:        '#f0d890',
    // },
    "O'Toole": {
      canvasBgColor: "#f4f3f3",
      branchColor: "#7984BC",
      branchWidth: "1",
      fontSize: "11",
      fontFamily: "Helvetica",
      labelColor: "#7984BC",
      tipSize: "3",
      tipHaloSize: "1",
      tipShapeColor: "#AF808B",
      tipShapeBgColor: "#D8D4D3",
      nodeSize: "2",
      nodeHaloSize: "1",
      nodeShapeColor: "#88B2BA",
      nodeShapeBgColor: "#D8D4D3",
      axisColor: "#7984BC",
      legendTextColor: "#7984BC",
      nodeBarsColor: "#88B2BA",
      selectedTipFillColor: "#7f3e4d",
      selectedTipStrokeColor: "#7f3e4d",
      selectedNodeFillColor: "#263b3f",
      selectedNodeStrokeColor: "#263b3f",
      tipHoverFillColor: "#7f3e4d",
      tipHoverStrokeColor: "#7f3e4d",
      nodeHoverFillColor: "#263b3f",
      nodeHoverStrokeColor: "#263b3f"
    }
  };
  var DEFAULT_SETTINGS = {
    theme: "Artic",
    fontFamily: "Monospace",
    canvasBgColor: "#ffffff",
    branchColor: "#444444",
    branchWidth: "1",
    fontSize: "11",
    labelColor: "#000000",
    tipSize: "2",
    tipHaloSize: "1",
    tipShapeColor: "#ffffff",
    tipShapeBgColor: "#000000",
    tipOutlineColor: "#033940",
    nodeSize: "0",
    nodeHaloSize: "1",
    nodeShapeColor: "#000000",
    nodeShapeBgColor: "#000000",
    axisColor: "#444444",
    legendTextColor: "#444444",
    selectedLabelStyle: "bold",
    selectedTipStrokeColor: "#ffffff",
    selectedTipFillColor: "#ffffff",
    selectedTipGrowthFactor: "1.5",
    selectedTipMinSize: "5",
    selectedTipFillOpacity: "0.35",
    selectedTipStrokeWidth: "0.5",
    selectedTipStrokeOpacity: "0.5",
    selectedNodeStrokeColor: "#ffffff",
    selectedNodeFillColor: "#ffffff",
    selectedNodeGrowthFactor: "1.5",
    selectedNodeMinSize: "5",
    selectedNodeFillOpacity: "0.35",
    selectedNodeStrokeWidth: "0.5",
    selectedNodeStrokeOpacity: "0.5",
    tipHoverStrokeColor: "#f5a700",
    tipHoverFillColor: "#f5a700",
    tipHoverGrowthFactor: "1.5",
    tipHoverMinSize: "5",
    tipHoverFillOpacity: "0.45",
    tipHoverStrokeWidth: "0.5",
    tipHoverStrokeOpacity: "0.5",
    nodeHoverStrokeColor: "#f5a700",
    nodeHoverFillColor: "#f5a700",
    nodeHoverGrowthFactor: "1.5",
    nodeHoverMinSize: "5",
    nodeHoverFillOpacity: "0.45",
    nodeHoverStrokeWidth: "0.5",
    nodeHoverStrokeOpacity: "0.5",
    axisFontSize: "9",
    axisFontFamily: "theme",
    axisLineWidth: "1",
    legendShow: "right",
    legendFontSize: "11",
    legendFontFamily: "theme",
    axisShow: "off",
    axisDateAnnotation: "",
    axisDateFormat: "yyyy-MM-dd",
    axisMajorInterval: "auto",
    axisMinorInterval: "off",
    axisMajorLabelFormat: "partial",
    axisMinorLabelFormat: "off",
    // Layout geometry (no DOM controls — passed directly to TreeRenderer)
    paddingLeft: "20",
    paddingRight: "20",
    paddingTop: "20",
    paddingBottom: "20",
    // Legend canvas internal padding (px) — controls spacing inside the legend panel
    legendPadding: "12",
    // Legend canvas height as % of the canvas area (1–100, pinned to top)
    legendHeightPct: "100",
    // Second legend
    legendAnnotation2: "",
    legend2Position: "right",
    // 'right' (beside L1) | 'below' (stacked under L1)
    legendHeightPct2: "50",
    // Axis canvas vertical padding (px) — gap above the baseline line
    axisPaddingTop: "3",
    elbowRadius: "2",
    rootStubLength: "10",
    // Node bars (only shown when tree has 'height' group from BEAST)
    nodeBarsEnabled: "off",
    nodeBarsColor: "#444444",
    nodeBarsWidth: "6",
    nodeBarsShowMedian: "mean",
    nodeBarsShowRange: "off",
    // Negative branch lengths
    clampNegBranches: "off",
    // Tip label layout
    tipLabelAlign: "off",
    // Tip label shapes (displayed to the left of label text)
    tipLabelShape: "off",
    // 'off' | 'square' | 'circle' | 'block'
    tipLabelShapeSize: "50",
    // 1–100: % of scaleY for square/circle; ×0.1 width factor for block
    tipLabelShapeColor: "#aaaaaa",
    tipLabelShapeMarginLeft: "2",
    tipLabelShapeMarginRight: "3",
    // Second tip label shape (shown immediately to the right of shape 1)
    tipLabelShape2: "off",
    tipLabelShape2Size: "50",
    tipLabelShape2Color: "#888888",
    tipLabelShape2MarginRight: "3",
    // Node labels (internal-node annotation labels)
    nodeLabelAnnotation: "",
    nodeLabelPosition: "right",
    nodeLabelFontSize: "9",
    nodeLabelColor: "#aaaaaa",
    nodeLabelSpacing: "4",
    // Intro animation played when a tree is first loaded.
    // Options: 'y-then-x' | 'x-then-y' | 'simultaneous' | 'from-bottom' | 'from-top' | 'none'
    introAnimation: "x-then-y"
  };

  // peartree/js/graphicsio.js
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function svgTextEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function viewportDims({ canvas, axisCanvas, legendLeftCanvas, legendRightCanvas }) {
    const llVisible = legendLeftCanvas.style.display !== "none";
    const lrVisible = legendRightCanvas.style.display !== "none";
    const axVisible = axisCanvas.style.display !== "none";
    const llW = llVisible ? legendLeftCanvas.clientWidth : 0;
    const lrW = lrVisible ? legendRightCanvas.clientWidth : 0;
    const ttW = canvas.clientWidth;
    const ttH = canvas.clientHeight;
    const axH = axVisible ? axisCanvas.clientHeight : 0;
    return {
      totalW: llW + ttW + lrW,
      totalH: ttH + axH,
      llW,
      lrW,
      ttW,
      ttH,
      axH,
      llVisible,
      lrVisible,
      axVisible
    };
  }
  function compositeViewPng(ctx, targetW, targetH, fullTree = false, transparent = false) {
    const { renderer, canvas, axisCanvas, legendLeftCanvas, legendRightCanvas } = ctx;
    const { totalW, llW, lrW, ttW, ttH, axH, llVisible, lrVisible, axVisible } = viewportDims(ctx);
    const ttH_eff = fullTree ? renderer.paddingTop + renderer.paddingBottom + (renderer.maxY + 1) * renderer.scaleY : ttH;
    const totalH_eff = ttH_eff + (axVisible ? axH : 0);
    const sx = targetW / totalW;
    const sy = targetH / totalH_eff;
    const oc = new OffscreenCanvas(targetW, targetH);
    const oCtx = oc.getContext("2d");
    if (!transparent) {
      oCtx.fillStyle = renderer.bgColor;
      oCtx.fillRect(0, 0, targetW, targetH);
    }
    if (llVisible) {
      if (transparent) {
        renderer._skipBg = true;
        renderer._drawLegend();
        renderer._skipBg = false;
      }
      oCtx.drawImage(
        legendLeftCanvas,
        0,
        0,
        Math.round(llW * sx),
        Math.round(ttH_eff * sy)
      );
      if (transparent) {
        renderer._drawLegend();
      }
    }
    if (fullTree) {
      const treeW = Math.round(ttW * sx);
      const treeH = Math.round(ttH_eff * sy);
      const toc = new OffscreenCanvas(treeW, treeH);
      renderer.renderFull(toc, treeW, treeH, transparent);
      oCtx.drawImage(toc, Math.round(llW * sx), 0);
    } else if (transparent) {
      const toc = new OffscreenCanvas(Math.round(ttW), Math.round(ttH_eff));
      renderer.renderViewToOffscreen(toc, true);
      oCtx.drawImage(
        toc,
        Math.round(llW * sx),
        0,
        Math.round(ttW * sx),
        Math.round(ttH_eff * sy)
      );
    } else {
      oCtx.drawImage(
        canvas,
        Math.round(llW * sx),
        0,
        Math.round(ttW * sx),
        Math.round(ttH_eff * sy)
      );
    }
    if (axVisible) {
      oCtx.drawImage(
        axisCanvas,
        Math.round(llW * sx),
        Math.round(ttH_eff * sy),
        Math.round(ttW * sx),
        Math.round(axH * sy)
      );
    }
    if (lrVisible) {
      if (transparent) {
        renderer._skipBg = true;
        renderer._drawLegend();
        renderer._skipBg = false;
      }
      oCtx.drawImage(
        legendRightCanvas,
        Math.round((llW + ttW) * sx),
        0,
        Math.round(lrW * sx),
        Math.round(ttH_eff * sy)
      );
      if (transparent) {
        renderer._drawLegend();
      }
    }
    return oc;
  }
  function buildGraphicSVG(ctx, fullTree = false, transparent = false) {
    const { renderer, legendRenderer, axisRenderer } = ctx;
    const nm = renderer.nodeMap;
    if (!nm || !nm.size) return null;
    const { totalW, llW, lrW, ttW, ttH, axH, llVisible, lrVisible, axVisible } = viewportDims(ctx);
    const sx = renderer.scaleX, ox = renderer.offsetX;
    const sy = renderer.scaleY;
    const oy = fullTree ? renderer.paddingTop + renderer.scaleY * 0.5 : renderer.offsetY;
    const ttH_eff = fullTree ? Math.round(renderer.paddingTop + renderer.paddingBottom + (renderer.maxY + 1) * renderer.scaleY) : ttH;
    const totalH_eff = ttH_eff + (axVisible ? axH : 0);
    const bg = renderer.bgColor;
    const bc = renderer.branchColor;
    const bw = Math.max(0.5, renderer.branchWidth);
    const lc = renderer.labelColor;
    const fs = renderer.fontSize;
    const tr = renderer.tipRadius;
    const nr = renderer.nodeRadius;
    const toSX = (wx) => wx * sx + ox + llW;
    const toSY = (wy) => wy * sy + oy;
    const f = (n) => n.toFixed(2);
    const MARGIN = fullTree ? Infinity : 20;
    const defs = [];
    defs.push(`<clipPath id="tc"><rect x="${llW}" y="0" width="${ttW}" height="${ttH_eff}"/></clipPath>`);
    const bgParts = [];
    if (!transparent) {
      bgParts.push(`<rect width="${totalW}" height="${totalH_eff}" fill="${esc(bg)}"/>`);
    }
    const legendParts = [];
    const lr = legendRenderer;
    const legendPos = lr?._position;
    const legendKey = lr?._annotation;
    const legendSchema = lr?._schema;
    if (legendPos && legendKey && legendSchema) {
      const def = legendSchema.get(legendKey);
      if (def) {
        const lx = legendPos === "left" ? 0 : llW + ttW;
        const lfs = lr.fontSize ?? fs;
        const ltc = lr.textColor ?? "#F7EECA";
        const lfont = lr._fontFamily ?? "monospace";
        const PAD = 12;
        const legendH = ttH;
        let ly = PAD;
        legendParts.push(`<text x="${lx + PAD}" y="${ly}" dominant-baseline="hanging" font-family="${lfont}" font-size="${lfs}px" font-weight="700" fill="#b58900">${svgTextEsc(legendKey)}</text>`);
        ly += lfs + 10;
        if (def.dataType === "categorical" || def.dataType === "ordinal") {
          const paletteName = lr._paletteOverrides?.get(legendKey);
          const colourMap = buildCategoricalColourMap(def.values || [], paletteName);
          const SWATCH = Math.max(8, lfs);
          const ROW_H = Math.max(SWATCH + 4, lfs + 4);
          (def.values || []).forEach((val) => {
            if (ly + SWATCH > legendH - PAD) return;
            const colour = colourMap.get(val) ?? MISSING_DATA_COLOUR;
            legendParts.push(`<rect x="${lx + PAD}" y="${ly}" width="${SWATCH}" height="${SWATCH}" fill="${esc(colour)}"/>`);
            legendParts.push(`<text x="${lx + PAD + SWATCH + 6}" y="${ly + SWATCH / 2}" dominant-baseline="central" font-family="${lfont}" font-size="${lfs}px" fill="${esc(ltc)}">${svgTextEsc(String(val))}</text>`);
            ly += ROW_H;
          });
        } else if (def.dataType === "date" || isNumericType(def.dataType)) {
          const BAR_W = 14;
          const BAR_H = Math.max(40, legendH - ly - PAD);
          const gid = "lgrd";
          const seqStops = getSequentialPalette(lr._paletteOverrides?.get(legendKey));
          const ns = seqStops.length;
          const stopMarkup = seqStops.map(
            (c, i) => `<stop offset="${(ns === 1 ? 0 : i / (ns - 1) * 100).toFixed(1)}%" stop-color="${esc(seqStops[ns - 1 - i])}"/>`
          ).join("");
          defs.push(`<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">${stopMarkup}</linearGradient>`);
          legendParts.push(`<rect x="${lx + PAD}" y="${ly}" width="${BAR_W}" height="${BAR_H}" fill="url(#${gid})"/>`);
          const LABEL_X = lx + PAD + BAR_W + 6;
          const tickCount = Math.max(2, Math.min(6, Math.floor(BAR_H / (lfs + 6))));
          const min = def.min ?? 0, max = def.max ?? 1;
          const range = def.dataType === "date" ? new Date(max).getFullYear() - new Date(min).getFullYear() || 1 : max - min || 1;
          const fmt = def.fmt ?? ((v) => String(v));
          for (let i = 0; i < tickCount; i++) {
            const t = i / (tickCount - 1);
            const tickY = ly + t * BAR_H;
            const val = def.dataType === "date" ? null : max - t * range;
            const label = def.dataType === "date" ? (() => {
              const targetDec = max - t * range;
              let best = (def.values || [])[0] ?? String(max);
              let bestDist = Infinity;
              for (const v of def.values || []) {
                const d = Math.abs(new Date(v).getFullYear() - targetDec);
                if (d < bestDist) {
                  bestDist = d;
                  best = v;
                }
              }
              return best;
            })() : fmt(val);
            legendParts.push(`<rect x="${lx + PAD + BAR_W}" y="${f(tickY - 0.5)}" width="4" height="1" fill="${esc(ltc)}"/>`);
            const baseline = i === 0 ? "hanging" : i === tickCount - 1 ? "auto" : "central";
            legendParts.push(`<text x="${LABEL_X}" y="${f(tickY)}" dominant-baseline="${baseline}" font-family="${lfont}" font-size="${lfs}px" fill="${esc(ltc)}">${svgTextEsc(String(label))}</text>`);
          }
        }
      }
    }
    const branchParts = [];
    const bgNodeParts = [];
    const bgTipParts = [];
    const fgNodeParts = [];
    const fgTipParts = [];
    const labelParts = [];
    const connectorParts = [];
    const shapeParts = [];
    const tipHaloSW = renderer.tipHaloSize * 2;
    const nodeHaloSW = renderer.nodeHaloSize * 2;
    const tipBgColor = renderer.tipShapeBgColor || bg;
    const nodeBgColor = renderer.nodeShapeBgColor || bg;
    const rootNode = [...nm.values()].find((n) => n.parentId === null);
    if (rootNode) {
      const rx = toSX(rootNode.x), ry = toSY(rootNode.y);
      const stub = renderer.rootStubLength ?? 20;
      branchParts.push(`<line x1="${f(rx - stub)}" y1="${f(ry)}" x2="${f(rx)}" y2="${f(ry)}"/>`);
    }
    const outlineR = tr > 0 ? tr + renderer.tipHaloSize : 0;
    const _align = renderer.tipLabelAlign;
    const alignLabelX = _align && _align !== "off" ? toSX(renderer.maxX) + outlineR + 3 : null;
    const _svgShape = renderer._tipLabelShape;
    const _svgShSz = _svgShape !== "off" ? Math.max(2, Math.round(fs * renderer._tipLabelShapeSize / 100)) : 0;
    const _svgShML = _svgShape !== "off" ? renderer._tipLabelShapeMarginLeft : 0;
    const _svgShMR = _svgShape !== "off" ? renderer._tipLabelShapeMarginRight : 0;
    const _svgShOff = _svgShML + _svgShSz + _svgShMR;
    const _svgShape2 = _svgShape !== "off" ? renderer._tipLabelShape2 : "off";
    const _svgShSz2 = _svgShape2 !== "off" ? Math.max(2, Math.round(fs * renderer._tipLabelShape2Size / 100)) : 0;
    const _svgSh2MR = _svgShape2 !== "off" ? renderer._tipLabelShape2MarginRight : 0;
    const _svgTxOff = _svgShOff + _svgShSz2 + _svgSh2MR;
    for (const [, node] of nm) {
      const nx = toSX(node.x), ny = toSY(node.y);
      if (node.parentId !== null) {
        const parent = nm.get(node.parentId);
        if (parent && ny > -MARGIN && ny < ttH + MARGIN) {
          branchParts.push(`<line x1="${f(toSX(parent.x))}" y1="${f(ny)}" x2="${f(nx)}" y2="${f(ny)}"/>`);
        }
      }
      if (!node.isTip && node.children.length >= 2) {
        const childYs = node.children.map((cid) => {
          const c = nm.get(cid);
          return c ? toSY(c.y) : null;
        }).filter((y) => y !== null);
        if (childYs.length >= 2) {
          const minY = Math.min(...childYs), maxY = Math.max(...childYs);
          if (maxY > -MARGIN && minY < ttH + MARGIN)
            branchParts.push(`<line x1="${f(nx)}" y1="${f(minY)}" x2="${f(nx)}" y2="${f(maxY)}"/>`);
        }
      }
      if (ny > -MARGIN && ny < ttH + MARGIN) {
        if (node.isTip && tr > 0) {
          const fill = renderer._tipColourBy && renderer._tipColourScale ? renderer._tipColourForValue(node.annotations?.[renderer._tipColourBy]) ?? renderer.tipShapeColor : renderer.tipShapeColor;
          if (tipHaloSW > 0)
            bgTipParts.push(`<circle cx="${f(nx)}" cy="${f(ny)}" r="${tr}" fill="${esc(tipBgColor)}" stroke="${esc(tipBgColor)}" stroke-width="${tipHaloSW}"/>`);
          fgTipParts.push(`<circle cx="${f(nx)}" cy="${f(ny)}" r="${tr}" fill="${esc(fill)}"/>`);
        } else if (!node.isTip && nr > 0) {
          const fill = renderer._nodeColourBy && renderer._nodeColourScale ? renderer._nodeColourForValue(node.annotations?.[renderer._nodeColourBy]) ?? renderer.nodeShapeColor : renderer.nodeShapeColor;
          if (nodeHaloSW > 0)
            bgNodeParts.push(`<circle cx="${f(nx)}" cy="${f(ny)}" r="${nr}" fill="${esc(nodeBgColor)}" stroke="${esc(nodeBgColor)}" stroke-width="${nodeHaloSW}"/>`);
          fgNodeParts.push(`<circle cx="${f(nx)}" cy="${f(ny)}" r="${nr}" fill="${esc(fill)}"/>`);
        }
        if (node.isTip) {
          const labelText = renderer._tipLabelText ? renderer._tipLabelText(node) : node.name;
          if (labelText) {
            const baseX = alignLabelX ?? nx + outlineR + 3;
            if (alignLabelX !== null && _align !== "aligned") {
              const tipEdgeX = nx + outlineR + 2;
              const lineEndX = alignLabelX + (_svgShOff > 0 ? _svgShML : 0) - 2;
              if (lineEndX - tipEdgeX >= 8) {
                let dashAttr = "";
                if (_align === "dashed") dashAttr = ` stroke-dasharray="3 4"`;
                else if (_align === "dots") dashAttr = ` stroke-dasharray="1 4"`;
                connectorParts.push(`<line x1="${f(tipEdgeX)}" y1="${f(ny)}" x2="${f(lineEndX)}" y2="${f(ny)}" stroke="${esc(renderer.dimLabelColor)}" stroke-width="0.35"${dashAttr}/>`);
              }
            }
            if (_svgShape !== "off") {
              const shapeX = baseX + _svgShML;
              const halfSz = _svgShSz / 2;
              const sFill = renderer._tipLabelShapeColourBy && renderer._tipLabelShapeColourScale ? renderer._tipLabelShapeColourForValue(node.annotations?.[renderer._tipLabelShapeColourBy]) ?? renderer._tipLabelShapeColor : renderer._tipLabelShapeColor;
              if (_svgShape === "circle") {
                shapeParts.push(`<circle cx="${f(shapeX + halfSz)}" cy="${f(ny)}" r="${f(halfSz)}" fill="${esc(sFill)}"/>`);
              } else if (_svgShape === "block") {
                const bTop = Math.floor(ny - sy / 2);
                const bH = Math.ceil(ny + sy / 2) - bTop;
                shapeParts.push(`<rect x="${f(shapeX)}" y="${f(bTop)}" width="${f(_svgShSz)}" height="${f(bH)}" fill="${esc(sFill)}"/>`);
              } else {
                shapeParts.push(`<rect x="${f(shapeX)}" y="${f(ny - halfSz)}" width="${f(_svgShSz)}" height="${f(_svgShSz)}" fill="${esc(sFill)}"/>`);
              }
            }
            if (_svgShape2 !== "off") {
              const shape2X = baseX + _svgShOff;
              const halfSz2 = _svgShSz2 / 2;
              const s2Fill = renderer._tipLabelShape2ColourBy && renderer._tipLabelShape2ColourScale ? renderer._tipLabelShape2ColourForValue(node.annotations?.[renderer._tipLabelShape2ColourBy]) ?? renderer._tipLabelShape2Color : renderer._tipLabelShape2Color;
              if (_svgShape2 === "circle") {
                shapeParts.push(`<circle cx="${f(shape2X + halfSz2)}" cy="${f(ny)}" r="${f(halfSz2)}" fill="${esc(s2Fill)}"/>`);
              } else if (_svgShape2 === "block") {
                const bTop = Math.floor(ny - sy / 2);
                const bH = Math.ceil(ny + sy / 2) - bTop;
                shapeParts.push(`<rect x="${f(shape2X)}" y="${f(bTop)}" width="${f(_svgShSz2)}" height="${f(bH)}" fill="${esc(s2Fill)}"/>`);
              } else {
                shapeParts.push(`<rect x="${f(shape2X)}" y="${f(ny - halfSz2)}" width="${f(_svgShSz2)}" height="${f(_svgShSz2)}" fill="${esc(s2Fill)}"/>`);
              }
            }
            const lx2 = baseX + _svgTxOff;
            const labelFill = renderer._labelColourBy && renderer._labelColourScale ? renderer._labelColourForValue(node.annotations?.[renderer._labelColourBy]) ?? lc : lc;
            labelParts.push(`<text x="${f(lx2)}" y="${f(ny)}" dominant-baseline="central" font-family="monospace" font-size="${fs}px" fill="${esc(labelFill)}">${svgTextEsc(labelText)}</text>`);
          }
        } else if (!node.isTip && node.label) {
          labelParts.push(`<text x="${f(nx + 3)}" y="${f(ny - 3)}" font-family="monospace" font-size="${Math.round(fs * 0.85)}px" fill="${esc(lc)}" opacity="0.7">${svgTextEsc(node.label)}</text>`);
        }
      }
    }
    const axisParts = [];
    if (axVisible && axisRenderer._visible && axisRenderer._scaleX && axisRenderer._maxX !== 0) {
      const ar = axisRenderer;
      const plotLeft = ar._offsetX;
      const plotRight = ar._offsetX + ar._maxX * ar._scaleX;
      const AX = llW;
      const AY = ttH_eff;
      const Y_BASE = 3;
      const MAJOR_H = 9;
      const MINOR_H = 5;
      const TICK_C = "rgba(255,255,255,0.45)";
      const MINOR_C = "rgba(255,255,255,0.25)";
      const TEXT_C = "rgba(242,241,230,0.80)";
      const TEXT_DIM = "rgba(242,241,230,0.45)";
      const afs = ar._fontSize;
      const afsMinor = Math.max(6, afs - 2);
      const approxW = (label, fsize) => label.length * fsize * 0.57;
      const { leftVal, rightVal } = ar._valueDomain();
      const minVal = Math.min(leftVal, rightVal);
      const maxVal = Math.max(leftVal, rightVal);
      const targetMajor = Math.max(2, Math.round((plotRight - plotLeft) / 90));
      let majorTicks, minorTicks;
      if (ar._dateMode) {
        const majI = ar._majorInterval, minI = ar._minorInterval;
        majorTicks = majI === "auto" ? TreeCalibration.niceCalendarTicks(minVal, maxVal, targetMajor) : TreeCalibration.calendarTicksForInterval(minVal, maxVal, majI);
        if (minI === "off") {
          minorTicks = [];
        } else {
          const all = minI === "auto" ? TreeCalibration.niceCalendarTicks(minVal, maxVal, targetMajor * 5) : TreeCalibration.calendarTicksForInterval(minVal, maxVal, minI);
          const ms = new Set(majorTicks.map((t) => t.toFixed(8)));
          minorTicks = all.filter((t) => !ms.has(t.toFixed(8)));
        }
      } else {
        majorTicks = AxisRenderer._niceTicks(leftVal, rightVal, targetMajor);
        const minorAll = majorTicks.length > 1 ? AxisRenderer._niceTicks(leftVal, rightVal, targetMajor * 5) : [];
        const ms = new Set(majorTicks.map((t) => t.toPrecision(10)));
        minorTicks = minorAll.filter((t) => !ms.has(t.toPrecision(10)));
      }
      axisParts.push(`<line x1="${f(plotLeft + AX)}" y1="${f(AY + Y_BASE + 0.5)}" x2="${f(plotRight + AX)}" y2="${f(AY + Y_BASE + 0.5)}" stroke="${TICK_C}" stroke-width="1"/>`);
      const minorLabelFmt = ar._dateMode ? ar._minorLabelFormat : "off";
      const showMinorLabel = minorLabelFmt !== "off";
      let minorLabelRight = -Infinity;
      for (const val of minorTicks) {
        const sx2 = ar._valToScreenX(val) + AX;
        if (sx2 < plotLeft + AX - 1 || sx2 > plotRight + AX + 1) continue;
        axisParts.push(`<line x1="${f(sx2)}" y1="${f(AY + Y_BASE + 1)}" x2="${f(sx2)}" y2="${f(AY + Y_BASE + 1 + MINOR_H)}" stroke="${MINOR_C}" stroke-width="1"/>`);
        if (showMinorLabel) {
          const label = ar._calibration.decYearToString(val, minorLabelFmt, ar._dateFormat, ar._minorInterval);
          const tw = approxW(label, afsMinor);
          const lx2 = Math.max(plotLeft + AX + tw / 2 + 1, Math.min(plotRight + AX - tw / 2 - 1, sx2));
          if (lx2 - tw / 2 > minorLabelRight + 2) {
            axisParts.push(`<text x="${f(lx2)}" y="${f(AY + Y_BASE + 1 + MINOR_H + 2)}" dominant-baseline="hanging" text-anchor="middle" font-family="monospace" font-size="${afsMinor}px" fill="${TEXT_DIM}">${svgTextEsc(label)}</text>`);
            minorLabelRight = lx2 + tw / 2;
          }
        }
      }
      const majorLabelFmt = ar._dateMode ? ar._majorLabelFormat : "auto";
      const showMajorLabel = majorLabelFmt !== "off";
      let majorLabelRight = -Infinity;
      for (const val of majorTicks) {
        const sx2 = ar._valToScreenX(val) + AX;
        if (sx2 < plotLeft + AX - 1 || sx2 > plotRight + AX + 1) continue;
        axisParts.push(`<line x1="${f(sx2)}" y1="${f(AY + Y_BASE + 1)}" x2="${f(sx2)}" y2="${f(AY + Y_BASE + 1 + MAJOR_H)}" stroke="${TICK_C}" stroke-width="1"/>`);
        if (showMajorLabel) {
          let label;
          if (ar._dateMode) {
            const effMajorFmt = majorLabelFmt === "auto" ? "partial" : majorLabelFmt;
            label = ar._calibration.decYearToString(val, effMajorFmt, ar._dateFormat, ar._majorInterval);
          } else {
            label = AxisRenderer._formatValue(val);
          }
          const tw = approxW(label, afs);
          const lx2 = Math.max(plotLeft + AX + tw / 2 + 1, Math.min(plotRight + AX - tw / 2 - 1, sx2));
          if (lx2 - tw / 2 > majorLabelRight + 2) {
            axisParts.push(`<text x="${f(lx2)}" y="${f(AY + Y_BASE + 1 + MAJOR_H + 2)}" dominant-baseline="hanging" text-anchor="middle" font-family="monospace" font-size="${afs}px" fill="${TEXT_C}">${svgTextEsc(label)}</text>`);
            majorLabelRight = lx2 + tw / 2;
          }
        }
      }
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${totalW}" height="${totalH_eff}" viewBox="0 0 ${totalW} ${totalH_eff}">
  <defs>
    ${defs.join("\n    ")}
  </defs>
  ${bgParts.join("\n  ")}
  ${legendParts.join("\n  ")}
  <g clip-path="url(#tc)" stroke="${esc(bc)}" stroke-width="${bw}" fill="none" stroke-linecap="round">
    ${branchParts.join("\n    ")}
  </g>
  <g clip-path="url(#tc)">
    ${bgNodeParts.join("\n    ")}
  </g>
  <g clip-path="url(#tc)">
    ${bgTipParts.join("\n    ")}
  </g>
  <g clip-path="url(#tc)">
    ${fgNodeParts.join("\n    ")}
  </g>
  <g clip-path="url(#tc)">
    ${fgTipParts.join("\n    ")}
  </g>
  <g clip-path="url(#tc)">
    ${connectorParts.join("\n    ")}
  </g>
  <g clip-path="url(#tc)">
    ${shapeParts.join("\n    ")}
  </g>
  <g clip-path="url(#tc)">
    ${labelParts.join("\n    ")}
  </g>
  ${axisParts.join("\n  ")}
</svg>`;
  }

  // peartree/js/annotationsio.js
  function esc2(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function createAnnotImporter({ getGraph, onApply }) {
    const overlay = document.getElementById("import-annot-overlay");
    const body = document.getElementById("import-annot-body");
    const footer = document.getElementById("import-annot-footer");
    const titleEl = document.getElementById("import-annot-title");
    function open() {
      if (!getGraph()) return;
      _showAnnotPicker();
      overlay.classList.add("open");
    }
    function close() {
      overlay.classList.remove("open");
    }
    document.getElementById("import-annot-close").addEventListener("click", close);
    function loadFile(name, content) {
      if (!getGraph()) return;
      overlay.classList.add("open");
      _showImportConfig(name, content, close);
    }
    function _showAnnotPicker(errorMsg) {
      titleEl.innerHTML = '<i class="bi bi-file-earmark-plus me-2"></i>Import Annotations';
      footer.innerHTML = `<button id="imp-picker-cancel-btn" class="btn btn-sm btn-secondary">Cancel</button>`;
      document.getElementById("imp-picker-cancel-btn").addEventListener("click", close);
      body.innerHTML = `
      <div class="pt-tabs">
        <button class="pt-tab-btn active" data-imp-tab="file"><i class="bi bi-folder2-open me-1"></i>File</button>
        <button class="pt-tab-btn"        data-imp-tab="url" ><i class="bi bi-link-45deg me-1"></i>URL</button>
      </div>
      <div class="pt-tab-panel active" id="imp-tab-file">
        <div id="annot-drop-zone" class="pt-drop-zone">
          <div class="pt-drop-icon"><i class="bi bi-file-earmark-arrow-down"></i></div>
          <p>Drag and drop your annotation file here</p>
          <p class="text-secondary" style="font-size:0.8rem;margin-bottom:1rem">CSV (.csv) &nbsp;or&nbsp; Tab-separated (.tsv)</p>
          <input type="file" id="annot-file-input" accept=".csv,.tsv,.txt" style="position:absolute;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none">
          <button class="btn btn-sm btn-outline-primary" id="btn-annot-file-choose"><i class="bi bi-folder2-open me-1"></i>Choose File</button>
        </div>
      </div>
      <div class="pt-tab-panel" id="imp-tab-url">
        <label class="form-label">Annotation file URL</label>
        <input type="url" class="pt-modal-url-input" id="annot-url-input"
          placeholder="https://example.com/annotations.csv" />
        <div style="text-align:center;margin-top:0.5rem">
          <button class="btn btn-sm btn-outline-primary" id="btn-annot-load-url"
            ><i class="bi bi-cloud-download me-1"></i>Load from URL</button>
        </div>
      </div>
      <div id="imp-loading" class="pt-modal-loading" style="display:none">
        <div class="pt-spinner"></div>Loading&hellip;
      </div>
      ${errorMsg ? `<div class="pt-modal-error">${esc2(errorMsg)}</div>` : ""}`;
      body.querySelectorAll("[data-imp-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          body.querySelectorAll("[data-imp-tab]").forEach((b) => b.classList.remove("active"));
          body.querySelectorAll(".pt-tab-panel").forEach((p) => p.classList.remove("active"));
          btn.classList.add("active");
          document.getElementById(`imp-tab-${btn.dataset.impTab}`).classList.add("active");
        });
      });
      const annotFileInput = document.getElementById("annot-file-input");
      const annotDropZone = document.getElementById("annot-drop-zone");
      document.getElementById("btn-annot-file-choose").addEventListener("click", () => annotFileInput.click());
      annotFileInput.addEventListener("change", () => {
        const file = annotFileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => _showImportConfig(file.name, e.target.result);
        reader.readAsText(file);
      });
      annotDropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        annotDropZone.classList.add("drag-over");
      });
      annotDropZone.addEventListener("dragleave", () => annotDropZone.classList.remove("drag-over"));
      annotDropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        annotDropZone.classList.remove("drag-over");
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => _showImportConfig(file.name, ev.target.result);
        reader.readAsText(file);
      });
      document.getElementById("btn-annot-load-url").addEventListener("click", async () => {
        const url = document.getElementById("annot-url-input").value.trim();
        if (!url) return;
        const loadingEl = document.getElementById("imp-loading");
        loadingEl.style.display = "";
        try {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status} \u2013 ${url}`);
          const text = await resp.text();
          _showImportConfig(url.split("/").pop() || "annotations", text);
        } catch (err) {
          loadingEl.style.display = "none";
          _showAnnotPicker(err.message);
        }
      });
    }
    function _showImportConfig(filename, text, onCancel) {
      const handleCancel = onCancel ?? (() => _showAnnotPicker());
      let parsed;
      try {
        parsed = parseDelimited(text);
      } catch (err) {
        _showImportError(`Parse error: ${err.message}`, handleCancel);
        return;
      }
      const { headers, rows } = parsed;
      if (headers.length < 2) {
        _showImportError("File must have at least 2 columns (one to match tips and at least one annotation column).", handleCancel);
        return;
      }
      if (rows.length === 0) {
        _showImportError("No data rows found (file appears to have only a header row).", handleCancel);
        return;
      }
      const headerOpts = headers.map((h, i) => `<option value="${i}">${esc2(h)}</option>`).join("");
      const colChecks = headers.map(
        (h, i) => `<label><input type="checkbox" class="imp-col-chk" data-idx="${i}" checked> ${esc2(h)}</label>`
      ).join("");
      titleEl.innerHTML = `<i class="bi bi-file-earmark-text me-2"></i>${esc2(filename)}`;
      body.innerHTML = `
      <p style="margin:0 0 0.8rem;color:var(--bs-secondary-color)">
        ${rows.length}&nbsp;row${rows.length !== 1 ? "s" : ""},
        ${headers.length}&nbsp;column${headers.length !== 1 ? "s" : ""}
      </p>

      <div class="imp-section">
        <label class="imp-section-label">Match column</label>
        <div class="imp-row">
          <select class="imp-select" id="imp-match-col">${headerOpts}</select>
        </div>
      </div>

      <div class="imp-section">
        <label class="imp-section-label">Match mode</label>
        <div style="display:flex;flex-direction:column;gap:0.3rem;">
          <label class="imp-row" style="cursor:pointer">
            <input type="radio" name="imp-mode" id="imp-mode-full" value="full" checked>
            Full taxon label
          </label>
          <label class="imp-row" style="cursor:pointer">
            <input type="radio" name="imp-mode" id="imp-mode-field" value="field">
            Pipe-delimited field:&nbsp;
            <input type="number" id="imp-field-num" min="1" value="1"
              style="width:52px;background:#02292e;color:var(--bs-body-color);border:1px solid #235b62;border-radius:0.25rem;padding:0.1rem 0.3rem;font-size:0.82rem;"
              title="Which |-delimited field (1 = first)">
          </label>
        </div>
      </div>

      <div class="imp-section">
        <label class="imp-section-label">Columns to import</label>
        <div class="imp-col-grid" id="imp-col-grid">${colChecks}</div>
        <button id="imp-toggle-all" class="btn btn-sm btn-outline-secondary"
          style="margin-top:0.4rem;font-size:0.75rem;padding:0.1rem 0.5rem">Deselect all</button>
      </div>

      <div class="imp-section">
        <label class="imp-row" style="cursor:pointer;gap:0.4rem;align-items:flex-start">
          <input type="checkbox" id="imp-replace" style="margin-top:0.1rem;flex-shrink:0">
          <span>Replace existing annotations with the same name
            <span style="display:block;color:var(--bs-secondary-color);font-size:0.75rem">
              Clears matching annotation keys from all nodes before applying new values.
            </span>
          </span>
        </label>
      </div>`;
      footer.innerHTML = `
      <button id="imp-cancel-btn" class="btn btn-sm btn-outline-secondary">Cancel</button>
      <button id="imp-apply-btn" class="btn btn-sm btn-primary">Import &#x2192;</button>`;
      function _syncMatchColDisabled() {
        const matchIdx = document.getElementById("imp-match-col").value;
        document.querySelectorAll(".imp-col-chk").forEach((el) => {
          const isMatch = el.dataset.idx === matchIdx;
          el.disabled = isMatch;
          if (isMatch) el.checked = false;
          el.closest("label").style.opacity = isMatch ? "0.4" : "";
        });
      }
      document.getElementById("imp-match-col").addEventListener("change", _syncMatchColDisabled);
      _syncMatchColDisabled();
      document.getElementById("imp-field-num").addEventListener("focus", () => {
        document.getElementById("imp-mode-field").checked = true;
      });
      document.getElementById("imp-toggle-all").addEventListener("click", () => {
        const matchIdx = document.getElementById("imp-match-col").value;
        const eligible = [...document.querySelectorAll(".imp-col-chk")].filter((el) => el.dataset.idx !== matchIdx);
        const anyUnchecked = eligible.some((el) => !el.checked);
        eligible.forEach((el) => {
          el.checked = anyUnchecked;
        });
        document.getElementById("imp-toggle-all").textContent = anyUnchecked ? "Deselect all" : "Select all";
      });
      document.getElementById("imp-cancel-btn").addEventListener("click", () => handleCancel());
      document.getElementById("imp-apply-btn").addEventListener("click", () => {
        const matchIdx = parseInt(document.getElementById("imp-match-col").value, 10);
        const matchCol = headers[matchIdx];
        const modeField = document.getElementById("imp-mode-field").checked;
        const fieldIndex = Math.max(1, parseInt(document.getElementById("imp-field-num").value, 10) || 1) - 1;
        const doReplace = document.getElementById("imp-replace").checked;
        const importCols = headers.filter((_, i) => {
          if (i === matchIdx) return false;
          const el = document.querySelector(`.imp-col-chk[data-idx="${i}"]`);
          return el && el.checked;
        });
        if (importCols.length === 0) {
          const grid = document.getElementById("imp-col-grid");
          grid.style.outline = "1px solid var(--bs-danger)";
          setTimeout(() => {
            grid.style.outline = "";
          }, 1500);
          return;
        }
        _applyAnnotations({
          rows,
          matchCol,
          matchMode: modeField ? "field" : "full",
          fieldIndex,
          importCols,
          doReplace,
          filename
        });
      });
    }
    function _applyAnnotations({ rows, matchCol, matchMode, fieldIndex, importCols, doReplace, filename }) {
      const graph = getGraph();
      const tips = graph.nodes.filter((n) => n.adjacents.length === 1);
      const rowLookup = /* @__PURE__ */ new Map();
      for (const row of rows) {
        const key = (row[matchCol] ?? "").trim();
        if (key && !rowLookup.has(key)) rowLookup.set(key, row);
      }
      if (doReplace) {
        for (const colName of importCols)
          for (const node of graph.nodes) delete node.annotations[colName];
      }
      let matched = 0;
      const matchedRowKeys = /* @__PURE__ */ new Set();
      const unmatchedTipExamples = [];
      for (const node of tips) {
        const label = node.name ?? node.origId ?? "";
        const matchKey = matchMode === "field" ? (label.split("|")[fieldIndex] ?? "").trim() : label.trim();
        const row = rowLookup.get(matchKey);
        if (!row) {
          if (unmatchedTipExamples.length < 5) unmatchedTipExamples.push(matchKey || label);
          continue;
        }
        matched++;
        matchedRowKeys.add(matchKey);
        for (const colName of importCols) {
          const raw = (row[colName] ?? "").trim();
          if (raw === "") continue;
          const num = Number(raw);
          node.annotations[colName] = Number.isNaN(num) ? raw : num;
        }
      }
      const unmatchedTips = tips.length - matched;
      const unmatchedRows = rowLookup.size - matchedRowKeys.size;
      graph.annotationSchema = buildAnnotationSchema(graph.nodes);
      onApply(graph);
      _showImportResults({
        matched,
        unmatchedTips,
        unmatchedRows,
        unmatchedTipExamples,
        importCols,
        filename,
        totalTips: tips.length
      });
    }
    function _showImportResults({ matched, unmatchedTips, unmatchedRows, unmatchedTipExamples = [], importCols, filename, totalTips }) {
      const pct = totalTips > 0 ? Math.round(100 * matched / totalTips) : 0;
      const okCls = matched > 0 ? "imp-ok" : "imp-warn";
      const tipCls = unmatchedTips > 0 ? "imp-warn" : "imp-ok";
      const rowCls = unmatchedRows > 0 ? "imp-warn" : "imp-ok";
      titleEl.innerHTML = '<i class="bi bi-file-earmark-check me-2"></i>Import Results';
      body.innerHTML = `
      <div class="imp-result-row">
        <span class="imp-result-icon ${okCls}"><i class="bi bi-check-circle-fill"></i></span>
        <span><strong>${matched}</strong> of <strong>${totalTips}</strong> tips matched (${pct}%)</span>
      </div>
      <div class="imp-result-row">
        <span class="imp-result-icon ${tipCls}">
          <i class="bi bi-${unmatchedTips > 0 ? "exclamation-triangle-fill" : "check-circle-fill"}"></i>
        </span>
        <span><strong>${unmatchedTips}</strong> tip${unmatchedTips !== 1 ? "s" : ""} unmatched${unmatchedTips > 0 && unmatchedTipExamples.length > 0 ? ` <span style="color:var(--bs-secondary-color);font-size:0.78rem">(e.g. ${unmatchedTipExamples.map((n) => `<code style="background:#02292e;padding:0 3px;border-radius:3px">${esc2(n)}</code>`).join(", ")}${unmatchedTips > unmatchedTipExamples.length ? ", \u2026" : ""})</span>` : ""}</span>
      </div>
      <div class="imp-result-row">
        <span class="imp-result-icon ${rowCls}">
          <i class="bi bi-${unmatchedRows > 0 ? "exclamation-triangle-fill" : "check-circle-fill"}"></i>
        </span>
        <span><strong>${unmatchedRows}</strong> annotation row${unmatchedRows !== 1 ? "s" : ""} unmatched</span>
      </div>
      ${importCols.length > 0 ? `
      <div style="margin-top:0.75rem;padding-top:0.6rem;border-top:1px solid #235b62;">
        <span style="color:var(--bs-secondary-color)">Annotations imported:</span>
        ${importCols.map((c) => `<code style="background:#02292e;padding:0 3px;border-radius:3px;margin:0 2px">${esc2(c)}</code>`).join("")}
      </div>` : ""}`;
      footer.innerHTML = `<button id="imp-close-btn" class="btn btn-sm btn-primary">Close</button>`;
      document.getElementById("imp-close-btn").addEventListener("click", close);
    }
    function _showImportError(msg, onCancel) {
      const handleCancel = onCancel ?? (() => _showAnnotPicker());
      titleEl.innerHTML = '<i class="bi bi-exclamation-triangle me-2"></i>Import Error';
      body.innerHTML = `<div style="color:var(--bs-danger);padding:0.5rem 0">${esc2(msg)}</div>`;
      footer.innerHTML = `<button id="imp-back-btn" class="btn btn-sm btn-outline-secondary me-auto">&#x2190; Back</button>
      <button id="imp-close-err-btn" class="btn btn-sm btn-secondary">Close</button>`;
      document.getElementById("imp-back-btn").addEventListener("click", () => handleCancel());
      document.getElementById("imp-close-err-btn").addEventListener("click", close);
    }
    return { open, close, loadFile };
  }

  // peartree/js/annotcurator.js
  function esc3(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function _fmtNum(v) {
    if (v == null || !Number.isFinite(v)) return "\u2014";
    const a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3 && v !== 0) return v.toExponential(3);
    return parseFloat(v.toPrecision(5)).toString();
  }
  function createAnnotCurator({ getGraph, onApply, onTableColumnsChange, getTableColumns }) {
    const overlay = document.getElementById("curate-annot-overlay");
    const tbody = document.getElementById("curate-annot-tbody");
    const detail = document.getElementById("curate-annot-detail");
    const applyBtn = document.getElementById("curate-annot-apply");
    let _pending = /* @__PURE__ */ new Map();
    let _deleted = /* @__PURE__ */ new Set();
    let _selected = null;
    let _tableColumns = new Set(getTableColumns ? getTableColumns() : []);
    document.getElementById("curate-annot-close").addEventListener("click", close);
    document.getElementById("curate-annot-cancel").addEventListener("click", close);
    applyBtn.addEventListener("click", _apply);
    const parseTipsOverlay = document.getElementById("parse-tips-overlay");
    document.getElementById("curate-annot-parse-tips").addEventListener("click", _openParseTips);
    document.getElementById("parse-tips-close").addEventListener("click", _closeParseTips);
    document.getElementById("parse-tips-cancel").addEventListener("click", _closeParseTips);
    document.getElementById("parse-tips-ok").addEventListener("click", _runParseTips);
    parseTipsOverlay.addEventListener("click", (e) => {
      if (e.target === parseTipsOverlay) _closeParseTips();
    });
    parseTipsOverlay.addEventListener("keydown", (e) => {
      if (e.key === "Enter") _runParseTips();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    function open() {
      const graph = getGraph();
      if (!graph?.annotationSchema) return;
      _pending.clear();
      _deleted.clear();
      _selected = null;
      _renderTable(graph.annotationSchema);
      _renderDetail(null, null);
      overlay.classList.add("open");
    }
    function close() {
      overlay.classList.remove("open");
    }
    function _apply() {
      const graph = getGraph();
      if (!graph) return;
      if (_deleted.size > 0) {
        const names = [..._deleted].join(", ");
        const plural = _deleted.size === 1 ? "annotation" : "annotations";
        if (!confirm(`Permanently delete ${_deleted.size} ${plural}?

${names}

This cannot be undone.`)) return;
      }
      const schema = _buildModifiedSchema(graph);
      if (onTableColumnsChange) {
        let changed = false;
        for (const name of _deleted) {
          if (_tableColumns.delete(name)) changed = true;
        }
        if (changed) onTableColumnsChange([..._tableColumns]);
      }
      onApply(schema);
      graph.annotationSchema = schema;
      close();
    }
    function _renderTable(schema) {
      const rows = [];
      const namesInTable = _tableColumns.has("__names__");
      rows.push(`
      <tr data-name="__names__" class="ca-row-fixed">
        <td><span class="ca-name">Names</span>
          <span style="margin-left:5px;font-size:0.68rem;color:rgba(255,255,255,0.3);font-style:italic">tip labels</span></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td class="ca-center">
          <input type="checkbox" class="ca-table-chk" data-name="__names__"
            ${namesInTable ? "checked" : ""}
            title="Show tip names in data table panel"
            style="cursor:pointer;accent-color:var(--pt-teal,#2aa198)">
        </td>
        <td class="ca-center"><span style="color:rgba(255,255,255,0.15)" title="Cannot be deleted">\u2014</span></td>
      </tr>`);
      for (const [name, def] of schema) {
        if (name === "user_colour") continue;
        if (def.groupMember) continue;
        const isDeleted = _deleted.has(name);
        const p = _pending.get(name) ?? {};
        const type = p.dataType ?? def.dataType;
        const isNum = isNumericType(type);
        const obsMin = def.observedMin ?? def.min;
        const obsMax = def.observedMax ?? def.max;
        const scaleMin = p.min !== void 0 ? p.min : def.min;
        const scaleMax = p.max !== void 0 ? p.max : def.max;
        const boundsOverridden = p.min !== void 0 || p.max !== void 0 || p._boundsMode === "nonneg" || p._boundsMode === "prob";
        const boundsColor = def.fixedBounds || boundsOverridden ? "var(--pt-gold)" : "rgba(255,255,255,0.4)";
        const onStr = def.onTips && def.onNodes ? "T+N" : def.onTips ? "T" : "N";
        const isSelected = name === _selected;
        let obsCell;
        if (isNum) {
          obsCell = `<span style="font-family:monospace">${_fmtNum(obsMin)}</span>
                   <span style="color:rgba(255,255,255,0.3);padding:0 3px">\u2026</span>
                   <span style="font-family:monospace">${_fmtNum(obsMax)}</span>`;
        } else if (type === "date" && def.min != null && def.max != null) {
          obsCell = `<span style="font-family:monospace">${esc3(def.min)}</span>
                   <span style="color:rgba(255,255,255,0.3);padding:0 3px">\u2026</span>
                   <span style="font-family:monospace">${esc3(def.max)}</span>`;
        } else if (type === "categorical" && def.values) {
          obsCell = `<span style="color:rgba(255,255,255,0.5)">${def.values.length} values</span>`;
        } else {
          obsCell = '<span style="color:rgba(255,255,255,0.3)">\u2014</span>';
        }
        let boundsCell;
        if (isNum) {
          boundsCell = `<span style="font-family:monospace;color:${boundsColor}">${_fmtNum(scaleMin)}</span>
                      <span style="color:rgba(255,255,255,0.3);padding:0 3px">\u2026</span>
                      <span style="font-family:monospace;color:${boundsColor}">${_fmtNum(scaleMax)}</span>`;
        } else {
          boundsCell = '<span style="color:rgba(255,255,255,0.2)">\u2014</span>';
        }
        const hasPending = !isDeleted && _pending.has(name) && Object.keys(_pending.get(name)).length > 0;
        const rowAttr = isDeleted ? ' class="ca-row-deleted"' : isSelected ? ' class="selected"' : "";
        const delBtn = isDeleted ? `<button class="ca-del-btn ca-reinstate-btn" data-name="${esc3(name)}" title="Reinstate" tabindex="-1"><i class="bi bi-arrow-counterclockwise"></i></button>` : `<button class="ca-del-btn" data-name="${esc3(name)}" title="Delete annotation" tabindex="-1"><i class="bi bi-trash3"></i></button>`;
        rows.push(`
        <tr data-name="${esc3(name)}"${rowAttr}>
          <td>
            ${hasPending ? '<span class="ca-pending-dot" title="Unsaved changes"></span>' : ""}
            <span class="ca-name">${esc3(name)}</span>
          </td>
          <td><span class="ca-type-badge ca-type-${esc3(type)}">${esc3(type)}</span></td>
          <td class="ca-center" style="color:rgba(255,255,255,0.45);font-size:0.72rem">${onStr}</td>
          <td>${obsCell}</td>
          <td>${boundsCell}</td>
          <td class="ca-center">
            <input type="checkbox" class="ca-table-chk" data-name="${esc3(name)}"
              ${_tableColumns.has(name) ? "checked" : ""}
              title="Show in data table panel"
              style="cursor:pointer;accent-color:var(--pt-teal,#2aa198)">
          </td>
          <td class="ca-center">${delBtn}</td>
        </tr>`);
      }
      tbody.innerHTML = rows.length ? rows.join("") : '<tr><td colspan="7" style="text-align:center;color:rgba(255,255,255,0.3);padding:16px">No annotations</td></tr>';
      for (const chk of tbody.querySelectorAll(".ca-table-chk")) {
        chk.addEventListener("click", (e) => {
          e.stopPropagation();
          const chkName = chk.dataset.name;
          if (chk.checked) {
            _tableColumns.add(chkName);
          } else {
            _tableColumns.delete(chkName);
          }
          if (onTableColumnsChange) onTableColumnsChange([..._tableColumns]);
        });
      }
      for (const btn of tbody.querySelectorAll(".ca-del-btn")) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const btnName = btn.dataset.name;
          if (_deleted.has(btnName)) {
            _deleted.delete(btnName);
          } else {
            _deleted.add(btnName);
            _pending.delete(btnName);
            if (_selected === btnName) {
              _selected = null;
              _renderDetail(null, null);
            }
          }
          const schema2 = getGraph()?.annotationSchema;
          if (schema2) _renderTable(schema2);
        });
      }
      for (const tr of tbody.querySelectorAll("tr[data-name]")) {
        tr.addEventListener("click", () => {
          const clickedName = tr.dataset.name;
          if (clickedName === "__names__") return;
          if (_deleted.has(clickedName)) return;
          if (_selected === clickedName) {
            _selected = null;
            tr.classList.remove("selected");
            _renderDetail(null, null);
            return;
          }
          _selected = clickedName;
          for (const r of tbody.querySelectorAll("tr")) r.classList.remove("selected");
          tr.classList.add("selected");
          const schema2 = getGraph()?.annotationSchema;
          if (schema2) _renderDetail(clickedName, schema2.get(clickedName));
        });
      }
    }
    function _renderDetail(name, def) {
      if (!def) {
        detail.innerHTML = '<p class="ca-detail-empty">\u2190 Select an annotation row to edit its settings</p>';
        return;
      }
      const p = _pending.get(name) ?? {};
      const currentType = p.dataType ?? def.dataType;
      const isNumeric = isNumericType(currentType);
      const isDate = currentType === "date";
      const isBranchAnnot = p.isBranchAnnotation !== void 0 ? p.isBranchAnnotation : def.isBranchAnnotation ?? false;
      const scaleMin = p.min !== void 0 ? p.min : def.min;
      const scaleMax = p.max !== void 0 ? p.max : def.max;
      const boundsMode = p._boundsMode ?? (currentType === "proportion" ? "proportion" : currentType === "percentage" ? "percentage" : def.fixedBounds ? def.min === 0 && def.max === 1 ? "prob" : def.min === 0 ? "nonneg" : "custom" : "auto");
      const selInt = currentType === "integer" ? " selected" : "";
      const selReal = currentType === "real" ? " selected" : "";
      const selProp = currentType === "proportion" ? " selected" : "";
      const selPerc = currentType === "percentage" ? " selected" : "";
      const selCat = currentType === "categorical" ? " selected" : "";
      const chkAuto = boundsMode === "auto" ? " checked" : "";
      const chkNonneg = boundsMode === "nonneg" ? " checked" : "";
      const chkProb = boundsMode === "prob" ? " checked" : "";
      const chkCustom = boundsMode === "custom" ? " checked" : "";
      const customVis = boundsMode === "custom" ? "" : "visibility:hidden;";
      const minVal = scaleMin != null ? scaleMin : "";
      const maxVal = scaleMax != null ? scaleMax : "";
      const obsMinStr = esc3(_fmtNum(def.observedMin ?? def.min));
      const obsMaxStr = esc3(_fmtNum(def.observedMax ?? def.max));
      let html = `<div class="ca-detail-header"><i class="bi bi-tag me-1"></i>${esc3(name)}</div>`;
      html += `<div class="ca-section-lbl">Interpret as</div><div class="ca-row"><label class="ca-row-lbl">Type</label><select id="cd-type" class="ca-sel">`;
      if (isNumericType(def.dataType)) {
        html += `<option value="integer"${selInt}>Integer \u2014 discrete</option><option value="real"${selReal}>Real \u2014 continuous</option><option value="proportion"${selProp}>Proportion [0\u20131] \u2014 fixed bounds</option><option value="percentage"${selPerc}>Percentage [0\u2013100] \u2014 fixed bounds</option><option value="categorical"${selCat}>Categorical</option>`;
      } else {
        html += `<option value="${esc3(def.dataType)}" selected>${esc3(def.dataType)}</option>`;
      }
      html += `</select>`;
      if (def.dataType === "integer" && currentType === "categorical") {
        html += `<span class="ca-hint">integer values treated as string labels</span>`;
      }
      html += `</div>`;
      if (currentType === "categorical" && def.values?.length) {
        const vals = def.values;
        let preview;
        if (vals.length <= 4) {
          preview = vals.map((v) => `<span class="ca-mono" style="margin-right:6px">${esc3(v)}</span>`).join("");
        } else {
          preview = [vals[0], vals[1], vals[2]].map((v) => `<span class="ca-mono" style="margin-right:6px">${esc3(v)}</span>`).join("") + `<span style="color:rgba(255,255,255,0.4);margin-right:6px">\u2026</span><span class="ca-mono">${esc3(vals[vals.length - 1])}</span>`;
        }
        html += `<div class="ca-section-lbl" style="margin-top:10px">Values <span class="ca-hint">${vals.length} distinct</span></div><div class="ca-row" style="flex-wrap:wrap;gap:4px 0">${preview}</div>`;
      }
      if (isDate && def.min != null && def.max != null) {
        html += `<div class="ca-section-lbl" style="margin-top:10px">Date range</div><div class="ca-row"><label class="ca-row-lbl">Earliest</label><span class="ca-mono" style="margin-right:16px">${esc3(def.min)}</span><label class="ca-row-lbl">Latest</label><span class="ca-mono">${esc3(def.max)}</span><span class="ca-hint" style="margin-left:10px">${def.values ? def.values.length + " distinct values" : ""}</span></div>`;
      }
      if (isNumeric) {
        if (currentType === "proportion" || currentType === "percentage") {
          const [fbMin, fbMax] = currentType === "proportion" ? [0, 1] : [0, 100];
          html += `<div class="ca-section-lbl" style="margin-top:10px">Scale bounds</div><div class="ca-row" style="color:rgba(255,255,255,0.55);font-size:0.78rem"><i class="bi bi-lock-fill me-2" style="opacity:0.5"></i>Fixed by type: <span class="ca-mono" style="margin:0 6px">${fbMin}\u2009\u2026\u2009${fbMax}</span><span class="ca-hint">(change type to Real to adjust)</span></div>`;
        } else {
          html += `<div class="ca-section-lbl" style="margin-top:10px">Scale bounds</div><div class="ca-row ca-wrap"><label class="ca-chk-lbl"><input type="radio" name="cd-bounds" value="auto"${chkAuto}>Auto \u2014 observed <span class="ca-mono">${obsMinStr}\u2009\u2026\u2009${obsMaxStr}</span></label><label class="ca-chk-lbl"><input type="radio" name="cd-bounds" value="nonneg"${chkNonneg}>Non-negative <span class="ca-mono">0\u2009\u2026\u2009+\u221E</span></label><label class="ca-chk-lbl"><input type="radio" name="cd-bounds" value="prob"${chkProb}>Probability <span class="ca-mono">0\u2009\u2026\u20091</span></label><label class="ca-chk-lbl"><input type="radio" name="cd-bounds" value="custom"${chkCustom}>Custom</label></div><div id="cd-custom-row" class="ca-row" style="${customVis}"><label class="ca-row-lbl">Min</label><input type="number" id="cd-min" class="ca-num-input" value="${minVal}" placeholder="auto" step="any"><label class="ca-row-lbl" style="margin-left:8px">Max</label><input type="number" id="cd-max" class="ca-num-input" value="${maxVal}" placeholder="auto" step="any"></div>`;
        }
      }
      html += `<div class="ca-section-lbl" style="margin-top:10px">Behaviour</div><div class="ca-row"><label class="ca-chk-lbl"><input type="checkbox" id="cd-branch-annot"${isBranchAnnot ? " checked" : ""}> Branch annotation <span class="ca-hint">(stored on descendant; describes the branch above it \u2014 transferred on reroot)</span></label></div>`;
      detail.innerHTML = html;
      document.getElementById("cd-type")?.addEventListener("change", (e) => {
        _mutPending(name, { dataType: e.target.value });
        _rerender(name);
      });
      for (const radio of detail.querySelectorAll('[name="cd-bounds"]')) {
        radio.addEventListener("change", () => {
          const mode = detail.querySelector('[name="cd-bounds"]:checked')?.value ?? "auto";
          const customRow = document.getElementById("cd-custom-row");
          if (customRow) customRow.style.visibility = mode === "custom" ? "" : "hidden";
          _mutPending(name, { _boundsMode: mode, ..._boundsFromPreset(mode, def) });
          _updateTableRow(name, getGraph()?.annotationSchema);
        });
      }
      document.getElementById("cd-min")?.addEventListener("blur", (e) => {
        const v = e.target.value.trim();
        _mutPending(name, { min: v === "" ? void 0 : parseFloat(v) });
        _updateTableRow(name, getGraph()?.annotationSchema);
      });
      document.getElementById("cd-max")?.addEventListener("blur", (e) => {
        const v = e.target.value.trim();
        _mutPending(name, { max: v === "" ? void 0 : parseFloat(v) });
        _updateTableRow(name, getGraph()?.annotationSchema);
      });
      document.getElementById("cd-branch-annot")?.addEventListener("change", (e) => {
        _mutPending(name, { isBranchAnnotation: e.target.checked });
      });
    }
    function _openParseTips() {
      document.getElementById("parse-tips-name").value = "";
      document.getElementById("parse-tips-delim").value = "|";
      document.getElementById("parse-tips-field").value = "1";
      document.getElementById("parse-tips-type").value = "auto";
      document.getElementById("parse-tips-missing").value = "?";
      document.getElementById("parse-tips-error").style.display = "none";
      const graph = getGraph();
      const examplesWrap = document.getElementById("parse-tips-examples");
      const examplesList = document.getElementById("parse-tips-examples-list");
      const tips = graph ? graph.nodes.filter((n) => n.adjacents.length === 1 && n.name != null) : [];
      if (tips.length > 0) {
        const MAX = 5;
        const sample = tips.slice(0, MAX);
        examplesList.innerHTML = sample.map((n) => {
          const label = n.name.length > 60 ? n.name.slice(0, 57) + "\u2026" : n.name;
          return `<div>${esc3(label)}</div>`;
        }).join("") + (tips.length > MAX ? `<div style="color:rgba(255,255,255,0.3)">\u2026 ${tips.length - MAX} more</div>` : "");
        examplesWrap.style.display = "";
      } else {
        examplesWrap.style.display = "none";
      }
      parseTipsOverlay.classList.add("open");
      setTimeout(() => document.getElementById("parse-tips-name").focus(), 50);
    }
    function _closeParseTips() {
      parseTipsOverlay.classList.remove("open");
    }
    function _showParseError(msg) {
      const el = document.getElementById("parse-tips-error");
      el.textContent = msg;
      el.style.display = "";
    }
    function _runParseTips() {
      const graph = getGraph();
      if (!graph) return;
      const annotName = document.getElementById("parse-tips-name").value.trim();
      const delimiter = document.getElementById("parse-tips-delim").value;
      const fieldNum = parseInt(document.getElementById("parse-tips-field").value, 10);
      const typeHint = document.getElementById("parse-tips-type").value;
      const missingStr = document.getElementById("parse-tips-missing").value;
      document.getElementById("parse-tips-error").style.display = "none";
      if (!annotName) {
        _showParseError("Please enter an annotation name.");
        return;
      }
      if (!delimiter) {
        _showParseError("Please enter a delimiter character.");
        return;
      }
      if (isNaN(fieldNum) || fieldNum === 0) {
        _showParseError("Field must be a non-zero integer.");
        return;
      }
      if (graph.annotationSchema.has(annotName)) {
        if (!confirm(`An annotation named "${annotName}" already exists. Overwrite it?`)) return;
      }
      const tips = graph.nodes.filter((n) => n.adjacents.length === 1 && n.name != null);
      if (tips.length === 0) {
        _showParseError("No tip nodes with names found.");
        return;
      }
      const extracted = [];
      const missing = [];
      for (const node of tips) {
        const parts = (node.name ?? "").split(delimiter);
        const idx = fieldNum > 0 ? fieldNum - 1 : parts.length + fieldNum;
        if (idx < 0 || idx >= parts.length) {
          missing.push(node.name);
        } else {
          extracted.push({ node, raw: parts[idx].trim() });
        }
      }
      if (missing.length > 0) {
        const sample = missing.slice(0, 3).map((n) => `"${n}"`).join(", ");
        _showParseError(
          `${missing.length} tip${missing.length > 1 ? "s" : ""} don't have field ${fieldNum}: ` + sample + (missing.length > 3 ? `, \u2026` : "")
        );
        return;
      }
      const parseErrors = [];
      for (const e of extracted) {
        if (missingStr !== "" && e.raw === missingStr) {
          e.value = "?";
          continue;
        }
        if (typeHint === "integer") {
          const n = parseInt(e.raw, 10);
          if (isNaN(n)) {
            parseErrors.push(e.raw);
          } else {
            e.value = n;
          }
        } else if (typeHint === "real") {
          const n = parseFloat(e.raw);
          if (isNaN(n)) {
            parseErrors.push(e.raw);
          } else {
            e.value = n;
          }
        } else {
          e.value = e.raw;
        }
      }
      if (parseErrors.length > 0) {
        const sample = [...new Set(parseErrors)].slice(0, 3).map((v) => `"${v}"`).join(", ");
        _showParseError(`Cannot parse as ${typeHint}: ${sample}${parseErrors.length > 3 ? ", \u2026" : ""}`);
        return;
      }
      for (const { node, value } of extracted) {
        node.annotations[annotName] = value;
      }
      const newSchema = buildAnnotationSchema(graph.nodes);
      if (typeHint !== "auto" && newSchema.has(annotName)) {
        const def = newSchema.get(annotName);
        if (typeHint === "categorical" && def.dataType !== "categorical") {
          const distinct = [...new Set(extracted.map((e) => String(e.value)))].sort();
          def.dataType = "categorical";
          def.values = distinct;
          delete def.min;
          delete def.max;
          delete def.observedMin;
          delete def.observedMax;
          delete def.observedRange;
          delete def.fmt;
          delete def.fmtValue;
        } else if (typeHint === "date" && def.dataType !== "date") {
          const distinct = [...new Set(extracted.map((e) => String(e.value)))].sort();
          def.dataType = "date";
          def.values = distinct;
          def.min = distinct[0];
          def.max = distinct[distinct.length - 1];
          delete def.observedMin;
          delete def.observedMax;
          delete def.observedRange;
          delete def.fmt;
          delete def.fmtValue;
        }
      }
      graph.annotationSchema = newSchema;
      _closeParseTips();
      _selected = null;
      _renderTable(newSchema);
      _renderDetail(null, null);
    }
    function _mutPending(name, changes) {
      _pending.set(name, { ..._pending.get(name) ?? {}, ...changes });
    }
    function _rerender(name) {
      const schema = getGraph()?.annotationSchema;
      if (!schema) return;
      _renderTable(schema);
      _renderDetail(name, schema.get(name));
    }
    function _updateTableRow(name, schema) {
      if (!schema) return;
      _renderTable(schema);
    }
    function _boundsFromPreset(mode, def) {
      if (mode === "auto") return { min: void 0, max: void 0, fixedBounds: false };
      if (mode === "nonneg") return { min: 0, max: void 0, fixedBounds: true };
      if (mode === "prob") return { min: 0, max: 1, fixedBounds: true };
      if (mode === "proportion") return { min: 0, max: 1, fixedBounds: true };
      if (mode === "percentage") return { min: 0, max: 100, fixedBounds: true };
      return { fixedBounds: true };
    }
    function _buildModifiedSchema(graph) {
      const { nodes: nodes2, annotationSchema: schema } = graph;
      const out = new Map(Array.from(schema, ([k, v]) => [k, { ...v }]));
      for (const name of _deleted) {
        out.delete(name);
        for (const node of nodes2) {
          delete node.annotations[name];
        }
      }
      for (const [name, p] of _pending) {
        if (!out.has(name)) continue;
        const def = out.get(name);
        const targetType = p.dataType ?? def.dataType;
        if (p.dataType && p.dataType !== def.dataType) {
          if (p.dataType === "categorical") {
            const distinct = [...new Set(
              nodes2.filter((n) => n.annotations?.[name] != null).map((n) => String(n.annotations[name]))
            )].sort();
            def.dataType = "categorical";
            def.values = distinct;
            delete def.min;
            delete def.max;
            delete def.observedMin;
            delete def.observedMax;
            delete def.observedRange;
            delete def.fmt;
            delete def.fmtValue;
          } else if (p.dataType === "proportion") {
            def.dataType = "proportion";
            def.min = 0;
            def.max = 1;
            def.fixedBounds = true;
          } else if (p.dataType === "percentage") {
            def.dataType = "percentage";
            def.min = 0;
            def.max = 100;
            def.fixedBounds = true;
          } else {
            def.dataType = p.dataType;
            def.fixedBounds = false;
          }
        }
        if (p._boundsMode === "auto") {
          def.min = def.observedMin;
          def.max = def.observedMax;
          def.fixedBounds = false;
        } else {
          if (p.min !== void 0) {
            def.min = p.min;
          }
          if (p.max !== void 0) {
            def.max = p.max;
          }
          if (p.fixedBounds !== void 0) def.fixedBounds = p.fixedBounds;
        }
        const finalType = def.dataType;
        if (isNumericType(finalType)) {
          def.observedRange = (def.observedMax ?? def.max ?? 0) - (def.observedMin ?? def.min ?? 0);
          def.fmt = makeAnnotationFormatter(def, "ticks");
          def.fmtValue = makeAnnotationFormatter(def, "value");
        }
        if (p.isBranchAnnotation !== void 0) def.isBranchAnnotation = p.isBranchAnnotation;
      }
      return out;
    }
    return { open, close };
  }

  // peartree/js/datatablerenderer.js
  function _esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  var _measureCanvas = document.createElement("canvas");
  function createDataTableRenderer({ getRenderer, onEditCommit, onRowSelect, panel, headerEl, bodyEl }) {
    let _columns = [];
    let _showNames = false;
    let _columnSig = "";
    let _tips = [];
    let _tipsVersion = 0;
    let _colWidths = [];
    let _rowEls = /* @__PURE__ */ new Map();
    let _open = false;
    let _selectedIds = /* @__PURE__ */ new Set();
    let _lastClickedIdx = -1;
    function setColumns(cols) {
      const raw = (cols || []).filter(Boolean);
      _showNames = raw.includes("__names__");
      _columns = raw.filter((c) => c !== "__names__");
      _columnSig = "";
      _clearRows();
      if (_open) _redraw();
    }
    function setTips(tips) {
      _tips = [...tips || []].sort((a, b) => a.y - b.y);
      _tipsVersion++;
      _clearRows();
      if (_open) _redraw();
    }
    function syncView() {
      if (!_open) return;
      _redraw();
    }
    function syncSelection(ids) {
      _selectedIds = ids instanceof Set ? ids : new Set(ids);
      for (const [tipId, { el }] of _rowEls) {
        el.classList.toggle("dt-row-selected", _selectedIds.has(tipId));
      }
    }
    function open() {
      _open = true;
      panel.classList.add("open");
      panel.style.flexBasis = panel._dtWidth || "280px";
      const r = getRenderer();
      if (r?.nodes) _tips = r.nodes.filter((n) => n.isTip).sort((a, b) => a.y - b.y);
      if (r?._selectedTipIds) _selectedIds = new Set(r._selectedTipIds);
      _clearRows();
      _redraw();
    }
    function close() {
      if (panel.style.flexBasis && panel.style.flexBasis !== "0px") {
        panel._dtWidth = panel.style.flexBasis;
      }
      _open = false;
      panel.classList.remove("open");
      panel.style.flexBasis = "0";
    }
    function isOpen() {
      return _open;
    }
    function _clearRows() {
      for (const { el } of _rowEls.values()) el.remove();
      _rowEls.clear();
      if (bodyEl) bodyEl.innerHTML = "";
    }
    function _computeColWidths(fontPx, fontFamily) {
      const ctx = _measureCanvas.getContext("2d");
      ctx.font = `${fontPx}px ${fontFamily}`;
      const PAD = 14;
      const MIN = 48;
      _colWidths = [];
      if (_showNames) {
        let w = ctx.measureText("Names").width;
        for (const tip of _tips) w = Math.max(w, ctx.measureText(tip.name ?? tip.id ?? "").width);
        _colWidths.push(Math.max(MIN, Math.ceil(w) + PAD));
      }
      for (const col of _columns) {
        let w = ctx.measureText(col).width;
        for (const tip of _tips) {
          const val = tip.annotations?.[col];
          if (val != null) w = Math.max(w, ctx.measureText(String(val)).width);
        }
        _colWidths.push(Math.max(MIN, Math.ceil(w) + PAD));
      }
    }
    function _renderHeader() {
      if (!headerEl) return;
      let html = "";
      let wi = 0;
      if (_showNames) {
        const w = _colWidths[wi++] ?? 100;
        html += `<div class="dt-header-name" style="flex:0 0 ${w}px;width:${w}px" title="Tip names">Names</div>`;
      }
      for (const col of _columns) {
        const w = _colWidths[wi++] ?? 80;
        html += `<div class="dt-header-cell" style="flex:0 0 ${w}px;width:${w}px" title="${_esc(col)}">${_esc(col)}</div>`;
      }
      headerEl.innerHTML = html;
    }
    function _redraw() {
      const renderer = getRenderer();
      if (!renderer || !bodyEl) return;
      const scaleY = renderer.scaleY;
      const offsetY = renderer.offsetY;
      const rowH = Math.max(12, Math.min(40, scaleY));
      const dtFontPx = Math.max(9, Math.min(rowH * 0.8, renderer.fontSize || 11));
      panel.style.setProperty("--dt-font-size", dtFontPx + "px");
      const bodyH = bodyEl.clientHeight;
      const BUFFER = rowH * 4;
      const currentSig = `${Math.round(dtFontPx)}|${_tipsVersion}|${_showNames ? "1" : "0"}|${_columns.join("\0")}`;
      if (currentSig !== _columnSig) {
        _columnSig = currentSig;
        _computeColWidths(dtFontPx, renderer.fontFamily || "monospace");
        _clearRows();
        _renderHeader();
      }
      const visible = /* @__PURE__ */ new Set();
      for (const tip of _tips) {
        const screenY = tip.y * scaleY + offsetY;
        const topY = screenY - rowH * 0.5;
        const inView = screenY + BUFFER >= 0 && screenY - BUFFER <= bodyH;
        if (!inView) {
          const existing = _rowEls.get(tip.id);
          if (existing) {
            existing.el.style.display = "none";
          }
          continue;
        }
        visible.add(tip.id);
        if (_rowEls.has(tip.id)) {
          const { el, cells } = _rowEls.get(tip.id);
          el.style.top = `${topY}px`;
          el.style.height = `${rowH}px`;
          el.style.display = "flex";
          el.classList.toggle("dt-row-selected", _selectedIds.has(tip.id));
          for (const [key, input] of cells) {
            if (document.activeElement !== input) {
              const val = tip.annotations?.[key];
              const str = val == null ? "" : String(val);
              if (input.value !== str) input.value = str;
            }
          }
        } else {
          const row = document.createElement("div");
          row.className = "dt-row";
          row.style.top = `${topY}px`;
          row.style.height = `${rowH}px`;
          if (_showNames) {
            const nameCell = document.createElement("div");
            nameCell.className = "dt-name-cell";
            const w = _colWidths[0] ?? 100;
            nameCell.style.cssText = `flex:0 0 ${w}px;width:${w}px`;
            const label = tip.name ?? tip.id ?? "";
            nameCell.textContent = label;
            nameCell.title = label;
            row.appendChild(nameCell);
          }
          const cells = /* @__PURE__ */ new Map();
          let wi = _showNames ? 1 : 0;
          for (const col of _columns) {
            const cell = document.createElement("div");
            cell.className = "dt-cell";
            const w = _colWidths[wi++] ?? 80;
            cell.style.cssText = `flex:0 0 ${w}px;width:${w}px`;
            const input = document.createElement("input");
            input.type = "text";
            const val = tip.annotations?.[col];
            input.value = val == null ? "" : String(val);
            input.placeholder = col;
            input.title = (tip.name ?? tip.id ?? "") + " / " + col;
            input.addEventListener("keydown", (e) => {
              if (e.key === "Enter") {
                input.blur();
              }
              if (e.key === "Escape") {
                const orig = tip.annotations?.[col];
                input.value = orig == null ? "" : String(orig);
                input._cancelBlur = true;
                input.blur();
              }
            });
            input.addEventListener("blur", () => {
              if (input._cancelBlur) {
                input._cancelBlur = false;
                return;
              }
              const orig = tip.annotations?.[col];
              const origStr = orig == null ? "" : String(orig);
              if (input.value !== origStr) {
                onEditCommit(tip.id, col, input.value);
                if (!tip.annotations) tip.annotations = {};
                tip.annotations[col] = input.value;
              }
            });
            cell.appendChild(input);
            row.appendChild(cell);
            cells.set(col, input);
          }
          if (_selectedIds.has(tip.id)) row.classList.add("dt-row-selected");
          row.addEventListener("click", (e) => {
            if (e.target.tagName === "INPUT") return;
            const tipIdx = _tips.indexOf(tip);
            const meta = e.metaKey || e.ctrlKey;
            const shift = e.shiftKey;
            let next = new Set(_selectedIds);
            if (shift && _lastClickedIdx >= 0 && tipIdx >= 0) {
              const lo = Math.min(_lastClickedIdx, tipIdx);
              const hi = Math.max(_lastClickedIdx, tipIdx);
              for (let i = lo; i <= hi; i++) next.add(_tips[i].id);
            } else if (meta) {
              if (next.has(tip.id)) next.delete(tip.id);
              else next.add(tip.id);
            } else {
              next = /* @__PURE__ */ new Set([tip.id]);
            }
            if (tipIdx >= 0 && !shift) _lastClickedIdx = tipIdx;
            if (onRowSelect) onRowSelect(next);
          });
          bodyEl.appendChild(row);
          _rowEls.set(tip.id, { el: row, cells });
        }
      }
      for (const [id, { el }] of [..._rowEls]) {
        if (!visible.has(id) && el.style.display !== "none") {
          const tip = _tips.find((t) => t.id === id);
          if (!tip) {
            el.remove();
            _rowEls.delete(id);
          }
        }
      }
    }
    _renderHeader();
    return { setColumns, setTips, syncView, syncSelection, open, close, isOpen };
  }

  // peartree/js/commands.js
  var commands_exports = {};
  __export(commands_exports, {
    execute: () => execute,
    get: () => get,
    getAll: () => getAll,
    matchesShortcut: () => matchesShortcut,
    onStateChange: () => onStateChange,
    setEnabled: () => setEnabled
  });
  var _commands = /* @__PURE__ */ new Map();
  var _listeners = [];
  function _define(def) {
    _commands.set(def.id, {
      id: def.id,
      label: def.label,
      shortcut: def.shortcut ?? null,
      // Tauri-format: 'CmdOrCtrl+Shift+O', or null
      group: def.group ?? "misc",
      enabled: def.enabled ?? true,
      // initial enabled state
      buttonId: def.buttonId ?? null,
      // DOM id of the corresponding toolbar button
      exec: null
      // set at runtime by peartree.js
    });
  }
  _define({ id: "new-window", label: "New Window", shortcut: "CmdOrCtrl+N", group: "file", enabled: true });
  _define({ id: "open-file", label: "Open\u2026", shortcut: "CmdOrCtrl+O", group: "file", enabled: true });
  _define({ id: "open-tree", label: "Open Tree\u2026", shortcut: "CmdOrCtrl+Shift+O", group: "file", enabled: true, buttonId: "btn-open-tree" });
  _define({ id: "import-annot", label: "Import Annotations\u2026", shortcut: "CmdOrCtrl+Shift+A", group: "file", enabled: false, buttonId: "btn-import-annot" });
  _define({ id: "curate-annot", label: "Curate Annotations\u2026", shortcut: null, group: "file", enabled: false, buttonId: "btn-curate-annot" });
  _define({ id: "export-tree", label: "Export Tree\u2026", shortcut: "CmdOrCtrl+E", group: "file", enabled: false, buttonId: "btn-export-tree" });
  _define({ id: "export-image", label: "Export Image\u2026", shortcut: "CmdOrCtrl+Shift+E", group: "file", enabled: false, buttonId: "btn-export-graphic" });
  _define({ id: "select-all", label: "Select All", shortcut: "CmdOrCtrl+A", group: "edit", enabled: true });
  _define({ id: "select-invert", label: "Invert Selection", shortcut: "CmdOrCtrl+Shift+I", group: "edit", enabled: true });
  _define({ id: "view-back", label: "Back", shortcut: "CmdOrCtrl+[", group: "view", enabled: false, buttonId: "btn-back" });
  _define({ id: "view-forward", label: "Forward", shortcut: "CmdOrCtrl+]", group: "view", enabled: false, buttonId: "btn-forward" });
  _define({ id: "view-drill", label: "Drill into Subtree", shortcut: "CmdOrCtrl+Shift+.", group: "view", enabled: false, buttonId: "btn-drill" });
  _define({ id: "view-climb", label: "Climb Out One Level", shortcut: "CmdOrCtrl+Shift+,", group: "view", enabled: false, buttonId: "btn-climb" });
  _define({ id: "view-home", label: "Root", shortcut: "CmdOrCtrl+\\", group: "view", enabled: false, buttonId: "btn-home" });
  _define({ id: "view-zoom-in", label: "Zoom In", shortcut: "CmdOrCtrl+=", group: "view", enabled: false, buttonId: "btn-zoom-in" });
  _define({ id: "view-zoom-out", label: "Zoom Out", shortcut: "CmdOrCtrl+-", group: "view", enabled: false, buttonId: "btn-zoom-out" });
  _define({ id: "view-fit", label: "Fit All", shortcut: "CmdOrCtrl+0", group: "view", enabled: false, buttonId: "btn-fit" });
  _define({ id: "view-fit-labels", label: "Fit Labels", shortcut: "CmdOrCtrl+Shift+0", group: "view", enabled: false, buttonId: "btn-fit-labels" });
  _define({ id: "view-info", label: "Get Info\u2026", shortcut: "CmdOrCtrl+I", group: "view", enabled: false, buttonId: "btn-node-info" });
  _define({ id: "tree-rotate", label: "Rotate Node", shortcut: null, group: "tree", enabled: false, buttonId: "btn-rotate" });
  _define({ id: "tree-rotate-all", label: "Rotate Clade", shortcut: null, group: "tree", enabled: false, buttonId: "btn-rotate-all" });
  _define({ id: "tree-order-up", label: "Order Up", shortcut: "CmdOrCtrl+U", group: "tree", enabled: false, buttonId: "btn-order-asc" });
  _define({ id: "tree-order-down", label: "Order Down", shortcut: "CmdOrCtrl+D", group: "tree", enabled: false, buttonId: "btn-order-desc" });
  _define({ id: "tree-reroot", label: "Re-root Tree", shortcut: null, group: "tree", enabled: false, buttonId: "btn-reroot" });
  _define({ id: "tree-midpoint", label: "Midpoint Root", shortcut: "CmdOrCtrl+M", group: "tree", enabled: false, buttonId: "btn-midpoint-root" });
  _define({ id: "tree-hide", label: "Hide Nodes", shortcut: null, group: "tree", enabled: false, buttonId: "btn-hide" });
  _define({ id: "tree-show", label: "Show Nodes", shortcut: null, group: "tree", enabled: false, buttonId: "btn-show" });
  _define({ id: "tree-paint", label: "Paint Node", shortcut: null, group: "tree", enabled: false, buttonId: "btn-apply-user-colour" });
  _define({ id: "tree-clear-colours", label: "Clear Colours", shortcut: null, group: "tree", enabled: false, buttonId: "btn-clear-user-colour" });
  _define({ id: "show-help", label: "PearTree Help", shortcut: "CmdOrCtrl+?", group: "help", enabled: true, buttonId: "btn-help" });
  function setEnabled(id, enabled) {
    const cmd = _commands.get(id);
    if (!cmd || cmd.enabled === enabled) return;
    cmd.enabled = enabled;
    if (cmd.buttonId) {
      const el = document.getElementById(cmd.buttonId);
      if (el) el.disabled = !enabled;
    }
    for (const fn of _listeners) fn(id, enabled);
  }
  function onStateChange(fn, { callNow = false } = {}) {
    _listeners.push(fn);
    if (callNow) {
      for (const cmd of _commands.values()) fn(cmd.id, cmd.enabled);
    }
  }
  function execute(id) {
    const cmd = _commands.get(id);
    if (!cmd || !cmd.exec || !cmd.enabled) return false;
    cmd.exec();
    return true;
  }
  function get(id) {
    return _commands.get(id);
  }
  function getAll() {
    return _commands;
  }
  function matchesShortcut(e, shortcut) {
    if (!shortcut) return false;
    const parts = shortcut.split("+");
    const rawKey = parts[parts.length - 1];
    const needsCmdCtrl = parts.some((p) => p === "CmdOrCtrl" || p === "Cmd" || p === "Ctrl");
    const needsShift = parts.includes("Shift");
    const needsAlt = parts.includes("Alt");
    if (needsCmdCtrl !== (e.metaKey || e.ctrlKey)) return false;
    if (needsShift !== e.shiftKey) return false;
    if (needsAlt !== e.altKey) return false;
    return e.key === rawKey || e.key.toLowerCase() === rawKey.toLowerCase();
  }

  // peartree/js/peartree.js
  var EXAMPLE_TREE_PATH = "data/ebov.tree";
  var PEARTREE_BASE_URL = "https://artic-network.github.io/peartree/";
  async function fetchWithFallback(relativePath) {
    try {
      const r = await fetch(relativePath);
      if (r.ok) return r.text();
    } catch (_) {
    }
    const r2 = await fetch(PEARTREE_BASE_URL + relativePath);
    if (!r2.ok) throw new Error("HTTP " + r2.status + " \u2013 could not fetch " + relativePath);
    return r2.text();
  }
  async function fetchExampleTree() {
    return fetchWithFallback(EXAMPLE_TREE_PATH);
  }
  (async () => {
    const canvas = document.getElementById("tree-canvas");
    const loadingEl = document.getElementById("loading");
    const canvasBgColorEl = document.getElementById("canvas-bg-color");
    const branchColorEl = document.getElementById("branch-color");
    const branchWidthSlider = document.getElementById("branch-width-slider");
    const fontSlider = document.getElementById("font-size-slider");
    const tipSlider = document.getElementById("tip-size-slider");
    const tipHaloSlider = document.getElementById("tip-halo-slider");
    const nodeSlider = document.getElementById("node-size-slider");
    const nodeHaloSlider = document.getElementById("node-halo-slider");
    const tipShapeColorEl = document.getElementById("tip-shape-color");
    const tipShapeBgEl = document.getElementById("tip-shape-bg-color");
    const labelColorEl = document.getElementById("label-color");
    const selectedLabelStyleEl = document.getElementById("selected-label-style");
    const selectedTipStrokeEl = document.getElementById("selected-tip-stroke");
    const selectedNodeStrokeEl = document.getElementById("selected-node-stroke");
    const tipHoverFillEl = document.getElementById("tip-hover-fill");
    const nodeHoverFillEl = document.getElementById("node-hover-fill");
    const selectedTipFillEl = document.getElementById("selected-tip-fill");
    const selectedTipGrowthSlider = document.getElementById("selected-tip-growth");
    const selectedTipMinSizeSlider = document.getElementById("selected-tip-min-size");
    const selectedTipFillOpacitySlider = document.getElementById("selected-tip-fill-opacity");
    const selectedTipStrokeWidthSlider = document.getElementById("selected-tip-stroke-width");
    const selectedTipStrokeOpacitySlider = document.getElementById("selected-tip-stroke-opacity");
    const selectedNodeFillEl = document.getElementById("selected-node-fill");
    const selectedNodeGrowthSlider = document.getElementById("selected-node-growth");
    const selectedNodeMinSizeSlider = document.getElementById("selected-node-min-size");
    const selectedNodeFillOpacitySlider = document.getElementById("selected-node-fill-opacity");
    const selectedNodeStrokeWidthSlider = document.getElementById("selected-node-stroke-width");
    const selectedNodeStrokeOpacitySlider = document.getElementById("selected-node-stroke-opacity");
    const tipHoverStrokeEl = document.getElementById("tip-hover-stroke");
    const tipHoverGrowthSlider = document.getElementById("tip-hover-growth");
    const tipHoverMinSizeSlider = document.getElementById("tip-hover-min-size");
    const tipHoverFillOpacitySlider = document.getElementById("tip-hover-fill-opacity");
    const tipHoverStrokeWidthSlider = document.getElementById("tip-hover-stroke-width");
    const tipHoverStrokeOpacitySlider = document.getElementById("tip-hover-stroke-opacity");
    const nodeHoverStrokeEl = document.getElementById("node-hover-stroke");
    const nodeHoverGrowthSlider = document.getElementById("node-hover-growth");
    const nodeHoverMinSizeSlider = document.getElementById("node-hover-min-size");
    const nodeHoverFillOpacitySlider = document.getElementById("node-hover-fill-opacity");
    const nodeHoverStrokeWidthSlider = document.getElementById("node-hover-stroke-width");
    const nodeHoverStrokeOpacitySlider = document.getElementById("node-hover-stroke-opacity");
    const nodeShapeColorEl = document.getElementById("node-shape-color");
    const nodeShapeBgEl = document.getElementById("node-shape-bg-color");
    const nodeBarsShowEl = document.getElementById("node-bars-show");
    const nodeBarsColorEl = document.getElementById("node-bars-color");
    const nodeBarsWidthSlider = document.getElementById("node-bars-width-slider");
    const nodeBarsMedianEl = document.getElementById("node-bars-median");
    const nodeBarsRangeEl = document.getElementById("node-bars-range");
    const nodeBarsControlsEl = document.getElementById("node-bars-controls");
    const nodeBarsUnavailEl = document.getElementById("node-bars-unavail");
    const tipShapeDetailEl = document.getElementById("tip-shape-detail");
    const nodeShapeDetailEl = document.getElementById("node-shape-detail");
    const nodeLabelDetailEl = document.getElementById("node-label-detail");
    const nodeBarsDetailEl = document.getElementById("node-bars-detail");
    const legendDetailEl = document.getElementById("legend-detail");
    const axisDetailEl = document.getElementById("axis-detail");
    const clampNegBranchesEl = document.getElementById("clamp-neg-branches");
    const clampNegBranchesRowEl = document.getElementById("clamp-neg-branches-row");
    const fontFamilyEl = document.getElementById("font-family-select");
    const tipColourBy = document.getElementById("tip-colour-by");
    const nodeColourBy = document.getElementById("node-colour-by");
    const labelColourBy = document.getElementById("label-colour-by");
    const tipLabelShow = document.getElementById("tip-label-show");
    const tipLabelControlsEl = document.getElementById("tip-label-controls");
    const tipLabelAlignEl = document.getElementById("tip-label-align");
    const nodeLabelShowEl = document.getElementById("node-label-show");
    const nodeLabelPositionEl = document.getElementById("node-label-position");
    const nodeLabelFontSizeSlider = document.getElementById("node-label-font-size-slider");
    const nodeLabelColorEl = document.getElementById("node-label-color");
    const nodeLabelSpacingSlider = document.getElementById("node-label-spacing-slider");
    const tipLabelDpRowEl = document.getElementById("tip-label-dp-row");
    const tipLabelDpEl = document.getElementById("tip-label-decimal-places");
    const nodeLabelDpRowEl = document.getElementById("node-label-dp-row");
    const nodeLabelDpEl = document.getElementById("node-label-decimal-places");
    const tipPaletteSelect = document.getElementById("tip-palette-select");
    const tipPaletteRow = document.getElementById("tip-palette-row");
    const nodePaletteSelect = document.getElementById("node-palette-select");
    const nodePaletteRow = document.getElementById("node-palette-row");
    const labelPaletteSelect = document.getElementById("label-palette-select");
    const labelPaletteRow = document.getElementById("label-palette-row");
    const tipLabelShapeEl = document.getElementById("tip-label-shape");
    const tipLabelShapeColorEl = document.getElementById("tip-label-shape-color");
    const tipLabelShapeColourBy = document.getElementById("tip-label-shape-colour-by");
    const tipLabelShapePaletteRow = document.getElementById("tip-label-shape-palette-row");
    const tipLabelShapePaletteSelect = document.getElementById("tip-label-shape-palette-select");
    const tipLabelShapeMarginLeftSlider = document.getElementById("tip-label-shape-margin-left-slider");
    const tipLabelShapeMarginRightSlider = document.getElementById("tip-label-shape-margin-right-slider");
    const tipLabelShapeDetailEl = document.getElementById("tip-label-shape-detail");
    const tipLabelShape2El = document.getElementById("tip-label-shape-2");
    const tipLabelShape2ColorEl = document.getElementById("tip-label-shape-2-color");
    const tipLabelShape2ColourBy = document.getElementById("tip-label-shape-2-colour-by");
    const tipLabelShape2PaletteRow = document.getElementById("tip-label-shape-2-palette-row");
    const tipLabelShape2PaletteSelect = document.getElementById("tip-label-shape-2-palette-select");
    const tipLabelShape2MarginRightSlider = document.getElementById("tip-label-shape-2-margin-right-slider");
    const tipLabelShape2SectionEl = document.getElementById("tip-label-shape-2-section");
    const tipLabelShape2DetailEl = document.getElementById("tip-label-shape-2-detail");
    const tipLabelShapeSizeSlider = document.getElementById("tip-label-shape-size-slider");
    const tipLabelShape2SizeSlider = document.getElementById("tip-label-shape-2-size-slider");
    const legendShowEl = document.getElementById("legend-show");
    const legendAnnotEl = document.getElementById("legend-annotation");
    const legendTextColorEl = document.getElementById("legend-text-color");
    const legendFontSizeSlider = document.getElementById("legend-font-size-slider");
    const legendHeightPctSlider = document.getElementById("legend-height-pct-slider");
    const legendFontFamilyEl = document.getElementById("legend-font-family-select");
    const legendLeftCanvas = document.getElementById("legend-left-canvas");
    const legendRightCanvas = document.getElementById("legend-right-canvas");
    const legend2LeftCanvas = document.getElementById("legend2-left-canvas");
    const legend2RightCanvas = document.getElementById("legend2-right-canvas");
    const legend2AnnotEl = document.getElementById("legend-annotation-2");
    const legend2ShowEl = document.getElementById("legend2-show");
    const legend2HeightPctSlider = document.getElementById("legend2-height-pct-slider");
    const legend2DetailEl = document.getElementById("legend2-detail");
    const axisCanvas = document.getElementById("axis-canvas");
    const axisShowEl = document.getElementById("axis-show");
    const axisDateAnnotEl = document.getElementById("axis-date-annotation");
    const axisDateRow = document.getElementById("axis-date-row");
    const axisDateFmtEl = document.getElementById("axis-date-format");
    const axisDateFmtRow = document.getElementById("axis-date-format-row");
    const axisMajorIntervalEl = document.getElementById("axis-major-interval");
    const axisMinorIntervalEl = document.getElementById("axis-minor-interval");
    const axisMajorLabelEl = document.getElementById("axis-major-label");
    const axisMinorLabelEl = document.getElementById("axis-minor-label");
    const axisMajorIntervalRow = document.getElementById("axis-major-interval-row");
    const axisMinorIntervalRow = document.getElementById("axis-minor-interval-row");
    const axisMajorLabelRow = document.getElementById("axis-major-label-row");
    const axisMinorLabelRow = document.getElementById("axis-minor-label-row");
    const axisColorEl = document.getElementById("axis-color");
    const axisFontSizeSlider = document.getElementById("axis-font-size-slider");
    const axisFontFamilyEl = document.getElementById("axis-font-family-select");
    const axisLineWidthSlider = document.getElementById("axis-line-width-slider");
    const themeSelect = document.getElementById("theme-select");
    const btnStoreTheme = document.getElementById("btn-store-theme");
    const btnDefaultTheme = document.getElementById("btn-default-theme");
    const btnRemoveTheme = document.getElementById("btn-remove-theme");
    const btnFit = document.getElementById("btn-fit");
    const btnResetSettings = document.getElementById("btn-reset-settings");
    const btnImportAnnot = document.getElementById("btn-import-annot");
    const btnCurateAnnot = document.getElementById("btn-curate-annot");
    const btnDataTable = document.getElementById("btn-data-table");
    const btnExportTree = document.getElementById("btn-export-tree");
    const btnMPR = document.getElementById("btn-midpoint-root");
    const tipColourPickerEl = document.getElementById("btn-node-colour");
    const btnApplyUserColour = document.getElementById("btn-apply-user-colour");
    const btnClearUserColour = document.getElementById("btn-clear-user-colour");
    const tipFilterEl = document.getElementById("tip-filter");
    const tipFilterCnt = document.getElementById("tip-filter-count");
    let currentOrder = null;
    let graph = null;
    let controlsBound = false;
    let _cachedMidpoint = null;
    let isExplicitlyRooted = false;
    let _loadedFilename = null;
    let _axisIsTimedTree = false;
    let treeLoaded = false;
    const themeRegistry = new Map(Object.entries(THEMES));
    let defaultTheme = localStorage.getItem(DEFAULT_THEME_KEY) || "Artic";
    if (!themeRegistry.has(defaultTheme)) defaultTheme = Object.keys(THEMES)[0];
    const annotationPalettes = /* @__PURE__ */ new Map();
    function _updatePaletteSelect(sel, row, annotKey) {
      const schema = renderer?._annotationSchema;
      if (!annotKey || annotKey === "user_colour" || !schema) {
        row.style.display = "none";
        return;
      }
      const def = schema.get(annotKey);
      if (!def) {
        row.style.display = "none";
        return;
      }
      const isCat = def.dataType === "categorical" || def.dataType === "ordinal";
      const palettes = isCat ? CATEGORICAL_PALETTES : SEQUENTIAL_PALETTES;
      const defPal = isCat ? DEFAULT_CATEGORICAL_PALETTE : DEFAULT_SEQUENTIAL_PALETTE;
      const stored = annotationPalettes.get(annotKey) ?? defPal;
      sel.innerHTML = "";
      for (const name of Object.keys(palettes)) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      }
      sel.value = [...sel.options].some((o) => o.value === stored) ? stored : defPal;
      row.style.display = "flex";
    }
    function _syncPaletteSelects(key, paletteName) {
      const pairs = () => [
        [tipColourBy, tipPaletteSelect],
        [nodeColourBy, nodePaletteSelect],
        [labelColourBy, labelPaletteSelect],
        [tipLabelShapeColourBy, tipLabelShapePaletteSelect],
        [tipLabelShape2ColourBy, tipLabelShape2PaletteSelect]
      ];
      for (const [colourBy, sel] of pairs()) {
        if (colourBy.value === key && sel.value !== paletteName) {
          if ([...sel.options].some((o) => o.value === paletteName)) sel.value = paletteName;
        }
      }
    }
    function saveUserThemes() {
      const userObj = {};
      for (const [name, theme] of themeRegistry) {
        if (!THEMES[name]) userObj[name] = theme;
      }
      localStorage.setItem(USER_THEMES_KEY, JSON.stringify(userObj));
    }
    function loadUserThemes() {
      try {
        const stored = JSON.parse(localStorage.getItem(USER_THEMES_KEY) || "{}");
        for (const [name, theme] of Object.entries(stored)) {
          themeRegistry.set(name, theme);
        }
      } catch {
      }
    }
    function _populateThemeSelect() {
      const current = themeSelect.value;
      themeSelect.innerHTML = "";
      for (const name of themeRegistry.keys()) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name + (name === defaultTheme ? " \u2605" : "");
        themeSelect.appendChild(opt);
      }
      const customOpt = document.createElement("option");
      customOpt.value = "custom";
      customOpt.textContent = "Custom";
      customOpt.style.fontStyle = "italic";
      themeSelect.appendChild(customOpt);
      themeSelect.value = themeSelect.querySelector(`option[value="${CSS.escape(current)}"]`) ? current : themeRegistry.keys().next().value;
    }
    function _snapshotTheme() {
      return {
        canvasBgColor: canvasBgColorEl.value,
        branchColor: branchColorEl.value,
        branchWidth: branchWidthSlider.value,
        fontSize: fontSlider.value,
        labelColor: labelColorEl.value,
        tipSize: tipSlider.value,
        tipHaloSize: tipHaloSlider.value,
        tipShapeColor: tipShapeColorEl.value,
        tipShapeBgColor: tipShapeBgEl.value,
        nodeSize: nodeSlider.value,
        nodeHaloSize: nodeHaloSlider.value,
        nodeShapeColor: nodeShapeColorEl.value,
        nodeShapeBgColor: nodeShapeBgEl.value,
        tipLabelShapeColor: tipLabelShapeColorEl.value,
        tipLabelShape2Color: tipLabelShape2ColorEl.value,
        axisColor: axisColorEl.value,
        legendTextColor: legendTextColorEl.value,
        selectedTipStrokeColor: selectedTipStrokeEl.value,
        selectedNodeStrokeColor: selectedNodeStrokeEl.value,
        tipHoverFillColor: tipHoverFillEl.value,
        nodeHoverFillColor: nodeHoverFillEl.value,
        selectedTipFillColor: selectedTipFillEl.value,
        selectedNodeFillColor: selectedNodeFillEl.value,
        tipHoverStrokeColor: tipHoverStrokeEl.value,
        nodeHoverStrokeColor: nodeHoverStrokeEl.value
      };
    }
    function storeTheme() {
      const name = prompt("Enter a name for this theme:")?.trim();
      if (!name) return;
      if (name.toLowerCase() === "custom") {
        alert('"Custom" is a reserved name \u2014 please choose a different name.');
        return;
      }
      if (THEMES[name]) {
        alert(`"${name}" is a built-in theme and cannot be overwritten.`);
        return;
      }
      themeRegistry.set(name, _snapshotTheme());
      saveUserThemes();
      _populateThemeSelect();
      themeSelect.value = name;
      _syncThemeButtons();
      saveSettings();
    }
    function _syncThemeButtons() {
      const sel = themeSelect.value;
      const isCustom = sel === "custom";
      const isBuiltIn = !!THEMES[sel];
      const isDefault = sel === defaultTheme;
      btnStoreTheme.disabled = !isCustom;
      btnDefaultTheme.disabled = isCustom || isDefault;
      btnRemoveTheme.disabled = isCustom || isBuiltIn;
    }
    function setDefaultTheme() {
      const name = themeSelect.value;
      if (name === "custom" || !themeRegistry.has(name)) return;
      defaultTheme = name;
      localStorage.setItem(DEFAULT_THEME_KEY, name);
      _populateThemeSelect();
      themeSelect.value = name;
      _syncThemeButtons();
    }
    function removeTheme() {
      const name = themeSelect.value;
      if (name === "custom" || THEMES[name]) return;
      if (!confirm(`Remove the theme \u201C${name}\u201D?`)) return;
      if (defaultTheme === name) {
        defaultTheme = Object.keys(THEMES)[0];
        localStorage.setItem(DEFAULT_THEME_KEY, defaultTheme);
      }
      themeRegistry.delete(name);
      saveUserThemes();
      _populateThemeSelect();
      const fallback = themeSelect.value;
      if (themeRegistry.has(fallback)) applyTheme(fallback);
      _syncThemeButtons();
    }
    function loadSettings() {
      try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      } catch {
        return {};
      }
    }
    function _resolveTypeface(key) {
      const effectiveKey = key === "theme" ? fontFamilyEl.value : key;
      return TYPEFACES[effectiveKey] ?? effectiveKey;
    }
    function saveSettings() {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(_buildSettingsSnapshot()));
    }
    function _buildSettingsSnapshot() {
      return {
        theme: themeSelect.value,
        canvasBgColor: canvasBgColorEl.value,
        branchColor: branchColorEl.value,
        branchWidth: branchWidthSlider.value,
        fontSize: fontSlider.value,
        fontFamily: fontFamilyEl.value,
        labelColor: labelColorEl.value,
        selectedLabelStyle: selectedLabelStyleEl.value,
        selectedTipStrokeColor: selectedTipStrokeEl.value,
        selectedNodeStrokeColor: selectedNodeStrokeEl.value,
        tipHoverFillColor: tipHoverFillEl.value,
        nodeHoverFillColor: nodeHoverFillEl.value,
        selectedTipFillColor: selectedTipFillEl.value,
        selectedTipGrowthFactor: selectedTipGrowthSlider.value,
        selectedTipMinSize: selectedTipMinSizeSlider.value,
        selectedTipFillOpacity: selectedTipFillOpacitySlider.value,
        selectedTipStrokeWidth: selectedTipStrokeWidthSlider.value,
        selectedTipStrokeOpacity: selectedTipStrokeOpacitySlider.value,
        selectedNodeFillColor: selectedNodeFillEl.value,
        selectedNodeGrowthFactor: selectedNodeGrowthSlider.value,
        selectedNodeMinSize: selectedNodeMinSizeSlider.value,
        selectedNodeFillOpacity: selectedNodeFillOpacitySlider.value,
        selectedNodeStrokeWidth: selectedNodeStrokeWidthSlider.value,
        selectedNodeStrokeOpacity: selectedNodeStrokeOpacitySlider.value,
        tipHoverStrokeColor: tipHoverStrokeEl.value,
        tipHoverGrowthFactor: tipHoverGrowthSlider.value,
        tipHoverMinSize: tipHoverMinSizeSlider.value,
        tipHoverFillOpacity: tipHoverFillOpacitySlider.value,
        tipHoverStrokeWidth: tipHoverStrokeWidthSlider.value,
        tipHoverStrokeOpacity: tipHoverStrokeOpacitySlider.value,
        nodeHoverStrokeColor: nodeHoverStrokeEl.value,
        nodeHoverGrowthFactor: nodeHoverGrowthSlider.value,
        nodeHoverMinSize: nodeHoverMinSizeSlider.value,
        nodeHoverFillOpacity: nodeHoverFillOpacitySlider.value,
        nodeHoverStrokeWidth: nodeHoverStrokeWidthSlider.value,
        nodeHoverStrokeOpacity: nodeHoverStrokeOpacitySlider.value,
        tipSize: tipSlider.value,
        tipHaloSize: tipHaloSlider.value,
        tipShapeColor: tipShapeColorEl.value,
        tipShapeBgColor: tipShapeBgEl.value,
        nodeSize: nodeSlider.value,
        nodeHaloSize: nodeHaloSlider.value,
        nodeShapeColor: nodeShapeColorEl.value,
        nodeShapeBgColor: nodeShapeBgEl.value,
        tipColourBy: tipColourBy.value,
        nodeColourBy: nodeColourBy.value,
        labelColourBy: labelColourBy.value,
        annotationPalettes: Object.fromEntries(annotationPalettes),
        legendShow: legendShowEl.value,
        legendAnnotation: legendAnnotEl.value,
        legendAnnotation2: legend2AnnotEl.value,
        legend2Position: legend2ShowEl.value,
        legendHeightPct2: legend2HeightPctSlider.value,
        legendTextColor: legendTextColorEl.value,
        legendFontSize: legendFontSizeSlider.value,
        legendHeightPct: legendHeightPctSlider.value,
        legendFontFamily: legendFontFamilyEl.value,
        axisShow: axisShowEl.value,
        axisDateAnnotation: axisDateAnnotEl.value,
        axisDateFormat: axisDateFmtEl.value,
        axisMajorInterval: axisMajorIntervalEl.value,
        axisMinorInterval: axisMinorIntervalEl.value,
        axisMajorLabelFormat: axisMajorLabelEl.value,
        axisMinorLabelFormat: axisMinorLabelEl.value,
        axisColor: axisColorEl.value,
        axisFontSize: axisFontSizeSlider.value,
        axisFontFamily: axisFontFamilyEl.value,
        axisLineWidth: axisLineWidthSlider.value,
        nodeBarsEnabled: nodeBarsShowEl.value,
        nodeBarsColor: nodeBarsColorEl.value,
        nodeBarsWidth: nodeBarsWidthSlider.value,
        nodeBarsShowMedian: nodeBarsMedianEl.value,
        nodeBarsShowRange: nodeBarsRangeEl.value,
        clampNegBranches: clampNegBranchesEl.value,
        tipLabelShow: tipLabelShow.value,
        tipLabelAlign: tipLabelAlignEl.value,
        tipLabelDecimalPlaces: tipLabelDpEl.value !== "" ? parseInt(tipLabelDpEl.value) : null,
        tipLabelShape: tipLabelShapeEl.value,
        tipLabelShapeColor: tipLabelShapeColorEl.value,
        tipLabelShapeColourBy: tipLabelShapeColourBy.value,
        tipLabelShapeSize: tipLabelShapeSizeSlider.value,
        tipLabelShapeMarginLeft: tipLabelShapeMarginLeftSlider.value,
        tipLabelShapeMarginRight: tipLabelShapeMarginRightSlider.value,
        tipLabelShape2: tipLabelShape2El.value,
        tipLabelShape2Color: tipLabelShape2ColorEl.value,
        tipLabelShape2ColourBy: tipLabelShape2ColourBy.value,
        tipLabelShape2Size: tipLabelShape2SizeSlider.value,
        tipLabelShape2MarginRight: tipLabelShape2MarginRightSlider.value,
        nodeLabelAnnotation: nodeLabelShowEl.value,
        nodeLabelPosition: nodeLabelPositionEl.value,
        nodeLabelFontSize: nodeLabelFontSizeSlider.value,
        nodeLabelColor: nodeLabelColorEl.value,
        nodeLabelSpacing: nodeLabelSpacingSlider.value,
        nodeLabelDecimalPlaces: nodeLabelDpEl.value !== "" ? parseInt(nodeLabelDpEl.value) : null,
        mode: renderer ? renderer._mode : "nodes"
      };
    }
    function _applyVisualSettingsFromFile(s) {
      if (!s) return;
      if (s.canvasBgColor) {
        canvasBgColorEl.value = s.canvasBgColor;
        _syncCanvasWrapperBg(s.canvasBgColor);
      }
      if (s.branchColor) branchColorEl.value = s.branchColor;
      if (s.branchWidth != null) {
        branchWidthSlider.value = s.branchWidth;
        document.getElementById("branch-width-value").textContent = s.branchWidth;
      }
      if (s.fontSize != null) {
        fontSlider.value = s.fontSize;
        document.getElementById("font-size-value").textContent = s.fontSize;
      }
      if (s.fontFamily) fontFamilyEl.value = s.fontFamily;
      if (s.labelColor) labelColorEl.value = s.labelColor;
      if (s.selectedLabelStyle) selectedLabelStyleEl.value = s.selectedLabelStyle;
      if (s.selectedTipStrokeColor) selectedTipStrokeEl.value = s.selectedTipStrokeColor;
      if (s.selectedNodeStrokeColor) selectedNodeStrokeEl.value = s.selectedNodeStrokeColor;
      if (s.tipHoverFillColor) tipHoverFillEl.value = s.tipHoverFillColor;
      if (s.nodeHoverFillColor) nodeHoverFillEl.value = s.nodeHoverFillColor;
      if (s.selectedTipFillColor) selectedTipFillEl.value = s.selectedTipFillColor;
      if (s.selectedTipGrowthFactor != null) {
        selectedTipGrowthSlider.value = s.selectedTipGrowthFactor;
        document.getElementById("selected-tip-growth-value").textContent = s.selectedTipGrowthFactor;
      }
      if (s.selectedTipMinSize != null) {
        selectedTipMinSizeSlider.value = s.selectedTipMinSize;
        document.getElementById("selected-tip-min-size-value").textContent = s.selectedTipMinSize;
      }
      if (s.selectedTipFillOpacity != null) {
        selectedTipFillOpacitySlider.value = s.selectedTipFillOpacity;
        document.getElementById("selected-tip-fill-opacity-value").textContent = s.selectedTipFillOpacity;
      }
      if (s.selectedTipStrokeWidth != null) {
        selectedTipStrokeWidthSlider.value = s.selectedTipStrokeWidth;
        document.getElementById("selected-tip-stroke-width-value").textContent = s.selectedTipStrokeWidth;
      }
      if (s.selectedTipStrokeOpacity != null) {
        selectedTipStrokeOpacitySlider.value = s.selectedTipStrokeOpacity;
        document.getElementById("selected-tip-stroke-opacity-value").textContent = s.selectedTipStrokeOpacity;
      }
      if (s.selectedNodeFillColor) selectedNodeFillEl.value = s.selectedNodeFillColor;
      if (s.selectedNodeGrowthFactor != null) {
        selectedNodeGrowthSlider.value = s.selectedNodeGrowthFactor;
        document.getElementById("selected-node-growth-value").textContent = s.selectedNodeGrowthFactor;
      }
      if (s.selectedNodeMinSize != null) {
        selectedNodeMinSizeSlider.value = s.selectedNodeMinSize;
        document.getElementById("selected-node-min-size-value").textContent = s.selectedNodeMinSize;
      }
      if (s.selectedNodeFillOpacity != null) {
        selectedNodeFillOpacitySlider.value = s.selectedNodeFillOpacity;
        document.getElementById("selected-node-fill-opacity-value").textContent = s.selectedNodeFillOpacity;
      }
      if (s.selectedNodeStrokeWidth != null) {
        selectedNodeStrokeWidthSlider.value = s.selectedNodeStrokeWidth;
        document.getElementById("selected-node-stroke-width-value").textContent = s.selectedNodeStrokeWidth;
      }
      if (s.selectedNodeStrokeOpacity != null) {
        selectedNodeStrokeOpacitySlider.value = s.selectedNodeStrokeOpacity;
        document.getElementById("selected-node-stroke-opacity-value").textContent = s.selectedNodeStrokeOpacity;
      }
      if (s.tipHoverStrokeColor) tipHoverStrokeEl.value = s.tipHoverStrokeColor;
      if (s.tipHoverGrowthFactor != null) {
        tipHoverGrowthSlider.value = s.tipHoverGrowthFactor;
        document.getElementById("tip-hover-growth-value").textContent = s.tipHoverGrowthFactor;
      }
      if (s.tipHoverMinSize != null) {
        tipHoverMinSizeSlider.value = s.tipHoverMinSize;
        document.getElementById("tip-hover-min-size-value").textContent = s.tipHoverMinSize;
      }
      if (s.tipHoverFillOpacity != null) {
        tipHoverFillOpacitySlider.value = s.tipHoverFillOpacity;
        document.getElementById("tip-hover-fill-opacity-value").textContent = s.tipHoverFillOpacity;
      }
      if (s.tipHoverStrokeWidth != null) {
        tipHoverStrokeWidthSlider.value = s.tipHoverStrokeWidth;
        document.getElementById("tip-hover-stroke-width-value").textContent = s.tipHoverStrokeWidth;
      }
      if (s.tipHoverStrokeOpacity != null) {
        tipHoverStrokeOpacitySlider.value = s.tipHoverStrokeOpacity;
        document.getElementById("tip-hover-stroke-opacity-value").textContent = s.tipHoverStrokeOpacity;
      }
      if (s.nodeHoverStrokeColor) nodeHoverStrokeEl.value = s.nodeHoverStrokeColor;
      if (s.nodeHoverGrowthFactor != null) {
        nodeHoverGrowthSlider.value = s.nodeHoverGrowthFactor;
        document.getElementById("node-hover-growth-value").textContent = s.nodeHoverGrowthFactor;
      }
      if (s.nodeHoverMinSize != null) {
        nodeHoverMinSizeSlider.value = s.nodeHoverMinSize;
        document.getElementById("node-hover-min-size-value").textContent = s.nodeHoverMinSize;
      }
      if (s.nodeHoverFillOpacity != null) {
        nodeHoverFillOpacitySlider.value = s.nodeHoverFillOpacity;
        document.getElementById("node-hover-fill-opacity-value").textContent = s.nodeHoverFillOpacity;
      }
      if (s.nodeHoverStrokeWidth != null) {
        nodeHoverStrokeWidthSlider.value = s.nodeHoverStrokeWidth;
        document.getElementById("node-hover-stroke-width-value").textContent = s.nodeHoverStrokeWidth;
      }
      if (s.nodeHoverStrokeOpacity != null) {
        nodeHoverStrokeOpacitySlider.value = s.nodeHoverStrokeOpacity;
        document.getElementById("node-hover-stroke-opacity-value").textContent = s.nodeHoverStrokeOpacity;
      }
      if (s.tipSize != null) {
        tipSlider.value = s.tipSize;
        document.getElementById("tip-size-value").textContent = s.tipSize;
      }
      if (s.tipHaloSize != null) {
        tipHaloSlider.value = s.tipHaloSize;
        document.getElementById("tip-halo-value").textContent = s.tipHaloSize;
      }
      if (s.tipShapeColor) tipShapeColorEl.value = s.tipShapeColor;
      if (s.tipShapeBgColor) tipShapeBgEl.value = s.tipShapeBgColor;
      if (s.tipLabelShape) tipLabelShapeEl.value = s.tipLabelShape;
      if (s.tipLabelShapeColor) tipLabelShapeColorEl.value = s.tipLabelShapeColor;
      if (s.tipLabelShapeMarginLeft != null) {
        tipLabelShapeMarginLeftSlider.value = s.tipLabelShapeMarginLeft;
        document.getElementById("tip-label-shape-margin-left-value").textContent = s.tipLabelShapeMarginLeft;
      }
      if (s.tipLabelShapeMarginRight != null) {
        tipLabelShapeMarginRightSlider.value = s.tipLabelShapeMarginRight;
        document.getElementById("tip-label-shape-margin-right-value").textContent = s.tipLabelShapeMarginRight;
      }
      if (s.tipLabelShapeSize != null) {
        tipLabelShapeSizeSlider.value = s.tipLabelShapeSize;
        document.getElementById("tip-label-shape-size-value").textContent = s.tipLabelShapeSize;
      }
      if (s.tipLabelShape2) tipLabelShape2El.value = s.tipLabelShape2;
      if (s.tipLabelShape2Color) tipLabelShape2ColorEl.value = s.tipLabelShape2Color;
      if (s.tipLabelShape2MarginRight != null) {
        tipLabelShape2MarginRightSlider.value = s.tipLabelShape2MarginRight;
        document.getElementById("tip-label-shape-2-margin-right-value").textContent = s.tipLabelShape2MarginRight;
      }
      if (s.tipLabelShape2Size != null) {
        tipLabelShape2SizeSlider.value = s.tipLabelShape2Size;
        document.getElementById("tip-label-shape-2-size-value").textContent = s.tipLabelShape2Size;
      }
      if (s.nodeSize != null) {
        nodeSlider.value = s.nodeSize;
        document.getElementById("node-size-value").textContent = s.nodeSize;
      }
      if (s.nodeHaloSize != null) {
        nodeHaloSlider.value = s.nodeHaloSize;
        document.getElementById("node-halo-value").textContent = s.nodeHaloSize;
      }
      if (s.nodeShapeColor) nodeShapeColorEl.value = s.nodeShapeColor;
      if (s.nodeShapeBgColor) nodeShapeBgEl.value = s.nodeShapeBgColor;
      if (s.axisShow) axisShowEl.value = s.axisShow === "on" ? "forward" : s.axisShow;
      if (s.axisDateFormat) axisDateFmtEl.value = s.axisDateFormat;
      if (s.axisMajorInterval) axisMajorIntervalEl.value = s.axisMajorInterval;
      if (s.axisMinorInterval) axisMinorIntervalEl.value = s.axisMinorInterval;
      if (s.axisMajorLabelFormat) axisMajorLabelEl.value = s.axisMajorLabelFormat;
      if (s.axisMinorLabelFormat) axisMinorLabelEl.value = s.axisMinorLabelFormat;
      if (s.axisColor) axisColorEl.value = s.axisColor;
      if (s.axisFontFamily) axisFontFamilyEl.value = s.axisFontFamily;
      if (s.legendShow) legendShowEl.value = s.legendShow;
      if (s.legendTextColor) legendTextColorEl.value = s.legendTextColor;
      if (s.legendFontSize != null) {
        legendFontSizeSlider.value = s.legendFontSize;
        document.getElementById("legend-font-size-value").textContent = s.legendFontSize;
      }
      if (s.legendHeightPct != null) {
        legendHeightPctSlider.value = s.legendHeightPct;
        document.getElementById("legend-height-pct-value").textContent = s.legendHeightPct + "%";
      }
      if (s.legendFontFamily) legendFontFamilyEl.value = s.legendFontFamily;
      if (s.legend2Position) legend2ShowEl.value = s.legend2Position;
      if (s.legendHeightPct2 != null) {
        legend2HeightPctSlider.value = s.legendHeightPct2;
        document.getElementById("legend2-height-pct-value").textContent = s.legendHeightPct2 + "%";
      }
      if (s.nodeBarsEnabled) nodeBarsShowEl.value = s.nodeBarsEnabled;
      if (s.nodeBarsColor) nodeBarsColorEl.value = s.nodeBarsColor;
      if (s.nodeBarsWidth != null) {
        nodeBarsWidthSlider.value = s.nodeBarsWidth;
        document.getElementById("node-bars-width-value").textContent = s.nodeBarsWidth;
      }
      if (s.nodeBarsShowMedian) nodeBarsMedianEl.value = s.nodeBarsShowMedian;
      if (s.nodeBarsShowRange) nodeBarsRangeEl.value = s.nodeBarsShowRange;
      if (s.clampNegBranches) clampNegBranchesEl.value = s.clampNegBranches;
      if (s.nodeLabelPosition) nodeLabelPositionEl.value = s.nodeLabelPosition;
      if (s.nodeLabelFontSize != null) {
        nodeLabelFontSizeSlider.value = s.nodeLabelFontSize;
        document.getElementById("node-label-font-size-value").textContent = s.nodeLabelFontSize;
      }
      if (s.nodeLabelColor) nodeLabelColorEl.value = s.nodeLabelColor;
      if (s.nodeLabelSpacing != null) {
        nodeLabelSpacingSlider.value = s.nodeLabelSpacing;
        document.getElementById("node-label-spacing-value").textContent = s.nodeLabelSpacing;
      }
      if (s.tipLabelDecimalPlaces != null && tipLabelDpEl) tipLabelDpEl.value = String(s.tipLabelDecimalPlaces);
      if (s.nodeLabelDecimalPlaces != null && nodeLabelDpEl) nodeLabelDpEl.value = String(s.nodeLabelDecimalPlaces);
      const themeName = s.theme && themeRegistry.has(s.theme) ? s.theme : s.theme === "custom" ? "custom" : "custom";
      themeSelect.value = themeName;
      _syncThemeButtons();
      if (renderer) {
        renderer.setSettings(_buildRendererSettings());
        if (s.axisColor) axisRenderer.setColor(s.axisColor);
      }
      _syncControlVisibility();
    }
    function applyDefaults() {
      if (!confirm("Reset all visual settings to their defaults?")) return;
      applyTheme("Artic");
      tipColourBy.value = "user_colour";
      nodeColourBy.value = "user_colour";
      labelColourBy.value = "user_colour";
      tipLabelShow.value = "names";
      tipLabelControlsEl.style.display = "";
      tipLabelAlignEl.value = "off";
      legendShowEl.value = DEFAULT_SETTINGS.legendShow;
      legendAnnotEl.value = "";
      legend2AnnotEl.value = "";
      legend2ShowEl.value = DEFAULT_SETTINGS.legend2Position;
      legend2HeightPctSlider.value = DEFAULT_SETTINGS.legendHeightPct2;
      document.getElementById("legend2-height-pct-value").textContent = DEFAULT_SETTINGS.legendHeightPct2 + "%";
      legendTextColorEl.value = DEFAULT_SETTINGS.legendTextColor;
      legendFontSizeSlider.value = DEFAULT_SETTINGS.legendFontSize;
      document.getElementById("legend-font-size-value").textContent = DEFAULT_SETTINGS.legendFontSize;
      legendFontFamilyEl.value = DEFAULT_SETTINGS.legendFontFamily;
      axisShowEl.value = DEFAULT_SETTINGS.axisShow;
      axisDateAnnotEl.value = "";
      calibration.setAnchor(null, /* @__PURE__ */ new Map(), 0);
      axisDateFmtRow.style.display = "none";
      axisDateFmtEl.value = DEFAULT_SETTINGS.axisDateFormat;
      axisMajorIntervalEl.value = DEFAULT_SETTINGS.axisMajorInterval;
      axisMinorIntervalEl.value = DEFAULT_SETTINGS.axisMinorInterval;
      axisMajorLabelEl.value = DEFAULT_SETTINGS.axisMajorLabelFormat;
      axisMinorLabelEl.value = DEFAULT_SETTINGS.axisMinorLabelFormat;
      _updateMinorOptions(DEFAULT_SETTINGS.axisMajorInterval, DEFAULT_SETTINGS.axisMinorInterval);
      axisFontSizeSlider.value = DEFAULT_SETTINGS.axisFontSize;
      document.getElementById("axis-font-size-value").textContent = DEFAULT_SETTINGS.axisFontSize;
      axisLineWidthSlider.value = DEFAULT_SETTINGS.axisLineWidth;
      document.getElementById("axis-line-width-value").textContent = DEFAULT_SETTINGS.axisLineWidth;
      axisFontFamilyEl.value = DEFAULT_SETTINGS.axisFontFamily;
      nodeBarsShowEl.value = DEFAULT_SETTINGS.nodeBarsEnabled;
      nodeBarsColorEl.value = DEFAULT_SETTINGS.nodeBarsColor;
      nodeBarsWidthSlider.value = DEFAULT_SETTINGS.nodeBarsWidth;
      document.getElementById("node-bars-width-value").textContent = DEFAULT_SETTINGS.nodeBarsWidth;
      nodeBarsMedianEl.value = DEFAULT_SETTINGS.nodeBarsShowMedian;
      nodeBarsRangeEl.value = DEFAULT_SETTINGS.nodeBarsShowRange;
      clampNegBranchesEl.value = DEFAULT_SETTINGS.clampNegBranches ?? "off";
      nodeLabelShowEl.value = DEFAULT_SETTINGS.nodeLabelAnnotation;
      nodeLabelPositionEl.value = DEFAULT_SETTINGS.nodeLabelPosition;
      nodeLabelFontSizeSlider.value = DEFAULT_SETTINGS.nodeLabelFontSize;
      document.getElementById("node-label-font-size-value").textContent = DEFAULT_SETTINGS.nodeLabelFontSize;
      nodeLabelColorEl.value = DEFAULT_SETTINGS.nodeLabelColor;
      nodeLabelSpacingSlider.value = DEFAULT_SETTINGS.nodeLabelSpacing;
      document.getElementById("node-label-spacing-value").textContent = DEFAULT_SETTINGS.nodeLabelSpacing;
      if (tipLabelDpEl) tipLabelDpEl.value = "";
      if (nodeLabelDpEl) nodeLabelDpEl.value = "";
      tipLabelShapeEl.value = DEFAULT_SETTINGS.tipLabelShape;
      tipLabelShapeColorEl.value = DEFAULT_SETTINGS.tipLabelShapeColor;
      tipLabelShapeColourBy.value = "user_colour";
      tipLabelShapeMarginLeftSlider.value = DEFAULT_SETTINGS.tipLabelShapeMarginLeft;
      document.getElementById("tip-label-shape-margin-left-value").textContent = DEFAULT_SETTINGS.tipLabelShapeMarginLeft;
      tipLabelShapeMarginRightSlider.value = DEFAULT_SETTINGS.tipLabelShapeMarginRight;
      document.getElementById("tip-label-shape-margin-right-value").textContent = DEFAULT_SETTINGS.tipLabelShapeMarginRight;
      tipLabelShapeSizeSlider.value = DEFAULT_SETTINGS.tipLabelShapeSize;
      document.getElementById("tip-label-shape-size-value").textContent = DEFAULT_SETTINGS.tipLabelShapeSize;
      tipLabelShape2El.value = DEFAULT_SETTINGS.tipLabelShape2;
      tipLabelShape2ColorEl.value = DEFAULT_SETTINGS.tipLabelShape2Color;
      tipLabelShape2ColourBy.value = "user_colour";
      tipLabelShape2MarginRightSlider.value = DEFAULT_SETTINGS.tipLabelShape2MarginRight;
      document.getElementById("tip-label-shape-2-margin-right-value").textContent = DEFAULT_SETTINGS.tipLabelShape2MarginRight;
      tipLabelShape2SizeSlider.value = DEFAULT_SETTINGS.tipLabelShape2Size;
      document.getElementById("tip-label-shape-2-size-value").textContent = DEFAULT_SETTINGS.tipLabelShape2Size;
      if (renderer) {
        renderer.setTipColourBy("user_colour");
        renderer.setNodeColourBy("user_colour");
        renderer.setLabelColourBy("user_colour");
        renderer.setTipLabelShapeColourBy("user_colour");
        renderer.setTipLabelShape2ColourBy("user_colour");
        legendRenderer.setFontSize(parseInt(DEFAULT_SETTINGS.legendFontSize));
        legendRenderer.setFontFamily(_resolveTypeface(legendFontFamilyEl.value));
        legendRenderer.setTextColor(DEFAULT_SETTINGS.legendTextColor);
        axisRenderer.setFontFamily(_resolveTypeface(axisFontFamilyEl.value));
        renderer.setMode("nodes");
        renderer.setNodeLabelAnnotation(null);
        applyLegend();
        applyAxis();
        applyTickOptions();
        applyAxisStyle();
      }
      currentOrder = null;
      document.getElementById("btn-order-asc")?.classList.remove("active");
      document.getElementById("btn-order-desc")?.classList.remove("active");
      document.getElementById("btn-mode-nodes")?.classList.toggle("active", true);
      document.getElementById("btn-mode-branches")?.classList.toggle("active", false);
      saveSettings();
    }
    let calibration;
    function _buildRendererSettings() {
      return {
        bgColor: canvasBgColorEl.value,
        branchColor: branchColorEl.value,
        branchWidth: parseFloat(branchWidthSlider.value),
        fontSize: parseInt(fontSlider.value),
        tipRadius: parseInt(tipSlider.value),
        tipHaloSize: parseInt(tipHaloSlider.value),
        tipShapeColor: tipShapeColorEl.value,
        tipShapeBgColor: tipShapeBgEl.value,
        tipOutlineColor: DEFAULT_SETTINGS.tipOutlineColor,
        nodeRadius: parseInt(nodeSlider.value),
        nodeHaloSize: parseInt(nodeHaloSlider.value),
        nodeShapeColor: nodeShapeColorEl.value,
        nodeShapeBgColor: nodeShapeBgEl.value,
        labelColor: labelColorEl.value,
        selectedLabelStyle: selectedLabelStyleEl.value,
        paddingLeft: parseInt(DEFAULT_SETTINGS.paddingLeft),
        paddingRight: parseInt(DEFAULT_SETTINGS.paddingRight),
        paddingTop: parseInt(DEFAULT_SETTINGS.paddingTop),
        paddingBottom: parseInt(DEFAULT_SETTINGS.paddingBottom),
        elbowRadius: parseFloat(DEFAULT_SETTINGS.elbowRadius),
        rootStubLength: parseFloat(DEFAULT_SETTINGS.rootStubLength),
        tipHoverFillColor: tipHoverFillEl.value,
        tipHoverStrokeColor: tipHoverStrokeEl.value,
        tipHoverGrowthFactor: parseFloat(tipHoverGrowthSlider.value),
        tipHoverMinSize: parseFloat(tipHoverMinSizeSlider.value),
        tipHoverFillOpacity: parseFloat(tipHoverFillOpacitySlider.value),
        tipHoverStrokeWidth: parseFloat(tipHoverStrokeWidthSlider.value),
        tipHoverStrokeOpacity: parseFloat(tipHoverStrokeOpacitySlider.value),
        nodeHoverFillColor: nodeHoverFillEl.value,
        nodeHoverStrokeColor: nodeHoverStrokeEl.value,
        nodeHoverGrowthFactor: parseFloat(nodeHoverGrowthSlider.value),
        nodeHoverMinSize: parseFloat(nodeHoverMinSizeSlider.value),
        nodeHoverFillOpacity: parseFloat(nodeHoverFillOpacitySlider.value),
        nodeHoverStrokeWidth: parseFloat(nodeHoverStrokeWidthSlider.value),
        nodeHoverStrokeOpacity: parseFloat(nodeHoverStrokeOpacitySlider.value),
        selectedTipStrokeColor: selectedTipStrokeEl.value,
        selectedTipFillColor: selectedTipFillEl.value,
        selectedTipGrowthFactor: parseFloat(selectedTipGrowthSlider.value),
        selectedTipMinSize: parseFloat(selectedTipMinSizeSlider.value),
        selectedTipFillOpacity: parseFloat(selectedTipFillOpacitySlider.value),
        selectedTipStrokeWidth: parseFloat(selectedTipStrokeWidthSlider.value),
        selectedTipStrokeOpacity: parseFloat(selectedTipStrokeOpacitySlider.value),
        selectedNodeStrokeColor: selectedNodeStrokeEl.value,
        selectedNodeFillColor: selectedNodeFillEl.value,
        selectedNodeGrowthFactor: parseFloat(selectedNodeGrowthSlider.value),
        selectedNodeMinSize: parseFloat(selectedNodeMinSizeSlider.value),
        selectedNodeFillOpacity: parseFloat(selectedNodeFillOpacitySlider.value),
        selectedNodeStrokeWidth: parseFloat(selectedNodeStrokeWidthSlider.value),
        selectedNodeStrokeOpacity: parseFloat(selectedNodeStrokeOpacitySlider.value),
        nodeBarsEnabled: nodeBarsShowEl.value === "on",
        nodeBarsColor: nodeBarsColorEl.value,
        nodeBarsWidth: parseInt(nodeBarsWidthSlider.value),
        nodeBarsShowMedian: nodeBarsMedianEl.value,
        nodeBarsShowRange: nodeBarsRangeEl.value === "on",
        clampNegativeBranches: clampNegBranchesEl.value === "on",
        fontFamily: TYPEFACES[fontFamilyEl.value] ?? fontFamilyEl.value,
        tipLabelsOff: tipLabelShow.value === "off",
        tipLabelAnnotation: tipLabelShow.value === "names" ? null : tipLabelShow.value === "off" ? null : tipLabelShow.value,
        tipLabelAlign: tipLabelAlignEl.value,
        tipLabelDecimalPlaces: tipLabelDpEl.value !== "" ? parseInt(tipLabelDpEl.value) : null,
        tipLabelShape: tipLabelShapeEl.value,
        tipLabelShapeColor: tipLabelShapeColorEl.value,
        tipLabelShapeSize: parseInt(tipLabelShapeSizeSlider.value),
        tipLabelShapeMarginLeft: parseInt(tipLabelShapeMarginLeftSlider.value),
        tipLabelShapeMarginRight: parseInt(tipLabelShapeMarginRightSlider.value),
        tipLabelShape2: tipLabelShape2El.value,
        tipLabelShape2Color: tipLabelShape2ColorEl.value,
        tipLabelShape2Size: parseInt(tipLabelShape2SizeSlider.value),
        tipLabelShape2MarginRight: parseInt(tipLabelShape2MarginRightSlider.value),
        nodeLabelAnnotation: nodeLabelShowEl.value || null,
        nodeLabelPosition: nodeLabelPositionEl.value,
        nodeLabelFontSize: parseInt(nodeLabelFontSizeSlider.value),
        nodeLabelColor: nodeLabelColorEl.value,
        nodeLabelSpacing: parseInt(nodeLabelSpacingSlider.value),
        nodeLabelDecimalPlaces: nodeLabelDpEl.value !== "" ? parseInt(nodeLabelDpEl.value) : null,
        calCalibration: calibration?.isActive ? calibration : null,
        calDateFormat: axisDateFmtEl.value,
        introAnimation: DEFAULT_SETTINGS.introAnimation
      };
    }
    function _syncControlVisibility() {
      const _vis = (el, visible) => {
        if (el) el.classList.toggle("pt-detail-open", visible);
      };
      _vis(tipShapeDetailEl, parseInt(tipSlider.value) > 0);
      _vis(nodeShapeDetailEl, parseInt(nodeSlider.value) > 0);
      _vis(tipLabelShapeDetailEl, tipLabelShapeEl.value !== "off");
      _vis(tipLabelShape2SectionEl, tipLabelShapeEl.value !== "off");
      _vis(tipLabelShape2DetailEl, tipLabelShape2El.value !== "off");
      _vis(nodeLabelDetailEl, nodeLabelShowEl.value !== "");
      _vis(nodeBarsDetailEl, nodeBarsShowEl.value === "on");
      _vis(legendDetailEl, legendAnnotEl.value !== "");
      _vis(legend2DetailEl, legendAnnotEl.value !== "" && legend2AnnotEl.value !== "");
      _vis(axisDetailEl, axisShowEl.value !== "off");
    }
    function _syncCanvasWrapperBg(color) {
      if (!treeLoaded) return;
      document.getElementById("canvas-container").style.background = color;
      document.getElementById("canvas-wrapper").style.background = color;
      document.getElementById("canvas-and-axis-wrapper").style.background = color;
      document.getElementById("data-table-panel").style.background = color;
    }
    function applyTheme(name) {
      const t = themeRegistry.get(name);
      if (!t) return;
      canvasBgColorEl.value = t.canvasBgColor;
      _syncCanvasWrapperBg(t.canvasBgColor);
      branchColorEl.value = t.branchColor;
      branchWidthSlider.value = t.branchWidth;
      document.getElementById("branch-width-value").textContent = t.branchWidth;
      fontSlider.value = t.fontSize;
      document.getElementById("font-size-value").textContent = t.fontSize;
      labelColorEl.value = t.labelColor;
      selectedLabelStyleEl.value = t.selectedLabelStyle ?? DEFAULT_SETTINGS.selectedLabelStyle;
      selectedTipStrokeEl.value = t.selectedTipStrokeColor ?? DEFAULT_SETTINGS.selectedTipStrokeColor;
      selectedNodeStrokeEl.value = t.selectedNodeStrokeColor ?? DEFAULT_SETTINGS.selectedNodeStrokeColor;
      tipHoverFillEl.value = t.tipHoverFillColor ?? DEFAULT_SETTINGS.tipHoverFillColor;
      nodeHoverFillEl.value = t.nodeHoverFillColor ?? DEFAULT_SETTINGS.nodeHoverFillColor;
      selectedTipFillEl.value = t.selectedTipFillColor ?? DEFAULT_SETTINGS.selectedTipFillColor;
      selectedNodeFillEl.value = t.selectedNodeFillColor ?? DEFAULT_SETTINGS.selectedNodeFillColor;
      tipHoverStrokeEl.value = t.tipHoverStrokeColor ?? DEFAULT_SETTINGS.tipHoverStrokeColor;
      nodeHoverStrokeEl.value = t.nodeHoverStrokeColor ?? DEFAULT_SETTINGS.nodeHoverStrokeColor;
      tipSlider.value = t.tipSize;
      document.getElementById("tip-size-value").textContent = t.tipSize;
      tipHaloSlider.value = t.tipHaloSize;
      document.getElementById("tip-halo-value").textContent = t.tipHaloSize;
      tipShapeColorEl.value = t.tipShapeColor;
      tipShapeBgEl.value = t.tipShapeBgColor;
      nodeSlider.value = t.nodeSize;
      document.getElementById("node-size-value").textContent = t.nodeSize;
      nodeHaloSlider.value = t.nodeHaloSize;
      document.getElementById("node-halo-value").textContent = t.nodeHaloSize;
      nodeShapeColorEl.value = t.nodeShapeColor;
      nodeShapeBgEl.value = t.nodeShapeBgColor;
      tipLabelShapeColorEl.value = t.tipLabelShapeColor || t.tipShapeColor;
      tipLabelShape2ColorEl.value = t.tipLabelShape2Color || t.nodeShapeColor;
      if (t.axisColor) {
        axisColorEl.value = t.axisColor;
      }
      nodeBarsColorEl.value = t.nodeBarsColor ?? DEFAULT_SETTINGS.nodeBarsColor;
      const legendColor = t.legendTextColor || t.labelColor;
      legendTextColorEl.value = legendColor;
      fontFamilyEl.value = t.fontFamily ?? DEFAULT_SETTINGS.fontFamily;
      if (renderer) {
        renderer.setSettings(_buildRendererSettings());
        if (t.axisColor) axisRenderer.setColor(t.axisColor);
        legendRenderer.setTextColor(legendColor);
        axisRenderer.setFontFamily(_resolveTypeface(axisFontFamilyEl.value));
        legendRenderer.setFontFamily(_resolveTypeface(legendFontFamilyEl.value));
        axisRenderer._lastHash = "";
      }
      themeSelect.value = name;
      _syncThemeButtons();
      saveSettings();
      _syncControlVisibility();
    }
    function _markCustomTheme() {
      if (themeSelect.value !== "custom") {
        themeSelect.value = "custom";
        saveSettings();
      }
      _syncThemeButtons();
    }
    btnResetSettings.addEventListener("click", applyDefaults);
    btnStoreTheme.addEventListener("click", storeTheme);
    btnDefaultTheme.addEventListener("click", setDefaultTheme);
    btnRemoveTheme.addEventListener("click", removeTheme);
    loadUserThemes();
    _populateThemeSelect();
    _syncThemeButtons();
    const _saved = loadSettings();
    if (_saved.annotationPalettes) {
      for (const [k, v] of Object.entries(_saved.annotationPalettes)) annotationPalettes.set(k, v);
    }
    if (_saved.canvasBgColor) canvasBgColorEl.value = _saved.canvasBgColor;
    if (_saved.branchColor) branchColorEl.value = _saved.branchColor;
    if (_saved.branchWidth != null) {
      branchWidthSlider.value = _saved.branchWidth;
      document.getElementById("branch-width-value").textContent = _saved.branchWidth;
    }
    if (_saved.fontSize != null) {
      fontSlider.value = _saved.fontSize;
      document.getElementById("font-size-value").textContent = _saved.fontSize;
    }
    if (_saved.fontFamily) fontFamilyEl.value = _saved.fontFamily;
    if (_saved.labelColor) labelColorEl.value = _saved.labelColor;
    if (_saved.selectedLabelStyle) selectedLabelStyleEl.value = _saved.selectedLabelStyle;
    if (_saved.selectedTipStrokeColor) selectedTipStrokeEl.value = _saved.selectedTipStrokeColor;
    if (_saved.selectedNodeStrokeColor) selectedNodeStrokeEl.value = _saved.selectedNodeStrokeColor;
    if (_saved.tipHoverFillColor) tipHoverFillEl.value = _saved.tipHoverFillColor;
    if (_saved.nodeHoverFillColor) nodeHoverFillEl.value = _saved.nodeHoverFillColor;
    if (_saved.selectedTipFillColor) selectedTipFillEl.value = _saved.selectedTipFillColor;
    if (_saved.selectedTipGrowthFactor != null) {
      selectedTipGrowthSlider.value = _saved.selectedTipGrowthFactor;
      document.getElementById("selected-tip-growth-value").textContent = _saved.selectedTipGrowthFactor;
    }
    if (_saved.selectedTipMinSize != null) {
      selectedTipMinSizeSlider.value = _saved.selectedTipMinSize;
      document.getElementById("selected-tip-min-size-value").textContent = _saved.selectedTipMinSize;
    }
    if (_saved.selectedTipFillOpacity != null) {
      selectedTipFillOpacitySlider.value = _saved.selectedTipFillOpacity;
      document.getElementById("selected-tip-fill-opacity-value").textContent = _saved.selectedTipFillOpacity;
    }
    if (_saved.selectedTipStrokeWidth != null) {
      selectedTipStrokeWidthSlider.value = _saved.selectedTipStrokeWidth;
      document.getElementById("selected-tip-stroke-width-value").textContent = _saved.selectedTipStrokeWidth;
    }
    if (_saved.selectedTipStrokeOpacity != null) {
      selectedTipStrokeOpacitySlider.value = _saved.selectedTipStrokeOpacity;
      document.getElementById("selected-tip-stroke-opacity-value").textContent = _saved.selectedTipStrokeOpacity;
    }
    if (_saved.selectedNodeFillColor) selectedNodeFillEl.value = _saved.selectedNodeFillColor;
    if (_saved.selectedNodeGrowthFactor != null) {
      selectedNodeGrowthSlider.value = _saved.selectedNodeGrowthFactor;
      document.getElementById("selected-node-growth-value").textContent = _saved.selectedNodeGrowthFactor;
    }
    if (_saved.selectedNodeMinSize != null) {
      selectedNodeMinSizeSlider.value = _saved.selectedNodeMinSize;
      document.getElementById("selected-node-min-size-value").textContent = _saved.selectedNodeMinSize;
    }
    if (_saved.selectedNodeFillOpacity != null) {
      selectedNodeFillOpacitySlider.value = _saved.selectedNodeFillOpacity;
      document.getElementById("selected-node-fill-opacity-value").textContent = _saved.selectedNodeFillOpacity;
    }
    if (_saved.selectedNodeStrokeWidth != null) {
      selectedNodeStrokeWidthSlider.value = _saved.selectedNodeStrokeWidth;
      document.getElementById("selected-node-stroke-width-value").textContent = _saved.selectedNodeStrokeWidth;
    }
    if (_saved.selectedNodeStrokeOpacity != null) {
      selectedNodeStrokeOpacitySlider.value = _saved.selectedNodeStrokeOpacity;
      document.getElementById("selected-node-stroke-opacity-value").textContent = _saved.selectedNodeStrokeOpacity;
    }
    if (_saved.tipHoverStrokeColor) tipHoverStrokeEl.value = _saved.tipHoverStrokeColor;
    if (_saved.tipHoverGrowthFactor != null) {
      tipHoverGrowthSlider.value = _saved.tipHoverGrowthFactor;
      document.getElementById("tip-hover-growth-value").textContent = _saved.tipHoverGrowthFactor;
    }
    if (_saved.tipHoverMinSize != null) {
      tipHoverMinSizeSlider.value = _saved.tipHoverMinSize;
      document.getElementById("tip-hover-min-size-value").textContent = _saved.tipHoverMinSize;
    }
    if (_saved.tipHoverFillOpacity != null) {
      tipHoverFillOpacitySlider.value = _saved.tipHoverFillOpacity;
      document.getElementById("tip-hover-fill-opacity-value").textContent = _saved.tipHoverFillOpacity;
    }
    if (_saved.tipHoverStrokeWidth != null) {
      tipHoverStrokeWidthSlider.value = _saved.tipHoverStrokeWidth;
      document.getElementById("tip-hover-stroke-width-value").textContent = _saved.tipHoverStrokeWidth;
    }
    if (_saved.tipHoverStrokeOpacity != null) {
      tipHoverStrokeOpacitySlider.value = _saved.tipHoverStrokeOpacity;
      document.getElementById("tip-hover-stroke-opacity-value").textContent = _saved.tipHoverStrokeOpacity;
    }
    if (_saved.nodeHoverStrokeColor) nodeHoverStrokeEl.value = _saved.nodeHoverStrokeColor;
    if (_saved.nodeHoverGrowthFactor != null) {
      nodeHoverGrowthSlider.value = _saved.nodeHoverGrowthFactor;
      document.getElementById("node-hover-growth-value").textContent = _saved.nodeHoverGrowthFactor;
    }
    if (_saved.nodeHoverMinSize != null) {
      nodeHoverMinSizeSlider.value = _saved.nodeHoverMinSize;
      document.getElementById("node-hover-min-size-value").textContent = _saved.nodeHoverMinSize;
    }
    if (_saved.nodeHoverFillOpacity != null) {
      nodeHoverFillOpacitySlider.value = _saved.nodeHoverFillOpacity;
      document.getElementById("node-hover-fill-opacity-value").textContent = _saved.nodeHoverFillOpacity;
    }
    if (_saved.nodeHoverStrokeWidth != null) {
      nodeHoverStrokeWidthSlider.value = _saved.nodeHoverStrokeWidth;
      document.getElementById("node-hover-stroke-width-value").textContent = _saved.nodeHoverStrokeWidth;
    }
    if (_saved.nodeHoverStrokeOpacity != null) {
      nodeHoverStrokeOpacitySlider.value = _saved.nodeHoverStrokeOpacity;
      document.getElementById("node-hover-stroke-opacity-value").textContent = _saved.nodeHoverStrokeOpacity;
    }
    if (_saved.tipSize != null) {
      tipSlider.value = _saved.tipSize;
      document.getElementById("tip-size-value").textContent = _saved.tipSize;
    }
    if (_saved.tipHaloSize != null) {
      tipHaloSlider.value = _saved.tipHaloSize;
      document.getElementById("tip-halo-value").textContent = _saved.tipHaloSize;
    }
    if (_saved.tipShapeColor) tipShapeColorEl.value = _saved.tipShapeColor;
    if (_saved.tipShapeBgColor) tipShapeBgEl.value = _saved.tipShapeBgColor;
    if (_saved.tipLabelShape) tipLabelShapeEl.value = _saved.tipLabelShape;
    if (_saved.tipLabelShapeColor) tipLabelShapeColorEl.value = _saved.tipLabelShapeColor;
    if (_saved.tipLabelShapeMarginLeft != null) {
      tipLabelShapeMarginLeftSlider.value = _saved.tipLabelShapeMarginLeft;
      document.getElementById("tip-label-shape-margin-left-value").textContent = _saved.tipLabelShapeMarginLeft;
    }
    if (_saved.tipLabelShapeMarginRight != null) {
      tipLabelShapeMarginRightSlider.value = _saved.tipLabelShapeMarginRight;
      document.getElementById("tip-label-shape-margin-right-value").textContent = _saved.tipLabelShapeMarginRight;
    }
    if (_saved.tipLabelShape2) tipLabelShape2El.value = _saved.tipLabelShape2;
    if (_saved.tipLabelShape2Color) tipLabelShape2ColorEl.value = _saved.tipLabelShape2Color;
    if (_saved.tipLabelShape2MarginRight != null) {
      tipLabelShape2MarginRightSlider.value = _saved.tipLabelShape2MarginRight;
      document.getElementById("tip-label-shape-2-margin-right-value").textContent = _saved.tipLabelShape2MarginRight;
    }
    if (_saved.tipLabelShapeSize != null) {
      tipLabelShapeSizeSlider.value = _saved.tipLabelShapeSize;
      document.getElementById("tip-label-shape-size-value").textContent = _saved.tipLabelShapeSize;
    }
    if (_saved.tipLabelShape2Size != null) {
      tipLabelShape2SizeSlider.value = _saved.tipLabelShape2Size;
      document.getElementById("tip-label-shape-2-size-value").textContent = _saved.tipLabelShape2Size;
    }
    if (_saved.nodeSize != null) {
      nodeSlider.value = _saved.nodeSize;
      document.getElementById("node-size-value").textContent = _saved.nodeSize;
    }
    if (_saved.nodeHaloSize != null) {
      nodeHaloSlider.value = _saved.nodeHaloSize;
      document.getElementById("node-halo-value").textContent = _saved.nodeHaloSize;
    }
    if (_saved.nodeShapeColor) nodeShapeColorEl.value = _saved.nodeShapeColor;
    if (_saved.nodeShapeBgColor) nodeShapeBgEl.value = _saved.nodeShapeBgColor;
    if (_saved.axisColor) axisColorEl.value = _saved.axisColor;
    if (_saved.axisFontFamily) axisFontFamilyEl.value = _saved.axisFontFamily;
    if (_saved.axisFontSize != null) {
      axisFontSizeSlider.value = _saved.axisFontSize;
      document.getElementById("axis-font-size-value").textContent = _saved.axisFontSize;
    }
    if (_saved.axisLineWidth != null) {
      axisLineWidthSlider.value = _saved.axisLineWidth;
      document.getElementById("axis-line-width-value").textContent = _saved.axisLineWidth;
    }
    if (_saved.legendShow) legendShowEl.value = _saved.legendShow;
    if (_saved.legendTextColor) legendTextColorEl.value = _saved.legendTextColor;
    if (_saved.legendFontSize != null) {
      legendFontSizeSlider.value = _saved.legendFontSize;
      document.getElementById("legend-font-size-value").textContent = _saved.legendFontSize;
    }
    if (_saved.legendHeightPct != null) {
      legendHeightPctSlider.value = _saved.legendHeightPct;
      document.getElementById("legend-height-pct-value").textContent = _saved.legendHeightPct + "%";
    }
    if (_saved.legendFontFamily) legendFontFamilyEl.value = _saved.legendFontFamily;
    if (_saved.tipLabelAlign) tipLabelAlignEl.value = _saved.tipLabelAlign;
    if (_saved.nodeLabelPosition) nodeLabelPositionEl.value = _saved.nodeLabelPosition;
    if (_saved.nodeLabelFontSize != null) {
      nodeLabelFontSizeSlider.value = _saved.nodeLabelFontSize;
      document.getElementById("node-label-font-size-value").textContent = _saved.nodeLabelFontSize;
    }
    if (_saved.nodeLabelColor) nodeLabelColorEl.value = _saved.nodeLabelColor;
    if (_saved.nodeLabelSpacing != null) {
      nodeLabelSpacingSlider.value = _saved.nodeLabelSpacing;
      document.getElementById("node-label-spacing-value").textContent = _saved.nodeLabelSpacing;
    }
    themeSelect.value = _saved.theme || "Artic";
    const container = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = container.clientWidth + "px";
    canvas.style.height = container.clientHeight + "px";
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const renderer = new TreeRenderer(canvas, _buildRendererSettings());
    renderer._onStatsChange = (stats) => {
      const el = document.getElementById("status-stats");
      if (!el) return;
      if (!stats) {
        el.innerHTML = "";
        return;
      }
      el.innerHTML = `<span class="st-lbl">Tips\u2009</span><span class="st-val">${stats.tipCount}</span><span class="st-sep"> | </span><span class="st-lbl">Dist\u2009</span><span class="st-val">${stats.distance.toFixed(5)}</span><span class="st-sep"> | </span><span class="st-lbl">Height\u2009</span><span class="st-val">${stats.height.toFixed(5)}</span><span class="st-sep"> | </span><span class="st-lbl">Length\u2009</span><span class="st-val">${stats.totalLength.toFixed(5)}</span>`;
    };
    const legendRenderer = new LegendRenderer(
      legendLeftCanvas,
      legendRightCanvas,
      legend2LeftCanvas,
      legend2RightCanvas,
      {
        fontSize: parseInt(legendFontSizeSlider.value),
        textColor: legendTextColorEl.value,
        bgColor: canvasBgColorEl.value,
        padding: parseInt(DEFAULT_SETTINGS.legendPadding),
        heightPct: parseInt(DEFAULT_SETTINGS.legendHeightPct),
        heightPct2: parseInt(DEFAULT_SETTINGS.legendHeightPct2)
      }
    );
    renderer.setLegendRenderer(legendRenderer);
    legendRenderer.onCategoryClick = (value) => {
      if (!renderer.nodeMap) return;
      const key = legendRenderer._annotation;
      if (!key) return;
      const ids = [];
      for (const [id, n] of renderer.nodeMap) {
        if (!n.isTip) continue;
        if (n.annotations?.[key] === value) ids.push(id);
      }
      renderer._selectedTipIds = new Set(ids);
      renderer._mrcaNodeId = null;
      if (renderer._onNodeSelectChange) renderer._onNodeSelectChange(ids.length > 0);
      renderer._dirty = true;
    };
    legendRenderer.onCategoryClick2 = (value) => {
      if (!renderer.nodeMap) return;
      const key2 = legendRenderer._annotation2;
      if (!key2) return;
      const ids = [];
      for (const [id, n] of renderer.nodeMap) {
        if (!n.isTip) continue;
        if (n.annotations?.[key2] === value) ids.push(id);
      }
      renderer._selectedTipIds = new Set(ids);
      renderer._mrcaNodeId = null;
      if (renderer._onNodeSelectChange) renderer._onNodeSelectChange(ids.length > 0);
      renderer._dirty = true;
    };
    const axisRenderer = new AxisRenderer(axisCanvas, {
      axisColor: axisColorEl.value,
      fontSize: parseInt(axisFontSizeSlider.value),
      lineWidth: parseFloat(axisLineWidthSlider.value),
      paddingTop: parseInt(DEFAULT_SETTINGS.axisPaddingTop)
    });
    calibration = new TreeCalibration();
    if (!_saved.theme) {
      applyTheme(defaultTheme);
    } else {
      renderer.setSettings(_buildRendererSettings(), false);
      _syncControlVisibility();
    }
    legendRenderer.setFontFamily(_resolveTypeface(legendFontFamilyEl.value));
    axisRenderer.setFontFamily(_resolveTypeface(axisFontFamilyEl.value));
    renderer._onViewChange = (scaleX, offsetX, paddingLeft, labelRightPad, bgColor, fontSize, dpr2) => {
      axisRenderer.update(scaleX, offsetX, paddingLeft, labelRightPad, bgColor, fontSize, dpr2);
      _syncCanvasWrapperBg(bgColor);
      dataTableRenderer.syncView();
    };
    renderer._onLayoutChange = (maxX, viewSubtreeRootId) => {
      const viewNodes = renderer.nodes || [];
      dataTableRenderer.setTips(viewNodes.filter((n) => n.isTip));
      if (!_axisIsTimedTree && !(axisShowEl.value === "time" && axisDateAnnotEl.value)) return;
      const hMap = renderer._globalHeightMap;
      const rootLayoutNode = viewNodes.find((n) => !n.parentId);
      const rootH = rootLayoutNode ? hMap.get(rootLayoutNode.id) ?? 0 : 0;
      const viewRootH = viewSubtreeRootId ? hMap.get(viewSubtreeRootId) ?? rootH : rootH;
      let minTipH = Infinity;
      for (const n of viewNodes) {
        if (!n.isTip) continue;
        const h = hMap.get(n.id);
        if (h != null && h < minTipH) minTipH = h;
      }
      if (!isFinite(minTipH)) minTipH = 0;
      axisRenderer.setSubtreeParams({
        maxX: viewRootH - minTipH,
        rootHeight: viewRootH,
        minTipH
      });
    };
    const _savedAxisShow = _saved.axisShow === "on" ? "forward" : _saved.axisShow || "off";
    if (_savedAxisShow !== "off") {
      axisShowEl.value = _savedAxisShow;
      axisRenderer.setDirection(_savedAxisShow);
      axisRenderer.setVisible(true);
    }
    if (_saved.axisMajorInterval) axisMajorIntervalEl.value = _saved.axisMajorInterval;
    _updateMinorOptions(axisMajorIntervalEl.value, _saved.axisMinorInterval || "off");
    if (_saved.axisMajorLabelFormat) axisMajorLabelEl.value = _saved.axisMajorLabelFormat;
    if (_saved.axisMinorLabelFormat) axisMinorLabelEl.value = _saved.axisMinorLabelFormat;
    if (loadingEl) {
      loadingEl.classList.add("hidden");
    }
    const modal = document.getElementById("open-tree-modal");
    const btnModalClose = document.getElementById("btn-modal-close");
    function openModal() {
      setModalError(null);
      setModalLoading(false);
      modal.classList.add("open");
    }
    function closeModal() {
      modal.classList.remove("open");
      if (!treeLoaded) {
        const es = document.getElementById("empty-state");
        if (es) es.classList.remove("hidden");
      }
    }
    function setModalError(msg) {
      const el = document.getElementById("modal-error");
      if (msg) {
        el.textContent = msg;
        el.style.display = "block";
      } else {
        el.style.display = "none";
      }
    }
    function showErrorDialog(msg) {
      const overlay = document.getElementById("error-dialog-overlay");
      document.getElementById("error-dialog-msg").textContent = msg;
      overlay.classList.add("open");
    }
    document.getElementById("error-dialog-ok").addEventListener("click", () => {
      document.getElementById("error-dialog-overlay").classList.remove("open");
    });
    function showConfirmDialog(title, msg, { okLabel = "OK", cancelLabel = "Cancel" } = {}) {
      return new Promise((resolve) => {
        const overlay = document.getElementById("confirm-dialog-overlay");
        document.getElementById("confirm-dialog-title").textContent = title;
        document.getElementById("confirm-dialog-msg").textContent = msg;
        document.getElementById("confirm-dialog-ok").textContent = okLabel;
        document.getElementById("confirm-dialog-cancel").textContent = cancelLabel;
        overlay.classList.add("open");
        const okBtn = document.getElementById("confirm-dialog-ok");
        const cancelBtn = document.getElementById("confirm-dialog-cancel");
        function close(result) {
          overlay.classList.remove("open");
          okBtn.removeEventListener("click", onOk);
          cancelBtn.removeEventListener("click", onCancel);
          document.removeEventListener("keydown", onKey, true);
          resolve(result);
        }
        function onOk() {
          close(true);
        }
        function onCancel() {
          close(false);
        }
        function onKey(e) {
          if (e.key === "Escape") {
            e.stopPropagation();
            close(false);
          }
        }
        okBtn.addEventListener("click", onOk);
        cancelBtn.addEventListener("click", onCancel);
        document.addEventListener("keydown", onKey, true);
      });
    }
    function setModalLoading(on) {
      document.getElementById("modal-loading").style.display = on ? "block" : "none";
      modal.querySelectorAll(".pt-modal-body button, .pt-tab-btn").forEach((b) => {
        if (b !== btnModalClose) b.disabled = on;
      });
    }
    modal.querySelectorAll(".pt-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        modal.querySelectorAll(".pt-tab-btn").forEach((b) => b.classList.remove("active"));
        modal.querySelectorAll(".pt-tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("tab-panel-" + btn.dataset.tab).classList.add("active");
      });
    });
    btnModalClose.addEventListener("click", () => closeModal());
    document.addEventListener("keydown", (e) => {
      const inTextField = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) && !["checkbox", "radio"].includes(document.activeElement?.type);
      if (e.key === "Escape") {
        if (exportGraphicOverlay.classList.contains("open")) {
          _closeGraphicsDialog();
          return;
        }
        if (exportOverlay.classList.contains("open")) {
          _closeExportDialog();
          return;
        }
        if (document.getElementById("curate-annot-overlay")?.classList.contains("open")) {
          annotCurator.close();
          return;
        }
        if (document.getElementById("import-annot-overlay")?.classList.contains("open")) {
          annotImporter.close();
          return;
        }
        const nodeInfoOv = document.getElementById("node-info-overlay");
        if (nodeInfoOv && nodeInfoOv.classList.contains("open")) {
          nodeInfoOv.classList.remove("open");
          return;
        }
        if (modal.classList.contains("open")) {
          closeModal();
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey && !inTextField) {
        if (exportGraphicOverlay.classList.contains("open")) {
          document.getElementById("expg-download-btn")?.click();
          return;
        }
        if (exportOverlay.classList.contains("open")) {
          document.getElementById("exp-download-btn")?.click();
          return;
        }
        if (document.getElementById("import-annot-overlay")?.classList.contains("open")) {
          const apply = document.getElementById("imp-apply-btn");
          if (apply) {
            apply.click();
            return;
          }
          (document.getElementById("imp-close-btn") || document.getElementById("imp-close-err-btn") || document.getElementById("imp-picker-cancel-btn"))?.click();
          return;
        }
        const nodeInfoOv2 = document.getElementById("node-info-overlay");
        if (nodeInfoOv2 && nodeInfoOv2.classList.contains("open")) {
          nodeInfoOv2.classList.remove("open");
          return;
        }
        if (modal.classList.contains("open")) {
          closeModal();
          return;
        }
      }
    }, { capture: true });
    const dropZone = document.getElementById("tree-drop-zone");
    const fileInput = document.getElementById("tree-file-input");
    document.getElementById("btn-file-choose").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handleFile(file);
      fileInput.value = "";
    });
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    async function handleFile(file) {
      setModalLoading(true);
      setModalError(null);
      try {
        const text = await file.text();
        await loadTree(text, file.name);
      } catch (err) {
        setModalError(err.message);
        setModalLoading(false);
      }
    }
    async function pickTreeFile() {
      await window.peartree.pickFile();
    }
    document.getElementById("btn-load-url").addEventListener("click", async () => {
      const url = document.getElementById("tree-url-input").value.trim();
      if (!url) {
        setModalError("Please enter a URL.");
        return;
      }
      setModalLoading(true);
      setModalError(null);
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("HTTP " + resp.status + " \u2013 " + url);
        const text = await resp.text();
        await loadTree(text, url.split("/").pop() || "tree");
      } catch (err) {
        setModalError(err.message);
        setModalLoading(false);
      }
    });
    async function loadExampleTree(onError) {
      try {
        const text = await fetchExampleTree();
        await loadTree(text, EXAMPLE_TREE_PATH);
      } catch (err) {
        onError(err.message);
      }
    }
    document.getElementById("btn-load-example").addEventListener("click", () => {
      setModalLoading(true);
      setModalError(null);
      loadExampleTree((msg) => {
        setModalError(msg);
        setModalLoading(false);
      });
    });
    const emptyStateEl = document.getElementById("empty-state");
    function hideEmptyState() {
      emptyStateEl.classList.add("hidden");
    }
    function showEmptyState() {
      if (!treeLoaded) emptyStateEl.classList.remove("hidden");
    }
    document.getElementById("empty-state-open-btn").addEventListener("click", () => pickTreeFile());
    document.getElementById("empty-state-example-btn").addEventListener("click", () => {
      hideEmptyState();
      loadExampleTree((msg) => {
        showEmptyState();
        showErrorDialog(msg);
      });
    });
    emptyStateEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      emptyStateEl.classList.add("drag-over");
    });
    emptyStateEl.addEventListener("dragleave", (e) => {
      if (!emptyStateEl.contains(e.relatedTarget)) emptyStateEl.classList.remove("drag-over");
    });
    emptyStateEl.addEventListener("drop", (e) => {
      e.preventDefault();
      emptyStateEl.classList.remove("drag-over");
      const file = e.dataTransfer.files[0];
      if (file) {
        openModal();
        handleFile(file);
      }
    });
    const annotImporter = createAnnotImporter({
      getGraph: () => graph,
      onApply: (g) => {
        _refreshAnnotationUIs(g.annotationSchema);
        renderer.setAnnotationSchema(g.annotationSchema);
        axisRenderer.setHeightFormatter(g.annotationSchema.get("height")?.fmt ?? null);
        renderer.setTipColourBy(tipColourBy.value || null);
        renderer.setNodeColourBy(nodeColourBy.value || null);
        renderer.setLabelColourBy(labelColourBy.value || null);
        renderer.setTipLabelShapeColourBy(tipLabelShapeColourBy.value || null);
        renderer.setTipLabelShape2ColourBy(tipLabelShape2ColourBy.value || null);
        renderer.setTipLabelsOff(tipLabelShow.value === "off");
        if (tipLabelShow.value !== "off") renderer.setTipLabelAnnotation(tipLabelShow.value === "names" ? null : tipLabelShow.value);
        applyLegend();
        renderer._dirty = true;
      }
    });
    btnImportAnnot.addEventListener("click", () => execute("import-annot"));
    const annotCurator = createAnnotCurator({
      getGraph: () => graph,
      onApply: (schema) => {
        _refreshAnnotationUIs(schema);
        renderer.setAnnotationSchema(schema);
        axisRenderer.setHeightFormatter(schema.get("height")?.fmt ?? null);
        applyLegend();
        renderer._dirty = true;
      },
      onTableColumnsChange: (cols) => {
        dataTableRenderer.setColumns(cols);
      }
    });
    btnCurateAnnot.addEventListener("click", () => execute("curate-annot"));
    const dataTableRenderer = createDataTableRenderer({
      getRenderer: () => renderer,
      panel: document.getElementById("data-table-panel"),
      headerEl: document.getElementById("dt-header"),
      bodyEl: document.getElementById("dt-body"),
      onRowSelect: (selectedIds) => {
        renderer._selectedTipIds = new Set(selectedIds);
        renderer._updateMRCA();
        renderer._notifyStats();
        if (renderer._onNodeSelectChange) renderer._onNodeSelectChange(renderer._selectedTipIds.size > 0);
        renderer._dirty = true;
      },
      onEditCommit: (nodeId, key, newValue) => {
        const node = renderer?.nodeMap?.get(nodeId);
        if (!node) return;
        if (!node.annotations) node.annotations = {};
        const schema = graph?.annotationSchema;
        const def = schema?.get(key);
        const dt = def?.dataType;
        let parsed = newValue === "" ? null : newValue;
        if (dt === "integer") {
          const n = parseInt(newValue, 10);
          parsed = Number.isFinite(n) ? n : newValue === "" ? null : newValue;
        } else if (dt === "real" || dt === "proportion" || dt === "percentage") {
          const n = parseFloat(newValue);
          parsed = Number.isFinite(n) ? n : newValue === "" ? null : newValue;
        }
        node.annotations[key] = parsed;
        if (def && schema && isNumericType(dt)) {
          const values = [];
          for (const n of graph.nodes) {
            const v = n.annotations?.[key];
            if (v != null && v !== "?" && Number.isFinite(Number(v))) values.push(Number(v));
          }
          if (values.length > 0) {
            def.observedMin = Math.min(...values);
            def.observedMax = Math.max(...values);
          }
        }
        if (schema) {
          renderer.setAnnotationSchema(schema);
          applyLegend();
        }
        renderer._dirty = true;
      }
    });
    function _resizeDuringTransition(durationMs = 230) {
      const start = performance.now();
      (function tick() {
        renderer._resize();
        if (performance.now() - start < durationMs) requestAnimationFrame(tick);
      })();
    }
    btnDataTable.addEventListener("click", () => {
      if (dataTableRenderer.isOpen()) {
        dataTableRenderer.close();
        btnDataTable.classList.remove("active");
      } else {
        dataTableRenderer.open();
        btnDataTable.classList.add("active");
      }
      _resizeDuringTransition();
    });
    const _dtResizeHandle = document.getElementById("data-table-resize-handle");
    const _dtPanel = document.getElementById("data-table-panel");
    if (_dtResizeHandle && _dtPanel) {
      let _dtDragging = false;
      let _dtStartX = 0;
      let _dtStartW = 0;
      _dtResizeHandle.addEventListener("mousedown", (e) => {
        _dtDragging = true;
        _dtStartX = e.clientX;
        _dtStartW = _dtPanel.offsetWidth;
        document.body.style.cursor = "ew-resize";
        e.preventDefault();
      });
      window.addEventListener("mousemove", (e) => {
        if (!_dtDragging) return;
        const delta = _dtStartX - e.clientX;
        const newW = Math.max(100, Math.min(700, _dtStartW + delta));
        _dtPanel.style.flexBasis = `${newW}px`;
        _dtPanel._dtWidth = `${newW}px`;
        renderer._resize();
      });
      window.addEventListener("mouseup", () => {
        if (_dtDragging) {
          _dtDragging = false;
          document.body.style.cursor = "";
        }
      });
    }
    document.getElementById("export-tree-close").addEventListener("click", _closeExportDialog);
    btnExportTree.addEventListener("click", _openExportDialog);
    function _esc2(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    const exportOverlay = document.getElementById("export-tree-overlay");
    const exportBody = document.getElementById("export-tree-body");
    const exportFooter = document.getElementById("export-tree-footer");
    const exportTitleEl = document.getElementById("export-tree-title");
    let _exportSaveHandler = null;
    let _graphicsSaveHandler = null;
    function _openExportDialog() {
      if (!graph) return;
      exportOverlay.classList.add("open");
      _buildExportDialog();
    }
    function _closeExportDialog() {
      exportOverlay.classList.remove("open");
    }
    function _buildExportDialog() {
      const hasSubtree = !!renderer._viewSubtreeRootId;
      const schema = graph ? graph.annotationSchema : /* @__PURE__ */ new Map();
      const annotKeys = schema ? [...schema.keys()] : [];
      exportTitleEl.innerHTML = '<i class="bi bi-file-earmark-arrow-down me-2"></i>Export Tree';
      exportBody.innerHTML = `
      <div class="exp-section">
        <span class="exp-section-label">Format</span>
        <div class="exp-radio-group">
          <label class="exp-radio-opt"><input type="radio" name="exp-format" value="nexus" checked>&nbsp;NEXUS <span style="color:var(--bs-secondary-color);font-size:0.78rem">(.nexus)</span></label>
          <label class="exp-radio-opt"><input type="radio" name="exp-format" value="newick">&nbsp;Newick <span style="color:var(--bs-secondary-color);font-size:0.78rem">(.nwk)</span></label>
        </div>
      </div>
      <div class="exp-section" id="exp-settings-row">
        <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.85rem;cursor:pointer">
          <input type="checkbox" id="exp-store-settings" checked>
          <span>Embed current visual settings in file</span>
        </label>
      </div>
      <div class="exp-section">
        <span class="exp-section-label">Scope</span>
        <div class="exp-radio-group">
          <label class="exp-radio-opt"><input type="radio" name="exp-scope" value="full" checked>&nbsp;Entire tree</label>
          <label class="exp-radio-opt${!hasSubtree ? " exp-disabled" : ""}">
            <input type="radio" name="exp-scope" value="subtree"${!hasSubtree ? " disabled" : ""}>&nbsp;Current subtree view
          </label>
        </div>
      </div>
      ${annotKeys.length > 0 ? `
      <div class="exp-section">
        <span class="exp-section-label" style="display:flex;align-items:center;justify-content:space-between;">
          <span>Annotations to include</span>
          <span style="display:flex;gap:0.3rem">
            <button id="exp-all-btn"  class="btn btn-sm btn-outline-secondary" style="font-size:0.7rem;padding:1px 8px;line-height:1.4">All</button>
            <button id="exp-none-btn" class="btn btn-sm btn-outline-secondary" style="font-size:0.7rem;padding:1px 8px;line-height:1.4">None</button>
          </span>
        </span>
        <div class="imp-col-grid" id="exp-annot-grid" style="margin-top:0.35rem">
          ${annotKeys.map((k) => `
            <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.82rem;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              <input type="checkbox" class="exp-annot-cb" value="${_esc2(k)}" checked>
              <code style="font-size:0.78rem;background:#02292e;padding:0 3px;border-radius:3px">${_esc2(k)}</code>
            </label>`).join("")}
        </div>
      </div>` : ""}`;
      exportFooter.innerHTML = `
      <button id="exp-cancel-btn"   class="btn btn-sm btn-secondary">Cancel</button>
      <button id="exp-download-btn" class="btn btn-sm btn-primary"><i class="bi bi-${_exportSaveHandler ? "folder-check" : "download"} me-1"></i>${_exportSaveHandler ? "Export" : "Download"}</button>`;
      document.getElementById("exp-cancel-btn").addEventListener("click", _closeExportDialog);
      document.getElementById("exp-download-btn").addEventListener("click", _doExport);
      document.querySelectorAll('input[name="exp-format"]').forEach((radio) => radio.addEventListener("change", () => {
        const settingsRow = document.getElementById("exp-settings-row");
        if (settingsRow) settingsRow.style.display = document.querySelector('input[name="exp-format"]:checked')?.value === "newick" ? "none" : "";
      }));
      if (annotKeys.length > 0) {
        const annotGrid = document.getElementById("exp-annot-grid");
        const allCbs = () => annotGrid.querySelectorAll(".exp-annot-cb");
        const isNewick = () => document.querySelector('input[name="exp-format"]:checked')?.value === "newick";
        const _newickWarning = `
        <div id="exp-newick-warn" style="margin-top:0.5rem;padding:0.4rem 0.6rem;border-radius:4px;background:rgba(203,75,22,0.15);border:1px solid rgba(203,75,22,0.45);font-size:0.8rem;color:#e07040;display:flex;align-items:flex-start;gap:0.4rem">
          <i class="bi bi-exclamation-triangle-fill" style="flex-shrink:0;margin-top:1px"></i>
          <span>Annotations are not part of the Newick format and may be incompatible with some software.</span>
        </div>`;
        const _syncAnnotSection = () => {
          const nwk = isNewick();
          const settingsRow = document.getElementById("exp-settings-row");
          if (nwk) {
            allCbs().forEach((cb) => {
              cb.checked = false;
            });
            document.getElementById("exp-newick-warn")?.remove();
            if (settingsRow) settingsRow.style.display = "none";
          } else {
            allCbs().forEach((cb) => {
              cb.checked = true;
            });
            document.getElementById("exp-newick-warn")?.remove();
            if (settingsRow) settingsRow.style.display = "";
          }
        };
        document.querySelectorAll('input[name="exp-format"]').forEach((radio) => radio.addEventListener("change", _syncAnnotSection));
        annotGrid.addEventListener("change", (e) => {
          if (!isNewick() || !e.target.matches(".exp-annot-cb")) return;
          if (!document.getElementById("exp-newick-warn")) {
            annotGrid.insertAdjacentHTML("afterend", _newickWarning);
          }
        });
        document.getElementById("exp-all-btn").addEventListener("click", () => {
          allCbs().forEach((cb) => {
            cb.checked = true;
          });
          if (isNewick() && !document.getElementById("exp-newick-warn")) {
            annotGrid.insertAdjacentHTML("afterend", _newickWarning);
          }
        });
        document.getElementById("exp-none-btn").addEventListener("click", () => {
          allCbs().forEach((cb) => {
            cb.checked = false;
          });
          document.getElementById("exp-newick-warn")?.remove();
        });
      }
    }
    function _doExport() {
      const format = document.querySelector('input[name="exp-format"]:checked')?.value || "nexus";
      const scope = document.querySelector('input[name="exp-scope"]:checked')?.value || "full";
      const annotKeys = [...document.querySelectorAll("#exp-annot-grid .exp-annot-cb:checked")].map((cb) => cb.value);
      const storeSettings = format === "nexus" && document.getElementById("exp-store-settings")?.checked;
      const subtreeId = scope === "subtree" ? renderer._viewSubtreeRootId : null;
      const newick = graphToNewick(graph, subtreeId, annotKeys);
      if (!newick) return;
      let content, ext;
      if (format === "nexus") {
        const rootedTag = annotKeys.length > 0 ? "[&R] " : "";
        const settingsLine = storeSettings ? `	[peartree=${JSON.stringify(_buildSettingsSnapshot())}]
` : "";
        content = `#NEXUS
BEGIN TREES;
	tree TREE1 = ${rootedTag}${newick}
${settingsLine}END;
`;
        ext = "nexus";
      } else {
        content = newick + "\n";
        ext = "nwk";
      }
      if (_exportSaveHandler) {
        _exportSaveHandler({
          content,
          filename: `tree.${ext}`,
          mimeType: "text/plain",
          filterName: format === "nexus" ? "NEXUS files" : "Newick files",
          extensions: [ext]
        });
      } else {
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement("a"), { href: url, download: `tree.${ext}` });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      _closeExportDialog();
    }
    const btnExportGraphic = document.getElementById("btn-export-graphic");
    const exportGraphicOverlay = document.getElementById("export-graphic-overlay");
    const exportGraphicBody = document.getElementById("export-graphic-body");
    const exportGraphicFooter = document.getElementById("export-graphic-footer");
    document.getElementById("export-graphic-close").addEventListener("click", _closeGraphicsDialog);
    btnExportGraphic.addEventListener("click", _openGraphicsDialog);
    function _openGraphicsDialog() {
      if (!graph) return;
      exportGraphicOverlay.classList.add("open");
      _buildGraphicsDialog();
    }
    function _closeGraphicsDialog() {
      exportGraphicOverlay.classList.remove("open");
    }
    function _buildGraphicsDialog() {
      const { totalW, totalH } = viewportDims({ canvas, axisCanvas, legendLeftCanvas, legendRightCanvas });
      const defPx = Math.round(totalW * 2);
      const defH = Math.round(totalH * 2);
      exportGraphicBody.innerHTML = `
      <div class="expg-row">
        <span class="expg-label">Filename</span>
        <input type="text" id="expg-filename" class="expg-input" value="tree" autocomplete="off" spellcheck="false">
        <span id="expg-ext-hint" style="font-size:0.82rem;color:var(--bs-secondary-color);flex-shrink:0">.svg</span>
      </div>
      <div class="expg-row">
        <span class="expg-label">Format</span>
        <div class="expg-radios">
          <label class="expg-radio"><input type="radio" name="expg-fmt" value="svg" checked>&nbsp;SVG (vector)</label>
          <label class="expg-radio"><input type="radio" name="expg-fmt" value="png">&nbsp;PNG (raster)</label>
        </div>
      </div>
      <div class="expg-row">
        <span class="expg-label">View</span>
        <div class="expg-radios">
          <label class="expg-radio"><input type="radio" name="expg-view" value="current" checked>&nbsp;Current view</label>
          <label class="expg-radio"><input type="radio" name="expg-view" value="full">&nbsp;Full tree</label>
        </div>
      </div>
      <div class="expg-row">
        <span class="expg-label">Background</span>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="expg-bg" checked>&nbsp;Include background colour
        </label>
      </div>
      <div id="expg-png-opts" style="display:none">
        <p class="expg-hint">Output size: ${defPx} \xD7 ${defH} px (2\xD7 current viewport)</p>
      </div>`;
      exportGraphicFooter.innerHTML = `
      <button id="expg-cancel-btn"   class="btn btn-sm btn-secondary">Cancel</button>
      <button id="expg-download-btn" class="btn btn-sm btn-primary"><i class="bi bi-${_graphicsSaveHandler ? "folder-check" : "download"} me-1"></i>${_graphicsSaveHandler ? "Export" : "Download"}</button>`;
      const _updateExpgHint = () => {
        const { totalW: totalW2, totalH: totalH2, axH, axVisible } = viewportDims({ canvas, axisCanvas, legendLeftCanvas, legendRightCanvas });
        const isFull = document.querySelector('input[name="expg-view"]:checked')?.value === "full";
        const ph = isFull ? Math.round((renderer.paddingTop + renderer.paddingBottom + (renderer.maxY + 1) * renderer.scaleY + (axVisible ? axH : 0)) * 2) : Math.round(totalH2 * 2);
        const pw = Math.round(totalW2 * 2);
        const p = document.querySelector("#expg-png-opts p");
        if (p) p.textContent = `Output size: ${pw} \xD7 ${ph} px (2\xD7 ${isFull ? "full tree height" : "current viewport"})`;
      };
      document.querySelectorAll('input[name="expg-fmt"]').forEach((r) => r.addEventListener("change", () => {
        const isPng = document.querySelector('input[name="expg-fmt"]:checked')?.value === "png";
        document.getElementById("expg-png-opts").style.display = isPng ? "block" : "none";
        document.getElementById("expg-ext-hint").textContent = isPng ? ".png" : ".svg";
        if (isPng) _updateExpgHint();
      }));
      document.querySelectorAll('input[name="expg-view"]').forEach((r) => r.addEventListener("change", _updateExpgHint));
      document.getElementById("expg-cancel-btn").addEventListener("click", _closeGraphicsDialog);
      document.getElementById("expg-download-btn").addEventListener("click", _doGraphicsExport);
    }
    function _doGraphicsExport() {
      const fmt = document.querySelector('input[name="expg-fmt"]:checked')?.value || "svg";
      const filename = document.getElementById("expg-filename")?.value.trim() || "tree";
      const fullTree = document.querySelector('input[name="expg-view"]:checked')?.value === "full";
      const transparent = !(document.getElementById("expg-bg")?.checked ?? true);
      if (fmt === "png") {
        const { totalW, totalH, axH, axVisible } = viewportDims({ canvas, axisCanvas, legendLeftCanvas, legendRightCanvas });
        const targetW = Math.round(totalW * 2);
        const targetH = fullTree ? Math.round((renderer.paddingTop + renderer.paddingBottom + (renderer.maxY + 1) * renderer.scaleY + (axVisible ? axH : 0)) * 2) : Math.round(totalH * 2);
        compositeViewPng({ renderer, canvas, axisCanvas, legendLeftCanvas, legendRightCanvas, axisRenderer }, targetW, targetH, fullTree, transparent).convertToBlob({ type: "image/png" }).then(async (blob) => {
          if (_graphicsSaveHandler) {
            const arrayBuf = await blob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuf);
            let binary = "";
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            _graphicsSaveHandler({
              contentBase64: btoa(binary),
              base64: true,
              filename: `${filename}.png`,
              mimeType: "image/png",
              filterName: "PNG images",
              extensions: ["png"]
            });
          } else {
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement("a"), { href: url, download: `${filename}.png` });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
        });
      } else {
        const svgStr = buildGraphicSVG({ renderer, legendRenderer, canvas, axisCanvas, legendLeftCanvas, legendRightCanvas, axisRenderer }, fullTree, transparent);
        if (!svgStr) return;
        if (_graphicsSaveHandler) {
          _graphicsSaveHandler({
            content: svgStr,
            base64: false,
            filename: `${filename}.svg`,
            mimeType: "image/svg+xml",
            filterName: "SVG images",
            extensions: ["svg"]
          });
        } else {
          const blob = new Blob([svgStr], { type: "image/svg+xml" });
          const url = URL.createObjectURL(blob);
          const a = Object.assign(document.createElement("a"), { href: url, download: `${filename}.svg` });
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }
      _closeGraphicsDialog();
    }
    function _updateLabelDpRow(rowEl, annotKey, schema) {
      if (!rowEl) return;
      const SYNTHETIC = [CAL_DATE_KEY, CAL_DATE_HPD_KEY, CAL_DATE_HPD_ONLY_KEY];
      const dt = schema?.get(annotKey)?.dataType;
      const isNumeric = annotKey && annotKey !== "names" && annotKey !== "" && !SYNTHETIC.includes(annotKey) && ["real", "integer", "proportion", "percentage"].includes(dt);
      rowEl.style.display = isNumeric ? "" : "none";
    }
    function _refreshAnnotationUIs(schema) {
      function repopulate(sel, { isLegend = false, filter = "all" } = {}) {
        const prev = sel.value;
        while (sel.options.length > 1) sel.remove(1);
        for (const [name, def] of schema) {
          if (name === "user_colour") continue;
          if (def.dataType === "list") continue;
          if (def.groupMember) continue;
          if (filter === "tips" && !def.onTips) continue;
          if (filter === "nodes" && !def.onNodes) continue;
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          sel.appendChild(opt);
        }
        sel.disabled = false;
        sel.value = [...sel.options].some((o) => o.value === prev) ? prev : isLegend ? "" : "user_colour";
      }
      repopulate(tipColourBy, { filter: "tips" });
      repopulate(nodeColourBy, { filter: "nodes" });
      repopulate(labelColourBy, { filter: "tips" });
      repopulate(tipLabelShapeColourBy, { filter: "tips" });
      repopulate(tipLabelShape2ColourBy, { filter: "tips" });
      repopulate(legendAnnotEl, { isLegend: true });
      repopulate(legend2AnnotEl, { isLegend: true });
      {
        const prev = tipLabelShow.value;
        while (tipLabelShow.options.length > 2) tipLabelShow.remove(2);
        for (const [name, def] of schema) {
          if (def.dataType === "list") continue;
          if (def.groupMember) continue;
          if (!def.onTips) continue;
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          tipLabelShow.appendChild(opt);
        }
        if (calibration.isActive) {
          const _optCal = document.createElement("option");
          _optCal.value = CAL_DATE_KEY;
          _optCal.textContent = "Calendar date";
          tipLabelShow.appendChild(_optCal);
          if (schema.get("height")?.group?.hpd) {
            const _optHpd = document.createElement("option");
            _optHpd.value = CAL_DATE_HPD_KEY;
            _optHpd.textContent = "Calendar date + HPDs";
            tipLabelShow.appendChild(_optHpd);
            const _optHpdOnly = document.createElement("option");
            _optHpdOnly.value = CAL_DATE_HPD_ONLY_KEY;
            _optHpdOnly.textContent = "Calendar date HPDs";
            tipLabelShow.appendChild(_optHpdOnly);
          }
        }
        tipLabelShow.disabled = false;
        tipLabelShow.value = [...tipLabelShow.options].some((o) => o.value === prev) ? prev : "names";
        tipLabelControlsEl.style.display = tipLabelShow.value === "off" ? "none" : "";
        if (renderer) {
          renderer.setTipLabelsOff(tipLabelShow.value === "off");
          if (tipLabelShow.value !== "off") renderer.setTipLabelAnnotation(tipLabelShow.value === "names" ? null : tipLabelShow.value);
        }
      }
      {
        const prev = nodeLabelShowEl.value;
        while (nodeLabelShowEl.options.length > 1) nodeLabelShowEl.remove(1);
        for (const [name, def] of schema) {
          if (def.dataType === "list") continue;
          if (def.groupMember) continue;
          if (!def.onNodes) continue;
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          nodeLabelShowEl.appendChild(opt);
        }
        if (calibration.isActive) {
          const _optCal = document.createElement("option");
          _optCal.value = CAL_DATE_KEY;
          _optCal.textContent = "Calendar date";
          nodeLabelShowEl.appendChild(_optCal);
          if (schema.get("height")?.group?.hpd) {
            const _optHpd = document.createElement("option");
            _optHpd.value = CAL_DATE_HPD_KEY;
            _optHpd.textContent = "Calendar date + HPDs";
            nodeLabelShowEl.appendChild(_optHpd);
            const _optHpdOnly = document.createElement("option");
            _optHpdOnly.value = CAL_DATE_HPD_ONLY_KEY;
            _optHpdOnly.textContent = "Calendar date HPDs";
            nodeLabelShowEl.appendChild(_optHpdOnly);
          }
        }
        nodeLabelShowEl.disabled = false;
        nodeLabelShowEl.value = [...nodeLabelShowEl.options].some((o) => o.value === prev) ? prev : "";
        if (renderer) renderer.setNodeLabelAnnotation(nodeLabelShowEl.value || null);
      }
      _syncControlVisibility();
      _updatePaletteSelect(tipPaletteSelect, tipPaletteRow, tipColourBy.value);
      _updatePaletteSelect(nodePaletteSelect, nodePaletteRow, nodeColourBy.value);
      _updatePaletteSelect(labelPaletteSelect, labelPaletteRow, labelColourBy.value);
      _updatePaletteSelect(tipLabelShapePaletteSelect, tipLabelShapePaletteRow, tipLabelShapeColourBy.value);
      _updatePaletteSelect(tipLabelShape2PaletteSelect, tipLabelShape2PaletteRow, tipLabelShape2ColourBy.value);
      if (btnClearUserColour) {
        setEnabled("tree-clear-colours", schema.has("user_colour"));
      }
      const heightDef = schema ? schema.get("height") : null;
      const hasNodeBars = !!(heightDef && heightDef.group && heightDef.group.hpd);
      if (nodeBarsControlsEl) nodeBarsControlsEl.style.display = hasNodeBars ? "" : "none";
      if (nodeBarsUnavailEl) nodeBarsUnavailEl.style.display = hasNodeBars ? "none" : "block";
      if (!hasNodeBars && nodeBarsShowEl.value === "on") {
        nodeBarsShowEl.value = "off";
        if (renderer) {
          renderer.setSettings(_buildRendererSettings());
          renderer._dirty = true;
        }
      }
      _updateLabelDpRow(tipLabelDpRowEl, tipLabelShow.value, schema);
      _updateLabelDpRow(nodeLabelDpRowEl, nodeLabelShowEl.value, schema);
    }
    async function loadTree(text, filename) {
      setModalLoading(true);
      setModalError(null);
      _loadedFilename = filename || null;
      await new Promise((r) => setTimeout(r, 0));
      try {
        let _populateColourBy = function(sel, filter = "all") {
          while (sel.options.length > 0) sel.remove(0);
          const uc = document.createElement("option");
          uc.value = "user_colour";
          uc.textContent = "user colour";
          sel.appendChild(uc);
          for (const [name, def] of schema) {
            if (name === "user_colour") continue;
            if (def.dataType === "list") continue;
            if (def.groupMember) continue;
            if (filter === "tips" && !def.onTips) continue;
            if (filter === "nodes" && !def.onNodes) continue;
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            sel.appendChild(opt);
          }
          sel.disabled = false;
          sel.value = "user_colour";
        };
        let parsedRoot = null;
        const nexusTrees = parseNexus(text);
        const _fileSettings = nexusTrees.length > 0 ? nexusTrees[0].peartreeSettings || null : null;
        if (nexusTrees.length > 0) {
          parsedRoot = nexusTrees[0].root;
        } else {
          const trimmed = text.trim();
          if (trimmed.startsWith("(")) {
            parsedRoot = parseNewick(trimmed);
          } else {
            throw new Error("No trees found. File must be in NEXUS or Newick format.");
          }
        }
        {
          let totalBranches = 0;
          let missingLengths = 0;
          const _stack = parsedRoot.children ? [...parsedRoot.children] : [];
          while (_stack.length) {
            const n = _stack.pop();
            totalBranches++;
            if (n.length === void 0) missingLengths++;
            if (n.children) for (const c of n.children) _stack.push(c);
          }
          if (totalBranches > 0 && missingLengths > 0) {
            setModalLoading(false);
            const allMissing = missingLengths === totalBranches;
            const msg = allMissing ? `This tree has no branch lengths (${totalBranches} branch${totalBranches !== 1 ? "es" : ""} checked). Without branch lengths the tree cannot be displayed.

Assign a branch length of 1.0 to every branch so the tree can be shown as a cladogram?` : `${missingLengths} of ${totalBranches} branches are missing branch lengths. They will be treated as zero, which may cause nodes to overlap.

Assign 1.0 to the ${missingLengths} missing branch${missingLengths !== 1 ? "es" : ""}?`;
            const assign = await showConfirmDialog(
              "Missing branch lengths",
              msg,
              { okLabel: "Assign 1.0", cancelLabel: "Cancel" }
            );
            if (!assign) {
              setModalLoading(false);
              if (!treeLoaded) showEmptyState();
              return;
            }
            const _fixStack = parsedRoot.children ? [...parsedRoot.children] : [];
            while (_fixStack.length) {
              const n = _fixStack.pop();
              if (n.length === void 0) n.length = 1;
              if (n.children) for (const c of n.children) _fixStack.push(c);
            }
            setModalLoading(true);
          }
        }
        {
          let _collectNodeLabels = function(node) {
            if (node.annotations && "_node_label" in node.annotations) labelledNodes.push(node);
            if (node.children) for (const c of node.children) _collectNodeLabels(c);
          };
          const labelledNodes = [];
          _collectNodeLabels(parsedRoot);
          if (labelledNodes.length > 0) {
            const allNumeric = labelledNodes.every((n) => !isNaN(parseFloat(n.annotations["_node_label"])));
            const defaultName = allNumeric ? "bootstrap" : "label";
            const chosen = (prompt(
              `This tree has labels on ${labelledNodes.length} internal node(s).
What annotation name should these be stored as?`,
              defaultName
            ) ?? defaultName).trim() || defaultName;
            for (const n of labelledNodes) {
              const raw = n.annotations["_node_label"];
              delete n.annotations["_node_label"];
              const num = parseFloat(raw);
              n.annotations[chosen] = !isNaN(num) ? num : raw;
            }
          }
        }
        graph = fromNestedRoot(parsedRoot);
        renderer.hiddenNodeIds = graph.hiddenNodeIds;
        renderer.graph = graph;
        currentOrder = null;
        if (_fileSettings) _applyVisualSettingsFromFile(_fileSettings);
        _cachedMidpoint = null;
        isExplicitlyRooted = graph.rooted;
        document.getElementById("reroot-controls").classList.toggle("visible", !isExplicitlyRooted);
        setEnabled("tree-midpoint", !isExplicitlyRooted);
        setEnabled("tree-reroot", false);
        const schema = graph.annotationSchema;
        _populateColourBy(tipColourBy, "tips");
        _populateColourBy(nodeColourBy, "nodes");
        _populateColourBy(labelColourBy, "tips");
        _populateColourBy(tipLabelShapeColourBy, "tips");
        _populateColourBy(tipLabelShape2ColourBy, "tips");
        while (tipLabelShow.options.length > 2) tipLabelShow.remove(2);
        for (const [name, def] of schema) {
          if (name === "user_colour") continue;
          if (def.dataType === "list") continue;
          if (def.groupMember) continue;
          if (!def.onTips) continue;
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          tipLabelShow.appendChild(opt);
        }
        tipLabelShow.disabled = false;
        tipLabelControlsEl.style.display = tipLabelShow.value === "off" ? "none" : "";
        while (nodeLabelShowEl.options.length > 1) nodeLabelShowEl.remove(1);
        for (const [name, def] of schema) {
          if (name === "user_colour") continue;
          if (def.dataType === "list") continue;
          if (def.groupMember) continue;
          if (!def.onNodes) continue;
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          nodeLabelShowEl.appendChild(opt);
        }
        nodeLabelShowEl.disabled = false;
        while (legendAnnotEl.options.length > 1) legendAnnotEl.remove(1);
        for (const [name, def] of schema) {
          if (name === "user_colour") continue;
          if (def.dataType !== "list") {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            legendAnnotEl.appendChild(opt);
          }
        }
        legendAnnotEl.value = "";
        legendAnnotEl.disabled = schema.size === 0;
        while (legend2AnnotEl.options.length > 1) legend2AnnotEl.remove(1);
        for (const [name, def] of schema) {
          if (name === "user_colour") continue;
          if (def.dataType !== "list") {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            legend2AnnotEl.appendChild(opt);
          }
        }
        legend2AnnotEl.value = "";
        legend2AnnotEl.disabled = schema.size === 0;
        if (btnClearUserColour) {
          setEnabled("tree-clear-colours", schema.has("user_colour"));
        }
        const _eff = _fileSettings || _saved;
        const _hasOpt = (sel, key) => key && [...sel.options].some((o) => o.value === key);
        tipColourBy.value = _hasOpt(tipColourBy, _eff.tipColourBy) ? _eff.tipColourBy : "user_colour";
        nodeColourBy.value = _hasOpt(nodeColourBy, _eff.nodeColourBy) ? _eff.nodeColourBy : "user_colour";
        labelColourBy.value = _hasOpt(labelColourBy, _eff.labelColourBy) ? _eff.labelColourBy : "user_colour";
        tipLabelShapeColourBy.value = _hasOpt(tipLabelShapeColourBy, _eff.tipLabelShapeColourBy) ? _eff.tipLabelShapeColourBy : "user_colour";
        tipLabelShape2ColourBy.value = _hasOpt(tipLabelShape2ColourBy, _eff.tipLabelShape2ColourBy) ? _eff.tipLabelShape2ColourBy : "user_colour";
        legendAnnotEl.value = _hasOpt(legendAnnotEl, _eff.legendAnnotation) ? _eff.legendAnnotation : "";
        legend2AnnotEl.value = _hasOpt(legend2AnnotEl, _eff.legendAnnotation2) ? _eff.legendAnnotation2 : "";
        tipLabelShow.value = _hasOpt(tipLabelShow, _eff.tipLabelShow) ? _eff.tipLabelShow : "names";
        tipLabelControlsEl.style.display = tipLabelShow.value === "off" ? "none" : "";
        nodeLabelShowEl.value = _hasOpt(nodeLabelShowEl, _eff.nodeLabelAnnotation) ? _eff.nodeLabelAnnotation : "";
        if (_fileSettings?.nodeOrder === "asc" || _fileSettings?.nodeOrder === "desc") {
          const asc = _fileSettings.nodeOrder === "asc";
          reorderGraph(graph, asc);
          currentOrder = _fileSettings.nodeOrder;
        }
        renderer.setAnnotationSchema(schema);
        {
          const _hDef = schema ? schema.get("height") : null;
          const _hasNB = !!(_hDef && _hDef.group && _hDef.group.hpd);
          if (nodeBarsControlsEl) nodeBarsControlsEl.style.display = _hasNB ? "" : "none";
          if (nodeBarsUnavailEl) nodeBarsUnavailEl.style.display = _hasNB ? "none" : "block";
          if (!_hasNB && nodeBarsShowEl && nodeBarsShowEl.value === "on") nodeBarsShowEl.value = "off";
        }
        if (_eff.annotationPalettes) {
          for (const [k, v] of Object.entries(_eff.annotationPalettes)) {
            annotationPalettes.set(k, v);
          }
        }
        for (const [k, v] of annotationPalettes) {
          renderer.setAnnotationPalette(k, v);
        }
        renderer.setTipColourBy(tipColourBy.value || null);
        renderer.setNodeColourBy(nodeColourBy.value || null);
        renderer.setLabelColourBy(labelColourBy.value || null);
        renderer.setTipLabelShapeColourBy(tipLabelShapeColourBy.value || null);
        renderer.setTipLabelShape2ColourBy(tipLabelShape2ColourBy.value || null);
        renderer.setTipLabelsOff(tipLabelShow.value === "off");
        if (tipLabelShow.value !== "off") renderer.setTipLabelAnnotation(tipLabelShow.value === "names" ? null : tipLabelShow.value);
        renderer.setNodeLabelAnnotation(nodeLabelShowEl.value || null);
        _updatePaletteSelect(tipPaletteSelect, tipPaletteRow, tipColourBy.value);
        _updatePaletteSelect(nodePaletteSelect, nodePaletteRow, nodeColourBy.value);
        _updatePaletteSelect(labelPaletteSelect, labelPaletteRow, labelColourBy.value);
        _updatePaletteSelect(tipLabelShapePaletteSelect, tipLabelShapePaletteRow, tipLabelShapeColourBy.value);
        _updatePaletteSelect(tipLabelShape2PaletteSelect, tipLabelShape2PaletteRow, tipLabelShape2ColourBy.value);
        applyLegend();
        const layout = computeLayoutFromGraph(graph, null, { clampNegativeBranches: clampNegBranchesEl.value === "on" });
        renderer.setData(layout.nodes, layout.nodeMap, layout.maxX, layout.maxY);
        const _isTimedTree = schema.has("height");
        const _rootHeight = _isTimedTree ? layout.maxX : 0;
        axisRenderer.setTreeParams({ maxX: layout.maxX, isTimedTree: _isTimedTree, rootHeight: _rootHeight });
        axisRenderer.setHeightFormatter(schema.get("height")?.fmt ?? null);
        while (axisDateAnnotEl.options.length > 1) axisDateAnnotEl.remove(1);
        for (const [name, def] of schema) {
          const isDate = def.dataType === "date";
          const isDecimalYear = (def.dataType === "real" || def.dataType === "integer") && def.min >= 1e3 && def.max <= 3e3;
          if (isDate || isDecimalYear) {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            axisDateAnnotEl.appendChild(opt);
          }
        }
        const _hasDateAnnotations = axisDateAnnotEl.options.length > 1;
        axisDateRow.style.display = _hasDateAnnotations ? "flex" : "none";
        axisDateAnnotEl.disabled = !_hasDateAnnotations;
        const _savedAxisDate = _eff.axisDateAnnotation || "";
        const _canRestoreDate = _hasDateAnnotations && _savedAxisDate && [...axisDateAnnotEl.options].some((o) => o.value === _savedAxisDate);
        axisDateAnnotEl.value = _canRestoreDate ? _savedAxisDate : "";
        calibration.setAnchor(_canRestoreDate ? _savedAxisDate : null, layout.nodeMap, layout.maxX);
        axisDateFmtRow.style.display = calibration.isActive ? "flex" : "none";
        if (calibration.isActive) {
          const _hasHpd = !!schema.get("height")?.group?.hpd;
          for (const _sel of [tipLabelShow, nodeLabelShowEl]) {
            if (![..._sel.options].some((o) => o.value === CAL_DATE_KEY)) {
              const _o = document.createElement("option");
              _o.value = CAL_DATE_KEY;
              _o.textContent = "Calendar date";
              _sel.appendChild(_o);
            }
            if (_hasHpd && ![..._sel.options].some((o) => o.value === CAL_DATE_HPD_KEY)) {
              const _o = document.createElement("option");
              _o.value = CAL_DATE_HPD_KEY;
              _o.textContent = "Calendar date + HPDs";
              _sel.appendChild(_o);
            }
            if (_hasHpd && ![..._sel.options].some((o) => o.value === CAL_DATE_HPD_ONLY_KEY)) {
              const _o = document.createElement("option");
              _o.value = CAL_DATE_HPD_ONLY_KEY;
              _o.textContent = "Calendar date HPDs";
              _sel.appendChild(_o);
            }
          }
          const _calKeys = [CAL_DATE_KEY, CAL_DATE_HPD_KEY, CAL_DATE_HPD_ONLY_KEY];
          if (_calKeys.includes(_eff.tipLabelShow)) {
            tipLabelShow.value = _eff.tipLabelShow;
            renderer.setTipLabelAnnotation(_eff.tipLabelShow);
          }
          if (_calKeys.includes(_eff.nodeLabelAnnotation)) {
            nodeLabelShowEl.value = _eff.nodeLabelAnnotation;
            renderer.setNodeLabelAnnotation(_eff.nodeLabelAnnotation);
          }
        }
        renderer.setCalibration(calibration.isActive ? calibration : null, axisDateFmtEl.value);
        _axisIsTimedTree = _isTimedTree;
        const _hideClamp = _isTimedTree || calibration.isActive;
        if (clampNegBranchesRowEl) clampNegBranchesRowEl.style.display = _hideClamp ? "none" : "";
        if (_hideClamp) clampNegBranchesEl.value = "off";
        _showDateTickRows(axisShowEl.value === "time" && !!axisDateAnnotEl.value);
        applyTickOptions();
        applyAxis();
        renderer.startIntroAnimation();
        renderer._navStack = [];
        renderer._fwdStack = [];
        renderer._viewSubtreeRootId = null;
        renderer._branchSelectNode = null;
        renderer._branchSelectX = null;
        renderer._branchHoverNode = null;
        renderer._branchHoverX = null;
        renderer._selectedTipIds.clear();
        renderer._mrcaNodeId = null;
        tipFilterEl.value = "";
        tipFilterCnt.hidden = true;
        if (!treeLoaded) {
          treeLoaded = true;
          _syncCanvasWrapperBg(canvasBgColorEl.value);
          tipFilterEl.disabled = false;
          tipColourPickerEl.disabled = false;
          const _btnHypUp = document.getElementById("btn-hyp-up");
          const _btnHypDown = document.getElementById("btn-hyp-down");
          if (_btnHypUp) _btnHypUp.disabled = false;
          if (_btnHypDown) _btnHypDown.disabled = false;
          document.getElementById("btn-mode-nodes").disabled = false;
          document.getElementById("btn-mode-branches").disabled = false;
          btnDataTable.disabled = false;
          emptyStateEl.classList.add("hidden");
          if (axisShowEl.value !== "off") axisCanvas.style.display = "block";
          setEnabled("import-annot", true);
          setEnabled("curate-annot", true);
          setEnabled("export-tree", true);
          setEnabled("export-image", true);
          setEnabled("view-zoom-in", true);
          setEnabled("view-zoom-out", true);
          setEnabled("view-fit", true);
          setEnabled("view-fit-labels", true);
          setEnabled("tree-order-up", true);
          setEnabled("tree-order-down", true);
        }
        renderer.setMode(_eff.mode === "branches" ? "branches" : "nodes");
        if (_fileSettings) saveSettings();
        if (!controlsBound) {
          bindControls();
          controlsBound = true;
        }
        if (renderer._onNavChange) renderer._onNavChange(false, false);
        if (renderer._onBranchSelectChange) renderer._onBranchSelectChange(false);
        if (renderer._onNodeSelectChange) renderer._onNodeSelectChange(false);
        document.getElementById("btn-order-asc").classList.toggle("active", currentOrder === "desc");
        document.getElementById("btn-order-desc").classList.toggle("active", currentOrder === "asc");
        const _restoredMode = renderer._mode;
        document.getElementById("btn-mode-nodes").classList.toggle("active", _restoredMode === "nodes");
        document.getElementById("btn-mode-branches").classList.toggle("active", _restoredMode === "branches");
        _syncControlVisibility();
        closeModal();
      } catch (err) {
        if (modal.classList.contains("open")) {
          setModalError(err.message);
        } else {
          showErrorDialog(err.message);
        }
      }
      setModalLoading(false);
    }
    function applyOrder(ascending) {
      const label = ascending ? "asc" : "desc";
      if (currentOrder === label) return;
      const isZoomed = renderer._targetScaleY > renderer.minScaleY * 1.005;
      const zoomRatio = renderer._targetScaleY / renderer.minScaleY;
      const anchorId = isZoomed ? renderer.nodeIdAtViewportCenter() : null;
      reorderGraph(graph, ascending);
      const layout = computeLayoutFromGraph(graph, renderer._viewSubtreeRootId, { clampNegativeBranches: clampNegBranchesEl.value === "on" });
      renderer.setDataAnimated(layout.nodes, layout.nodeMap, layout.maxX, layout.maxY);
      if (isZoomed && anchorId) {
        const H = renderer.canvas.clientHeight;
        const newScaleY = renderer.minScaleY * zoomRatio;
        const anchorNode = layout.nodeMap.get(anchorId);
        if (anchorNode) {
          const rawOffsetY = H / 2 - anchorNode.y * newScaleY;
          renderer._setTarget(
            rawOffsetY,
            newScaleY,
            /*immediate*/
            false
          );
        }
      }
      currentOrder = label;
      document.getElementById("btn-order-asc").classList.toggle("active", !ascending);
      document.getElementById("btn-order-desc").classList.toggle("active", ascending);
      saveSettings();
    }
    function bindControls() {
      const btnBack = document.getElementById("btn-back");
      const btnForward = document.getElementById("btn-forward");
      const btnHome = document.getElementById("btn-home");
      const btnDrill = document.getElementById("btn-drill");
      const btnClimb = document.getElementById("btn-climb");
      const btnOrderAsc = document.getElementById("btn-order-asc");
      const btnOrderDesc = document.getElementById("btn-order-desc");
      const btnReroot = document.getElementById("btn-reroot");
      const btnRotate = document.getElementById("btn-rotate");
      const btnRotateAll = document.getElementById("btn-rotate-all");
      const btnHide = document.getElementById("btn-hide");
      const btnShow = document.getElementById("btn-show");
      const btnNodeInfo = document.getElementById("btn-node-info");
      let _filterTimer = null;
      function _applyTipFilter() {
        clearTimeout(_filterTimer);
        _filterTimer = null;
        const q = tipFilterEl.value.trim().toLowerCase();
        if (!q) {
          renderer._selectedTipIds.clear();
          renderer._mrcaNodeId = null;
          if (renderer._onNodeSelectChange) renderer._onNodeSelectChange(false);
          tipFilterCnt.hidden = true;
          renderer._dirty = true;
          return;
        }
        const matches = [];
        if (renderer.nodeMap) {
          for (const [id, n] of renderer.nodeMap) {
            if (!n.isTip) continue;
            const label = renderer._tipLabelText(n) ?? n.name ?? "";
            if (label.toLowerCase().includes(q)) {
              matches.push(n);
            }
          }
        }
        renderer._selectedTipIds = new Set(matches.map((n) => n.id));
        renderer._mrcaNodeId = null;
        if (renderer._onNodeSelectChange) renderer._onNodeSelectChange(matches.length > 0);
        tipFilterCnt.textContent = `${matches.length}`;
        tipFilterCnt.hidden = false;
        renderer._dirty = true;
        if (matches.length > 0 && renderer._targetScaleY > renderer.minScaleY * 1.01) {
          const top = matches.reduce((a, b) => a.y < b.y ? a : b);
          const newOffsetY = renderer.paddingTop + 10 - top.y * renderer._targetScaleY;
          renderer._setTarget(newOffsetY, renderer._targetScaleY, false);
        }
      }
      tipFilterEl.addEventListener("input", () => {
        clearTimeout(_filterTimer);
        _filterTimer = setTimeout(_applyTipFilter, 300);
      });
      tipFilterEl.addEventListener("blur", () => {
        clearTimeout(_filterTimer);
        _applyTipFilter();
      });
      tipFilterEl.addEventListener("search", _applyTipFilter);
      function _selectedNodeId() {
        if (renderer._mrcaNodeId) return renderer._mrcaNodeId;
        if (renderer._selectedTipIds.size === 1) return [...renderer._selectedTipIds][0];
        return null;
      }
      function canHide() {
        if (!graph) return false;
        if (renderer._selectedTipIds.size > 1) {
          if (!renderer.nodes) return false;
          const sel = renderer._selectedTipIds;
          if (![...sel].some((id) => !graph.hiddenNodeIds.has(id))) return false;
          const remaining = renderer.nodes.filter(
            (n) => n.isTip && !sel.has(n.id) && !graph.hiddenNodeIds.has(n.id)
          ).length;
          return remaining >= 2;
        }
        const nodeId = _selectedNodeId();
        if (!nodeId || !renderer.nodeMap) return false;
        const node = renderer.nodeMap.get(nodeId);
        if (!node || !node.parentId) return false;
        if (graph.hiddenNodeIds.has(nodeId)) return false;
        const parent = renderer.nodeMap.get(node.parentId);
        if (!parent || parent.children.filter((cid) => cid !== nodeId).length < 1) return false;
        const viewSubtreeRootId = renderer._viewSubtreeRootId;
        if (viewSubtreeRootId) {
          const subtreeIdx = graph.origIdToIdx.get(viewSubtreeRootId);
          if (subtreeIdx !== void 0) {
            for (const adjIdx of graph.nodes[subtreeIdx].adjacents.slice(1)) {
              if (graphVisibleTipCount(graph, adjIdx, subtreeIdx, nodeId) === 0) return false;
            }
          }
          return true;
        }
        const { nodeA, nodeB, lenA } = graph.root;
        let countA, countB;
        if (lenA === 0) {
          countA = 0;
          for (const adj of graph.nodes[nodeA].adjacents) {
            if (adj !== nodeB) countA += graphVisibleTipCount(graph, adj, nodeA, nodeId);
          }
          countB = graphVisibleTipCount(graph, nodeB, nodeA, nodeId);
        } else {
          countA = graphVisibleTipCount(graph, nodeA, nodeB, nodeId);
          countB = graphVisibleTipCount(graph, nodeB, nodeA, nodeId);
        }
        if (countA + countB < 2) return false;
        return true;
      }
      function _resolveGraphStart(nodeId) {
        const gIdx = graph.origIdToIdx.get(nodeId);
        if (gIdx === void 0) return null;
        const { nodeA, lenA } = graph.root;
        const isRoot = lenA === 0 && gIdx === nodeA;
        const gFromIdx = isRoot ? -1 : graph.nodes[gIdx].adjacents[0];
        return { gIdx, gFromIdx };
      }
      function _prevStackIsDownward() {
        if (!renderer._navStack.length || !renderer.nodeMap) return false;
        const prevId = renderer._navStack[renderer._navStack.length - 1].subtreeRootId;
        if (!prevId) return false;
        const prevNode = renderer.nodeMap.get(prevId);
        return !!(prevNode && prevNode.parentId);
      }
      function canDrill() {
        if (!renderer.nodeMap) return false;
        const nodeId = _selectedNodeId();
        if (!nodeId) return _prevStackIsDownward();
        const node = renderer.nodeMap.get(nodeId);
        return !!(node && !node.isTip && node.parentId);
      }
      function canClimb() {
        return !!renderer._viewSubtreeRootId;
      }
      function canShow() {
        if (!graph || !graph.hiddenNodeIds.size) return false;
        const nodeId = _selectedNodeId();
        const viewSubtreeRootId = renderer._viewSubtreeRootId;
        if (viewSubtreeRootId) {
          const subtreeIdx = graph.origIdToIdx.get(viewSubtreeRootId);
          if (subtreeIdx === void 0) return false;
          const fromIdx = graph.nodes[subtreeIdx].adjacents[0] ?? -1;
          if (!nodeId) return graphSubtreeHasHidden(graph, subtreeIdx, fromIdx);
          const gs2 = _resolveGraphStart(nodeId);
          if (!gs2) return false;
          return graphSubtreeHasHidden(graph, gs2.gIdx, gs2.gFromIdx);
        }
        if (!nodeId) return true;
        const gs = _resolveGraphStart(nodeId);
        if (!gs) return graph.hiddenNodeIds.size > 0;
        return graphSubtreeHasHidden(graph, gs.gIdx, gs.gFromIdx);
      }
      document.getElementById("btn-zoom-in").addEventListener("click", () => renderer.zoomIn());
      document.getElementById("btn-zoom-out").addEventListener("click", () => renderer.zoomOut());
      document.getElementById("btn-hyp-up")?.addEventListener("click", () => renderer.hypMagUp());
      document.getElementById("btn-hyp-down")?.addEventListener("click", () => renderer.hypMagDown());
      renderer._onNavChange = (canBack, canFwd) => {
        setEnabled("view-back", canBack);
        setEnabled("view-forward", canFwd);
        setEnabled("view-home", !!renderer._viewSubtreeRootId);
        setEnabled("view-drill", canDrill());
        setEnabled("view-climb", canClimb());
      };
      renderer._onBranchSelectChange = (hasSelection) => {
        if (renderer._mode === "branches") {
          setEnabled("tree-reroot", !isExplicitlyRooted && hasSelection);
        }
      };
      renderer._onNodeSelectChange = (hasSelection) => {
        if (renderer._mode === "nodes") {
          setEnabled("tree-reroot", !isExplicitlyRooted && hasSelection);
        }
        const canRotate = renderer._mode === "nodes" && hasSelection;
        setEnabled("view-info", !!graph);
        setEnabled("view-drill", canDrill());
        setEnabled("view-climb", canClimb());
        setEnabled("tree-rotate", canRotate);
        setEnabled("tree-rotate-all", canRotate);
        setEnabled("tree-hide", canHide());
        setEnabled("tree-show", canShow());
        setEnabled("tree-paint", hasSelection);
        dataTableRenderer.syncSelection(renderer._selectedTipIds);
      };
      btnBack.addEventListener("click", () => renderer.navigateBack());
      btnForward.addEventListener("click", () => renderer.navigateForward());
      btnHome.addEventListener("click", () => renderer.navigateHome());
      btnDrill.addEventListener("click", () => {
        const nodeId = _selectedNodeId();
        if (nodeId && canDrill()) renderer.navigateInto(nodeId);
        else if (!nodeId && _prevStackIsDownward()) {
          renderer.navigateBack();
          renderer._rootShiftFromX = renderer.offsetX;
          renderer._rootShiftToX = renderer._targetOffsetX;
          renderer._rootShiftAlpha = 0;
        }
      });
      btnClimb.addEventListener("click", () => renderer.navigateClimb());
      btnOrderAsc.addEventListener("click", () => applyOrder(false));
      btnOrderDesc.addEventListener("click", () => applyOrder(true));
      function applyRotate(recursive) {
        let nodeId = renderer._mrcaNodeId;
        if (!nodeId && renderer._selectedTipIds.size === 1) {
          const tipId = [...renderer._selectedTipIds][0];
          const tipNode = renderer.nodeMap.get(tipId);
          nodeId = tipNode?.parentId ?? null;
        }
        if (!nodeId) return;
        rotateNodeGraph(graph, nodeId, recursive);
        currentOrder = null;
        btnOrderAsc.classList.remove("active");
        btnOrderDesc.classList.remove("active");
        const layout = computeLayoutFromGraph(graph, renderer._viewSubtreeRootId, { clampNegativeBranches: clampNegBranchesEl.value === "on" });
        renderer.setDataAnimated(layout.nodes, layout.nodeMap, layout.maxX, layout.maxY);
        saveSettings();
      }
      btnRotate.addEventListener("click", () => applyRotate(false));
      btnRotateAll.addEventListener("click", () => applyRotate(true));
      function _seedRootShiftAnimation(oldRoot, oldNodeMap, newNodes, direction) {
        if (renderer._viewSubtreeRootId) return;
        const newRoot = newNodes.find((n) => !n.parentId);
        if (!newRoot || !oldRoot || newRoot.id === oldRoot.id) return;
        const curScaleX = renderer.scaleX;
        const curOffsetX = renderer.offsetX;
        if (direction === "in") {
          const oldNode = oldNodeMap?.get(newRoot.id);
          if (!oldNode) return;
          renderer._rootShiftFromX = curOffsetX + oldNode.x * curScaleX;
        } else {
          const newOldRootNode = renderer.nodeMap?.get(oldRoot.id);
          if (!newOldRootNode) return;
          renderer._rootShiftFromX = curOffsetX - newOldRootNode.x * curScaleX;
        }
        renderer._rootShiftToX = renderer._targetOffsetX;
        renderer._rootShiftAlpha = 0;
        renderer.offsetX = renderer._rootShiftFromX;
        renderer._animating = true;
      }
      function applyHide() {
        if (!canHide()) return;
        const oldRoot = renderer.nodes?.find((n) => !n.parentId) ?? null;
        const oldNodeMap = renderer.nodeMap;
        if (renderer._selectedTipIds.size > 1) {
          const { nodeA, nodeB } = graph.root;
          const rootGuard = /* @__PURE__ */ new Set([nodeA, nodeB]);
          const remaining = /* @__PURE__ */ new Map();
          for (const tipId of renderer._selectedTipIds) {
            if (graph.hiddenNodeIds.has(tipId)) continue;
            const tipIdx = graph.origIdToIdx.get(tipId);
            if (tipIdx === void 0) continue;
            let comingFrom = tipIdx;
            let nodeIdx = graph.nodes[tipIdx].adjacents[0];
            while (nodeIdx !== void 0 && nodeIdx >= 0 && !rootGuard.has(nodeIdx)) {
              if (!remaining.has(nodeIdx)) {
                const count = graph.nodes[nodeIdx].adjacents.slice(1).filter((ci) => !graph.hiddenNodeIds.has(graph.nodes[ci].origId)).length;
                remaining.set(nodeIdx, count - 1);
                break;
              } else {
                const newCount = remaining.get(nodeIdx) - 1;
                remaining.set(nodeIdx, newCount);
                if (newCount > 0) break;
              }
              comingFrom = nodeIdx;
              nodeIdx = graph.nodes[nodeIdx].adjacents[0];
            }
          }
          const hiddenAncestorIds = /* @__PURE__ */ new Set();
          for (const [ni, count] of remaining) {
            if (count === 0) hiddenAncestorIds.add(graph.nodes[ni].origId);
          }
          for (const origId of hiddenAncestorIds) {
            graph.hiddenNodeIds.add(origId);
          }
          for (const tipId of renderer._selectedTipIds) {
            if (graph.hiddenNodeIds.has(tipId)) continue;
            const tipIdx = graph.origIdToIdx.get(tipId);
            if (tipIdx === void 0) continue;
            let covered = false;
            let ni = graph.nodes[tipIdx].adjacents[0];
            while (ni !== void 0 && ni >= 0 && !rootGuard.has(ni)) {
              if (hiddenAncestorIds.has(graph.nodes[ni].origId)) {
                covered = true;
                break;
              }
              if (!remaining.has(ni)) break;
              ni = graph.nodes[ni].adjacents[0];
            }
            if (!covered) graph.hiddenNodeIds.add(tipId);
          }
        } else {
          const nodeId = _selectedNodeId();
          if (!nodeId) return;
          graph.hiddenNodeIds.add(nodeId);
        }
        renderer._selectedTipIds.clear();
        renderer._mrcaNodeId = null;
        if (renderer._onNodeSelectChange) renderer._onNodeSelectChange(false);
        renderer._fwdStack = [];
        if (renderer._onNavChange) renderer._onNavChange(renderer._navStack.length > 0, false);
        currentOrder = null;
        btnOrderAsc.classList.remove("active");
        btnOrderDesc.classList.remove("active");
        const layout = computeLayoutFromGraph(graph, renderer._viewSubtreeRootId, { clampNegativeBranches: clampNegBranchesEl.value === "on" });
        renderer.setDataAnimated(layout.nodes, layout.nodeMap, layout.maxX, layout.maxY);
        _seedRootShiftAnimation(oldRoot, oldNodeMap, layout.nodes, "in");
        renderer.fitToWindow();
      }
      function applyShow() {
        if (!canShow()) return;
        const nodeId = _selectedNodeId();
        const viewSubtreeRootId = renderer._viewSubtreeRootId;
        if (viewSubtreeRootId) {
          const startId = nodeId ?? viewSubtreeRootId;
          const startIdx = graph.origIdToIdx.get(startId);
          if (startIdx !== void 0) {
            let revealSubtree = function(ni, fi) {
              graph.hiddenNodeIds.delete(graph.nodes[ni].origId);
              for (const adj of graph.nodes[ni].adjacents) {
                if (adj !== fi) revealSubtree(adj, ni);
              }
            };
            const fromIdx = graph.nodes[startIdx].adjacents[0] ?? -1;
            revealSubtree(startIdx, fromIdx);
          }
        } else if (!nodeId) {
          graph.hiddenNodeIds.clear();
        } else {
          let revealAll = function(gnodeIdx, fromIdx) {
            for (const adjIdx of graph.nodes[gnodeIdx].adjacents) {
              if (adjIdx === fromIdx) continue;
              graph.hiddenNodeIds.delete(graph.nodes[adjIdx].origId);
              revealAll(adjIdx, gnodeIdx);
            }
          };
          const gs = _resolveGraphStart(nodeId);
          if (gs) {
            revealAll(gs.gIdx, gs.gFromIdx);
          } else {
            revealAll(graph.root.nodeA, graph.root.nodeB);
            revealAll(graph.root.nodeB, graph.root.nodeA);
          }
        }
        renderer._selectedTipIds.clear();
        renderer._mrcaNodeId = null;
        if (renderer._onNodeSelectChange) renderer._onNodeSelectChange(false);
        currentOrder = null;
        btnOrderAsc.classList.remove("active");
        btnOrderDesc.classList.remove("active");
        const oldRoot = renderer.nodes?.find((n) => !n.parentId) ?? null;
        const oldNodeMap = renderer.nodeMap;
        const layout = computeLayoutFromGraph(graph, renderer._viewSubtreeRootId, { clampNegativeBranches: clampNegBranchesEl.value === "on" });
        renderer.setDataAnimated(layout.nodes, layout.nodeMap, layout.maxX, layout.maxY);
        _seedRootShiftAnimation(oldRoot, oldNodeMap, layout.nodes, "out");
        renderer.fitToWindow();
      }
      btnHide.addEventListener("click", () => applyHide());
      btnShow.addEventListener("click", () => applyShow());
      const btnModeNodes = document.getElementById("btn-mode-nodes");
      const btnModeBranches = document.getElementById("btn-mode-branches");
      const applyMode = (mode) => {
        renderer.setMode(mode);
        btnModeNodes.classList.toggle("active", mode === "nodes");
        btnModeBranches.classList.toggle("active", mode === "branches");
        saveSettings();
      };
      btnModeNodes.addEventListener("click", () => applyMode("nodes"));
      btnModeBranches.addEventListener("click", () => applyMode("branches"));
      function applyReroot(childNodeId, distFromParent) {
        rerootOnGraph(graph, childNodeId, distFromParent);
        _cachedMidpoint = null;
        if (currentOrder === "asc") reorderGraph(graph, true);
        if (currentOrder === "desc") reorderGraph(graph, false);
        renderer._navStack = [];
        renderer._fwdStack = [];
        renderer._viewSubtreeRootId = null;
        renderer._branchSelectNode = null;
        renderer._branchSelectX = null;
        renderer._branchHoverNode = null;
        renderer._branchHoverX = null;
        renderer._selectedTipIds.clear();
        renderer._mrcaNodeId = null;
        if (renderer._onBranchSelectChange) renderer._onBranchSelectChange(false);
        if (renderer._onNodeSelectChange) renderer._onNodeSelectChange(false);
        btnReroot.disabled = true;
        const layout = computeLayoutFromGraph(graph, null, { clampNegativeBranches: clampNegBranchesEl.value === "on" });
        renderer.setDataCrossfade(layout.nodes, layout.nodeMap, layout.maxX, layout.maxY);
      }
      btnReroot.addEventListener("click", () => {
        let targetNode, distFromParent;
        if (renderer._mode === "branches") {
          const selNode = renderer._branchSelectNode;
          const selX = renderer._branchSelectX;
          if (!selNode || selX === null) return;
          const parentLayoutNode = renderer.nodeMap.get(selNode.parentId);
          if (!parentLayoutNode) return;
          targetNode = selNode;
          distFromParent = selX - parentLayoutNode.x;
        } else {
          let nodeId;
          if (renderer._selectedTipIds.size === 1) {
            nodeId = [...renderer._selectedTipIds][0];
          } else if (renderer._mrcaNodeId) {
            nodeId = renderer._mrcaNodeId;
          } else {
            return;
          }
          const layoutNode = renderer.nodeMap.get(nodeId);
          if (!layoutNode || !layoutNode.parentId) return;
          const parentLayoutNode = renderer.nodeMap.get(layoutNode.parentId);
          if (!parentLayoutNode) return;
          targetNode = layoutNode;
          distFromParent = (layoutNode.x - parentLayoutNode.x) / 2;
        }
        if (!targetNode) return;
        applyReroot(targetNode.id, distFromParent);
      });
      function applyMidpointRoot() {
        if (btnMPR.disabled) return;
        if (!_cachedMidpoint) _cachedMidpoint = midpointRootGraph(graph);
        const { childNodeId, distFromParent } = _cachedMidpoint;
        _cachedMidpoint = null;
        applyReroot(childNodeId, distFromParent);
      }
      btnMPR.addEventListener("click", () => applyMidpointRoot());
      function showNodeInfo() {
        let nodeId = renderer._mrcaNodeId;
        if (!nodeId && renderer._selectedTipIds && renderer._selectedTipIds.size === 1) {
          nodeId = [...renderer._selectedTipIds][0];
        }
        if (!renderer.nodeMap) return;
        if (!nodeId) {
          const totalNodes = graph ? graph.nodes.length : 0;
          const totalTips = graph ? graph.nodes.filter((n) => n.adjacents.length === 1).length : 0;
          const totalInner = totalNodes - totalTips;
          const hiddenCount = graph && graph.hiddenNodeIds ? graph.hiddenNodeIds.size : 0;
          const visibleNodes = renderer.nodes || [];
          const visibleTips = visibleNodes.filter((n) => n.isTip).length;
          const schema2 = graph ? graph.annotationSchema : null;
          const annotKeys = schema2 ? [...schema2.keys()].filter((k) => k !== "user_colour" && !schema2.get(k)?.groupMember) : [];
          const rows2 = [];
          if (_loadedFilename) rows2.push(["File", _loadedFilename]);
          rows2.push(["Tips", totalTips]);
          rows2.push(["Internal nodes", totalInner]);
          if (hiddenCount > 0) rows2.push(["Hidden nodes", hiddenCount]);
          if (visibleTips !== totalTips) rows2.push(["Visible tips", visibleTips]);
          rows2.push(["Root-to-tip span", renderer.maxX.toFixed(6)]);
          rows2.push(["Rooted", isExplicitlyRooted ? "Yes" : "No"]);
          const _isCalibrated = calibration?.isActive;
          const _isTimeTree = _axisIsTimedTree || _isCalibrated;
          rows2.push(["Time-scaled", _isTimeTree ? "Yes" : "No"]);
          if (_isTimeTree) {
            rows2.push(["__divider__", "Timing"]);
            const calFmt = axisDateFmtEl?.value || "yyyy-MM-dd";
            if (_axisIsTimedTree && !_isCalibrated) {
              const heightFmt = schema2?.get("height")?.fmt;
              const spanStr = heightFmt ? heightFmt(renderer.maxX) : renderer.maxX.toFixed(6) + " y";
              rows2.push(["Tree span", spanStr]);
            }
            if (_isCalibrated) {
              const rootDate = calibration.heightToDateString(renderer.maxX, "full", calFmt);
              rows2.push(["Root date", rootDate]);
              const allNodes = renderer.nodes || [];
              const tips = allNodes.filter((n) => n.isTip);
              if (tips.length > 0) {
                const tipHeights = tips.map(
                  (n) => renderer._globalHeightMap?.get(n.id) ?? renderer.maxX - n.x
                );
                const minTipH = Math.min(...tipHeights);
                const maxTipH = Math.max(...tipHeights);
                const newestDate = calibration.heightToDateString(minTipH, "full", calFmt);
                const oldestDate = calibration.heightToDateString(maxTipH, "full", calFmt);
                if (Math.abs(maxTipH - minTipH) < 1e-9) {
                  rows2.push(["Tip date", newestDate]);
                } else {
                  rows2.push(["Oldest tip", oldestDate]);
                  rows2.push(["Newest tip", newestDate]);
                  const spreadDays = Math.round((maxTipH - minTipH) * 365.25);
                  rows2.push(["Tip spread", spreadDays >= 365 ? (maxTipH - minTipH).toFixed(2) + " y" : spreadDays + " days"]);
                }
                const hpdKey = schema2?.get("height")?.group?.hpd;
                const rootNode = allNodes.find((n) => !n.parentId);
                const rootHpd = hpdKey && rootNode ? rootNode.annotations?.[hpdKey] : null;
                if (Array.isArray(rootHpd) && rootHpd.length >= 2) {
                  const dOlder = calibration.heightToDateString(rootHpd[1], "full", calFmt);
                  const dNewer = calibration.heightToDateString(rootHpd[0], "full", calFmt);
                  rows2.push(["Root 95% HPD", `[${dOlder} \u2013 ${dNewer}]`]);
                }
              }
            }
          }
          if (annotKeys.length > 0) {
            rows2.push(["__divider__", "Annotations"]);
            rows2.push(["", annotKeys.join(", ")]);
          }
          const titleEl2 = document.getElementById("node-info-title");
          titleEl2.textContent = "Tree";
          const body2 = document.getElementById("node-info-body");
          const tbl2 = document.createElement("table");
          tbl2.style.cssText = "width:100%;border-collapse:collapse;";
          for (const [label, value] of rows2) {
            const tr = tbl2.insertRow();
            if (label === "__divider__") {
              const td = tr.insertCell();
              td.colSpan = 2;
              td.style.cssText = "padding:6px 0 2px;";
              const div = document.createElement("div");
              div.style.cssText = "display:flex;align-items:center;gap:6px;color:rgba(230,213,149,0.5);font-size:0.72rem;letter-spacing:0.05em;text-transform:uppercase;";
              div.innerHTML = `<span style="flex:0 0 auto">${value}</span><span style="flex:1;border-top:1px solid rgba(230,213,149,0.2);display:inline-block"></span>`;
              td.appendChild(div);
            } else {
              const td1 = tr.insertCell();
              const td2 = tr.insertCell();
              td1.style.cssText = "color:rgba(230,213,149,0.7);padding:2px 14px 2px 0;white-space:nowrap;vertical-align:top;";
              td2.style.cssText = "color:rgba(242,241,230,0.88);padding:2px 0;word-break:break-all;";
              td1.textContent = label;
              td2.textContent = value;
            }
          }
          body2.innerHTML = "";
          body2.appendChild(tbl2);
          const overlay2 = document.getElementById("node-info-overlay");
          overlay2.classList.add("open");
          return;
        }
        const node = renderer.nodeMap.get(nodeId);
        if (!node) return;
        const parent = node.parentId ? renderer.nodeMap.get(node.parentId) : null;
        const branchLen2 = parent != null ? node.x - parent.x : node.x;
        const height = renderer._globalHeightMap ? renderer._globalHeightMap.get(node.id) ?? renderer.maxX - node.x : renderer.maxX - node.x;
        const rows = [];
        if (node.isTip && node.name) rows.push(["Name", node.name]);
        if (!node.isTip && node.name) rows.push(["Name", node.name]);
        if (node.label) rows.push(["Label", String(node.label)]);
        rows.push(["Divergence", node.x.toFixed(6)]);
        rows.push(["Height", height.toFixed(6)]);
        rows.push(["Branch length", branchLen2.toFixed(6)]);
        if (calibration?.isActive) {
          const calFmt = axisDateFmtEl.value || "yyyy-MM-dd";
          rows.push(["Calendar date", calibration.heightToDateString(height, "full", calFmt)]);
          const schema2 = graph ? graph.annotationSchema : null;
          const hpdKey = schema2?.get("height")?.group?.hpd;
          const hpd = hpdKey ? node.annotations?.[hpdKey] : null;
          if (Array.isArray(hpd) && hpd.length >= 2) {
            const dOlder = calibration.heightToDateString(hpd[1], "full", calFmt);
            const dNewer = calibration.heightToDateString(hpd[0], "full", calFmt);
            rows.push(["Date 95% HPD", `[${dOlder} \u2013 ${dNewer}]`]);
          }
        }
        if (!node.isTip) {
          const tipCount = renderer._getDescendantTipIds ? renderer._getDescendantTipIds(node.id).length : "\u2014";
          rows.push(["Tips below", tipCount]);
        }
        const annots = node.annotations || {};
        const schema = graph ? graph.annotationSchema : null;
        const annotEntries = Object.entries(annots);
        if (annotEntries.length > 0) {
          let fmtAnnot2 = function(v) {
            if (v === null || v === void 0) return "\u2014";
            if (Array.isArray(v)) {
              return "{" + v.map((x) => typeof x === "number" ? x.toFixed(6) : String(x)).join(", ") + "}";
            } else if (typeof v === "number") {
              return v.toFixed(6);
            }
            return String(v);
          };
          rows.push([null, null]);
          const emitted = /* @__PURE__ */ new Set();
          for (const [k, v] of annotEntries) {
            if (emitted.has(k)) continue;
            const def = schema ? schema.get(k) : null;
            if (def && def.groupMember) continue;
            rows.push([k, fmtAnnot2(v)]);
            emitted.add(k);
            if (def && def.group) {
              const SUB_LABELS = { median: "median", hpd: "95% HPD", range: "range", mean: "mean", lower: "lower", upper: "upper" };
              for (const [groupKey, subAnnotName] of Object.entries(def.group)) {
                if (Object.prototype.hasOwnProperty.call(annots, subAnnotName)) {
                  rows.push(["__sub__", [SUB_LABELS[groupKey] || groupKey, fmtAnnot2(annots[subAnnotName])]]);
                  emitted.add(subAnnotName);
                }
              }
            }
          }
          if (schema) {
            const SUB_LABELS = { median: "median", hpd: "95% HPD", range: "range", mean: "mean", lower: "lower", upper: "upper" };
            for (const [k, def] of schema) {
              if (emitted.has(k)) continue;
              if (def.groupMember) continue;
              if (!def.group) continue;
              if (Object.prototype.hasOwnProperty.call(annots, k)) continue;
              const meanKey = def.group.mean;
              if (!meanKey || !Object.prototype.hasOwnProperty.call(annots, meanKey)) continue;
              rows.push([k, fmtAnnot2(annots[meanKey])]);
              emitted.add(k);
              for (const [groupKey, subAnnotName] of Object.entries(def.group)) {
                if (Object.prototype.hasOwnProperty.call(annots, subAnnotName)) {
                  rows.push(["__sub__", [SUB_LABELS[groupKey] || groupKey, fmtAnnot2(annots[subAnnotName])]]);
                  emitted.add(subAnnotName);
                }
              }
            }
          }
        }
        const tipCount2 = !node.isTip && renderer._getDescendantTipIds ? renderer._getDescendantTipIds(node.id).length : null;
        const titleEl = document.getElementById("node-info-title");
        titleEl.textContent = node.isTip ? node.name || "Tip node" : `Internal node (${tipCount2 != null ? tipCount2 + " tips" : "internal"})`;
        const body = document.getElementById("node-info-body");
        const tbl = document.createElement("table");
        tbl.style.cssText = "width:100%;border-collapse:collapse;";
        for (const [label, value] of rows) {
          const tr = tbl.insertRow();
          if (label === null) {
            const td = tr.insertCell();
            td.colSpan = 2;
            td.style.cssText = "padding:6px 0 2px;";
            const div = document.createElement("div");
            div.style.cssText = "display:flex;align-items:center;gap:6px;color:rgba(230,213,149,0.5);font-size:0.72rem;letter-spacing:0.05em;text-transform:uppercase;";
            div.innerHTML = '<span style="flex:0 0 auto">Annotations</span><span style="flex:1;border-top:1px solid rgba(230,213,149,0.2);display:inline-block"></span>';
            td.appendChild(div);
          } else if (label === "__sub__") {
            const [subLabel, subValue] = value;
            const td1 = tr.insertCell();
            const td2 = tr.insertCell();
            td1.style.cssText = "color:rgba(230,213,149,0.42);padding:1px 14px 1px 18px;white-space:nowrap;vertical-align:top;font-size:0.85em;";
            td2.style.cssText = "color:rgba(242,241,230,0.55);padding:1px 0;word-break:break-all;font-size:0.85em;";
            td1.textContent = subLabel;
            td2.textContent = subValue;
          } else {
            const td1 = tr.insertCell();
            const td2 = tr.insertCell();
            td1.style.cssText = "color:rgba(230,213,149,0.7);padding:2px 14px 2px 0;white-space:nowrap;vertical-align:top;";
            td2.style.cssText = "color:rgba(242,241,230,0.88);padding:2px 0;word-break:break-all;";
            td1.textContent = label;
            td2.textContent = value;
          }
        }
        body.innerHTML = "";
        body.appendChild(tbl);
        const overlay = document.getElementById("node-info-overlay");
        overlay.classList.add("open");
      }
      btnNodeInfo.addEventListener("click", () => showNodeInfo());
      function _applyUserColour(colour) {
        if (!graph || renderer._selectedTipIds.size === 0) return;
        for (const id of renderer._selectedTipIds) {
          const idx = graph.origIdToIdx.get(id);
          if (idx !== void 0) graph.nodes[idx].annotations["user_colour"] = colour;
        }
        graph.annotationSchema = buildAnnotationSchema(graph.nodes);
        _refreshAnnotationUIs(graph.annotationSchema);
        renderer.setAnnotationSchema(graph.annotationSchema);
        tipColourBy.value = "user_colour";
        renderer.setTipColourBy("user_colour");
        renderer._dirty = true;
        saveSettings();
      }
      btnApplyUserColour.addEventListener("click", () => _applyUserColour(tipColourPickerEl.value));
      btnClearUserColour.addEventListener("click", () => {
        if (!graph) return;
        for (const node of graph.nodes) delete node.annotations["user_colour"];
        graph.annotationSchema = buildAnnotationSchema(graph.nodes);
        _refreshAnnotationUIs(graph.annotationSchema);
        renderer.setAnnotationSchema(graph.annotationSchema);
        renderer._dirty = true;
        saveSettings();
      });
      document.getElementById("node-info-close").addEventListener("click", () => {
        document.getElementById("node-info-overlay").classList.remove("open");
      });
      document.getElementById("node-info-overlay").addEventListener("click", (e) => {
        if (e.target === document.getElementById("node-info-overlay")) {
          document.getElementById("node-info-overlay").classList.remove("open");
        }
      });
      window.addEventListener("keydown", (e) => {
        if (!e.metaKey && !e.ctrlKey) return;
        if (e.key === "u" || e.key === "U") {
          e.preventDefault();
          applyOrder(false);
        }
        if (e.key === "d" || e.key === "D") {
          e.preventDefault();
          applyOrder(true);
        }
        if (e.key === "[") {
          e.preventDefault();
          renderer.navigateBack();
        }
        if (e.key === "]") {
          e.preventDefault();
          renderer.navigateForward();
        }
        if (e.key === "\\") {
          e.preventDefault();
          renderer.navigateHome();
        }
        if (e.shiftKey && e.code === "Comma") {
          e.preventDefault();
          renderer.navigateClimb();
        }
        if (e.shiftKey && e.code === "Period") {
          e.preventDefault();
          document.getElementById("btn-drill")?.click();
        }
        if (e.key === "a" || e.key === "A") {
          const inField = document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || document.activeElement.isContentEditable);
          if (!inField) {
            e.preventDefault();
            if (renderer.nodes) {
              const allTipIds = new Set(renderer.nodes.filter((n) => n.isTip).map((n) => n.id));
              renderer._selectedTipIds = allTipIds;
              renderer._mrcaNodeId = null;
              if (renderer._onNodeSelectChange) renderer._onNodeSelectChange(allTipIds.size > 0);
              renderer._dirty = true;
            }
          }
        }
        if (e.key === "b" || e.key === "B") {
          e.preventDefault();
          applyMode(renderer._mode === "branches" ? "nodes" : "branches");
        }
        if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          applyMidpointRoot();
        }
        if (!e.shiftKey && (e.key === "i" || e.key === "I")) {
          e.preventDefault();
          showNodeInfo();
        }
      });
    }
    themeSelect.addEventListener("change", () => {
      if (themeSelect.value !== "custom") applyTheme(themeSelect.value);
      else _syncThemeButtons();
    });
    canvasBgColorEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setBgColor(canvasBgColorEl.value);
      _syncCanvasWrapperBg(canvasBgColorEl.value);
      saveSettings();
    });
    branchColorEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setBranchColor(branchColorEl.value);
      saveSettings();
    });
    branchWidthSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("branch-width-value").textContent = branchWidthSlider.value;
      renderer.setBranchWidth(parseFloat(branchWidthSlider.value));
      saveSettings();
    });
    fontSlider.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setFontSize(parseInt(fontSlider.value));
      saveSettings();
    });
    fontFamilyEl.addEventListener("change", () => {
      _markCustomTheme();
      renderer.setSettings(_buildRendererSettings());
      applyAxisStyle();
      legendRenderer.setFontFamily(_resolveTypeface(legendFontFamilyEl.value));
      saveSettings();
    });
    legendFontFamilyEl.addEventListener("change", () => {
      _markCustomTheme();
      legendRenderer.setFontFamily(_resolveTypeface(legendFontFamilyEl.value));
      saveSettings();
    });
    axisFontFamilyEl.addEventListener("change", () => {
      _markCustomTheme();
      applyAxisStyle();
      saveSettings();
    });
    labelColorEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setLabelColor(labelColorEl.value);
      saveSettings();
    });
    selectedLabelStyleEl.addEventListener("change", () => {
      _markCustomTheme();
      renderer.setSelectedLabelStyle(selectedLabelStyleEl.value);
      saveSettings();
    });
    selectedTipStrokeEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setSelectedTipStrokeColor(selectedTipStrokeEl.value);
      saveSettings();
    });
    selectedNodeStrokeEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setSelectedNodeStrokeColor(selectedNodeStrokeEl.value);
      saveSettings();
    });
    tipHoverFillEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setTipHoverFillColor(tipHoverFillEl.value);
      saveSettings();
    });
    nodeHoverFillEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setNodeHoverFillColor(nodeHoverFillEl.value);
      saveSettings();
    });
    selectedTipFillEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setSelectedTipFillColor(selectedTipFillEl.value);
      saveSettings();
    });
    selectedTipGrowthSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("selected-tip-growth-value").textContent = selectedTipGrowthSlider.value;
      renderer.setSelectedTipGrowthFactor(parseFloat(selectedTipGrowthSlider.value));
      saveSettings();
    });
    selectedTipMinSizeSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("selected-tip-min-size-value").textContent = selectedTipMinSizeSlider.value;
      renderer.setSelectedTipMinSize(parseFloat(selectedTipMinSizeSlider.value));
      saveSettings();
    });
    selectedTipFillOpacitySlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("selected-tip-fill-opacity-value").textContent = selectedTipFillOpacitySlider.value;
      renderer.setSelectedTipFillOpacity(parseFloat(selectedTipFillOpacitySlider.value));
      saveSettings();
    });
    selectedTipStrokeWidthSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("selected-tip-stroke-width-value").textContent = selectedTipStrokeWidthSlider.value;
      renderer.setSelectedTipStrokeWidth(parseFloat(selectedTipStrokeWidthSlider.value));
      saveSettings();
    });
    selectedTipStrokeOpacitySlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("selected-tip-stroke-opacity-value").textContent = selectedTipStrokeOpacitySlider.value;
      renderer.setSelectedTipStrokeOpacity(parseFloat(selectedTipStrokeOpacitySlider.value));
      saveSettings();
    });
    selectedNodeFillEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setSelectedNodeFillColor(selectedNodeFillEl.value);
      saveSettings();
    });
    selectedNodeGrowthSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("selected-node-growth-value").textContent = selectedNodeGrowthSlider.value;
      renderer.setSelectedNodeGrowthFactor(parseFloat(selectedNodeGrowthSlider.value));
      saveSettings();
    });
    selectedNodeMinSizeSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("selected-node-min-size-value").textContent = selectedNodeMinSizeSlider.value;
      renderer.setSelectedNodeMinSize(parseFloat(selectedNodeMinSizeSlider.value));
      saveSettings();
    });
    selectedNodeFillOpacitySlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("selected-node-fill-opacity-value").textContent = selectedNodeFillOpacitySlider.value;
      renderer.setSelectedNodeFillOpacity(parseFloat(selectedNodeFillOpacitySlider.value));
      saveSettings();
    });
    selectedNodeStrokeWidthSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("selected-node-stroke-width-value").textContent = selectedNodeStrokeWidthSlider.value;
      renderer.setSelectedNodeStrokeWidth(parseFloat(selectedNodeStrokeWidthSlider.value));
      saveSettings();
    });
    selectedNodeStrokeOpacitySlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("selected-node-stroke-opacity-value").textContent = selectedNodeStrokeOpacitySlider.value;
      renderer.setSelectedNodeStrokeOpacity(parseFloat(selectedNodeStrokeOpacitySlider.value));
      saveSettings();
    });
    tipHoverStrokeEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setTipHoverStrokeColor(tipHoverStrokeEl.value);
      saveSettings();
    });
    tipHoverGrowthSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("tip-hover-growth-value").textContent = tipHoverGrowthSlider.value;
      renderer.setTipHoverGrowthFactor(parseFloat(tipHoverGrowthSlider.value));
      saveSettings();
    });
    tipHoverMinSizeSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("tip-hover-min-size-value").textContent = tipHoverMinSizeSlider.value;
      renderer.setTipHoverMinSize(parseFloat(tipHoverMinSizeSlider.value));
      saveSettings();
    });
    tipHoverFillOpacitySlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("tip-hover-fill-opacity-value").textContent = tipHoverFillOpacitySlider.value;
      renderer.setTipHoverFillOpacity(parseFloat(tipHoverFillOpacitySlider.value));
      saveSettings();
    });
    tipHoverStrokeWidthSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("tip-hover-stroke-width-value").textContent = tipHoverStrokeWidthSlider.value;
      renderer.setTipHoverStrokeWidth(parseFloat(tipHoverStrokeWidthSlider.value));
      saveSettings();
    });
    tipHoverStrokeOpacitySlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("tip-hover-stroke-opacity-value").textContent = tipHoverStrokeOpacitySlider.value;
      renderer.setTipHoverStrokeOpacity(parseFloat(tipHoverStrokeOpacitySlider.value));
      saveSettings();
    });
    nodeHoverStrokeEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setNodeHoverStrokeColor(nodeHoverStrokeEl.value);
      saveSettings();
    });
    nodeHoverGrowthSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("node-hover-growth-value").textContent = nodeHoverGrowthSlider.value;
      renderer.setNodeHoverGrowthFactor(parseFloat(nodeHoverGrowthSlider.value));
      saveSettings();
    });
    nodeHoverMinSizeSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("node-hover-min-size-value").textContent = nodeHoverMinSizeSlider.value;
      renderer.setNodeHoverMinSize(parseFloat(nodeHoverMinSizeSlider.value));
      saveSettings();
    });
    nodeHoverFillOpacitySlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("node-hover-fill-opacity-value").textContent = nodeHoverFillOpacitySlider.value;
      renderer.setNodeHoverFillOpacity(parseFloat(nodeHoverFillOpacitySlider.value));
      saveSettings();
    });
    nodeHoverStrokeWidthSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("node-hover-stroke-width-value").textContent = nodeHoverStrokeWidthSlider.value;
      renderer.setNodeHoverStrokeWidth(parseFloat(nodeHoverStrokeWidthSlider.value));
      saveSettings();
    });
    nodeHoverStrokeOpacitySlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("node-hover-stroke-opacity-value").textContent = nodeHoverStrokeOpacitySlider.value;
      renderer.setNodeHoverStrokeOpacity(parseFloat(nodeHoverStrokeOpacitySlider.value));
      saveSettings();
    });
    tipSlider.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setTipRadius(parseInt(tipSlider.value));
      saveSettings();
      _syncControlVisibility();
    });
    tipHaloSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("tip-halo-value").textContent = tipHaloSlider.value;
      renderer.setTipHaloSize(parseInt(tipHaloSlider.value));
      saveSettings();
    });
    nodeSlider.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setNodeRadius(parseInt(nodeSlider.value));
      saveSettings();
      _syncControlVisibility();
    });
    nodeHaloSlider.addEventListener("input", () => {
      _markCustomTheme();
      document.getElementById("node-halo-value").textContent = nodeHaloSlider.value;
      renderer.setNodeHaloSize(parseInt(nodeHaloSlider.value));
      saveSettings();
    });
    tipShapeColorEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setTipShapeColor(tipShapeColorEl.value);
      saveSettings();
    });
    tipShapeBgEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setTipShapeBgColor(tipShapeBgEl.value);
      saveSettings();
    });
    nodeShapeColorEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setNodeShapeColor(nodeShapeColorEl.value);
      saveSettings();
    });
    nodeShapeBgEl.addEventListener("input", () => {
      _markCustomTheme();
      renderer.setNodeShapeBgColor(nodeShapeBgEl.value);
      saveSettings();
    });
    nodeColourBy.addEventListener("change", () => {
      renderer.setNodeColourBy(nodeColourBy.value || null);
      _updatePaletteSelect(nodePaletteSelect, nodePaletteRow, nodeColourBy.value);
      saveSettings();
    });
    tipColourBy.addEventListener("change", () => {
      renderer.setTipColourBy(tipColourBy.value || null);
      _updatePaletteSelect(tipPaletteSelect, tipPaletteRow, tipColourBy.value);
      saveSettings();
    });
    labelColourBy.addEventListener("change", () => {
      renderer.setLabelColourBy(labelColourBy.value || null);
      _updatePaletteSelect(labelPaletteSelect, labelPaletteRow, labelColourBy.value);
      saveSettings();
    });
    tipLabelShow.addEventListener("change", () => {
      const isOff = tipLabelShow.value === "off";
      tipLabelControlsEl.style.display = isOff ? "none" : "";
      const schema = renderer?._annotationSchema ?? /* @__PURE__ */ new Map();
      _updateLabelDpRow(tipLabelDpRowEl, tipLabelShow.value, schema);
      renderer.setTipLabelsOff(isOff);
      if (!isOff) renderer.setTipLabelAnnotation(tipLabelShow.value === "names" ? null : tipLabelShow.value);
      saveSettings();
    });
    tipLabelAlignEl.addEventListener("change", () => {
      renderer.setTipLabelAlign(tipLabelAlignEl.value);
      saveSettings();
    });
    tipLabelDpEl.addEventListener("change", () => {
      renderer?.setSettings(_buildRendererSettings());
      saveSettings();
    });
    nodeLabelDpEl.addEventListener("change", () => {
      renderer?.setSettings(_buildRendererSettings());
      saveSettings();
      _markCustomTheme();
    });
    nodeLabelShowEl.addEventListener("change", () => {
      const schema = renderer?._annotationSchema ?? /* @__PURE__ */ new Map();
      _updateLabelDpRow(nodeLabelDpRowEl, nodeLabelShowEl.value, schema);
      renderer?.setNodeLabelAnnotation(nodeLabelShowEl.value || null);
      saveSettings();
      _markCustomTheme();
      _syncControlVisibility();
    });
    nodeLabelPositionEl.addEventListener("change", () => {
      renderer?.setNodeLabelPosition(nodeLabelPositionEl.value);
      saveSettings();
      _markCustomTheme();
    });
    nodeLabelFontSizeSlider.addEventListener("input", () => {
      const v = parseInt(nodeLabelFontSizeSlider.value);
      document.getElementById("node-label-font-size-value").textContent = v;
      renderer?.setNodeLabelFontSize(v);
      saveSettings();
      _markCustomTheme();
    });
    nodeLabelColorEl.addEventListener("input", () => {
      renderer?.setNodeLabelColor(nodeLabelColorEl.value);
      saveSettings();
      _markCustomTheme();
    });
    nodeLabelSpacingSlider.addEventListener("input", () => {
      const v = parseInt(nodeLabelSpacingSlider.value);
      document.getElementById("node-label-spacing-value").textContent = v;
      renderer?.setNodeLabelSpacing(v);
      saveSettings();
      _markCustomTheme();
    });
    tipPaletteSelect.addEventListener("change", () => {
      const key = tipColourBy.value;
      if (key && key !== "user_colour") {
        annotationPalettes.set(key, tipPaletteSelect.value);
        _syncPaletteSelects(key, tipPaletteSelect.value);
        renderer.setAnnotationPalette(key, tipPaletteSelect.value);
        legendRenderer.draw();
        saveSettings();
      }
    });
    nodePaletteSelect.addEventListener("change", () => {
      const key = nodeColourBy.value;
      if (key && key !== "user_colour") {
        annotationPalettes.set(key, nodePaletteSelect.value);
        _syncPaletteSelects(key, nodePaletteSelect.value);
        renderer.setAnnotationPalette(key, nodePaletteSelect.value);
        legendRenderer.draw();
        saveSettings();
      }
    });
    labelPaletteSelect.addEventListener("change", () => {
      const key = labelColourBy.value;
      if (key && key !== "user_colour") {
        annotationPalettes.set(key, labelPaletteSelect.value);
        _syncPaletteSelects(key, labelPaletteSelect.value);
        renderer.setAnnotationPalette(key, labelPaletteSelect.value);
        legendRenderer.draw();
        saveSettings();
      }
    });
    tipLabelShapeEl.addEventListener("change", () => {
      renderer.setTipLabelShape(tipLabelShapeEl.value);
      _syncControlVisibility();
      saveSettings();
      _markCustomTheme();
    });
    tipLabelShapeColorEl.addEventListener("input", () => {
      renderer.setTipLabelShapeColor(tipLabelShapeColorEl.value);
      saveSettings();
      _markCustomTheme();
    });
    tipLabelShapeColourBy.addEventListener("change", () => {
      renderer.setTipLabelShapeColourBy(tipLabelShapeColourBy.value || null);
      _updatePaletteSelect(tipLabelShapePaletteSelect, tipLabelShapePaletteRow, tipLabelShapeColourBy.value);
      saveSettings();
    });
    tipLabelShapeMarginLeftSlider.addEventListener("input", () => {
      const v = parseInt(tipLabelShapeMarginLeftSlider.value);
      document.getElementById("tip-label-shape-margin-left-value").textContent = v;
      renderer.setTipLabelShapeMarginLeft(v);
      saveSettings();
      _markCustomTheme();
    });
    tipLabelShapeMarginRightSlider.addEventListener("input", () => {
      const v = parseInt(tipLabelShapeMarginRightSlider.value);
      document.getElementById("tip-label-shape-margin-right-value").textContent = v;
      renderer.setTipLabelShapeMarginRight(v);
      saveSettings();
      _markCustomTheme();
    });
    tipLabelShapePaletteSelect.addEventListener("change", () => {
      const key = tipLabelShapeColourBy.value;
      if (key && key !== "user_colour") {
        annotationPalettes.set(key, tipLabelShapePaletteSelect.value);
        _syncPaletteSelects(key, tipLabelShapePaletteSelect.value);
        renderer.setAnnotationPalette(key, tipLabelShapePaletteSelect.value);
        legendRenderer.draw();
        saveSettings();
      }
    });
    tipLabelShape2El.addEventListener("change", () => {
      renderer.setTipLabelShape2(tipLabelShape2El.value);
      _syncControlVisibility();
      saveSettings();
      _markCustomTheme();
    });
    tipLabelShape2ColorEl.addEventListener("input", () => {
      renderer.setTipLabelShape2Color(tipLabelShape2ColorEl.value);
      saveSettings();
      _markCustomTheme();
    });
    tipLabelShape2ColourBy.addEventListener("change", () => {
      renderer.setTipLabelShape2ColourBy(tipLabelShape2ColourBy.value || null);
      _updatePaletteSelect(tipLabelShape2PaletteSelect, tipLabelShape2PaletteRow, tipLabelShape2ColourBy.value);
      saveSettings();
    });
    tipLabelShape2MarginRightSlider.addEventListener("input", () => {
      const v = parseInt(tipLabelShape2MarginRightSlider.value);
      document.getElementById("tip-label-shape-2-margin-right-value").textContent = v;
      renderer.setTipLabelShape2MarginRight(v);
      saveSettings();
      _markCustomTheme();
    });
    tipLabelShapeSizeSlider.addEventListener("input", () => {
      const v = parseInt(tipLabelShapeSizeSlider.value);
      document.getElementById("tip-label-shape-size-value").textContent = v;
      renderer.setTipLabelShapeSize(v);
      saveSettings();
      _markCustomTheme();
    });
    tipLabelShape2SizeSlider.addEventListener("input", () => {
      const v = parseInt(tipLabelShape2SizeSlider.value);
      document.getElementById("tip-label-shape-2-size-value").textContent = v;
      renderer.setTipLabelShape2Size(v);
      saveSettings();
      _markCustomTheme();
    });
    tipLabelShape2PaletteSelect.addEventListener("change", () => {
      const key = tipLabelShape2ColourBy.value;
      if (key && key !== "user_colour") {
        annotationPalettes.set(key, tipLabelShape2PaletteSelect.value);
        _syncPaletteSelects(key, tipLabelShape2PaletteSelect.value);
        renderer.setAnnotationPalette(key, tipLabelShape2PaletteSelect.value);
        legendRenderer.draw();
        saveSettings();
      }
    });
    function applyLegend() {
      const key = legendAnnotEl.value || null;
      const show = !!key;
      const pos = legendShowEl.value;
      const key2 = legend2AnnotEl.value || null;
      const pos2 = legend2ShowEl.value;
      const beside2 = show && !!key2 && pos2 === "right";
      legendRenderer.setFontSize(parseInt(legendFontSizeSlider.value));
      legendRenderer.setTextColor(legendTextColorEl.value);
      legendRenderer.setSettings(
        {
          heightPct: parseInt(legendHeightPctSlider.value),
          heightPct2: parseInt(legend2HeightPctSlider.value)
        },
        /*redraw*/
        false
      );
      legendRenderer.setAnnotation(show ? pos : null, key);
      legendRenderer.setAnnotation2(key2 ? pos2 : "right", key2);
      const W = show ? legendRenderer.measureWidth() : 0;
      const W2 = beside2 ? legendRenderer.measureWidth2() : 0;
      legendLeftCanvas.style.display = show && pos === "left" ? "block" : "none";
      legendLeftCanvas.style.width = W + "px";
      legendRightCanvas.style.display = show && pos === "right" ? "block" : "none";
      legendRightCanvas.style.width = W + "px";
      legend2RightCanvas.style.display = beside2 && pos === "right" ? "block" : "none";
      legend2RightCanvas.style.width = W2 + "px";
      legend2LeftCanvas.style.display = beside2 && pos === "left" ? "block" : "none";
      legend2LeftCanvas.style.width = W2 + "px";
      renderer._resize();
      saveSettings();
      _syncControlVisibility();
    }
    legendShowEl.addEventListener("change", applyLegend);
    legendAnnotEl.addEventListener("change", applyLegend);
    legend2AnnotEl.addEventListener("change", applyLegend);
    legend2ShowEl.addEventListener("change", applyLegend);
    legend2HeightPctSlider.addEventListener("input", () => {
      document.getElementById("legend2-height-pct-value").textContent = legend2HeightPctSlider.value + "%";
      applyLegend();
    });
    legendTextColorEl.addEventListener("input", () => {
      legendRenderer.setTextColor(legendTextColorEl.value);
      saveSettings();
    });
    legendFontSizeSlider.addEventListener("input", () => {
      document.getElementById("legend-font-size-value").textContent = legendFontSizeSlider.value;
      applyLegend();
    });
    legendHeightPctSlider.addEventListener("input", () => {
      document.getElementById("legend-height-pct-value").textContent = legendHeightPctSlider.value + "%";
      applyLegend();
    });
    function applyAxis() {
      const val = axisShowEl.value;
      const on = val !== "off";
      axisCanvas.style.display = on ? "block" : "none";
      if (val === "time") {
        axisRenderer.setCalibration(calibration.isActive ? calibration : null);
        axisRenderer.setDirection("forward");
      } else {
        axisRenderer.setCalibration(null);
        axisRenderer.setDirection(on ? val : "forward");
      }
      axisRenderer.setVisible(on);
      _showDateTickRows(val === "time" && calibration.isActive && !!axisDateAnnotEl.value);
      renderer._resize();
      if (on) {
        axisRenderer.update(
          renderer.scaleX,
          renderer.offsetX,
          renderer.paddingLeft,
          renderer.labelRightPad,
          renderer.bgColor,
          renderer.fontSize,
          window.devicePixelRatio || 1
        );
      }
      saveSettings();
      _syncControlVisibility();
    }
    axisShowEl.addEventListener("change", applyAxis);
    function _updateMinorOptions(majorVal, keepVal) {
      const opts = {
        auto: [["auto", "Auto"], ["years", "Years"], ["months", "Months"], ["off", "Off"]],
        decades: [["auto", "Auto"], ["years", "Years"], ["months", "Months"], ["off", "Off"]],
        years: [["auto", "Auto"], ["quarters", "Quarters"], ["months", "Months"], ["weeks", "Weeks"], ["days", "Days"], ["off", "Off"]],
        quarters: [["auto", "Auto"], ["months", "Months"], ["days", "Days"], ["off", "Off"]],
        months: [["auto", "Auto"], ["weeks", "Weeks"], ["days", "Days"], ["off", "Off"]],
        weeks: [["auto", "Auto"], ["days", "Days"], ["off", "Off"]],
        days: [["off", "Off"]]
      };
      const list = opts[majorVal] || [["auto", "Auto"], ["off", "Off"]];
      axisMinorIntervalEl.innerHTML = "";
      for (const [val, label] of list) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = label;
        axisMinorIntervalEl.appendChild(opt);
      }
      axisMinorIntervalEl.value = list.some((o) => o[0] === keepVal) ? keepVal : "off";
    }
    function applyTickOptions() {
      axisRenderer.setDateFormat(axisDateFmtEl.value);
      renderer?.setCalDateFormat(axisDateFmtEl.value);
      axisRenderer.setTickOptions({
        majorInterval: axisMajorIntervalEl.value,
        minorInterval: axisMinorIntervalEl.value,
        majorLabelFormat: axisMajorLabelEl.value,
        minorLabelFormat: axisMinorLabelEl.value
      });
      axisRenderer.update(
        renderer.scaleX,
        renderer.offsetX,
        renderer.paddingLeft,
        renderer.labelRightPad,
        renderer.bgColor,
        renderer.fontSize,
        window.devicePixelRatio || 1
      );
      saveSettings();
    }
    function applyAxisStyle() {
      axisRenderer.setColor(axisColorEl.value);
      axisRenderer.setLineWidth(parseFloat(axisLineWidthSlider.value));
      axisRenderer.setFontSize(parseInt(axisFontSizeSlider.value));
      axisRenderer.setFontFamily(_resolveTypeface(axisFontFamilyEl.value));
      axisRenderer.update(
        renderer.scaleX,
        renderer.offsetX,
        renderer.paddingLeft,
        renderer.labelRightPad,
        renderer.bgColor,
        renderer.fontSize,
        window.devicePixelRatio || 1
      );
      saveSettings();
    }
    axisColorEl.addEventListener("input", () => {
      _markCustomTheme();
      applyAxisStyle();
    });
    axisFontSizeSlider.addEventListener("input", () => {
      document.getElementById("axis-font-size-value").textContent = axisFontSizeSlider.value;
      applyAxisStyle();
    });
    axisLineWidthSlider.addEventListener("input", () => {
      document.getElementById("axis-line-width-value").textContent = axisLineWidthSlider.value;
      applyAxisStyle();
    });
    function applyNodeBars() {
      if (renderer) {
        renderer.setSettings(_buildRendererSettings());
        renderer._dirty = true;
      }
      saveSettings();
      _syncControlVisibility();
    }
    nodeBarsShowEl.addEventListener("change", applyNodeBars);
    nodeBarsColorEl.addEventListener("input", applyNodeBars);
    nodeBarsWidthSlider.addEventListener("input", () => {
      document.getElementById("node-bars-width-value").textContent = nodeBarsWidthSlider.value;
      applyNodeBars();
    });
    nodeBarsMedianEl.addEventListener("change", applyNodeBars);
    nodeBarsRangeEl.addEventListener("change", applyNodeBars);
    clampNegBranchesEl.addEventListener("change", () => {
      if (!renderer || !graph) {
        saveSettings();
        return;
      }
      renderer.setSettings(_buildRendererSettings());
      const layout = computeLayoutFromGraph(
        graph,
        renderer._viewSubtreeRootId,
        { clampNegativeBranches: clampNegBranchesEl.value === "on" }
      );
      renderer.setDataAnimated(layout.nodes, layout.nodeMap, layout.maxX, layout.maxY);
      saveSettings();
    });
    function _showDateTickRows(visible) {
      const d = visible ? "flex" : "none";
      axisMajorIntervalRow.style.display = d;
      axisMinorIntervalRow.style.display = d;
      axisMajorLabelRow.style.display = d;
      axisMinorLabelRow.style.display = d;
    }
    axisMajorIntervalEl.addEventListener("change", () => {
      _updateMinorOptions(axisMajorIntervalEl.value, axisMinorIntervalEl.value);
      applyTickOptions();
    });
    axisMinorIntervalEl.addEventListener("change", applyTickOptions);
    axisMajorLabelEl.addEventListener("change", applyTickOptions);
    axisMinorLabelEl.addEventListener("change", applyTickOptions);
    axisDateFmtEl.addEventListener("change", applyTickOptions);
    axisDateAnnotEl.addEventListener("change", () => {
      const key = axisDateAnnotEl.value || null;
      calibration.setAnchor(key, renderer.nodeMap || /* @__PURE__ */ new Map(), renderer.maxX);
      axisDateFmtRow.style.display = calibration.isActive ? "flex" : "none";
      if (clampNegBranchesRowEl) clampNegBranchesRowEl.style.display = _axisIsTimedTree || calibration.isActive ? "none" : "";
      if (calibration.isActive) clampNegBranchesEl.value = "off";
      _refreshAnnotationUIs(renderer?._annotationSchema ?? /* @__PURE__ */ new Map());
      if (renderer) renderer.setSettings(_buildRendererSettings());
      if (axisShowEl.value === "time") {
        axisRenderer.setCalibration(key && calibration.isActive ? calibration : null);
        if (renderer._viewSubtreeRootId && renderer._onLayoutChange) {
          renderer._onLayoutChange(renderer.maxX, renderer._viewSubtreeRootId);
        }
        _showDateTickRows(calibration.isActive && !!key);
        axisRenderer.update(
          renderer.scaleX,
          renderer.offsetX,
          renderer.paddingLeft,
          renderer.labelRightPad,
          renderer.bgColor,
          renderer.fontSize,
          window.devicePixelRatio || 1
        );
      }
      saveSettings();
    });
    btnFit.addEventListener("click", () => renderer.fitToWindow());
    document.getElementById("btn-fit-labels").addEventListener("click", () => renderer.fitLabels());
    document.getElementById("btn-open-tree").addEventListener("click", () => execute("open-tree"));
    get("open-file").exec = () => pickTreeFile();
    get("open-tree").exec = () => openModal();
    get("import-annot").exec = () => annotImporter.open();
    get("curate-annot").exec = () => annotCurator.open();
    get("select-all").exec = () => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) {
        document.execCommand("selectAll");
      } else if (renderer.nodes) {
        const allTipIds = new Set(renderer.nodes.filter((n) => n.isTip).map((n) => n.id));
        renderer._selectedTipIds = allTipIds;
        renderer._mrcaNodeId = null;
        if (renderer._onNodeSelectChange) renderer._onNodeSelectChange(allTipIds.size > 0);
        renderer._dirty = true;
      }
    };
    get("select-invert").exec = () => {
      if (!renderer.nodes) return;
      const allTipIds = renderer.nodes.filter((n) => n.isTip).map((n) => n.id);
      const inverted = new Set(allTipIds.filter((id) => !renderer._selectedTipIds.has(id)));
      renderer._selectedTipIds = inverted;
      renderer._mrcaNodeId = null;
      renderer._updateMRCA();
      if (renderer._onNodeSelectChange) renderer._onNodeSelectChange(inverted.size > 0);
      renderer._notifyStats();
      renderer._dirty = true;
    };
    for (const cmd of getAll().values()) {
      if (cmd.buttonId && !cmd.exec) {
        const btnId = cmd.buttonId;
        cmd.exec = () => document.getElementById(btnId)?.click();
      }
    }
    window.addEventListener("keydown", (e) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.altKey) return;
      for (const cmd of getAll().values()) {
        if (!matchesShortcut(e, cmd.shortcut)) continue;
        if (!cmd.exec) continue;
        if (cmd.id === "select-all") {
          const tag = document.activeElement?.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
        }
        e.preventDefault();
        execute(cmd.id);
        return;
      }
    });
    window.peartree = {
      /** Load a tree from a text string (async). */
      loadTree,
      openModal,
      closeModal,
      setModalError,
      /** Show a standalone error dialog with an OK button. */
      showErrorDialog,
      /** Show a confirm dialog; returns a Promise<boolean>. */
      showConfirmDialog,
      /** True when a tree is currently loaded in this window. */
      get hasTree() {
        return treeLoaded;
      },
      /** Trigger a file open. Default: click the hidden <input type="file">.
       *  Override with a platform-specific implementation (e.g. Tauri native dialog). */
      pickFile: () => fileInput.click(),
      /** The central command registry. Platform adapters (e.g. peartree-tauri.js)
       *  subscribe to enabled-state changes and execute commands via this. */
      commands: commands_exports,
      /** Annotation importer — platform adapters can call loadFile(name, content)
       *  to bypass the picker phase and go straight to the config dialog. */
      annotImporter,
      /** Override the tree-export action for the current platform.
       *  fn({ content, filename, mimeType, filterName, extensions }) — called
       *  instead of a browser download when the user clicks Export/Download in
       *  the Export Tree dialog.  Set to null to restore browser behaviour. */
      setExportSaveHandler: (fn) => {
        _exportSaveHandler = fn;
      },
      /** Override the graphic-export action for the current platform.
       *  fn({ content|contentBase64, base64, filename, mimeType, filterName, extensions })
       *  Set to null to restore browser behaviour. */
      setGraphicsSaveHandler: (fn) => {
        _graphicsSaveHandler = fn;
      },
      /** Fetch a file by relative path, falling back to the absolute GitHub Pages
       *  URL if the relative fetch fails (e.g. file:// context). */
      fetchWithFallback
    };
    {
      const _startParams = new URLSearchParams(window.location.search);
      const _fastaUrl = _startParams.get("treeUrl");
      if (_fastaUrl) {
        let _validated = null;
        try {
          const _u = new URL(_fastaUrl);
          if (_u.protocol === "http:" || _u.protocol === "https:") _validated = _u.href;
          else throw new Error("Only http/https URLs are supported.");
        } catch (_e) {
          console.warn("peartree: ignoring invalid fastaUrl parameter \u2013", _e.message);
        }
        if (_validated) {
          openModal();
          setModalLoading(true);
          setModalError(null);
          (async () => {
            try {
              const _resp = await fetch(_validated);
              if (!_resp.ok) throw new Error("HTTP " + _resp.status + " \u2013 " + _validated);
              const _text = await _resp.text();
              const _name = new URL(_validated).pathname.split("/").pop() || "data";
              await loadTree(_text, _name);
            } catch (_err) {
              setModalError(_err.message);
              setModalLoading(false);
            }
          })();
        }
      }
    }
    window.dispatchEvent(new CustomEvent("peartree-ready"));
  })();
})();
