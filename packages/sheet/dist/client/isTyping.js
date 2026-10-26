// Whether a key landed in somewhere you type (a text field, a select, an editable element), where a sheet's keys
// stand aside.
const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", "password", "number", "date", "time", ""]);
export function isTyping(target) {
    if (!(target instanceof HTMLElement))
        return false;
    if (target.isContentEditable)
        return true;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)
        return true;
    return target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type);
}
