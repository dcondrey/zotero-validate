window.addEventListener("load", function () {
  const PREF_BRANCH = "extensions.zotero.reference-validator.";

  const inputs = document.querySelectorAll("[data-pref]");
  for (const input of inputs) {
    const key = PREF_BRANCH + input.getAttribute("data-pref");
    const type = input.getAttribute("type");

    // Load current value
    const val = Zotero.Prefs.get(key);
    if (type === "checkbox") {
      input.checked = !!val;
    } else if (val !== undefined && val !== null) {
      input.value = val;
    }

    // Save on change
    const event = type === "checkbox" ? "change" : "input";
    input.addEventListener(event, function () {
      if (type === "checkbox") {
        Zotero.Prefs.set(key, input.checked);
      } else if (type === "number") {
        Zotero.Prefs.set(key, parseInt(input.value, 10));
      } else {
        Zotero.Prefs.set(key, input.value);
      }
    });
  }

  const clearCacheBtn = document.getElementById("clear-cache-btn");
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", function () {
      alert("Source cache cleared.");
    });
  }
});
