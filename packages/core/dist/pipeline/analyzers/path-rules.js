function globToRegex(pattern) {
  let regex = "";
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          regex += "(?:.+/)?";
          i += 3;
        } else {
          regex += ".*";
          i += 2;
        }
      } else {
        regex += "[^/]*";
        i += 1;
      }
    } else if (char === "?") {
      regex += "[^/]";
      i += 1;
    } else if (char === ".") {
      regex += "\\.";
      i += 1;
    } else {
      regex += char.replace(/[\\^$.|+()[\]{}]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp(`^${regex}$`);
}
function matchPathRules(changedFiles, pathRules) {
  if (pathRules.length === 0 || changedFiles.length === 0) return [];
  const matchedNotes = /* @__PURE__ */ new Set();
  const compiled = pathRules.map((rule) => ({
    regex: globToRegex(rule.pattern),
    notes: rule.notes
  }));
  for (const file of changedFiles) {
    for (const rule of compiled) {
      if (rule.regex.test(file)) {
        for (const note of rule.notes) {
          matchedNotes.add(note);
        }
      }
    }
  }
  return [...matchedNotes];
}
export {
  matchPathRules
};
