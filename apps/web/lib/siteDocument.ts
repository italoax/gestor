import { htmlToDOM, domToReact, attributesToProps } from 'html-react-parser';
import { createElement, cloneElement } from 'react';

const text = (node) =>
  (node.children || []).map((child) => child.data || text(child)).join('');
const find = (nodes, name) => {
  for (const node of nodes) {
    if (node.name === name) return node;
    const result = find(node.children || [], name);
    if (result) return result;
  }
};

export function readSiteDocument(html) {
  const nodes = htmlToDOM(html);
  const head = find(nodes, 'head');
  const body = find(nodes, 'body');
  const scripts = [];
  function clean(children) {
    return children.filter((node) => {
      if (node.name === 'script') {
        const attributes = node.attribs || {};
        if (attributes.type === 'application/ld+json') return true;
        scripts.push({ attributes, code: text(node) });
        return false;
      }
      if (node.attribs) {
        // O conteúdo de <template> vive em DocumentFragment, fora da árvore
        // hidratada pelo React. As fontes de ícones usam um elemento oculto.
        if (node.name === 'template' && node.attribs['data-ui-icon']) {
          node.name = 'span';
          node.attribs['data-ui-icon-source'] = node.attribs['data-ui-icon'];
          node.attribs.hidden = '';
          delete node.attribs['data-ui-icon'];
        }
        // React não executa atributos HTML de eventos. Traduza somente os dois
        // comportamentos usados pelos templates, sem avaliar código arbitrário.
        for (const key of Object.keys(node.attribs)) {
          if (!/^on/i.test(key)) continue;
          const value = node.attribs[key];
          if (key === 'onchange' && value === 'this.form.requestSubmit()')
            node.attribs['data-submit-on-change'] = '';
          const confirmation = value.match(/^return confirm\('([^']*)'\);?$/);
          if (confirmation) node.attribs['data-confirm'] = confirmation[1];
          delete node.attribs[key];
        }
      }
      if (node.name === 'option' && Object.hasOwn(node.attribs, 'selected')) {
        node.selectedForReact = true;
        delete node.attribs.selected;
      }
      if (node.children) node.children = clean(node.children);
      return true;
    });
  }
  const headNodes = clean(head?.children || []);
  const bodyNodes = clean(body?.children || nodes);
  const reactOptions = {
    replace(node) {
      if (node.name !== 'select') return;
      const selected = [];
      function readOptions(children) {
        for (const child of children) {
          if (child.selectedForReact)
            selected.push(child.attribs.value ?? text(child));
          if (child.children) readOptions(child.children);
        }
      }
      readOptions(node.children || []);
      const props = attributesToProps(node.attribs, 'select');
      if (selected.length)
        props.defaultValue = props.multiple ? selected : selected[0];
      return createElement(
        'select',
        props,
        domToReact(node.children || [], reactOptions),
      );
    },
    transform(element, node) {
      // O mapa de atributos da biblioteca não inclui fetchPriority do React 19.
      if (node.attribs && Object.hasOwn(node.attribs, 'fetchpriority')) {
        const props = {
          ...element.props,
          key: element.key,
          fetchPriority: node.attribs.fetchpriority,
        };
        delete props.fetchpriority;
        if (Object.hasOwn(node.attribs, 'inert')) props.inert = true;
        return createElement(element.type, props);
      }
      return node.attribs && Object.hasOwn(node.attribs, 'inert')
        ? cloneElement(element, { inert: true })
        : element;
    },
  };
  const metas = headNodes.filter((node) => node.name === 'meta');
  const meta = (key) =>
    metas.find(
      (node) => node.attribs.name === key || node.attribs.property === key,
    )?.attribs.content;
  return {
    title: text(find(headNodes, 'title') || { children: [] }) || 'Gestor IXTV',
    description: meta('description'),
    themeColor: meta('theme-color'),
    twitter: { card: meta('twitter:card') || 'summary' },
    appleWebAppTitle: meta('apple-mobile-web-app-title'),
    canonical: headNodes.find(
      (node) => node.name === 'link' && node.attribs.rel === 'canonical',
    )?.attribs.href,
    openGraph: {
      title: meta('og:title'),
      description: meta('og:description'),
      url: meta('og:url'),
      siteName: meta('og:site_name'),
      locale: meta('og:locale'),
      images: meta('og:image')
        ? [{ url: meta('og:image'), alt: meta('og:image:alt') }]
        : undefined,
      type: meta('og:type'),
    },
    bodyAttributes: body?.attribs || {},
    scripts,
    head: domToReact(
      headNodes.filter(
        (node) =>
          !['title', 'meta'].includes(node.name) ||
          node.attribs?.name === 'csrf-token',
      ),
      reactOptions,
    ),
    content: domToReact(bodyNodes, reactOptions),
  };
}
