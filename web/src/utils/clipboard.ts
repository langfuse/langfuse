import copy from "copy-to-clipboard";

export async function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    // For modern explorers like chrome
    try {
      await navigator.clipboard
        .writeText(text)
        .catch(function () {
          copy(text);
        });
    } catch (err) {
      copy(text);
    }
  } else {
    copy(text);
  }
}
