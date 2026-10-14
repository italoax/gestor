import * as prettier from 'prettier';

// Protege os blocos EJS enquanto o Prettier organiza o HTML. Condicionais como
// <input <%= checked ? 'checked' : '' %>> não são HTML comum e devem permanecer
// intactas, assim como o conteúdo JavaScript dentro de <% ... %>.
export async function formatSource(source, file) {
  const options = await prettier.resolveConfig(file);
  if (!file.endsWith('.ejs'))
    return prettier.format(source, { ...options, filepath: file });

  const marker = '__GESTOR_EJS_';
  if (source.includes(marker) || source.includes('__GESTOR_RAW_'))
    throw new Error('Marcador reservado em ' + file);
  const blocks = [];
  let masked = '';
  let previousEnd = 0;
  for (const match of source.matchAll(/<%[\s\S]*?%>/g)) {
    masked += source.slice(previousEnd, match.index);
    const block = match[0];
    const token = marker + blocks.length + '__';
    const insideRaw = ['script', 'style', 'textarea', 'pre'].some((name) => {
      const opening = masked.lastIndexOf('<' + name);
      return (
        opening > masked.lastIndexOf('</' + name) &&
        masked.indexOf('>', opening) !== -1
      );
    });
    const insideTag =
      !insideRaw && masked.lastIndexOf('<') > masked.lastIndexOf('>');
    let quote;
    if (insideTag) {
      for (const char of masked.slice(masked.lastIndexOf('<'))) {
        if (quote === char) quote = undefined;
        else if (!quote && (char === '"' || char === "'")) quote = char;
      }
      // Uma condição pode começar imediatamente após o nome da tag: <td<% ...
      // O espaço mantém o placeholder como atributo, sem alterar a tag HTML.
      if (!quote && !/\s$/.test(masked)) masked += ' ';
    }
    const placeholder = insideTag || insideRaw ? token : '<!--' + token + '-->';
    blocks.push({ token: placeholder, block });
    masked += placeholder;
    previousEnd = match.index + block.length;
  }
  masked += source.slice(previousEnd);
  const rawBlocks = [];
  const rawTags =
    /(<(script|style|textarea|pre)\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)(<\/\2\s*>)/gi;
  masked = masked.replace(rawTags, (_match, opening, _name, body, closing) => {
    const token = '__GESTOR_RAW_' + rawBlocks.length + '__';
    rawBlocks.push({ token, body });
    return opening + token + closing;
  });
  let formatted = await prettier.format(masked, {
    ...options,
    filepath: file,
    parser: 'html',
  });
  formatted = formatted.replace(
    rawTags,
    (_match, opening, _name, body, closing) => {
      const original = rawBlocks.find((entry) => entry.token === body.trim());
      if (!original) throw new Error('Conteúdo embutido alterado em ' + file);
      return opening + original.body + closing;
    },
  );
  for (const { token, block } of blocks) {
    if (formatted.split(token).length !== 2)
      throw new Error('Bloco EJS alterado durante a formatação: ' + file);
    formatted = formatted.replace(token, () => block);
  }
  return formatted;
}
