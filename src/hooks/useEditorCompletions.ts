import { useState, useEffect, useRef } from 'react';

const COMMON_HTML_TAGS = [
  'button', 'div', 'span', 'input', 'form', 'a', 'p', 'h1', 'h2', 'h3', 'header', 'footer',
  'section', 'article', 'nav', 'main', 'aside', 'img', 'table', 'tr', 'td', 'th', 'ul', 'li',
  'ol', 'label', 'select', 'option', 'textarea', 'canvas', 'video', 'audio', 'iframe', 'svg',
  'path', 'script', 'style', 'link', 'meta'
];

const COMMON_JS_KEYWORDS = [
  'const', 'let', 'function', 'return', 'import', 'export', 'default', 'async', 'await',
  'if', 'else', 'for', 'while', 'switch', 'case', 'try', 'catch', 'finally', 'typeof',
  'instanceof', 'interface', 'type', 'useState', 'useEffect', 'useCallback', 'useRef', 'useMemo'
];

const COMMON_CSS_PROPS = [
  'display', 'flex', 'grid', 'position', 'color', 'background', 'margin', 'padding',
  'border', 'width', 'height', 'align-items', 'justify-content', 'border-radius', 'font-size'
];

export function useEditorCompletions(
  editorRef: React.RefObject<any>,
  monaco: any,
  activeLanguage: string
): { completions: string[]; insertCompletion: (text: string) => void } {
  const [completions, setCompletions] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const updateCompletions = () => {
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        const model = editor.getModel();
        const pos = editor.getPosition();
        if (!model || !pos) return;

        const lineContent = model.getLineContent(pos.lineNumber);
        const prefix = lineContent.substring(0, pos.column - 1);
        const matchWord = prefix.match(/[a-zA-Z0-9_<\-:]+$/);

        if (!matchWord || matchWord[0].length < 1) {
          setCompletions([]);
          return;
        }

        const rawTyped = matchWord[0];
        const lowerTyped = rawTyped.toLowerCase();
        const isTagPrefix = lowerTyped.startsWith('<');
        const searchWord = isTagPrefix ? lowerTyped.substring(1) : lowerTyped;

        const matches: string[] = [];

        if (activeLanguage === 'html' || activeLanguage === 'xml' || isTagPrefix) {
          COMMON_HTML_TAGS.forEach((tag) => {
            if (tag.startsWith(searchWord)) {
              matches.push(isTagPrefix ? `<${tag}>` : tag);
            }
          });
        } else if (activeLanguage === 'css') {
          COMMON_CSS_PROPS.forEach((prop) => {
            if (prop.startsWith(searchWord)) {
              matches.push(prop);
            }
          });
        } else {
          COMMON_JS_KEYWORDS.forEach((kw) => {
            if (kw.toLowerCase().startsWith(searchWord)) {
              matches.push(kw);
            }
          });
        }

        setCompletions(matches.slice(0, 6));
      }, 100);
    };

    const cursorDisposable = editor.onDidChangeCursorPosition(updateCompletions);
    const contentDisposable = editor.onDidChangeModelContent(updateCompletions);

    return () => {
      cursorDisposable.dispose();
      contentDisposable.dispose();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [editorRef, monaco, activeLanguage]);

  const insertCompletion = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const pos = editor.getPosition();
    const model = editor.getModel();
    if (!pos || !model) return;

    const lineContent = model.getLineContent(pos.lineNumber);
    const prefix = lineContent.substring(0, pos.column - 1);
    const matchWord = prefix.match(/[a-zA-Z0-9_<\-:]+$/);

    const startCol = matchWord ? pos.column - matchWord[0].length : pos.column;
    const range = new monaco.Range(pos.lineNumber, startCol, pos.lineNumber, pos.column);

    editor.executeEdits('krypton-completion', [{ range, text, forceMoveMarkers: true }]);
    editor.focus();
  };

  return { completions, insertCompletion };
}
